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
import {
  payOnGreenDemoInProc,
  runInProcess,
  runTests,
  type InProcCase,
  type RunOutcome
} from "@/lib/runner";
import { scoreSplit, type ScoredCheck } from "@/lib/scoring/score";
import { planResolution } from "@/lib/settlement/resolve";
import { writeValidationResponse, type ValidationWriteResult } from "@/lib/erc8004/validation";
import {
  buildEvidenceBlob,
  buildManifest,
  hashBlob,
  storeEvidence,
  storeHeldoutReveal,
  verifyHeldoutReveal,
  type HeldoutRevealPointer
} from "@/lib/walrus";
import { verifyX402ForRequest, x402RequiredHeaders, x402ResponseHeaders } from "@/lib/x402/payongreen";

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
  /** agent receiving ERC-8004 validation; defaults to PAYONGREEN_ERC8004_AGENT_ID when set */
  agentId?: string;
  /** request a ValidationRegistry write/prepared payload for the pay-on-green verdict */
  writeValidation?: boolean;
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
  const x402 = await verifyX402ForRequest(request);
  if (x402.required && !x402.paid) {
    return NextResponse.json(
      {
        error: x402.error ?? "x402 payment required",
        accepts: [x402.requirements],
        x402
      },
      { status: 402, headers: x402RequiredHeaders(x402) }
    );
  }

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
  let replayFiles: Record<string, string> | undefined;
  let replayCommand = DEFAULT_COMMAND;
  let replayReportPath = "report.xml";
  let runnerSource: "demo" | "caller-run" | "injected-results" = "injected-results";
  let runOutcome: RunOutcome | null = null;
  let replayInProc:
    | { moduleSource: string; patch: string; exportName: string; cases: InProcCase[]; patchedSource: string }
    | undefined;

  if (body.demo === "green" || body.demo === "cheat") {
    // In-process runner: pure JS, no git/subprocess — runs identically on Vercel
    // and is deterministically replayable. (Trusted baked code only.)
    const fx = payOnGreenDemoInProc(body.demo);
    const outcome = runInProcess(fx);
    diff = fx.patch;
    results = outcome.results;
    requiredTests = fx.requiredTests;
    heldoutHidden = fx.hiddenTests;
    runMeta = {
      ran: true,
      applied: outcome.applied,
      exitCode: outcome.applied ? 0 : 1,
      timedOut: false,
      reportFound: true,
      totalTests: outcome.results.length
    };
    replayInProc = {
      moduleSource: fx.moduleSource,
      patch: fx.patch,
      exportName: fx.exportName,
      cases: fx.cases,
      patchedSource: outcome.patchedSource
    };
    replayCommand = ["ctrlz:in-process"];
    replayReportPath = "(in-process)";
    runnerSource = "demo";
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
    runOutcome = outcome;
    runMeta = runMetaOf(outcome);
    replayFiles = body.run.files;
    runnerSource = "caller-run";
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
      hiddenCount: hiddenTests.length,
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
  const settlement = await planResolution(split);

  const replay = {
    protocol: "ctrlz.payongreen.replay.v1",
    trustModel: "CTRL+Z server is the v1 verifier; this bundle is enough for third-party replay/audit of deterministic inputs and outputs.",
    runner: {
      source: runnerSource,
      command: replayCommand,
      reportPath: replayReportPath,
      node: runnerSource === "demo" ? "ctrlz:in-process (pure JS, Vercel-safe)" : "node --test",
      sandbox: process.env.PAYONGREEN_ALLOW_RUN === "1" ? "external-sandbox-required" : "baked-demo-or-injected"
    },
    workspace: replayFiles ? { files: replayFiles } : undefined,
    inProcess: replayInProc,
    patch,
    publicTests: requiredTests,
    heldout,
    run: runMeta,
    results,
    stdout: runOutcome?.stdout,
    stderr: runOutcome?.stderr,
    checkerRuntime: buildCheckerRuntimeManifest(runtimeChecks),
    settlement
  };

  // 3. Anchor a replayable evidence blob — the hash the escrow resolves against.
  const manifest = buildManifest({ intent, checks: resolvedDefs });
  const evidence = buildEvidenceBlob({
    taskSpec: manifest,
    workerOutput: submission,
    checkerReports: reports,
    checkerRuntime: buildCheckerRuntimeManifest(runtimeChecks),
    splitScore: split,
    recommendation: split.recommendation,
    replay,
    ...(heldoutReveal ? { heldoutReveal } : {})
  });
  const stored = await storeEvidence(evidence);
  const responseHash = (stored.hash.startsWith("0x") ? stored.hash : `0x${stored.hash}`) as `0x${string}`;
  const evidenceURI = stored.uri ?? `urn:sha256:${stored.hash}`;
  const shouldValidate = body.writeValidation === true || process.env.PAYONGREEN_WRITE_ERC8004 === "1";
  const agentId = body.agentId ?? process.env.PAYONGREEN_ERC8004_AGENT_ID;
  let erc8004Validation: ValidationWriteResult | { mode: "skipped"; reason: string } = {
    mode: "skipped",
    reason: agentId ? "writeValidation was false and PAYONGREEN_WRITE_ERC8004 is not enabled" : "missing agentId"
  };
  if (agentId && shouldValidate) {
    erc8004Validation = await writeValidationResponse({
      agentId,
      score: split.outputValidity.score,
      requestURI: `payongreen:${settlement.resultLabel.toLowerCase()}:${patchCommit}`,
      responseURI: evidenceURI,
      responseHash,
      tag: `ctrlz.payongreen.${settlement.resultLabel.toLowerCase()}`
    });
  }

  // 4. The settlement decision: the exact resolve() args the escrow consumes.
  return NextResponse.json(
    {
      intent,
      patchCommit,
      runVerified,
      requiredTests,
      totalRequired: requiredTests.length + (heldout.hiddenCount ?? 0),
      x402,
      run: runMeta,
      replay,
      results,
      reports,
      split,
      recommendation: split.recommendation,
      evidenceHash: stored.hash,
      evidenceStore: stored.store,
      evidenceUri: stored.uri ?? null,
      specHash,
      heldout,
      settlement,
      erc8004Validation
    },
    { headers: x402ResponseHeaders(x402) }
  );
}
