/**
 * JUnit XML → TestResult[] (§ pay-on-green runner).
 *
 * Framework-agnostic: pytest (`--junitxml`), jest (jest-junit), go-junit, and
 * Node's own `node --test --test-reporter=junit` all emit this format, so the
 * runner can grade any suite that writes a JUnit report. Pure + deterministic:
 * same XML → same results.
 *
 * Shapes handled (from `node --test`):
 *   passed  — <testcase name="..." time="..."/>                        (self-closed)
 *   failed  — <testcase name="..." failure="msg"><failure .../></testcase>
 *   errored — <testcase ...><error .../></testcase>
 *   skipped — <testcase ...><skipped/></testcase>  or  skipped="..." attr
 */

import type { TestResult, TestStatus } from "../checkers/types.ts";

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeEntities(m[1]) : undefined;
}

/** Parse a JUnit XML document into one TestResult per <testcase>. */
export function parseJUnit(xml: string): TestResult[] {
  const results: TestResult[] = [];
  // self-closed <testcase .../> OR <testcase ...>…</testcase>
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const body = m[2] === "/>" ? "" : (m[3] ?? "");
    const name = attr(attrs, "name") ?? "(unnamed)";

    let status: TestStatus = "passed";
    let message: string | undefined;
    if (/<skipped\b/.test(body) || attr(attrs, "skipped") !== undefined) {
      status = "skipped";
    } else if (/<error\b/.test(body)) {
      status = "errored";
      message = attr(attrs, "error");
    } else if (/<failure\b/.test(body) || attr(attrs, "failure") !== undefined) {
      status = "failed";
      message = attr(attrs, "failure");
    }

    results.push({ name, status, ...(message ? { message } : {}) });
  }
  return results;
}
