/**
 * Baked pay-on-green demo fixture (§ pay-on-green).
 *
 * A tiny, real, self-contained repo: a buggy `sum` and a 3-test suite. Two
 * shapes of the SAME fixture:
 *   - `payOnGreenDemo`      → files + `node --test` (the subprocess runner,
 *                             local / sandbox; emits real JUnit XML).
 *   - `payOnGreenDemoInProc`→ module source + acceptance cases (the in-process
 *                             runner; pure JS, runs on Vercel; deterministic).
 * Both encode identical tests under identical names, so the verdict matches.
 *
 * The split is what makes the held-out story land:
 *   public test  (worker sees):  "adds two"            sum(2,3) === 5
 *   hidden tests (held out):     "adds negatives"      sum(-1,-1) === -2
 *                                "adds zero"           sum(0,0)  === 0
 *
 * Variants:
 *   "green" — honest fix (a - b → a + b). All three pass → release.
 *   "cheat" — hardcode `=> 5`. Passes the VISIBLE test (2+3=5) but the held-out
 *             tests catch it (-1+-1 ≠ 5) → reject. This is the demo that proves
 *             why tests are held out.
 */

import type { InProcCase } from "./inproc.ts";

const BUGGY_SUM = "export const sum = (a, b) => a - b;\n";

const TEST_FILE = `import { test } from "node:test";
import assert from "node:assert";
import { sum } from "./sum.mjs";

test("adds two", () => assert.equal(sum(2, 3), 5));
test("adds negatives", () => assert.equal(sum(-1, -1), -2));
test("adds zero", () => assert.equal(sum(0, 0), 0));
`;

/** Honest fix: a - b → a + b. */
const GREEN_PATCH = `--- a/sum.mjs
+++ b/sum.mjs
@@ -1 +1 @@
-export const sum = (a, b) => a - b;
+export const sum = (a, b) => a + b;
`;

/** Cheat: hardcode 5 — passes the visible "adds two", fails the held-out tests. */
const CHEAT_PATCH = `--- a/sum.mjs
+++ b/sum.mjs
@@ -1 +1 @@
-export const sum = (a, b) => a - b;
+export const sum = (a, b) => 5;
`;

export type DemoVariant = "green" | "cheat";

export type DemoFixture = {
  files: Record<string, string>;
  patch: string;
  command: string[];
  reportPath: string;
  /** the public acceptance test the worker sees */
  requiredTests: string[];
  /** the buyer's held-out tests (committed pre-work, revealed at resolution) */
  hiddenTests: string[];
};

/** Build the fixture for a demo variant — same files/tests, different patch. */
export function payOnGreenDemo(variant: DemoVariant): DemoFixture {
  return {
    files: { "sum.mjs": BUGGY_SUM, "sum.test.mjs": TEST_FILE },
    patch: variant === "green" ? GREEN_PATCH : CHEAT_PATCH,
    command: ["node", "--test", "--test-reporter=junit", "--test-reporter-destination=report.xml"],
    reportPath: "report.xml",
    requiredTests: ["adds two"],
    hiddenTests: ["adds negatives", "adds zero"]
  };
}

/** The same 3 tests as data — `sum(...args) === expect` — for the in-process runner. */
const DEMO_CASES: InProcCase[] = [
  { name: "adds two", args: [2, 3], expect: 5 },
  { name: "adds negatives", args: [-1, -1], expect: -2 },
  { name: "adds zero", args: [0, 0], expect: 0 }
];

export type DemoInProcFixture = {
  moduleSource: string;
  patch: string;
  exportName: string;
  cases: InProcCase[];
  requiredTests: string[];
  hiddenTests: string[];
};

/**
 * In-process variant of the fixture (pure JS, Vercel-safe). Identical module,
 * patch, and test names as `payOnGreenDemo` — only the execution mechanism
 * differs (eval the module + run cases vs. spawn `node --test`).
 */
export function payOnGreenDemoInProc(variant: DemoVariant): DemoInProcFixture {
  return {
    moduleSource: BUGGY_SUM,
    patch: variant === "green" ? GREEN_PATCH : CHEAT_PATCH,
    exportName: "sum",
    cases: DEMO_CASES,
    requiredTests: ["adds two"],
    hiddenTests: ["adds negatives", "adds zero"]
  };
}
