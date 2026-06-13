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

/** check.type → checker. Demo set per BUILD_PLAN §6. */
export const CHECKER_REGISTRY: Record<string, Checker> = {
  schema: schemaChecker,
  price_max: priceChecker,
  wallet_risk: walletRiskChecker,
  source_listing: sourceListingChecker
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
