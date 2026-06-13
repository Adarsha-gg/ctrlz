/**
 * wallet-risk-checker (B2) — deterministic, pure, replayable.
 *
 * REUSES the merged risk engine (`scoreRecipient`, web/lib/risk) unchanged.
 * It maps the engine's tier to a checker result + confidence:
 *
 *   red    → fail       (address poisoning / flags / fraud recalls)
 *   yellow → uncertain  (limited history, ENS mismatch, no history)
 *   green  → pass        (known contact / established settlement history)
 *
 * The acceptance spec's `maxTier` (default "yellow") declares the worst tier
 * that still gates money: a tier worse than `maxTier` is an objective fail.
 *
 * Ethos guard: the LLM is NOT here. The engine's deterministic signals decide;
 * this checker only translates them into the report shape.
 */

import { scoreRecipient, DEMO_ADDRESS_BOOK, KNOWN_NAMES } from "../risk/index.ts";
import type { RecipientHistory, VerdictTier } from "../risk/index.ts";
import type { Checker, CheckerReport, CheckSpec, TaskContext } from "./types.ts";

const CHECKER = "wallet-risk-checker";

const TIER_RESULT: Record<VerdictTier, CheckerReport["result"]> = {
  red: "fail",
  yellow: "uncertain",
  green: "pass"
};

/** Higher = more confident the result is correct. */
const TIER_CONFIDENCE: Record<VerdictTier, number> = {
  red: 0.97,
  yellow: 0.6,
  green: 0.92
};

const TIER_RANK: Record<VerdictTier, number> = { green: 0, yellow: 1, red: 2 };

export const walletRiskChecker: Checker = (check: CheckSpec, ctx: TaskContext): CheckerReport => {
  const history =
    check.history && typeof check.history === "object"
      ? (check.history as RecipientHistory)
      : undefined;

  const verdict = scoreRecipient({
    address: ctx.recipientAddress,
    typedName: ctx.recipientName,
    addressBook: DEMO_ADDRESS_BOOK,
    knownNames: KNOWN_NAMES,
    history
  });

  const maxTier: VerdictTier =
    check.maxTier === "red" || check.maxTier === "green" ? check.maxTier : "yellow";

  // A tier worse than the spec's allowance is an objective fail, even if the
  // raw engine tier was only "yellow" (e.g. maxTier: "green").
  const worseThanAllowed = TIER_RANK[verdict.tier] > TIER_RANK[maxTier];

  const baseResult = TIER_RESULT[verdict.tier];
  const result: CheckerReport["result"] = worseThanAllowed ? "fail" : baseResult;

  const detail =
    verdict.reasons.length > 0
      ? `Recipient risk tier ${verdict.tier} (cap ${maxTier}). ${verdict.reasons.join(" ")}`
      : `Recipient risk tier ${verdict.tier} (cap ${maxTier}).`;

  return {
    checker: CHECKER,
    result,
    confidence: TIER_CONFIDENCE[verdict.tier],
    detail,
    evidenceHash: ctx.submission.evidenceHash
  };
};
