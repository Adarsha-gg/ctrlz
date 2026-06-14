/**
 * POST /verify/submit — the work-submission workflow (the missing spine).
 *
 * Before this, /verify only ran baked-in demo fixtures; there was no way for a
 * worker to actually SUBMIT data work and have it judged. This route is that
 * entry point, built for the deterministic niche: expensive-to-produce data
 * aggregation, verified by cheap sampled recompute.
 *
 * Flow (commit-reveal, mirrors held-out tests):
 *   1. Worker reveals its full output `rows` + the `rowsCommit` it locked.
 *   2. We verify the reveal hashes to the commit (anti-swap), then DERIVE which
 *      keys to spot-check from that commit — unpredictable until the rows were
 *      frozen, so the worker can't fake only the rows it expects to be checked.
 *   3. The verifier's independently re-fetched ground truth (`sample`) is fed to
 *      the deterministic `data_reconcile` checker, which compares only the
 *      sampled rows → pass/fail.
 *   4. Split-score it, anchor a replayable evidence blob, return the verdict +
 *      hash that the escrow `resolve()` consumes.
 *
 * The checkers decide; no LLM is in this path.
 */

import { NextResponse } from "next/server";
import {
  buildCheckerRuntimeManifest,
  commitDataset,
  deriveSampleKeys,
  runChecks,
  verifyDatasetReveal,
  DEFAULT_SAMPLE_SIZE,
  type CheckSpec,
  type DataRecord,
  type TaskContext,
  type WorkerSubmission
} from "@/lib/checkers";
import { buildHeldoutManifest, randomSalt } from "@/lib/checkers/heldout";
import { scoreSplit, type ScoredCheck } from "@/lib/scoring/score";
import { planResolution } from "@/lib/settlement/resolve";
import {
  buildEvidenceBlob,
  buildManifest,
  hashBlob,
  storeEvidence,
  storeHeldoutReveal,
  verifyHeldoutReveal,
  type HeldoutRevealPointer
} from "@/lib/walrus";

type SubmitBody = {
  intent?: string;
  /** the worker's full data output, revealed at submit */
  rows?: DataRecord[];
  /** the commitment locked before submit; if omitted we compute it from rows */
  rowsCommit?: string;
  /** verifier-side ground truth, independently re-fetched for the sampled keys */
  sample?: DataRecord[];
  /** how many rows to spot-check (default DEFAULT_SAMPLE_SIZE) */
  sampleSize?: number;
  /** value fields compared within `tolerance`; all others compared exactly */
  numericFields?: string[];
  tolerance?: number;
  /** the wallet the buyer would pay, for the evidence record */
  recipientAddress?: string;
  recipientName?: string;
  /**
   * Optional held-out audit (REPUTATION §8f): the buyer commits a secret set of
   * keys it will additionally check at strict tolerance. The worker never sees
   * WHICH keys — only that a held-out check exists — so it can't fake only the
   * publicly-sampled rows. Revealed at resolution, stored on Walrus, verified
   * against the commit, and run alongside the public sample.
   */
  heldout?: {
    /** the buyer's secret audit keys (subset of the submitted rows' keys) */
    auditKeys: string[];
    /** salt for the hiding commitment (auto-generated if omitted) */
    salt?: string;
    /** strict tolerance for the audit (default 0 — exact match) */
    tolerance?: number;
    /** value fields the audit compares numerically (defaults to the public ones) */
    numericFields?: string[];
  };
};

function isRecordArray(value: unknown): value is DataRecord[] {
  return (
    Array.isArray(value) &&
    value.every(
      (r) => r && typeof r === "object" && typeof (r as DataRecord).key === "string"
    )
  );
}

export async function POST(request: Request) {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!isRecordArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json(
      { error: "`rows` must be a non-empty array of { key, value } records" },
      { status: 400 }
    );
  }
  if (body.sample !== undefined && !isRecordArray(body.sample)) {
    return NextResponse.json(
      { error: "`sample` must be an array of { key, value } records" },
      { status: 400 }
    );
  }

  const rows = body.rows;
  const intent = body.intent ?? "Reconcile the submitted dataset against ground truth";
  const recipientAddress = body.recipientAddress ?? "0x0000000000000000000000000000000000000000";

  // 1. Commit-reveal integrity. If the worker locked a commit, the revealed rows
  //    must reproduce it; if it didn't supply one, we compute the canonical one.
  const rowsCommit = body.rowsCommit ?? (await commitDataset(rows));
  const dataset = { rows, rowsCommit };
  const commitVerified = await verifyDatasetReveal(dataset);

  // 2. Derive the spot-check sample FROM the commit (unpredictable pre-commit).
  const allKeys = rows.map((r) => r.key);
  const sampleKeys = deriveSampleKeys(
    rowsCommit,
    allKeys,
    typeof body.sampleSize === "number" ? body.sampleSize : DEFAULT_SAMPLE_SIZE
  );

  const numericFields = body.numericFields ?? [];
  const tolerance = typeof body.tolerance === "number" ? body.tolerance : 0;

  // 3. The public check def (what the worker sees) + its runtime form (with the
  //    verifier's ground-truth sample injected). Per §8f, the committed def binds
  //    the *requirement* (which keys, what tolerance); the `sample` is a held-out
  //    *input* injected only at resolution.
  const publicDef: CheckSpec = {
    type: "data_reconcile",
    hardGate: true,
    sampleKeys,
    numericFields,
    tolerance
  };
  const runtimePublic: CheckSpec = { ...publicDef, sample: body.sample ?? [], commitVerified };

  // 3b. Optional held-out audit: the buyer's secret keys, committed pre-work and
  //     revealed here. Stored on Walrus as its own blob, verified against the
  //     commit, then run at strict tolerance alongside the public sample.
  let runtimeChecks: CheckSpec[] = [runtimePublic];
  let resolvedDefs: CheckSpec[] = [publicDef];
  let heldoutReveal: HeldoutRevealPointer | undefined;
  let specHash: string;
  let heldout: {
    used: boolean;
    auditKeys?: string[];
    hiddenCount?: number;
    commit?: string;
    revealVerified?: boolean;
    revealStore?: string;
    revealBlobId?: string | null;
    revealUri?: string | null;
    revealHash?: string;
  } = { used: false };

  if (body.heldout && Array.isArray(body.heldout.auditKeys)) {
    // Only audit keys that are actually in the submitted rows are meaningful.
    const auditKeys = body.heldout.auditKeys.filter((k) => allKeys.includes(k));
    const hiddenDef: CheckSpec = {
      type: "data_reconcile",
      hardGate: true,
      sampleKeys: auditKeys,
      numericFields: body.heldout.numericFields ?? numericFields,
      tolerance: typeof body.heldout.tolerance === "number" ? body.heldout.tolerance : 0
    };
    const salt = body.heldout.salt ?? randomSalt();

    // Commit (binds the hidden audit at "lock"), then reveal + publish to Walrus.
    const heldoutManifest = await buildHeldoutManifest({
      intent,
      publicChecks: [publicDef],
      hiddenChecks: [hiddenDef],
      salt
    });
    const reveal = { hiddenChecks: [hiddenDef], salt };
    const verified = await verifyHeldoutReveal(heldoutManifest, reveal);
    heldoutReveal = await storeHeldoutReveal(reveal);

    // Inject runtime inputs into each revealed hidden check, then run public + hidden.
    const runtimeHidden = reveal.hiddenChecks.map((c) => ({
      ...c,
      sample: body.sample ?? [],
      commitVerified
    }));
    runtimeChecks = [runtimePublic, ...runtimeHidden];
    resolvedDefs = [publicDef, ...reveal.hiddenChecks];
    // The on-chain specHash binds the HELD-OUT manifest (commit included).
    specHash = await hashBlob(heldoutManifest);
    heldout = {
      used: true,
      auditKeys,
      hiddenCount: heldoutManifest.hiddenCount,
      commit: heldoutManifest.hiddenChecksCommit,
      revealVerified: verified.valid,
      revealStore: heldoutReveal.store,
      revealBlobId: heldoutReveal.blobId ?? null,
      revealUri: heldoutReveal.uri ?? null,
      revealHash: heldoutReveal.hash
    };
  } else {
    specHash = await hashBlob(buildManifest({ intent, checks: resolvedDefs }));
  }

  const submission: WorkerSubmission = {
    recipientAddress,
    ...(body.recipientName ? { recipientName: body.recipientName } : {}),
    invoice: {},
    dataset
  };
  const ctx: TaskContext = {
    submission,
    recipientAddress,
    ...(body.recipientName ? { recipientName: body.recipientName } : {})
  };

  const reports = runChecks(runtimeChecks, ctx);
  const scored: ScoredCheck[] = runtimeChecks.map((check, i) => ({ check, report: reports[i] }));
  const split = scoreSplit({ checks: scored });

  // 4. Anchor a replayable evidence blob — the hash the escrow resolves against.
  //    taskSpec records the full resolved check set (public + revealed hidden);
  //    heldoutReveal points at the Walrus blob holding the revealed audit.
  const manifest = buildManifest({ intent, checks: resolvedDefs });
  const evidence = buildEvidenceBlob({
    taskSpec: manifest,
    workerOutput: submission,
    checkerReports: reports,
    checkerRuntime: buildCheckerRuntimeManifest(runtimeChecks),
    splitScore: split,
    recommendation: split.recommendation,
    ...(heldoutReveal ? { heldoutReveal } : {})
  });
  const [stored, settlement] = await Promise.all([
    storeEvidence(evidence),
    planResolution(split)
  ]);

  // 5. The settlement decision: the exact resolve() args the escrow consumes.
  //    specHash = the committed (held-out) acceptance manifest; evidenceHash = the
  //    anchored blob; both flow on-chain so the verdict is reproducible.
  return NextResponse.json({
    intent,
    rowsCommit,
    commitVerified,
    sampledKeys: sampleKeys,
    sampledCount: sampleKeys.length,
    totalRows: rows.length,
    reports,
    split,
    recommendation: split.recommendation,
    evidenceHash: stored.hash,
    evidenceStore: stored.store,
    evidenceUri: stored.uri ?? null,
    specHash,
    heldout,
    settlement
  });
}
