/**
 * POST /verify/payongreen — the pay-on-green workflow (§ pay-on-green).
 *
 * The simplest verifiable agent-to-agent job: a worker delivers a code patch;
 * the buyer's test suite is the acceptance standard; the suite's exit state is
 * the verdict. Expensive to produce (real engineering), cheap to verify (run the
 * tests once), binary (green or not). This route is the spine — a near-twin of
 * /verify/submit, but the artifact is a patch and the checker is `tests_pass`.
 *
 * Flow (commit-reveal, mirrors /verify/submit + held-out tests):
 *   1. Worker reveals its `patch` (diff) + the `patchCommit` it locked. We verify
 *      the reveal hashes to the commit (anti-swap).
 *   2. The verifier's run of the suite against that patch (`results`) is injected
 *      onto the check — the exact analog of data_reconcile's re-fetched `sample`.
 *      (Inject-first; a real sandbox runner is a drop-in behind this interface.)
 *   3. The deterministic `tests_pass` checker compares the run against the
 *      acceptance set → pass/fail. Held-out tests (buyer's hidden suite) are
 *      committed pre-work and revealed here, run alongside the public set.
 *   4. Split-score it, anchor a replayable evidence blob, return the verdict +
 *      hashes the escrow `resolve()` consumes. Green → release; red → refund.
 *
 * The checkers decide; no LLM is in this path.
 */

import { NextResponse } from "next/server";
import {
  buildCheckerRuntimeManifest,
  runChecks,
  type CheckSpec,
  type TaskContext,
  type TestResult,
  type WorkerSubmission
} from "@/lib/checkers";
import { buildHeldoutManifest, randomSalt } from "@/lib/checkers/heldout";
import { commitPatch, verifyPatchReveal } from "@/lib/checkers/patchwork";
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

type PayOnGreenBody = {
  intent?: string;
  /** the worker's code patch, revealed at submit */
  patch?: { diff?: string; patchCommit?: string };
  /** the public acceptance tests the worker sees (names that MUST pass) */
  requiredTests?: string[];
  /**
   * The verifier's run of the FULL suite (public + any held-out) against the
   * patch — ground truth, injected here like data_reconcile's `sample`. A real
   * sandbox runner would produce this; inject-first lets the loop run end-to-end.
   */
  results?: TestResult[];
  /** the wallet the buyer would pay, for the evidence record */
  recipientAddress?: string;
  recipientName?: string;
  /**
   * Optional held-out audit (REPUTATION §8f): the buyer commits a secret set of
   * test names it will additionally require, pre-work. The worker never sees
   * WHICH tests — only that a held-out check exists — so it can't hardcode to the
   * public set. Revealed at resolution, stored on Walrus, verified against the
   * commit, and run alongside the public acceptance set.
   */
  heldout?: {
    /** the buyer's secret test names (run against the same `results`) */
    hiddenTests: string[];
    /** salt for the hiding commitment (auto-generated if omitted) */
    salt?: string;
  };
};

function isTestResultArray(value: unknown): value is TestResult[] {
  return (
    Array.isArray(value) &&
    value.every(
      (r) => r && typeof r === "object" && typeof (r as TestResult).name === "string"
    )
  );
}

export async function POST(request: Request) {
  let body: PayOnGreenBody;
  try {
    body = (await request.json()) as PayOnGreenBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const diff = body.patch?.diff;
  if (typeof diff !== "string" || diff.length === 0) {
    return NextResponse.json(
      { error: "`patch.diff` must be a non-empty string" },
      { status: 400 }
    );
  }
  if (body.results !== undefined && !isTestResultArray(body.results)) {
    return NextResponse.json(
      { error: "`results` must be an array of { name, status } records" },
      { status: 400 }
    );
  }

  const intent = body.intent ?? "Deliver a patch that makes the acceptance suite green";
  const recipientAddress = body.recipientAddress ?? "0x0000000000000000000000000000000000000000";
  const requiredTests = Array.isArray(body.requiredTests) ? body.requiredTests : [];
  const results = body.results ?? [];

  // 1. Commit-reveal integrity. If the worker locked a commit, the revealed diff
  //    must reproduce it; if it didn't supply one, we compute the canonical one.
  const patchCommit = body.patch?.patchCommit ?? (await commitPatch(diff));
  const patch = { diff, patchCommit };
  const runVerified = await verifyPatchReveal(patch);

  // 2. The public check def (what the worker sees) + its runtime form (with the
  //    verifier's injected run results). Per §8f, the committed def binds the
  //    *requirement* (which tests must pass); `results` is the held-out input.
  const publicDef: CheckSpec = {
    type: "tests_pass",
    hardGate: true,
    requiredTests
  };
  const runtimePublic: CheckSpec = { ...publicDef, results, runVerified };

  // 2b. Optional held-out audit: the buyer's secret test names, committed
  //     pre-work and revealed here. Stored on Walrus, verified against the
  //     commit, then run against the same injected results as the public set.
  let runtimeChecks: CheckSpec[] = [runtimePublic];
  let resolvedDefs: CheckSpec[] = [publicDef];
  let heldoutReveal: HeldoutRevealPointer | undefined;
  let specHash: string;
  let heldout: {
    used: boolean;
    hiddenTests?: string[];
    hiddenCount?: number;
    commit?: string;
    revealVerified?: boolean;
    revealStore?: string;
    revealBlobId?: string | null;
    revealUri?: string | null;
    revealHash?: string;
  } = { used: false };

  if (body.heldout && Array.isArray(body.heldout.hiddenTests) && body.heldout.hiddenTests.length > 0) {
    const hiddenTests = body.heldout.hiddenTests;
    const hiddenDef: CheckSpec = {
      type: "tests_pass",
      hardGate: true,
      requiredTests: hiddenTests
    };
    const salt = body.heldout.salt ?? randomSalt();

    // Commit (binds the hidden tests at "lock"), then reveal + publish to Walrus.
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
    const runtimeHidden = reveal.hiddenChecks.map((c) => ({ ...c, results, runVerified }));
    runtimeChecks = [runtimePublic, ...runtimeHidden];
    resolvedDefs = [publicDef, ...reveal.hiddenChecks];
    // The on-chain specHash binds the HELD-OUT manifest (commit included).
    specHash = await hashBlob(heldoutManifest);
    heldout = {
      used: true,
      hiddenTests,
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
    patch
  };
  const ctx: TaskContext = {
    submission,
    recipientAddress,
    ...(body.recipientName ? { recipientName: body.recipientName } : {})
  };

  const reports = runChecks(runtimeChecks, ctx);
  const scored: ScoredCheck[] = runtimeChecks.map((check, i) => ({ check, report: reports[i] }));
  const split = scoreSplit({ checks: scored });

  // 3. Anchor a replayable evidence blob — the hash the escrow resolves against.
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

  // 4. The settlement decision: the exact resolve() args the escrow consumes.
  return NextResponse.json({
    intent,
    patchCommit,
    runVerified,
    requiredTests,
    totalRequired: requiredTests.length + (heldout.hiddenCount ?? 0),
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
