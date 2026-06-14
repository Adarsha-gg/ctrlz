/**
 * Resolution → event class (REPUTATION.md §7) — pure.
 *
 * Every settled task emits a typed event; only `fraud` propagates to siblings.
 * The signal is already in the checker reports — this just tags it:
 *   fraud   — a hard-gate fraud-class checker failed, or evidence/commit tampering
 *   quality — an honest miss (reject/pause with no fraud signal)
 *   success — a clean PASS
 */

import type { CheckerReport } from "../checkers/types.ts";
import type { Recommendation } from "../scoring/score.ts";
import type { EventClass, FraudKind } from "./types.ts";

/** Checkers whose hard-gate failure is a fraud signal (not a mere quality miss). */
const FRAUD_CHECKERS = new Set(["wallet-risk-checker"]);

/** Detail-text fingerprints of tampering/poisoning across checkers (§7). */
const TAMPER_RE = /tamper|altered after commit|do not match the committed|poison|impersonat/i;

function fraudKindFromDetail(detail: string): FraudKind {
  if (/poison/i.test(detail)) return "poisoning";
  if (/impersonat/i.test(detail)) return "impersonation";
  if (/tamper|altered|do not match the committed/i.test(detail)) return "tampered_evidence";
  return "default";
}

export function classifyResolution(input: {
  recommendation: Recommendation;
  reports: CheckerReport[];
}): { class: EventClass; fraudKind?: FraudKind } {
  const fraudFail = input.reports.find(
    (r) => r.result === "fail" && (FRAUD_CHECKERS.has(r.checker) || TAMPER_RE.test(r.detail))
  );
  if (fraudFail) {
    return { class: "fraud", fraudKind: fraudKindFromDetail(fraudFail.detail) };
  }
  if (input.recommendation === "proceed" || input.recommendation === "proceed_with_protection") {
    return { class: "success" };
  }
  // reject/pause with no fraud fingerprint = honest work below the bar.
  return { class: "quality" };
}
