/**
 * Split-scoring engine (A2 / §7).
 *
 * Turns the checker reports into THREE never-collapsed scores plus a
 * deterministic recommendation:
 *
 *   outputValidity ← hard-gate checker results (is the work itself valid?)
 *   agentTrust     ← worker reputation/history  (is the counterparty trustworthy?)
 *   paymentRisk    ← the wallet-risk checker     (is paying this wallet safe?)
 *   recommendation ← deterministic policy over the three (§3/§7)
 *
 * Ethos guards:
 *  1. The LLM is NOT here — checks decide; this is a pure policy function.
 *  2. The three scores are NEVER collapsed into one.
 *  3. Same inputs → same output (replayable).
 *
 * Recommendation policy (deterministic, conservative):
 *  - any hard-gate OBJECTIVE fail (pass/fail checker) → "reject"
 *  - else any hard-gate "uncertain", or any advisory fail/uncertain → "pause"
 *  - else (all hard-gates pass, nothing advisory-flagged):
 *      paymentRisk warn/weak trust → "proceed_with_protection"; otherwise "proceed"
 */

import type { CheckerReport, CheckSpec } from "../checkers/index.ts";
import type { RecipientHistory } from "../risk/index.ts";

export type Recommendation =
  | "proceed"
  | "proceed_with_protection"
  | "pause"
  | "reject";

export type ScoreStatus = "pass" | "warn" | "fail" | "weak" | "strong" | "unknown";

export type SubScore = {
  score: number;
  status: ScoreStatus;
};

export type SplitScore = {
  outputValidity: SubScore;
  agentTrust: SubScore;
  paymentRisk: SubScore;
  recommendation: Recommendation;
};

/** A checker report paired with the spec entry that produced it. */
export type ScoredCheck = {
  check: CheckSpec;
  report: CheckerReport;
  /** B3: checker meta-reputation influence, 0..1. Defaults to 1. */
  metaWeight?: number;
};

export type ScoreInput = {
  checks: ScoredCheck[];
  /** worker settlement history; absent → agentTrust defaults to weak/unknown */
  workerHistory?: RecipientHistory;
};

const WALLET_RISK_CHECKER = "wallet-risk-checker";

function influence(check: ScoredCheck): number {
  return typeof check.metaWeight === "number" ? Math.max(0, Math.min(1, check.metaWeight)) : 1;
}

/** outputValidity ← hard-gate checker results only. */
function computeOutputValidity(checks: ScoredCheck[]): SubScore {
  const hard = checks.filter((c) => c.check.hardGate);
  if (hard.length === 0) {
    return { score: 50, status: "unknown" };
  }

  const hasFail = hard.some((c) => c.report.result === "fail");
  const hasUncertain = hard.some((c) => c.report.result === "uncertain");

  if (hasFail) {
    return { score: 8, status: "fail" };
  }
  if (hasUncertain) {
    // weighted by how confident the uncertain checks were
    const totalWeight = hard.reduce((sum, c) => sum + influence(c), 0) || 1;
    const avgConf = hard.reduce((sum, c) => sum + c.report.confidence * influence(c), 0) / totalWeight;
    return { score: Math.round(45 + avgConf * 20), status: "warn" };
  }
  return { score: 98, status: "pass" };
}

/**
 * paymentRisk ← the wallet-risk checker report. fail → high risk, uncertain →
 * warn, pass → low risk. Higher score = safer to pay.
 */
function computePaymentRisk(checks: ScoredCheck[]): SubScore {
  const wallet = checks.find((c) => c.report.checker === WALLET_RISK_CHECKER);
  if (!wallet) {
    return { score: 50, status: "unknown" };
  }
  switch (wallet.report.result) {
    case "fail":
      return { score: 6, status: "fail" };
    case "uncertain":
      return { score: 60, status: "warn" };
    case "pass":
    default:
      return { score: 94, status: "pass" };
  }
}

/**
 * agentTrust ← worker reputation/history. Mirrors the risk engine's
 * "established vs unknown" shape: distinct counterparties + sealed volume earn
 * trust; flags/recalls erode it. Default "weak/unknown" when no history.
 */
function computeAgentTrust(history?: RecipientHistory): SubScore {
  if (!history || history.sealedCount === 0) {
    return { score: 30, status: "weak" };
  }
  if (history.flagCount >= 2 || history.fraudRecallCount > 0) {
    return { score: 12, status: "fail" };
  }
  const established = history.sealedCount >= 5 && history.distinctSenders >= 3;
  if (established) {
    // distinct-counterparty weighted, capped
    const breadth = Math.min(history.distinctSenders / 50, 1);
    return { score: Math.round(70 + breadth * 25), status: "strong" };
  }
  return { score: 48, status: "weak" };
}

/** Deterministic recommendation policy over the reports + the three scores. */
function recommend(
  checks: ScoredCheck[],
  paymentRisk: SubScore,
  agentTrust: SubScore
): Recommendation {
  const hard = checks.filter((c) => c.check.hardGate);
  const advisory = checks.filter((c) => !c.check.hardGate);

  // Objective hard-gate fail → reject (auto-refund path, §5).
  if (hard.some((c) => c.report.result === "fail")) {
    return "reject";
  }
  // Hard-gate uncertainty → pause for buyer.
  if (hard.some((c) => c.report.result === "uncertain")) {
    return "pause";
  }
  // Advisory signals only pause when the checker still has enough meta-rep
  // influence. Low-accuracy advisory checkers are visible, but down-weighted.
  const advisoryFlag = advisory.some((c) => c.report.result === "fail" || c.report.result === "uncertain");
  const trustedAdvisoryFlag = advisory.some(
    (c) => (c.report.result === "fail" || c.report.result === "uncertain") && influence(c) >= 0.6
  );
  if (trustedAdvisoryFlag) {
    return "pause";
  }
  if (advisoryFlag) {
    return "proceed_with_protection";
  }
  // All hard-gates pass, nothing advisory-flagged. Trust/payment shading.
  if (paymentRisk.status === "warn" || agentTrust.status === "weak") {
    return "proceed_with_protection";
  }
  return "proceed";
}

/** Compute the split score + recommendation. Pure + deterministic. */
export function scoreSplit(input: ScoreInput): SplitScore {
  const outputValidity = computeOutputValidity(input.checks);
  const paymentRisk = computePaymentRisk(input.checks);
  const agentTrust = computeAgentTrust(input.workerHistory);
  const recommendation = recommend(input.checks, paymentRisk, agentTrust);

  return { outputValidity, agentTrust, paymentRisk, recommendation };
}
