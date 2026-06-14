/**
 * Settlement decision (§ the resolution the escrow consumes).
 *
 * The split-score recommendation is the last deterministic step before money
 * moves. This module maps it onto the exact arguments `CtrlZVerifyEscrow.resolve`
 * takes on-chain — so the same verdict the checkers produced is what releases or
 * refunds the escrow. No LLM, no human in this path; pure + replayable.
 *
 * Contract surface (contracts/src/CtrlZVerifyEscrow.sol):
 *   enum VerificationResult { PASS, FAIL, UNCERTAIN }   // ordinals 0,1,2
 *   resolve(id, VerificationResult result, bytes32 evidenceHash,
 *           uint16 scoreBps, bytes32 recommendationHash)
 *
 * Mapping (conservative — uncertainty never auto-releases):
 *   proceed / proceed_with_protection → PASS      → escrow releases to worker
 *   reject                            → FAIL      → escrow refunds buyer
 *   pause                             → UNCERTAIN → escrow holds for buyer call
 */

import type { Recommendation, SplitScore } from "../scoring/score.ts";
import { hashBlob } from "../walrus/store.ts";

/** Ordinals MUST match the on-chain `VerificationResult` enum order. */
export const VERIFICATION_RESULT = { PASS: 0, FAIL: 1, UNCERTAIN: 2 } as const;
export type VerificationResultLabel = keyof typeof VERIFICATION_RESULT;
export type VerificationResultCode = (typeof VERIFICATION_RESULT)[VerificationResultLabel];

export type ResolvePlan = {
  /** the on-chain `VerificationResult` ordinal passed to resolve() */
  result: VerificationResultCode;
  resultLabel: VerificationResultLabel;
  /** outputValidity score mapped to basis points (0..10000) */
  scoreBps: number;
  /** the deterministic recommendation that produced this resolution */
  recommendation: Recommendation;
  /** sha256 of the recommendation label — the on-chain `recommendationHash` */
  recommendationHash: string;
  /** PASS → release to worker; FAIL → refund buyer; UNCERTAIN → hold */
  releases: boolean;
  /** plain-English one-liner for the UI/receipt */
  detail: string;
};

const MAP: Record<
  Recommendation,
  { result: VerificationResultCode; label: VerificationResultLabel; releases: boolean; detail: string }
> = {
  proceed: {
    result: VERIFICATION_RESULT.PASS,
    label: "PASS",
    releases: true,
    detail: "All hard-gate checks passed — escrow releases payment to the worker."
  },
  proceed_with_protection: {
    result: VERIFICATION_RESULT.PASS,
    label: "PASS",
    releases: true,
    detail: "Hard-gates passed with advisory/payment flags — release, with buyer protection noted."
  },
  pause: {
    result: VERIFICATION_RESULT.UNCERTAIN,
    label: "UNCERTAIN",
    releases: false,
    detail: "A hard-gate was uncertain — escrow holds for the buyer to decide."
  },
  reject: {
    result: VERIFICATION_RESULT.FAIL,
    label: "FAIL",
    releases: false,
    detail: "An objective hard-gate failed — escrow refunds the buyer."
  }
};

/** Clamp the outputValidity score (0..100) into contract basis points. */
export function scoreToBps(score: number): number {
  return Math.round(Math.max(0, Math.min(100, score)) * 100);
}

/**
 * Build the settlement plan from a split score. `recommendationHash` is the
 * canonical sha256 of the recommendation label (same hashing the evidence layer
 * uses), so the on-chain commit is reproducible from the recommendation alone.
 */
export async function planResolution(split: SplitScore): Promise<ResolvePlan> {
  const mapped = MAP[split.recommendation];
  const recommendationHash = await hashBlob(split.recommendation);
  return {
    result: mapped.result,
    resultLabel: mapped.label,
    scoreBps: scoreToBps(split.outputValidity.score),
    recommendation: split.recommendation,
    recommendationHash,
    releases: mapped.releases,
    detail: mapped.detail
  };
}
