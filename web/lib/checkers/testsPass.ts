/**
 * tests-pass-checker (§ pay-on-green) — pure, sync, replayable.
 *
 * The simplest, hardest-to-argue-with verification we offer: the deliverable is
 * a code patch; the acceptance standard is a test suite; the verdict is the
 * suite's exit state. Producing the patch is expensive (real engineering);
 * verifying it is cheap (run the tests once). Binary — green or not green.
 *
 * Like `dataReconcileChecker`, this checker is pure: the impure step (actually
 * running the suite against the worker's patch in a sandbox) happens in the
 * submission route, which injects the resulting `results` onto the spec — the
 * exact analog of `data_reconcile`'s injected `sample` ground truth. The checker
 * only COMPARES the run outcome against the required acceptance set, so a report
 * is reproducible from (check, ctx) alone.
 *
 * Commit-reveal (mirrors held-out tests): the worker commits the patch
 * (`patchCommit = sha256({diff})`) before the buyer reveals the held-out suite,
 * and the buyer commits the hidden tests before seeing the patch. So neither
 * side can move after the fact — the worker can't hardcode tests it can't see,
 * and the buyer can't swap in harder tests after seeing the work.
 *
 * The check spec (`type: "tests_pass"`) carries:
 *   requiredTests: string[]    the acceptance set — every one of these MUST pass
 *   results:       TestResult[] the verifier's run of the suite against the patch
 *   runVerified:   boolean      did the run correspond to the committed patch? (anti-swap)
 *
 * Verdicts:
 *   fail      — patch altered after commit, or a required test failed/errored.
 *               Objective, money-gating.
 *   uncertain — no patch, no acceptance set, or no run result for a required test
 *               (suite didn't actually exercise it). Never a false money-gate.
 *   pass      — every required test ran and passed. confidence reflects how much
 *               of the acceptance set was actually green.
 */

import type { Checker, CheckerReport, CheckSpec, TaskContext, TestResult } from "./types.ts";

const CHECKER = "tests-pass-checker";
const MAX_REPORTED_FAILURES = 3;

function asResults(value: unknown): TestResult[] {
  return Array.isArray(value) ? (value as TestResult[]) : [];
}

export const testsPassChecker: Checker = (check: CheckSpec, ctx: TaskContext): CheckerReport => {
  const evidenceHash = ctx.submission.evidenceHash;
  const patch = ctx.submission.patch;
  const requiredTests = (Array.isArray(check.requiredTests) ? check.requiredTests : []) as string[];
  const results = asResults(check.results);

  if (!patch || !patch.diff) {
    return {
      checker: CHECKER,
      result: "uncertain",
      confidence: 0.5,
      detail: "No patch was submitted — nothing to run the suite against.",
      evidenceHash
    };
  }

  // Anti-swap: the run must have been against the patch the worker committed to.
  if (check.runVerified === false) {
    return {
      checker: CHECKER,
      result: "fail",
      confidence: 1,
      detail:
        "Revealed patch does not match the committed hash — the patch was altered after commit.",
      evidenceHash
    };
  }

  if (requiredTests.length === 0) {
    return {
      checker: CHECKER,
      result: "uncertain",
      confidence: 0.5,
      detail: "No acceptance tests were specified — cannot decide pass/fail.",
      evidenceHash
    };
  }

  const byName = new Map(results.map((r) => [r.name, r]));
  const failures: string[] = [];
  let passed = 0;

  for (const name of requiredTests) {
    const result = byName.get(name);
    if (!result || result.status === "skipped") {
      // The suite didn't actually exercise a required test — we can't conclude
      // green. Don't false-gate the money; surface it as uncertain.
      return {
        checker: CHECKER,
        result: "uncertain",
        confidence: 0.4,
        detail: `Required test "${name}" did not run (${
          result ? "skipped" : "no result"
        }) — the suite is incomplete.`,
        evidenceHash
      };
    }
    if (result.status === "passed") {
      passed += 1;
    } else {
      const why = result.message ? `: ${result.message}` : "";
      failures.push(`${name} ${result.status}${why}`);
    }
  }

  if (failures.length > 0) {
    const shown = failures.slice(0, MAX_REPORTED_FAILURES).join("; ");
    const more =
      failures.length > MAX_REPORTED_FAILURES ? ` (+${failures.length - MAX_REPORTED_FAILURES} more)` : "";
    return {
      checker: CHECKER,
      result: "fail",
      confidence: 1,
      detail: `${failures.length}/${requiredTests.length} required tests are not green: ${shown}${more}.`,
      evidenceHash
    };
  }

  return {
    checker: CHECKER,
    result: "pass",
    confidence: 1,
    detail: `All ${passed}/${requiredTests.length} required tests passed — the suite is green.`,
    evidenceHash
  };
};
