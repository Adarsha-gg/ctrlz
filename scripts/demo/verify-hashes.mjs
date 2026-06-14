#!/usr/bin/env node

import { replayChecks, runChecks } from "../../web/lib/checkers/index.ts";
import { buildCheckerRuntimeManifest } from "../../web/lib/checkers/runtime.ts";
import { computeCheckerMetas } from "../../web/lib/checkers/metaReputation.ts";
import { scoreSplit } from "../../web/lib/scoring/score.ts";
import { hashBlob } from "../../web/lib/walrus/store.ts";
import { buildEvidenceBlob, buildManifest } from "../../web/lib/walrus/evidence.ts";
import {
  CHECKER_HISTORY,
  CLEAN_SUBMISSION,
  DEMO_ACCEPTANCE_SPEC
} from "../../web/app/verify/fixtures.ts";

const demo = CLEAN_SUBMISSION;
const checks = DEMO_ACCEPTANCE_SPEC.checks.map((check) =>
  check.type === "wallet_risk" && demo.recipientHistory
    ? { ...check, history: demo.recipientHistory }
    : check
);
const ctx = {
  submission: demo.submission,
  recipientAddress: demo.submission.recipientAddress,
  recipientName: demo.submission.recipientName
};

const reports = runChecks(checks, ctx);
const replays = replayChecks(checks, ctx, reports);
const checkerMeta = computeCheckerMetas({ reports, history: CHECKER_HISTORY, replays });
const scored = checks.map((check, index) => ({
  check,
  report: reports[index],
  metaWeight: checkerMeta[index]?.weight
}));
const split = scoreSplit({ checks: scored, workerHistory: demo.workerHistory });
const manifest = buildManifest({ intent: DEMO_ACCEPTANCE_SPEC.intent, checks });
const evidence = buildEvidenceBlob({
  taskSpec: manifest,
  workerOutput: demo.submission,
  checkerReports: reports,
  checkerRuntime: buildCheckerRuntimeManifest(checks),
  splitScore: split,
  recommendation: split.recommendation,
  checkerMeta
});

const manifestHash = await hashBlob(manifest);
const evidenceHash = await hashBlob(evidence);

console.log(
  JSON.stringify(
    {
      type: "ctrlz_verify_hashes",
      submission: demo.id,
      recommendation: split.recommendation,
      specHash: `0x${manifestHash}`,
      evidenceHash: `0x${evidenceHash}`,
      splitScore: split
    },
    null,
    2
  )
);
