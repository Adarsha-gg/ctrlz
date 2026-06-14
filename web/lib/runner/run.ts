/**
 * The pay-on-green test runner (§ pay-on-green) — the impure ground-truth step.
 *
 * This is the analog of "the verifier re-fetches the sampled rows" in
 * data_reconcile, but for code: it materializes a workspace, applies the
 * worker's patch, RUNS the suite, and parses the JUnit report into the
 * `TestResult[]` the pure `tests_pass` checker decides over. The checker stays
 * pure; all the I/O lives here.
 *
 * Isolation note: this spawns the suite in a fresh temp dir with a timeout —
 * adequate for trusted/demo inputs. Before running UNTRUSTED worker patches, the
 * spawn must move into a real sandbox (container / microVM); the interface
 * (RunSpec → RunOutcome) stays identical, so that's a drop-in swap.
 */

import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseJUnit } from "./junit.ts";
import type { TestResult } from "../checkers/types.ts";

export type RunSpec = {
  /** files materialized into the workspace (relative path → contents) */
  files: Record<string, string>;
  /** unified diff applied (via `git apply`) before the suite runs */
  patch?: string;
  /** the test command, e.g. ["node","--test","--test-reporter=junit",...] */
  command: string[];
  /** path (relative to workspace) of the JUnit XML the command writes */
  reportPath: string;
  /** wall-clock budget; the suite is killed past this (default 30s) */
  timeoutMs?: number;
  /** extra env for the suite */
  env?: Record<string, string>;
};

export type RunOutcome = {
  results: TestResult[];
  /** did the patch apply cleanly? (true when there is no patch) */
  applied: boolean;
  exitCode: number | null;
  timedOut: boolean;
  /** was a JUnit report produced and parsed? */
  reportFound: boolean;
  stdout: string;
  stderr: string;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/** Resolve `rel` under `dir`, throwing if it escapes the workspace (`..`, absolute). */
function safeResolve(dir: string, rel: string): string {
  const full = path.resolve(dir, rel);
  if (full !== dir && !full.startsWith(dir + path.sep)) {
    throw new Error(`path escapes workspace: ${rel}`);
  }
  return full;
}

type SpawnResult = { code: number | null; timedOut: boolean; stdout: string; stderr: string };

function run(
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
  timeoutMs: number
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) }
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, timedOut, stdout, stderr: stderr + String(err) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stdout, stderr });
    });
  });
}

/**
 * Materialize → apply patch → run suite → parse report. Always cleans up its
 * temp workspace. Never throws; failures surface in the returned outcome.
 */
export async function runTests(spec: RunSpec): Promise<RunOutcome> {
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dir = await mkdtemp(path.join(tmpdir(), "ponr-"));
  try {
    // 1. Write the base workspace files — reject any path escaping the workspace.
    for (const [rel, content] of Object.entries(spec.files)) {
      const full = safeResolve(dir, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content);
    }

    // 2. Apply the worker's patch (the committed, revealed diff). If it does NOT
    //    apply cleanly, do NOT run the suite — an unapplied patch can't be
    //    verified, and running the base tree would grade the wrong thing. Return
    //    applied=false with no results so the caller hard-gates it.
    let applied = true;
    if (spec.patch && spec.patch.trim().length > 0) {
      await writeFile(path.join(dir, ".ponr.patch"), spec.patch);
      const g = await run("git", ["apply", "--whitespace=nowarn", ".ponr.patch"], { cwd: dir }, timeoutMs);
      applied = g.code === 0;
      if (!applied) {
        return {
          results: [],
          applied: false,
          exitCode: g.code,
          timedOut: g.timedOut,
          reportFound: false,
          stdout: g.stdout,
          stderr: g.stderr
        };
      }
    }

    // 3. Run the suite.
    const [cmd, ...args] = spec.command;
    const r = await run(cmd, args, { cwd: dir, env: spec.env }, timeoutMs);

    // 4. Parse the JUnit report (if the suite wrote one).
    let results: TestResult[] = [];
    let reportFound = false;
    try {
      const xml = await readFile(safeResolve(dir, spec.reportPath), "utf8");
      results = parseJUnit(xml);
      reportFound = true;
    } catch {
      reportFound = false;
    }

    return {
      results,
      applied,
      exitCode: r.code,
      timedOut: r.timedOut,
      reportFound,
      stdout: r.stdout,
      stderr: r.stderr
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
