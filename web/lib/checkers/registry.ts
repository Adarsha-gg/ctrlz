/**
 * Checker registry + runner (B1 / §6).
 *
 * The registry maps `check.type → checker`. The runner executes each check in a
 * spec, in order, and collects the reports. Unknown check types degrade to an
 * `uncertain` report rather than throwing — a spec must never crash the runner.
 *
 * Ethos guard: each registered checker is bounded + deterministic, so
 * `runChecks(checks, ctx)` is itself replayable: same inputs → same reports[].
 */

import type { Checker, CheckerReport, CheckSpec, TaskContext } from "./types.ts";
import { schemaChecker } from "./schema.ts";
import { priceChecker } from "./price.ts";
import { walletRiskChecker } from "./walletRisk.ts";
import { sourceListingChecker } from "./sourceListing.ts";
import { dataReconcileChecker } from "./dataReconcile.ts";
import { testsPassChecker } from "./testsPass.ts";

/** check.type → checker. Demo set per BUILD_PLAN §6. */
export const CHECKER_REGISTRY: Record<string, Checker> = {
  schema: schemaChecker,
  price_max: priceChecker,
  wallet_risk: walletRiskChecker,
  source_listing: sourceListingChecker,
  data_reconcile: dataReconcileChecker,
  tests_pass: testsPassChecker
};

/** Look up a checker by check type; undefined if none is registered. */
export function getChecker(type: string): Checker | undefined {
  return CHECKER_REGISTRY[type];
}

/** Report for a spec'd check whose type has no registered checker. */
function unknownReport(check: CheckSpec, ctx: TaskContext): CheckerReport {
  return {
    checker: `unregistered:${check.type}`,
    result: "uncertain",
    confidence: 0,
    detail: `No checker is registered for check type "${check.type}".`,
    evidenceHash: ctx.submission.evidenceHash
  };
}

/** Run every check in the spec and collect the reports, in spec order. */
export function runChecks(checks: CheckSpec[], ctx: TaskContext): CheckerReport[] {
  return checks.map((check) => {
    const checker = getChecker(check.type);
    return checker ? checker(check, ctx) : unknownReport(check, ctx);
  });
}

export type ReplayStatus = "match" | "mismatch" | "unregistered";

export type ReplayCheck = {
  checker: string;
  status: ReplayStatus;
  replayable: boolean;
};

function comparableReport(report: CheckerReport) {
  return {
    checker: report.checker,
    result: report.result,
    confidence: report.confidence,
    detail: report.detail,
    evidenceHash: report.evidenceHash
  };
}

/** Re-run reports against the same input and compare stable report fields. */
export function replayChecks(
  checks: CheckSpec[],
  ctx: TaskContext,
  previousReports: CheckerReport[]
): ReplayCheck[] {
  const rerun = runChecks(checks, ctx);
  return rerun.map((report, index) => {
    const check = checks[index];
    const registered = Boolean(getChecker(check.type));
    if (!registered) {
      return { checker: report.checker, status: "unregistered", replayable: false };
    }
    const previous = previousReports[index];
    const status =
      previous && JSON.stringify(comparableReport(previous)) === JSON.stringify(comparableReport(report))
        ? "match"
        : "mismatch";
    return { checker: report.checker, status, replayable: true };
  });
}
