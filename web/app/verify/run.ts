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
  storeEvidence,
  type AcceptanceManifest,
  type EvidenceBlob,
  type StoreResult
} from "@/lib/walrus";
import {
  applyWorldTrustBoost,
  decideWorldGate,
  type WorldGateDecision,
  type WorldTrustBoost
} from "@/lib/world";
import { CHECKER_HISTORY, DEMO_ACCEPTANCE_SPEC, type DemoSubmission } from "./fixtures";

export type VerificationResult = {
  scored: ScoredCheck[];
  reports: CheckerReport[];
  split: SplitScore;
  checkerMeta: CheckerMeta[];
  /** World AgentKit-style free-trial/payment gate + human-backing signal (F1) */
  worldGate: WorldGateDecision;
  /** capped baseline adjustment applied only to agentTrust, never output checks */
  worldTrustBoost: WorldTrustBoost;
  /** the acceptance-spec manifest this submission was judged against (E2) */
  manifest: AcceptanceManifest;
  /** the assembled evidence blob (E2) — the thing money resolves against */
  evidence: EvidenceBlob;
};

/** The evidence + manifest anchors surfaced in the UI (E2). */
export type EvidenceAnchors = {
  /** evidence-blob store result (Walrus or local fallback) + sha256 anchor */
  evidence: StoreResult;
  /** acceptance-manifest sha256 anchor (Codex's on-chain commit uses this) */
  manifestHash: string;
};

/** Run the demo acceptance spec over a submission and produce the split score. */
export function verifySubmission(demo: DemoSubmission): VerificationResult {
  // Inject the demo's wallet history onto the wallet_risk check so the risk
  // engine sees the seeded settlement counters.
  const checks: CheckSpec[] = DEMO_ACCEPTANCE_SPEC.checks.map((c) =>
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
  const rawSplit = scoreSplit({ checks: scored, workerHistory: demo.workerHistory });
  const worldGate = decideWorldGate({
    agentId: demo.worldAgent.agentId,
    usedVerifications: demo.worldAgent.usedVerifications,
    identity: demo.worldAgent.identity
  });
  const { split, boost: worldTrustBoost } = applyWorldTrustBoost(
    rawSplit,
    worldGate,
    demo.worldAgent.identity
  );

  // Assemble the verifiable manifest + evidence blob (E2). The manifest uses the
  // injected checks (so its hash reflects exactly what was evaluated); the
  // evidence blob bundles spec + worker output + reports + the split score.
  const manifest = buildManifest({ intent: DEMO_ACCEPTANCE_SPEC.intent, checks });
  const evidence = buildEvidenceBlob({
    taskSpec: manifest,
    workerOutput: demo.submission,
    checkerReports: reports,
    checkerRuntime: buildCheckerRuntimeManifest(checks),
    splitScore: split,
    recommendation: split.recommendation,
    checkerMeta
  });

  return { scored, reports, split, checkerMeta, worldGate, worldTrustBoost, manifest, evidence };
}

/**
 * Anchor the evidence (E2): compute the manifest hash and store the evidence
 * blob (Walrus → local fallback). Best-effort and NEVER throws — on any Walrus
 * failure the evidence store degrades to `{ store: "local", hash }` so the page
 * always has a hash to render.
 */
export async function anchorEvidence(result: VerificationResult): Promise<EvidenceAnchors> {
  const [evidence, manifestHash] = await Promise.all([
    storeEvidence(result.evidence),
    hashBlob(result.manifest)
  ]);
  return { evidence, manifestHash };
}
