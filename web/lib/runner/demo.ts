/**
 * Baked pay-on-green demo fixture (§ pay-on-green).
 *
 * A tiny, real, self-contained repo: a buggy `sum` and a 3-test suite. No
 * external test framework — it runs on Node's built-in `node --test`, which
 * emits JUnit XML natively, so the demo executes the SAME runner path a real
 * job would.
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
