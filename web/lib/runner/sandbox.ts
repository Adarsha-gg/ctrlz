/**
 * Vercel Sandbox runner (§ pay-on-green / untrusted execution).
 *
 * The local subprocess runner (`run.ts`) executes the worker's test files on the
 * host — fine in a trusted dev box, unsafe anywhere else. This runs the exact
 * same workflow (write workspace → `git apply` → run suite → parse JUnit) inside
 * an ephemeral Vercel Sandbox microVM (Firecracker), so untrusted worker code is
 * isolated from the app. Same `RunSpec → RunOutcome` contract as `runTests`, so
 * it's a drop-in for the `run` path.
 *
 * Auth: on Vercel deployments the SDK authenticates automatically via OIDC. For
 * local/explicit use, set VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID.
 */

import { Sandbox } from "@vercel/sandbox";
import { parseJUnit } from "./junit.ts";
import type { RunOutcome, RunSpec } from "./run.ts";

const WORKDIR = "/tmp/ponr";
const DEFAULT_TIMEOUT_MS = 60_000;

/** Is the Sandbox SDK able to authenticate here? (OIDC on Vercel, or explicit creds.) */
export function sandboxConfigured(): boolean {
  return (
    !!process.env.VERCEL_OIDC_TOKEN ||
    (!!process.env.VERCEL_TOKEN && !!process.env.VERCEL_TEAM_ID && !!process.env.VERCEL_PROJECT_ID)
  );
}

function credentials(): Record<string, string> {
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = process.env;
  if (VERCEL_TOKEN && VERCEL_TEAM_ID && VERCEL_PROJECT_ID) {
    return { token: VERCEL_TOKEN, teamId: VERCEL_TEAM_ID, projectId: VERCEL_PROJECT_ID };
  }
  return {}; // fall back to VERCEL_OIDC_TOKEN (automatic on Vercel)
}

function fail(message: string): RunOutcome {
  return { results: [], applied: false, exitCode: null, timedOut: false, reportFound: false, stdout: "", stderr: message };
}

/**
 * Run the suite against the patched workspace inside a fresh microVM. Mirrors
 * `runTests`: a patch that doesn't apply returns `applied:false` with no results
 * (the suite is never run), which the caller hard-gates.
 */
export async function runInSandbox(spec: RunSpec): Promise<RunOutcome> {
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const sandbox = await Sandbox.create({
    ...credentials(),
    runtime: "node24",
    timeout: timeoutMs + 60_000 // VM lifetime > suite budget (incl. setup)
  });

  try {
    await sandbox.mkDir(WORKDIR);

    // 1. Materialize the base workspace.
    const files = Object.entries(spec.files).map(([rel, content]) => ({
      path: `${WORKDIR}/${rel}`,
      content
    }));
    if (spec.patch && spec.patch.trim().length > 0) {
      files.push({ path: `${WORKDIR}/.ponr.patch`, content: spec.patch });
    }
    await sandbox.writeFiles(files);

    // 2. Apply the patch with git (handles multi-file diffs). Install git if the
    //    base image lacks it. A failed apply is a hard gate — suite is not run.
    if (spec.patch && spec.patch.trim().length > 0) {
      await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", "command -v git >/dev/null 2>&1 || sudo dnf install -y git >/dev/null 2>&1 || true"],
        timeoutMs
      });
      const apply = await sandbox.runCommand({
        cmd: "git",
        args: ["apply", "--whitespace=nowarn", ".ponr.patch"],
        cwd: WORKDIR,
        timeoutMs
      });
      if (apply.exitCode !== 0) {
        return fail(`patch did not apply in sandbox: ${await apply.stderr()}`);
      }
    }

    // 3. Run the suite.
    const [cmd, ...args] = spec.command;
    const run = await sandbox.runCommand({ cmd, args, cwd: WORKDIR, timeoutMs });
    const stdout = await run.stdout();
    const stderr = await run.stderr();

    // 4. Read the JUnit report back and parse it.
    let results: RunOutcome["results"] = [];
    let reportFound = false;
    const cat = await sandbox.runCommand({ cmd: "cat", args: [spec.reportPath], cwd: WORKDIR, timeoutMs });
    if (cat.exitCode === 0) {
      results = parseJUnit(await cat.stdout());
      reportFound = true;
    }

    return {
      results,
      applied: true,
      exitCode: run.exitCode,
      timedOut: false,
      reportFound,
      stdout,
      stderr
    };
  } finally {
    await sandbox.stop();
  }
}
