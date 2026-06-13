/**
 * Glue for the /verify demo: run a demo submission through the registered
 * checkers and the split-scoring engine. Pure + deterministic — same demo
 * submission → same result, so the page is replayable.
 */

import { runChecks } from "@/lib/checkers";
import type { CheckSpec, CheckerReport, TaskContext } from "@/lib/checkers";
import { scoreSplit } from "@/lib/scoring/score";
import type { ScoredCheck, SplitScore } from "@/lib/scoring/score";
import { DEMO_ACCEPTANCE_SPEC, type DemoSubmission } from "./fixtures";

export type VerificationResult = {
  scored: ScoredCheck[];
  reports: CheckerReport[];
  split: SplitScore;
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
  const scored: ScoredCheck[] = checks.map((c, i) => ({ check: c, report: reports[i] }));
  const split = scoreSplit({ checks: scored, workerHistory: demo.workerHistory });

  return { scored, reports, split };
}
