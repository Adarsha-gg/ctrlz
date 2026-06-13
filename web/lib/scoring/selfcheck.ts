/**
 * Deterministic self-check for the verification core (A1/A2/B1/B2) — runs with
 * plain Node type-stripping, no test framework:
 *
 *   node --experimental-strip-types web/lib/scoring/selfcheck.ts
 *
 * Proves the demo beats: the CLEAN GPU invoice → proceed/proceed_with_protection
 * with all checks passing; the BAD one (poisoned wallet + price > 700) →
 * reject or pause. Each case maps to a demo beat.
 *
 * NOTE: imports use relative .ts paths (not the @/ alias) so this runs under
 * --experimental-strip-types, mirroring web/lib/risk/selfcheck.ts.
 */

import { runChecks } from "../checkers/registry.ts";
import type { CheckSpec, TaskContext } from "../checkers/types.ts";
import { scoreSplit } from "./score.ts";
import type { ScoredCheck } from "./score.ts";
import {
  DEMO_ACCEPTANCE_SPEC,
  CLEAN_SUBMISSION,
  BAD_SUBMISSION,
  type DemoSubmission
} from "../../app/verify/fixtures.ts";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Inject the demo's wallet history onto the wallet_risk check, then run + pair. */
function evaluate(demo: DemoSubmission) {
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
  return { reports, scored, split };
}

// Beat 3+5: CLEAN invoice → proceed (or proceed_with_protection), all checks pass.
{
  const { reports, split } = evaluate(CLEAN_SUBMISSION);
  const noFails = reports.every((r) => r.result === "pass");
  check(
    "CLEAN invoice → every checker passes",
    noFails,
    JSON.stringify(reports.map((r) => `${r.checker}:${r.result}`))
  );
  check(
    "CLEAN invoice → proceed / proceed_with_protection",
    split.recommendation === "proceed" || split.recommendation === "proceed_with_protection",
    JSON.stringify(split)
  );
  check(
    "CLEAN invoice → outputValidity passes, paymentRisk safe, agentTrust strong",
    split.outputValidity.status === "pass" &&
      split.paymentRisk.status === "pass" &&
      split.agentTrust.status === "strong",
    JSON.stringify(split)
  );
}

// Beat 4: BAD invoice (poisoned wallet + price > 700) → reject / pause.
{
  const { reports, split } = evaluate(BAD_SUBMISSION);
  const price = reports.find((r) => r.checker === "price-checker");
  const wallet = reports.find((r) => r.checker === "wallet-risk-checker");
  check("BAD invoice → price-checker fails (> 700)", price?.result === "fail", JSON.stringify(price));
  check(
    "BAD invoice → wallet-risk-checker fails (poisoned lookalike)",
    wallet?.result === "fail",
    JSON.stringify(wallet)
  );
  check(
    "BAD invoice → reject or pause",
    split.recommendation === "reject" || split.recommendation === "pause",
    JSON.stringify(split)
  );
  check(
    "BAD invoice → the three scores are never collapsed (distinct sub-scores present)",
    typeof split.outputValidity.score === "number" &&
      typeof split.agentTrust.score === "number" &&
      typeof split.paymentRisk.score === "number",
    JSON.stringify(split)
  );
}

// Replayability: same input → identical reports.
{
  const a = evaluate(CLEAN_SUBMISSION);
  const b = evaluate(CLEAN_SUBMISSION);
  check(
    "deterministic: re-running CLEAN yields identical reports",
    JSON.stringify(a.reports) === JSON.stringify(b.reports)
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall verification-core checks passed");
