/**
 * Walrus evidence layer — shapes (E1 / BUILD_PLAN §4, §9).
 *
 * Two content-addressed blobs live on Walrus, anchored by their sha256 hash:
 *
 *   1. The ACCEPTANCE-SPEC MANIFEST — the buyer's commitment: what was asked.
 *      Its hash is committed on-chain at intent (Codex's lane consumes the hash),
 *      so the worker can't dispute the spec and the buyer can't move the goalposts.
 *
 *   2. The EVIDENCE BLOB — what happened: the task spec, the worker's output,
 *      every checker report, the split score + recommendation. This is the thing
 *      money resolves against; its hash is anchored in the HCS receipt + ERC-8004
 *      feedback (Codex's lane).
 *
 * Ethos guard: content-addressed. The sha256 of the canonical blob is the
 * load-bearing anchor (always computed in store.ts); Walrus is the swappable
 * backend behind it. These shapes stay plain/serializable so the hash is stable.
 */

import type { CheckerReport, CheckSpec, WorkerSubmission } from "../checkers/types.ts";
import type { CheckerRuntimeManifest } from "../checkers/runtime.ts";
import type { CheckerMeta } from "../checkers/metaReputation.ts";
import type { Recommendation, SplitScore } from "../scoring/score.ts";

/**
 * The acceptance-spec manifest — the verifiable spec the buyer commits.
 * Extends what `web/app/verify/fixtures.ts` already carries for the GPU task
 * (`intent` + `checks[]`) with the resolution policy + a created-at stamp so the
 * committed manifest is self-describing on Walrus.
 */
export type AcceptanceManifest = {
  intent: string;
  checks: CheckSpec[];
  /** how the result resolves; mirrors §4 ("auto_on_hardgates" for the demo) */
  resolutionPolicy?: string;
  /** ISO timestamp the manifest was committed (optional → deterministic blobs) */
  createdAt?: string;
};

/**
 * The evidence blob — the full audit object the decision is backed by (§9).
 * One object, referenced everywhere on-chain via its hash.
 */
export type EvidenceBlob = {
  /** the spec this submission was judged against (the manifest body, or a ref) */
  taskSpec: AcceptanceManifest;
  /** what the worker actually submitted */
  workerOutput: WorkerSubmission;
  /** every checker's machine-readable report (§6) */
  checkerReports: CheckerReport[];
  /** §8e: pinned checker code + frozen external inputs for replay disputes */
  checkerRuntime: CheckerRuntimeManifest;
  /** B3: checker accuracy/replayability snapshot used for this decision */
  checkerMeta?: CheckerMeta[];
  /** the three never-collapsed scores (§7) */
  splitScore: SplitScore;
  /** the deterministic recommendation the scores produced */
  recommendation: Recommendation;
  /** ISO timestamp (optional → omit for a deterministic, replayable blob) */
  createdAt?: string;
};

/** Build the acceptance manifest from the demo spec shape (intent + checks). */
export function buildManifest(
  spec: { intent: string; checks: CheckSpec[] },
  opts?: { resolutionPolicy?: string; createdAt?: string }
): AcceptanceManifest {
  return {
    intent: spec.intent,
    checks: spec.checks,
    resolutionPolicy: opts?.resolutionPolicy ?? "auto_on_hardgates",
    ...(opts?.createdAt ? { createdAt: opts.createdAt } : {})
  };
}

/** Assemble the evidence blob from a verification run. */
export function buildEvidenceBlob(input: {
  taskSpec: AcceptanceManifest;
  workerOutput: WorkerSubmission;
  checkerReports: CheckerReport[];
  checkerRuntime: CheckerRuntimeManifest;
  checkerMeta?: CheckerMeta[];
  splitScore: SplitScore;
  recommendation: Recommendation;
  createdAt?: string;
}): EvidenceBlob {
  return {
    taskSpec: input.taskSpec,
    workerOutput: input.workerOutput,
    checkerReports: input.checkerReports,
    checkerRuntime: input.checkerRuntime,
    ...(input.checkerMeta ? { checkerMeta: input.checkerMeta } : {}),
    splitScore: input.splitScore,
    recommendation: input.recommendation,
    ...(input.createdAt ? { createdAt: input.createdAt } : {})
  };
}
