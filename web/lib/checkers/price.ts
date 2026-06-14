/**
 * price-checker (B2) — deterministic, pure, replayable.
 *
 * Enforces `amount ≤ check.value` in the spec's currency (HBAR for the demo).
 * Over-budget is an objective hard fail; a missing/unparseable amount is
 * `uncertain` (the schema-checker is responsible for presence) rather than a
 * false money-gate.
 */

import type { Checker, CheckerReport, CheckSpec, TaskContext } from "./types.ts";

const CHECKER = "price-checker";

export const priceChecker: Checker = (check: CheckSpec, ctx: TaskContext): CheckerReport => {
  const max = typeof check.value === "number" ? check.value : NaN;
  const currency = typeof check.currency === "string" ? check.currency : "HBAR";
  const amount = ctx.submission.invoice.amount;
  const evidenceHash = ctx.submission.evidenceHash;

  if (typeof amount !== "number" || Number.isNaN(amount) || Number.isNaN(max)) {
    return {
      checker: CHECKER,
      result: "uncertain",
      confidence: 0.5,
      detail:
        typeof amount !== "number"
          ? "Invoice amount is missing or non-numeric — cannot evaluate the price cap."
          : "Price cap is not specified on the acceptance spec.",
      evidenceHash
    };
  }

  if (amount > max) {
    return {
      checker: CHECKER,
      result: "fail",
      confidence: 1,
      detail: `Invoice amount ${amount} ${currency} exceeds the ${max} ${currency} cap by ${
        Math.round((amount - max) * 100) / 100
      } ${currency}.`,
      evidenceHash
    };
  }

  return {
    checker: CHECKER,
    result: "pass",
    confidence: 1,
    detail: `Invoice amount ${amount} ${currency} is within the ${max} ${currency} cap.`,
    evidenceHash
  };
};
