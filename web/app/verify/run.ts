/**
 * Glue for the /verify demo: run a demo submission through the registered
 * checkers and the split-scoring engine. Pure + deterministic — same demo
 * submission → same result, so the page is replayable.
 */

import { buildCheckerRuntimeManifest, replayChecks, runChecks } from "@/lib/checkers";
import type { CheckSpec, CheckerReport, TaskContext } from "@/lib/checkers";
import { computeCheckerMetas, type CheckerMeta } from "@/lib/checkers/metaReputation";
import { scoreSplit } from "@/lib/scoring/score";
import type { ScoredCheck, SplitScore } from "@/lib/scoring/score";
import {
  buildEvidenceBlob,
  buildManifest,
  hashBlob,
  readEvidence,
  storeEvidence,
  type AcceptanceManifest,
  type EvidenceBlob,
  type StoreResult
} from "@/lib/walrus";
import { CHECKER_HISTORY, DEMO_ACCEPTANCE_SPEC, type DemoSubmission } from "./fixtures";

export type AcceptanceSpecInput = {
  intent: string;
  checks: CheckSpec[];
};

export type VerificationResult = {
  scored: ScoredCheck[];
  reports: CheckerReport[];
  split: SplitScore;
  checkerMeta: CheckerMeta[];
  /** the acceptance-spec manifest this submission was judged against (E2) */
  manifest: AcceptanceManifest;
  /** the assembled evidence blob (E2) — the thing money resolves against */
  evidence: EvidenceBlob;
};

/**
 * Round-trip proof that the evidence is actually retrievable from Walrus (Sui),
 * not just claimed: re-fetch the stored blob from the aggregator and recompute
 * its hash. `retrieved` = the aggregator returned the blob; `hashMatches` = the
 * fetched bytes hash to the same sha256 anchor we committed. Both false when the
 * blob stayed local (Walrus unavailable) — the hash anchor still holds.
 */
export type WalrusReadback = {
  attempted: boolean;
  retrieved: boolean;
  hashMatches: boolean;
};

/** The evidence + manifest anchors surfaced in the UI (E2). */
export type EvidenceAnchors = {
  /** evidence-blob store result (Walrus or local fallback) + sha256 anchor */
  evidence: StoreResult;
  /** acceptance-manifest sha256 anchor (Codex's on-chain commit uses this) */
  manifestHash: string;
  /** Walrus (Sui) retrievability proof — round-trips the stored blob */
  readback: WalrusReadback;
};

/** Run an acceptance spec over a submission and produce the split score. */
export function verifySubmission(
  demo: DemoSubmission,
  spec: AcceptanceSpecInput = DEMO_ACCEPTANCE_SPEC
): VerificationResult {
  // Inject the demo's wallet history onto the wallet_risk check so the risk
  // engine sees the seeded settlement counters.
  const checks: CheckSpec[] = spec.checks.map((c) =>
    c.type === "wallet_risk" && demo.recipientHistory
      ? { ...c, history: demo.recipientHistory }
      : c
  );

  const ctx: TaskContext = {
    submission: demo.submission,
    recipientAddress: demo.submission.recipientAddress,
    recipientName: demo.submission.recipientName
  };

  const reports = runChecks(checks, ctx);
  const replays = replayChecks(checks, ctx, reports);
  const checkerMeta = computeCheckerMetas({ reports, history: CHECKER_HISTORY, replays });
  const scored: ScoredCheck[] = checks.map((c, i) => ({
    check: c,
    report: reports[i],
    metaWeight: checkerMeta[i]?.weight
  }));
  const split = scoreSplit({ checks: scored, workerHistory: demo.workerHistory });

  // Assemble the verifiable manifest + evidence blob (E2). The manifest uses the
  // injected checks (so its hash reflects exactly what was evaluated); the
  // evidence blob bundles spec + worker output + reports + the split score.
  const manifest = buildManifest({ intent: spec.intent, checks });
  const evidence = buildEvidenceBlob({
    taskSpec: manifest,
    workerOutput: demo.submission,
    checkerReports: reports,
    checkerRuntime: buildCheckerRuntimeManifest(checks),
    splitScore: split,
    recommendation: split.recommendation,
    checkerMeta
  });

  return { scored, reports, split, checkerMeta, manifest, evidence };
}

/**
 * Anchor the evidence (E2): compute the manifest hash and store the evidence
 * blob (Walrus → local fallback). Best-effort and NEVER throws — on any Walrus
 * failure the evidence store degrades to `{ store: "local", hash }` so the page
 * always has a hash to render.
 *
 * When the blob lands on Walrus (Sui), we then round-trip it: re-fetch from the
 * aggregator and recompute the sha256 to prove the evidence is genuinely
 * retrievable and content-addressed, not just a claimed hash. The read-back is
 * also best-effort — a slow/unavailable aggregator degrades to "not verified"
 * without touching the committed anchor.
 */
export async function anchorEvidence(result: VerificationResult): Promise<EvidenceAnchors> {
  const [evidence, manifestHash] = await Promise.all([
    storeEvidence(result.evidence),
    hashBlob(result.manifest)
  ]);

  const readback = await verifyRetrievable(evidence);
  return { evidence, manifestHash, readback };
}

/** Round-trip the stored blob from Walrus to prove retrievability + integrity. */
async function verifyRetrievable(evidence: StoreResult): Promise<WalrusReadback> {
  if (evidence.store !== "walrus" || !evidence.blobId) {
    return { attempted: false, retrieved: false, hashMatches: false };
  }
  const fetched = await readEvidence(evidence.blobId);
  if (fetched === undefined) {
    return { attempted: true, retrieved: false, hashMatches: false };
  }
  const refetchedHash = await hashBlob(fetched);
  return { attempted: true, retrieved: true, hashMatches: refetchedHash === evidence.hash };
}
