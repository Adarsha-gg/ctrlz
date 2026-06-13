/**
 * Deterministic self-check for the verification core (A1/A2/B1/B2) — runs with
 * plain Node type-stripping, no test framework:
 *
 *   node --experimental-strip-types web/lib/scoring/selfcheck.ts
 *
 * Proves the demo beats: the CLEAN GPU invoice → proceed/proceed_with_protection
 * with all checks passing; the BAD one (poisoned wallet + price > 700) →
 * reject or pause. Each case maps to a demo beat.
 *
 * NOTE: imports use relative .ts paths (not the @/ alias) so this runs under
 * --experimental-strip-types, mirroring web/lib/risk/selfcheck.ts.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replayChecks } from "../checkers/registry.ts";
import { computeCheckerMetas } from "../checkers/metaReputation.ts";
import {
  buildCheckerRuntimeManifest,
  CHECKER_BUNDLE_HASH,
  CHECKER_SOURCE_HASHES
} from "../checkers/runtime.ts";
import { runChecks } from "../checkers/registry.ts";
import type { CheckSpec, TaskContext } from "../checkers/types.ts";
import { scoreSplit } from "./score.ts";
import type { ScoredCheck } from "./score.ts";
import {
  ALICE_HISTORY,
  CHECKER_HISTORY,
  DEMO_ACCEPTANCE_SPEC,
  CLEAN_SUBMISSION,
  BAD_SUBMISSION,
  type DemoSubmission
} from "../../app/verify/fixtures.ts";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const rootDir = fileURLToPath(new URL("../../../", import.meta.url));

function sha256Text(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

function sha256File(relativePath: string): string {
  return sha256Text(readFileSync(resolve(rootDir, relativePath), "utf8"));
}

function bundleFingerprint(hashes: Record<string, string>): string {
  return Object.keys(hashes)
    .sort()
    .map((path) => `${path}:${hashes[path]}`)
    .join("\n");
}

/** Inject the demo's wallet history onto the wallet_risk check, then run + pair. */
function evaluate(demo: DemoSubmission) {
  const checks: CheckSpec[] = DEMO_ACCEPTANCE_SPEC.checks.map((c) =>
    c.type === "wallet_risk" && demo.recipientHistory
      ? { ...c, history: demo.recipientHistory }
      : c
  );
  const ctx: TaskContext = {
    submission: demo.submission,
    recipientAddress: demo.submission.recipientAddress,
    recipientName: demo.submission.recipientName
  };
  const reports = runChecks(checks, ctx);
  const replays = replayChecks(checks, ctx, reports);
  const checkerRuntime = buildCheckerRuntimeManifest(checks);
  const checkerMeta = computeCheckerMetas({ reports, history: CHECKER_HISTORY, replays });
  const scored: ScoredCheck[] = checks.map((c, i) => ({
    check: c,
    report: reports[i],
    metaWeight: checkerMeta[i]?.weight
  }));
  const split = scoreSplit({ checks: scored, workerHistory: demo.workerHistory });
  return { reports, scored, split, checkerMeta, replays, checkerRuntime };
}

// Beat 3+5: CLEAN invoice → proceed (or proceed_with_protection), all checks pass.
{
  const { reports, split } = evaluate(CLEAN_SUBMISSION);
  const noFails = reports.every((r) => r.result === "pass");
  check(
    "CLEAN invoice → every checker passes",
    noFails,
    JSON.stringify(reports.map((r) => `${r.checker}:${r.result}`))
  );
  check(
    "CLEAN invoice → proceed / proceed_with_protection",
    split.recommendation === "proceed" || split.recommendation === "proceed_with_protection",
    JSON.stringify(split)
  );
  check(
    "CLEAN invoice → outputValidity passes, paymentRisk safe, agentTrust strong",
    split.outputValidity.status === "pass" &&
      split.paymentRisk.status === "pass" &&
      split.agentTrust.status === "strong",
    JSON.stringify(split)
  );
}

// Beat 4: BAD invoice (poisoned wallet + price > 700) → reject / pause.
{
  const { reports, split } = evaluate(BAD_SUBMISSION);
  const price = reports.find((r) => r.checker === "price-checker");
  const wallet = reports.find((r) => r.checker === "wallet-risk-checker");
  check("BAD invoice → price-checker fails (> 700)", price?.result === "fail", JSON.stringify(price));
  check(
    "BAD invoice → wallet-risk-checker fails (poisoned lookalike)",
    wallet?.result === "fail",
    JSON.stringify(wallet)
  );
  check(
    "BAD invoice → reject or pause",
    split.recommendation === "reject" || split.recommendation === "pause",
    JSON.stringify(split)
  );
  check(
    "BAD invoice → the three scores are never collapsed (distinct sub-scores present)",
    typeof split.outputValidity.score === "number" &&
      typeof split.agentTrust.score === "number" &&
      typeof split.paymentRisk.score === "number",
    JSON.stringify(split)
  );
}

// Replayability: same input → identical reports.
{
  const a = evaluate(CLEAN_SUBMISSION);
  const b = evaluate(CLEAN_SUBMISSION);
  check(
    "deterministic: re-running CLEAN yields identical reports",
    JSON.stringify(a.reports) === JSON.stringify(b.reports)
  );
  check(
    "B3 replay: deterministic checkers reproduce every CLEAN verdict",
    a.replays.every((r) => r.status === "match" && r.replayable),
    JSON.stringify(a.replays)
  );
}

// §8e: evidence must pin checker code and freeze external inputs for replay.
{
  const { reports, checkerRuntime } = evaluate(CLEAN_SUBMISSION);
  check(
    "§8e runtime manifest pins one checker version per report",
    checkerRuntime.checkers.length === reports.length &&
      checkerRuntime.checkers.every((entry) => entry.deterministic && entry.codeHash.startsWith("sha256:")),
    JSON.stringify(checkerRuntime)
  );
  const frozenHistory = checkerRuntime.frozenInputs.find(
    (entry) => entry.checker === "wallet-risk-checker" && entry.key === "check.history"
  );
  check(
    "§8e runtime manifest freezes wallet-risk history into the evidence path",
    Boolean(
      frozenHistory &&
        typeof frozenHistory.value === "object" &&
        frozenHistory.value &&
        (frozenHistory.value as { sealedCount?: number }).sealedCount === ALICE_HISTORY.sealedCount
    ),
    JSON.stringify(checkerRuntime.frozenInputs)
  );
}

// §8e: pinned checker hashes must move when checker logic/dependencies move.
{
  const actualHashes = Object.fromEntries(
    Object.keys(CHECKER_SOURCE_HASHES).map((path) => [path, sha256File(path)])
  ) as Record<string, string>;
  const stale = Object.entries(CHECKER_SOURCE_HASHES).filter(
    ([path, expected]) => actualHashes[path] !== expected
  );
  check(
    "§8e pinned checker source hashes match current files",
    stale.length === 0,
    JSON.stringify(stale)
  );
  const actualBundleHash = sha256Text(bundleFingerprint(actualHashes));
  check(
    "§8e pinned checker bundle hash matches current file set",
    actualBundleHash === CHECKER_BUNDLE_HASH,
    `${actualBundleHash} vs ${CHECKER_BUNDLE_HASH}`
  );
}

// B3: seeded wrong source-listing history lowers influence.
{
  const { checkerMeta } = evaluate(BAD_SUBMISSION);
  const source = checkerMeta.find((m) => m.checker === "source-listing-checker");
  check(
    "B3 meta-reputation: seeded false source-listing outcomes reduce checker weight",
    Boolean(source && source.weight < 0.6 && source.falsePass + source.falseFail > 0),
    JSON.stringify(source)
  );
}

// B3: low-weight advisory flags have less decision impact than high-weight ones.
{
  const baseReports = evaluate(CLEAN_SUBMISSION).reports;
  const advisoryReport = {
    checker: "source-listing-checker",
    result: "uncertain" as const,
    confidence: 0.55,
    detail: "Advisory source could not be confirmed."
  };
  const checks: ScoredCheck[] = [
    ...DEMO_ACCEPTANCE_SPEC.checks.slice(0, 3).map((check, index) => ({
      check,
      report: baseReports[index],
      metaWeight: 1
    })),
    { check: DEMO_ACCEPTANCE_SPEC.checks[3], report: advisoryReport, metaWeight: 0.3 }
  ];
  const low = scoreSplit({ checks, workerHistory: ALICE_HISTORY });
  const high = scoreSplit({
    checks: checks.map((c, index) => (index === 3 ? { ...c, metaWeight: 0.9 } : c)),
    workerHistory: ALICE_HISTORY
  });
  check(
    "B3 influence: low-weight advisory uncertainty does not force pause",
    low.recommendation === "proceed_with_protection",
    JSON.stringify(low)
  );
  check(
    "B3 influence: high-weight advisory uncertainty still pauses",
    high.recommendation === "pause",
    JSON.stringify(high)
  );
}

// B3 verifier finding: replay mismatch caps advisory influence below trusted.
{
  const base = evaluate(CLEAN_SUBMISSION);
  const sourceReport = base.reports.find((r) => r.checker === "source-listing-checker");
  const sourceMeta = computeCheckerMetas({
    reports: [sourceReport!],
    history: CHECKER_HISTORY,
    replays: [{ checker: "source-listing-checker", status: "mismatch", replayable: true }]
  })[0];
  check(
    "B3 replay guard: mismatched replay cannot keep trusted advisory weight",
    sourceMeta.weight < 0.6,
    JSON.stringify(sourceMeta)
  );
}

// B3 guard: deterministic hard-gate facts still win even if their weight is low.
{
  const { scored } = evaluate(BAD_SUBMISSION);
  const lowWeighted = scored.map((entry) =>
    entry.report.checker === "price-checker" ? { ...entry, metaWeight: 0.05 } : entry
  );
  const split = scoreSplit({ checks: lowWeighted, workerHistory: ALICE_HISTORY });
  check(
    "B3 guard: low-weight hard-gate price failure still rejects",
    split.recommendation === "reject",
    JSON.stringify(split)
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall verification-core checks passed");
