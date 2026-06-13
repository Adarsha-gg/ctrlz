/**
 * Deterministic self-check for the Walrus evidence layer (E1/E2) — runs with
 * plain Node type-stripping, no test framework:
 *
 *   node --experimental-strip-types web/lib/walrus/selfcheck.ts
 *
 * Proves the load-bearing invariants:
 *  1. `hashBlob` is DETERMINISTIC — same blob (even reordered keys) → same hash;
 *     a different blob → a different hash; output is a valid sha256 hex string.
 *  2. `storeEvidence` returns `{ store, hash }` with a VALID hash even when the
 *     publisher URL is bogus (forced local fallback) — it NEVER throws.
 *  3. Best-effort: one real store against the default testnet publisher; logs
 *     whether it succeeded (fine if it doesn't — Walrus testnet drifts).
 *
 * NOTE: imports use relative .ts paths (not the @/ alias) so this runs under
 * --experimental-strip-types, mirroring web/lib/scoring/selfcheck.ts.
 */

import { hashBlob, storeEvidence, canonicalJSON } from "./store.ts";
import { buildEvidenceBlob, buildManifest } from "./evidence.ts";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const isSha256Hex = (s: string) => /^[0-9a-f]{64}$/.test(s);

// A representative evidence blob (shape mirrors the /verify wiring).
const manifest = buildManifest(
  {
    intent: "Buy an RTX 4090 under 700 USDC from a seller with a valid wallet + shipping proof.",
    checks: [
      { type: "schema", hardGate: true },
      { type: "price_max", hardGate: true, value: 700, currency: "USDC" }
    ]
  },
  { createdAt: "2026-06-13T00:00:00.000Z" }
);

const blob = buildEvidenceBlob({
  taskSpec: manifest,
  workerOutput: {
    recipientAddress: "0xabc",
    recipientName: "alice",
    invoice: { invoiceId: "INV-1", item: "RTX 4090", amount: 689, currency: "USDC" }
  },
  checkerReports: [
    { checker: "price-checker", result: "pass", confidence: 1, detail: "689 ≤ 700" }
  ],
  splitScore: {
    outputValidity: { score: 98, status: "pass" },
    agentTrust: { score: 90, status: "strong" },
    paymentRisk: { score: 94, status: "pass" },
    recommendation: "proceed"
  },
  recommendation: "proceed",
  createdAt: "2026-06-13T00:00:00.000Z"
});

async function main() {
  // ---- 1. Determinism --------------------------------------------------
  const h1 = await hashBlob(blob);
  const h2 = await hashBlob(blob);
  check("hashBlob is a valid sha256 hex string", isSha256Hex(h1), h1);
  check("hashBlob is deterministic: same blob → same hash", h1 === h2, `${h1} vs ${h2}`);

  // Key order must not matter (canonical JSON).
  const reordered = {
    recommendation: blob.recommendation,
    splitScore: blob.splitScore,
    checkerReports: blob.checkerReports,
    workerOutput: blob.workerOutput,
    taskSpec: blob.taskSpec,
    createdAt: blob.createdAt
  };
  const hReordered = await hashBlob(reordered);
  check(
    "hashBlob ignores key order (canonical JSON)",
    hReordered === h1,
    `${hReordered} vs ${h1}`
  );

  // A different blob → a different hash.
  const mutated = { ...blob, recommendation: "reject" as const };
  const hMutated = await hashBlob(mutated);
  check("hashBlob differs for a different blob", hMutated !== h1, `${hMutated} vs ${h1}`);

  // canonicalJSON sanity: reordered serializations are identical.
  check(
    "canonicalJSON is stable under key reorder",
    canonicalJSON(blob) === canonicalJSON(reordered)
  );

  // ---- 2. Forced local fallback, no throw ------------------------------
  // Point the publisher at a bogus URL so the network attempt fails; the call
  // must still resolve with a valid hash and store === "local".
  const prevPub = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER;
  const prevTimeout = process.env.NEXT_PUBLIC_WALRUS_TIMEOUT_MS;
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER = "http://127.0.0.1:1/__bogus__";
  process.env.NEXT_PUBLIC_WALRUS_TIMEOUT_MS = "1500";

  let fallback;
  try {
    fallback = await storeEvidence(blob);
  } catch (e) {
    failures++;
    console.error(`FAIL  storeEvidence threw on bogus publisher — ${String(e)}`);
    fallback = undefined;
  }
  if (fallback) {
    check("storeEvidence (bogus publisher) does not throw", true);
    check("storeEvidence (bogus publisher) → store === 'local'", fallback.store === "local", fallback.store);
    check(
      "storeEvidence (bogus publisher) → valid sha256 hash anchor",
      isSha256Hex(fallback.hash),
      fallback.hash
    );
    check(
      "storeEvidence local-fallback hash matches hashBlob anchor",
      fallback.hash === h1,
      `${fallback.hash} vs ${h1}`
    );
  }

  // Restore env for the live attempt.
  if (prevPub === undefined) delete process.env.NEXT_PUBLIC_WALRUS_PUBLISHER;
  else process.env.NEXT_PUBLIC_WALRUS_PUBLISHER = prevPub;
  if (prevTimeout === undefined) delete process.env.NEXT_PUBLIC_WALRUS_TIMEOUT_MS;
  else process.env.NEXT_PUBLIC_WALRUS_TIMEOUT_MS = prevTimeout;

  // ---- 3. Best-effort live store (informational, never fails the run) --
  console.log("\n— best-effort live Walrus store (informational) —");
  try {
    const live = await storeEvidence(blob);
    if (live.store === "walrus") {
      console.log(`  LIVE OK  stored on Walrus: blobId=${live.blobId}`);
      console.log(`           uri=${live.uri}`);
    } else {
      console.log("  LIVE SKIP  publisher unreachable / shape drift → local fallback (expected-OK)");
    }
    console.log(`           hash anchor = ${live.hash}`);
  } catch (e) {
    console.log(`  LIVE SKIP  storeEvidence rejected unexpectedly — ${String(e)}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall walrus-evidence checks passed");
}

void main();
