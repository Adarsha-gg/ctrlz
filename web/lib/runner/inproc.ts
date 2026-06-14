/**
 * In-process pay-on-green runner (§ pay-on-green / Vercel) — pure JS, no git,
 * no child process, no filesystem.
 *
 * The subprocess runner (`run.ts`) spawns `git apply` + `node --test` — neither
 * exists on Vercel's serverless runtime, so a deployed `demo` would fail the
 * patch-apply and wrongly refund. This runner applies the diff in-memory and
 * evaluates the (trusted, baked) module to run the suite — so the demo behaves
 * IDENTICALLY on localhost and Vercel, and the result is deterministic, which
 * makes the anchored replay genuinely reproducible by anyone, anywhere.
 *
 * TRUST BOUNDARY: this evaluates the module source in-process, so it is for the
 * baked demo / trusted inputs ONLY. Untrusted worker code must go through the
 * sandboxed subprocess path (`run.ts`, gated by PAYONGREEN_ALLOW_RUN) — never
 * here.
 */

import type { TestResult } from "../checkers/types.ts";
import { applyUnifiedDiff } from "./diff.ts";

/** One acceptance case: call `exportName(...args)` and compare to `expect`. */
export type InProcCase = { name: string; args: unknown[]; expect: unknown };

export type InProcSpec = {
  /** the module-under-test source (ESM `export const/function ...`) */
  moduleSource: string;
  /** unified diff applied before evaluation (the worker's patch) */
  patch?: string;
  /** the export to invoke */
  exportName: string;
  /** the acceptance cases (public + held-out share this set) */
  cases: InProcCase[];
};

export type InProcOutcome = {
  results: TestResult[];
  /** did the patch apply cleanly? (false → hard gate; suite is not run) */
  applied: boolean;
  /** the patched source actually evaluated — recorded for the replay bundle */
  patchedSource: string;
};

function equal(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

export function runInProcess(spec: InProcSpec): InProcOutcome {
  let source = spec.moduleSource;
  let applied = true;

  if (spec.patch && spec.patch.trim().length > 0) {
    const r = applyUnifiedDiff(source, spec.patch);
    applied = r.applied;
    if (!applied) {
      // Same hard gate as a failed `git apply`: don't run the base tree.
      return { results: [], applied: false, patchedSource: spec.moduleSource };
    }
    source = r.result;
  }

  // Evaluate the (trusted) module in an isolated function scope to get the export.
  let callable: ((...args: unknown[]) => unknown) | undefined;
  try {
    const stripped = source.replace(/\bexport\s+(default\s+)?(const|let|var|function|class)\b/g, "$2");
    const factory = new Function(
      `"use strict";${stripped}\nreturn (typeof ${spec.exportName} !== "undefined") ? ${spec.exportName} : undefined;`
    );
    const fn = factory();
    if (typeof fn === "function") callable = fn as (...args: unknown[]) => unknown;
  } catch (e) {
    return {
      results: spec.cases.map((c) => ({
        name: c.name,
        status: "errored",
        message: `module eval failed: ${(e as Error).message}`
      })),
      applied,
      patchedSource: source
    };
  }

  if (!callable) {
    return {
      results: spec.cases.map((c) => ({
        name: c.name,
        status: "errored",
        message: `export "${spec.exportName}" is not a function`
      })),
      applied,
      patchedSource: source
    };
  }

  const results: TestResult[] = spec.cases.map((c) => {
    try {
      const got = callable!(...c.args);
      return equal(got, c.expect)
        ? { name: c.name, status: "passed" }
        : { name: c.name, status: "failed", message: `expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}` };
    } catch (e) {
      return { name: c.name, status: "errored", message: (e as Error).message };
    }
  });

  return { results, applied, patchedSource: source };
}
