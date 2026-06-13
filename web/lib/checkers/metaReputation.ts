import type { CheckResult, CheckerReport } from "./types.ts";
import type { ReplayCheck } from "./registry.ts";

export type SettledOutcome = "paid" | "refunded" | "buyer_accepted" | "disputed";

export type CheckerOutcomeRecord = {
  checker: string;
  result: CheckResult;
  confidence: number;
  settledOutcome: SettledOutcome;
  amountUsd: number;
  settledAt: string;
};

export type CheckerMeta = {
  checker: string;
  accuracy: number;
  weight: number;
  sampleCount: number;
  weightedSample: number;
  truePass: number;
  trueFail: number;
  falsePass: number;
  falseFail: number;
  abstained: number;
  replay: ReplayCheck;
};

const NOW = Date.parse("2026-06-13T00:00:00.000Z");
const DEFAULT_WEIGHT = 0.72;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function expectedResult(outcome: SettledOutcome): CheckResult | null {
  if (outcome === "paid" || outcome === "buyer_accepted") return "pass";
  if (outcome === "refunded") return "fail";
  return null;
}

function recordWeight(record: CheckerOutcomeRecord): number {
  const ageDays = Math.max(0, (NOW - Date.parse(record.settledAt)) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / 45);
  const money = Math.min(4, Math.max(0.5, Math.log10(Math.max(record.amountUsd, 1)) + 0.5));
  return recency * money;
}

function recordScore(record: CheckerOutcomeRecord): number | null {
  const expected = expectedResult(record.settledOutcome);
  if (!expected) return null;
  if (record.result === "uncertain") return 0.62;
  return record.result === expected ? 1 : 0;
}

export function computeCheckerMeta(
  checker: string,
  history: CheckerOutcomeRecord[],
  replay: ReplayCheck
): CheckerMeta {
  const records = history.filter((r) => r.checker === checker);
  let weightedCorrect = 0;
  let weightedTotal = 0;
  let truePass = 0;
  let trueFail = 0;
  let falsePass = 0;
  let falseFail = 0;
  let abstained = 0;

  for (const record of records) {
    const score = recordScore(record);
    if (score === null) continue;

    const expected = expectedResult(record.settledOutcome);
    if (record.result === "uncertain") abstained++;
    else if (record.result === "pass" && expected === "pass") truePass++;
    else if (record.result === "fail" && expected === "fail") trueFail++;
    else if (record.result === "pass" && expected === "fail") falsePass++;
    else if (record.result === "fail" && expected === "pass") falseFail++;

    const weight = recordWeight(record) * clamp01(record.confidence || 0.5);
    weightedCorrect += score * weight;
    weightedTotal += weight;
  }

  const accuracy = weightedTotal > 0 ? weightedCorrect / weightedTotal : DEFAULT_WEIGHT;
  const replayBonus = replay.status === "match" ? 0.06 : replay.status === "mismatch" ? -0.2 : -0.12;
  const rawWeight = replay.replayable
    ? clamp01(0.25 + accuracy * 0.69 + replayBonus)
    : checker.startsWith("unregistered:")
      ? 0
      : clamp01(accuracy);
  const weight = replay.status === "mismatch" ? Math.min(rawWeight, 0.49) : rawWeight;

  return {
    checker,
    accuracy: Math.round(accuracy * 100) / 100,
    weight: Math.round(weight * 100) / 100,
    sampleCount: records.length,
    weightedSample: Math.round(weightedTotal * 100) / 100,
    truePass,
    trueFail,
    falsePass,
    falseFail,
    abstained,
    replay
  };
}

export function computeCheckerMetas(input: {
  reports: CheckerReport[];
  history: CheckerOutcomeRecord[];
  replays: ReplayCheck[];
}): CheckerMeta[] {
  return input.reports.map((report, index) =>
    computeCheckerMeta(
      report.checker,
      input.history,
      input.replays[index] ?? { checker: report.checker, status: "unregistered", replayable: false }
    )
  );
}
