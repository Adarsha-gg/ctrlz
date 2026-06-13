/**
 * schema-checker (B2) — deterministic, pure, replayable.
 *
 * Verifies the worker's invoice carries the required fields. Field list is
 * declared on the check spec (`requiredFields`), defaulting to the GPU-invoice
 * demo set. A missing required field is an objective, machine-checkable fail.
 */

import type { Checker, CheckerReport, CheckSpec, TaskContext } from "./types.ts";

const CHECKER = "schema-checker";
const DEFAULT_REQUIRED = ["invoiceId", "seller", "item", "amount", "currency"];

export const schemaChecker: Checker = (check: CheckSpec, ctx: TaskContext): CheckerReport => {
  const required = Array.isArray(check.requiredFields)
    ? (check.requiredFields as string[])
    : DEFAULT_REQUIRED;
  const invoice = ctx.submission.invoice as Record<string, unknown>;

  const missing = required.filter((field) => {
    const value = invoice[field];
    return value === undefined || value === null || value === "";
  });

  const evidenceHash = ctx.submission.evidenceHash;

  if (missing.length > 0) {
    return {
      checker: CHECKER,
      result: "fail",
      confidence: 1,
      detail: `Invoice is missing required field(s): ${missing.join(", ")}.`,
      evidenceHash
    };
  }

  return {
    checker: CHECKER,
    result: "pass",
    confidence: 1,
    detail: `Invoice carries all required fields (${required.join(", ")}).`,
    evidenceHash
  };
};
