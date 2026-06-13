#!/usr/bin/env node
/**
 * Store a CTRL+Z Verify evidence record on Walrus and print its real aggregator
 * URI + sha256 anchor. Reuses the web evidence layer (web/lib/walrus/store.ts)
 * so the anchor is computed exactly the same way the /verify page computes it.
 *
 * This exists so the HCS receipt's `walrusUri` is a GENUINE Walrus URI instead
 * of a hand-typed link. On any Walrus failure the store layer degrades to a
 * local hash anchor (store: "local") and never throws.
 *
 *   node --experimental-strip-types scripts/hedera/store-evidence.mjs \
 *     --contract=0x... --evidence-hash=0x... --score-bps=9200 \
 *     --recommendation=proceed [--spec-hash=0x...] [--task-id=1]
 */

import { storeEvidence } from "../../web/lib/walrus/store.ts";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  })
);

function arg(name, fallback = "") {
  const v = args.get(name);
  return v && v.length > 0 ? v : fallback;
}

const record = {
  kind: "ctrlz.verify.evidence",
  taskId: arg("task-id", "1"),
  contractAddress: arg("contract"),
  specHash: arg("spec-hash"),
  evidenceHash: arg("evidence-hash"),
  scoreBps: Number(arg("score-bps", "0")),
  recommendation: arg("recommendation")
};

const result = await storeEvidence(record);

console.log(
  JSON.stringify(
    {
      type: "ctrlz_evidence_store",
      store: result.store,
      blobId: result.blobId ?? null,
      walrusUri: result.uri ?? null,
      sha256Anchor: result.hash,
      record
    },
    null,
    2
  )
);
