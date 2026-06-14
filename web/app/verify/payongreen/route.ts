/**
 * POST /verify/payongreen — the pay-on-green workflow (§ pay-on-green).
 *
 * The simplest verifiable agent-to-agent job: a worker delivers a code patch;
 * the buyer's test suite is the acceptance standard; the suite's exit state is
 * the verdict. Expensive to produce (real engineering), cheap to verify (run the
 * tests once), binary (green or not). This route is the spine — a near-twin of
 * /verify/submit, but the artifact is a patch and the checker is `tests_pass`.
 *
 * Ground truth comes from one of three sources, in priority order:
 *   demo    → a baked fixture run for REAL on `node --test` (green / cheat)
 *   run     → a caller-supplied workspace, patched + run for REAL by the runner
 *   results → pre-injected TestResult[] (the original inject-first path)
 *
 * Flow (commit-reveal, mirrors /verify/submit + held-out tests):
 *   1. Worker's patch (diff) is verified against its commit (anti-swap).
 *   2. The runner applies the patch and RUNS the suite → TestResult[] ground
 *      truth (the analog of data_reconcile's re-fetched `sample`).
 *   3. The deterministic `tests_pass` checker compares the run against the
 *      acceptance set → pass/fail. Held-out tests (buyer's hidden suite) are
 *      committed pre-work and revealed here, run alongside the public set.
 *   4. Split-score it, anchor a replayable evidence blob, return the verdict +
 *      hashes the escrow `resolve()` consumes. Green → release; red → refund.
 *
 * The checkers decide; no LLM is in this path. nodejs runtime — the runner
 * spawns a child process and touches the filesystem.
 */

import { NextResponse } from "next/server";
import {
  buildCheckerRuntimeManifest,
  runChecks,
  type CheckSpec,
  type TaskContext,
  type TestResult,
  type WorkerSubmission
} from "@/lib/checkers";
import { buildHeldoutManifest, randomSalt } from "@/lib/checkers/heldout";
import { commitPatch, verifyPatchReveal } from "@/lib/checkers/patchwork";
import { payOnGreenDemo, runTests, type RunOutcome } from "@/lib/runner";
import { scoreSplit, type ScoredCheck } from "@/lib/scoring/score";
import { planResolution } from "@/lib/settlement/resolve";
import {
  buildEvidenceBlob,
  buildManifest,
  hashBlob,
  storeEvidence,
  storeHeldoutReveal,
  verifyHeldoutReveal,
  type HeldoutRevealPointer
} from "@/lib/walrus";

export const runtime = "nodejs";

const DEFAULT_COMMAND = [
  "node",
  "--test",
  "--test-reporter=junit",
  "--test-reporter-destination=report.xml"
];

type PayOnGreenBody = {
  intent?: string;
  /** the worker's code patch, revealed at submit */
  patch?: { diff?: string; patchCommit?: string };
  /** the public acceptance tests the worker sees (names that MUST pass) */
  requiredTests?: string[];
  /** pre-injected run results (used only when neither `demo` nor `run` is given) */
  results?: TestResult[];
  /** the wallet the buyer would pay, for the evidence record */
  recipientAddress?: string;
  recipientName?: string;
  /** buyer's held-out tests: committed pre-work, revealed + run at resolution */
  heldout?: {
    hiddenTests: string[];
    salt?: string;
  };
  /** run a baked, self-contained fixture for real on `node --test` (safe; our code) */
  demo?: "green" | "cheat";
  /**
   * Run a caller-supplied workspace for real (patch = `patch.diff`). This
   * EXECUTES ARBITRARY CODE (the test files are caller-provided), so it is
   * disabled unless PAYONGREEN_ALLOW_RUN=1 is set in a sandboxed environment.
   * The command is fixed (`node --test`) and report path is fixed — callers
   * cannot choose the binary, args, env, or read path.
   */
  run?: {
    files: Record<string, string>;
    timeoutMs?: number;
  };
};

function isTestResultArray(value: unknown): value is TestResult[] {
  return (
    Array.isArray(value) &&
    value.every((r) => r && typeof r === "object" && typeof (r as TestResult).name === "string")
  );
}

function runMetaOf(outcome: RunOutcome) {
  return {
    ran: true,
    applied: outcome.applied,
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
    reportFound: outcome.reportFound,
    totalTests: outcome.results.length
  };
}

export async function POST(request: Request) {
  let body: PayOnGreenBody;
  try {
    body = (await request.json()) as PayOnGreenBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const intent = body.intent ?? "Deliver a patch that makes the acceptance suite green";
  const recipientAddress = body.recipientAddress ?? "0x0000000000000000000000000000000000000000";

  // --- Resolve ground truth: demo run > caller run > injected results ---------
  let diff: string | undefined = body.patch?.diff;
  let results: TestResult[] = body.results ?? [];
  let requiredTests: string[] = Array.isArray(body.requiredTests) ? body.requiredTests : [];
  let heldoutHidden: string[] | undefined = body.heldout?.hiddenTests;
  let runMeta: ReturnType<typeof runMetaOf> | { ran: false } = { ran: false };

  if (body.demo === "green" || body.demo === "cheat") {
    const fx = payOnGreenDemo(body.demo);
    const outcome = await runTests({
      files: fx.files,
      patch: fx.patch,
      command: fx.command,
      reportPath: fx.reportPath
    });
    diff = fx.patch;
    results = outcome.results;
    requiredTests = fx.requiredTests;
    heldoutHidden = fx.hiddenTests;
    runMeta = runMetaOf(outcome);
  } else if (body.run && body.run.files) {
    // Caller-supplied workspaces execute arbitrary code — gate behind an explicit
    // sandbox opt-in. The command + report path are FIXED (no caller-chosen
    // binary/args/env/read-path); callers may only supply files + a timeout.
    if (process.env.PAYONGREEN_ALLOW_RUN !== "1") {
      return NextResponse.json(
        {
          error:
            "caller-supplied `run` executes arbitrary code and is disabled. Set PAYONGREEN_ALLOW_RUN=1 in a sandboxed environment, or use `demo`."
        },
        { status: 403 }
      );
    }
    let outcome: RunOutcome;
    try {
      outcome = await runTests({
        files: body.run.files,
        patch: diff,
        command: DEFAULT_COMMAND,
        reportPath: "report.xml",
        ...(typeof body.run.timeoutMs === "number" ? { timeoutMs: body.run.timeoutMs } : {})
      });
    } catch (e) {
      return NextResponse.json(
        { error: `runner rejected workspace: ${(e as Error).message}` },
        { status: 400 }
      );
    }
    results = outcome.results;
    runMeta = runMetaOf(outcome);
  }

  if (typeof diff !== "string" || diff.length === 0) {
    return NextResponse.json(
      { error: "provide `demo`, a `run` workspace, or a non-empty `patch.diff`" },
      { status: 400 }
    );
  }
  if (body.results !== undefined && !isTestResultArray(body.results)) {
    return NextResponse.json(
      { error: "`results` must be an array of { name, status } records" },
      { status: 400 }
    );
  }

  // 1. Commit-reveal integrity. If the worker locked a commit, the revealed diff
  //    must reproduce it; if it didn't supply one, we compute the canonical one.
  const patchCommit = body.patch?.patchCommit ?? (await commitPatch(diff));
  const patch = { diff, patchCommit };
  const runVerified = await verifyPatchReveal(patch);

  // 2. The public check def (what the worker sees) + its runtime form (with the
  //    verifier's injected/real run results). `patchApplied` is a hard gate: when
  //    the runner ran and the patch did not apply, tests_pass fails (no release).
  const patchApplied: boolean | undefined = runMeta.ran ? runMeta.applied : undefined;
  const appliedField = patchApplied !== undefined ? { patchApplied } : {};
  const publicDef: CheckSpec = { type: "tests_pass", hardGate: true, requiredTests };
  const runtimePublic: CheckSpec = { ...publicDef, results, runVerified, ...appliedField };

  // 2b. Optional held-out audit: the buyer's secret test names, committed
  //     pre-work and revealed here. Stored on Walrus, verified against the
  //     commit, then run against the same results as the public set.
  let runtimeChecks: CheckSpec[] = [runtimePublic];
  let resolvedDefs: CheckSpec[] = [publicDef];
  let heldoutReveal: HeldoutRevealPointer | undefined;
  let specHash: string;
  let heldout: {
    used: boolean;
    hiddenTests?: string[];
    hiddenCount?: number;
    commit?: string;
    revealVerified?: boolean;
    revealStore?: string;
    revealBlobId?: string | null;
    revealUri?: string | null;
    revealHash?: string;
  } = { used: false };

  if (heldoutHidden && heldoutHidden.length > 0) {
    const hiddenTests = heldoutHidden;
    const hiddenDef: CheckSpec = { type: "tests_pass", hardGate: true, requiredTests: hiddenTests };
    const salt = body.heldout?.salt ?? randomSalt();

    const heldoutManifest = await buildHeldoutManifest({
      intent,
      publicChecks: [publicDef],
      hiddenChecks: [hiddenDef],
      salt
    });
    const reveal = { hiddenChecks: [hiddenDef], salt };
    const verified = await verifyHeldoutReveal(heldoutManifest, reveal);
    heldoutReveal = await storeHeldoutReveal(reveal);

    const runtimeHidden = reveal.hiddenChecks.map((c) => ({ ...c, results, runVerified, ...appliedField }));
    runtimeChecks = [runtimePublic, ...runtimeHidden];
    resolvedDefs = [publicDef, ...reveal.hiddenChecks];
    specHash = await hashBlob(heldoutManifest);
    heldout = {
      used: true,
      hiddenTests,
      hiddenCount: heldoutManifest.hiddenCount,
      commit: heldoutManifest.hiddenChecksCommit,
      revealVerified: verified.valid,
      revealStore: heldoutReveal.store,
      revealBlobId: heldoutReveal.blobId ?? null,
      revealUri: heldoutReveal.uri ?? null,
      revealHash: heldoutReveal.hash
    };
  } else {
    specHash = await hashBlob(buildManifest({ intent, checks: resolvedDefs }));
  }

  const submission: WorkerSubmission = {
    recipientAddress,
    ...(body.recipientName ? { recipientName: body.recipientName } : {}),
    invoice: {},
    patch
  };
  const ctx: TaskContext = {
    submission,
    recipientAddress,
    ...(body.recipientName ? { recipientName: body.recipientName } : {})
  };

  const reports = runChecks(runtimeChecks, ctx);
  const scored: ScoredCheck[] = runtimeChecks.map((check, i) => ({ check, report: reports[i] }));
  const split = scoreSplit({ checks: scored });

  // 3. Anchor a replayable evidence blob — the hash the escrow resolves against.
  const manifest = buildManifest({ intent, checks: resolvedDefs });
  const evidence = buildEvidenceBlob({
    taskSpec: manifest,
    workerOutput: submission,
    checkerReports: reports,
    checkerRuntime: buildCheckerRuntimeManifest(runtimeChecks),
    splitScore: split,
    recommendation: split.recommendation,
    ...(heldoutReveal ? { heldoutReveal } : {})
  });
  const [stored, settlement] = await Promise.all([storeEvidence(evidence), planResolution(split)]);

  // 4. The settlement decision: the exact resolve() args the escrow consumes.
  return NextResponse.json({
    intent,
    patchCommit,
    runVerified,
    requiredTests,
    totalRequired: requiredTests.length + (heldout.hiddenCount ?? 0),
    run: runMeta,
    results,
    reports,
    split,
    recommendation: split.recommendation,
    evidenceHash: stored.hash,
    evidenceStore: stored.store,
    evidenceUri: stored.uri ?? null,
    specHash,
    heldout,
    settlement
  });
}
