/**
 * data-reconcile-checker (§ deterministic niche) — pure, sync, replayable.
 *
 * Verifies an expensive data-aggregation output by SAMPLED RECOMPUTE, not full
 * recompute. The async layer (`reconcile.ts`, called by the submission route)
 * has already: (a) verified the revealed rows match the worker's commit, and
 * (b) derived which keys to spot-check from that commit. Both results are handed
 * to this checker on the spec, keeping the checker a pure (check, ctx) → report.
 *
 * The check spec (`type: "data_reconcile"`) carries:
 *   sample:        DataRecord[]  ground truth the verifier re-fetched, for the sampled keys
 *   sampleKeys:    string[]      the commit-derived keys that MUST be covered
 *   commitVerified boolean       did the revealed rows hash to the commitment?
 *   numericFields  string[]      value fields compared with `tolerance` (others exact)
 *   tolerance      number        allowed absolute delta on numeric fields (default 0)
 *
 * Verdicts:
 *   fail      — commit mismatch (tampering), a sampled row missing/wrong, or a
 *               numeric field outside tolerance. Objective, money-gating.
 *   uncertain — nothing to check against (no dataset, no sample, no ground truth
 *               for a sampled key). Never a false money-gate.
 *   pass      — every sampled row matches ground truth. confidence = coverage
 *               (k/N), an honest "this fraction was recomputed".
 */

import type { Checker, CheckerReport, CheckSpec, DataRecord, TaskContext } from "./types.ts";

const CHECKER = "data-reconcile-checker";
const MAX_REPORTED_DIFFS = 3;

function asRecords(value: unknown): DataRecord[] {
  return Array.isArray(value) ? (value as DataRecord[]) : [];
}

function fieldDiff(
  key: string,
  worker: Record<string, string | number>,
  truth: Record<string, string | number>,
  numericFields: string[],
  tolerance: number
): string | null {
  for (const field of Object.keys(truth)) {
    const expected = truth[field];
    const got = worker[field];
    if (numericFields.includes(field) && typeof expected === "number") {
      const gotNum = typeof got === "number" ? got : Number(got);
      if (!Number.isFinite(gotNum) || Math.abs(gotNum - expected) > tolerance) {
        return `${key}.${field}: expected ${expected}±${tolerance}, got ${got ?? "—"}`;
      }
    } else if (String(got) !== String(expected)) {
      return `${key}.${field}: expected ${expected}, got ${got ?? "—"}`;
    }
  }
  return null;
}

export const dataReconcileChecker: Checker = (check: CheckSpec, ctx: TaskContext): CheckerReport => {
  const evidenceHash = ctx.submission.evidenceHash;
  const dataset = ctx.submission.dataset;
  const sampleKeys = (Array.isArray(check.sampleKeys) ? check.sampleKeys : []) as string[];
  const sample = asRecords(check.sample);
  const numericFields = (Array.isArray(check.numericFields) ? check.numericFields : []) as string[];
  const tolerance = typeof check.tolerance === "number" ? check.tolerance : 0;

  if (!dataset || dataset.rows.length === 0) {
    return {
      checker: CHECKER,
      result: "uncertain",
      confidence: 0.5,
      detail: "No dataset was submitted — nothing to reconcile.",
      evidenceHash
    };
  }

  // Anti-swap: the revealed rows must be the ones the worker committed to.
  if (check.commitVerified === false) {
    return {
      checker: CHECKER,
      result: "fail",
      confidence: 1,
      detail:
        "Revealed rows do not match the committed hash — the dataset was altered after commit.",
      evidenceHash
    };
  }

  if (sampleKeys.length === 0) {
    return {
      checker: CHECKER,
      result: "uncertain",
      confidence: 0.5,
      detail: "No sample keys were derived — cannot spot-check this dataset.",
      evidenceHash
    };
  }

  const workerByKey = new Map(dataset.rows.map((row) => [row.key, row.value]));
  const truthByKey = new Map(sample.map((row) => [row.key, row.value]));

  const diffs: string[] = [];
  let verified = 0;

  for (const key of sampleKeys) {
    const truth = truthByKey.get(key);
    if (!truth) {
      // The verifier didn't supply ground truth for a key it was supposed to
      // check — we can't conclude pass/fail. Don't false-gate the money.
      return {
        checker: CHECKER,
        result: "uncertain",
        confidence: 0.4,
        detail: `Ground truth missing for sampled key ${key} — verifier sample is incomplete.`,
        evidenceHash
      };
    }
    const worker = workerByKey.get(key);
    if (!worker) {
      diffs.push(`${key}: worker omitted this sampled row`);
      continue;
    }
    const diff = fieldDiff(key, worker, truth, numericFields, tolerance);
    if (diff) {
      diffs.push(diff);
    } else {
      verified += 1;
    }
  }

  if (diffs.length > 0) {
    const shown = diffs.slice(0, MAX_REPORTED_DIFFS).join("; ");
    const more = diffs.length > MAX_REPORTED_DIFFS ? ` (+${diffs.length - MAX_REPORTED_DIFFS} more)` : "";
    return {
      checker: CHECKER,
      result: "fail",
      confidence: 1,
      detail: `${diffs.length}/${sampleKeys.length} sampled rows disagree with ground truth: ${shown}${more}.`,
      evidenceHash
    };
  }

  const coverage = Math.round((sampleKeys.length / dataset.rows.length) * 100) / 100;
  return {
    checker: CHECKER,
    result: "pass",
    confidence: Math.max(0.5, Math.min(1, coverage)),
    detail: `All ${verified} spot-checked rows match ground truth (${sampleKeys.length}/${dataset.rows.length} rows = ${Math.round(
      coverage * 100
    )}% recomputed).`,
    evidenceHash
  };
};
