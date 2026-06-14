/**
 * POST /api/agent/solve — the worker agent actually earns the bounty (§ A2A demo).
 *
 * 1. Claude generates a fix from the buggy code + spec + ONE sample test (never
 *    the held-out tests, never the answer).
 * 2. The real in-process runner runs the generated code against the FULL suite.
 * 3. The deterministic `tests_pass` checker decides public + held-out → verdict.
 * 4. Evidence anchored on Walrus; returns the exact shape /verify/settle consumes.
 *
 * So the verdict (and the on-chain payment) is earned by real generated work that
 * must generalize to tests the worker never saw — not a canned patch.
 */

import { NextResponse } from "next/server";
import {
  buildCheckerRuntimeManifest,
  runChecks,
  type CheckSpec,
  type TaskContext,
  type WorkerSubmission
} from "@/lib/checkers";
import { commitPatch } from "@/lib/checkers/patchwork";
import { runInProcess } from "@/lib/runner";
import { scoreSplit, type ScoredCheck } from "@/lib/scoring/score";
import { planResolution } from "@/lib/settlement/resolve";
import { buildEvidenceBlob, buildManifest, hashBlob, storeEvidence } from "@/lib/walrus";
import { solveWithClaude } from "@/lib/agent/worker";
import { MAX_TASK } from "@/lib/agent/task";

export const runtime = "nodejs";

export async function POST() {
  const task = MAX_TASK;

  // 1. The worker generates a fix (real LLM work).
  const solve = await solveWithClaude({
    buggySource: task.buggySource,
    spec: task.spec,
    publicTest: task.publicTest,
    exportName: task.exportName
  });
  if (!solve.usedLlm || !solve.source) {
    return NextResponse.json({ error: solve.note ?? "worker could not generate a fix" }, { status: 503 });
  }

  // 2. Run the generated code against the full suite (public + held-out).
  const outcome = runInProcess({
    moduleSource: solve.source,
    exportName: task.exportName,
    cases: task.cases
  });

  const publicNames = task.publicCaseNames;
  const heldoutNames = task.cases.map((c) => c.name).filter((n) => !publicNames.includes(n));

  // 3. The checker decides. Public + held-out are both hard gates; the worker
  //    never saw the held-out cases, so passing them proves the fix generalizes.
  const patchCommit = await commitPatch(solve.source);
  const submission: WorkerSubmission = {
    recipientAddress: "0x0000000000000000000000000000000000000000",
    invoice: {},
    patch: { diff: solve.source, patchCommit }
  };
  const ctx: TaskContext = { submission, recipientAddress: submission.recipientAddress };

  const publicDef: CheckSpec = { type: "tests_pass", hardGate: true, requiredTests: publicNames };
  const heldoutDef: CheckSpec = { type: "tests_pass", hardGate: true, requiredTests: heldoutNames };
  const runtimeChecks: CheckSpec[] = [
    { ...publicDef, results: outcome.results, runVerified: true },
    { ...heldoutDef, results: outcome.results, runVerified: true }
  ];

  const reports = runChecks(runtimeChecks, ctx);
  const scored: ScoredCheck[] = runtimeChecks.map((check, i) => ({ check, report: reports[i] }));
  const split = scoreSplit({ checks: scored });
  const settlement = await planResolution(split);

  // 4. Anchor the evidence and return the settle-ready payload.
  const intent = `Earn bounty: ${task.spec}`;
  const manifest = buildManifest({ intent, checks: [publicDef, heldoutDef] });
  const specHash = await hashBlob(manifest);
  const evidence = buildEvidenceBlob({
    taskSpec: manifest,
    workerOutput: submission,
    checkerReports: reports,
    checkerRuntime: buildCheckerRuntimeManifest(runtimeChecks),
    splitScore: split,
    recommendation: split.recommendation
  });
  const stored = await storeEvidence(evidence);

  return NextResponse.json({
    task: { id: task.id, spec: task.spec, buggySource: task.buggySource, publicTest: task.publicTest },
    generatedSource: solve.source,
    results: outcome.results,
    publicTests: publicNames,
    heldoutTests: heldoutNames,
    reports,
    recommendation: split.recommendation,
    settlement,
    specHash,
    evidenceHash: stored.hash,
    evidenceStore: stored.store,
    evidenceUri: stored.uri ?? null
  });
}
