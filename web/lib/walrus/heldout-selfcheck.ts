/**
 * Self-check for the held-out reveal store on Walrus (walrus/heldout.ts). Runs
 * with plain Node type-stripping, no framework:
 *
 *   node --experimental-strip-types web/lib/walrus/heldout-selfcheck.ts
 *
 * Proves the use-case invariants:
 *  1. An honest reveal verifies against its committed manifest → valid, and the
 *     resolved check set = public + revealed hidden.
 *  2. Tampering with the hidden checks, the salt, or the count after commit is
 *     REJECTED (the buyer can't move the goalposts post-delivery).
 *  3. `storeHeldoutReveal` degrades to a local hash anchor on a bogus publisher
 *     and NEVER throws (same ethos as the evidence store).
 *  4. Best-effort: a real Walrus round-trip — store the reveal, fetch it back by
 *     blob id, and re-verify against the manifest (informational; testnet drifts).
 */

import { buildHeldoutManifest, randomSalt, type HeldoutReveal } from "../checkers/heldout.ts";
import type { CheckSpec } from "../checkers/types.ts";
import {
  storeHeldoutReveal,
  fetchAndVerifyHeldoutReveal,
  verifyHeldoutReveal
} from "./heldout.ts";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const publicChecks: CheckSpec[] = [
  { type: "schema", hardGate: true, requiredFields: ["invoiceId", "amount", "currency"] },
  { type: "price_max", hardGate: true, value: 700, currency: "HBAR" }
];
const hiddenChecks: CheckSpec[] = [
  { type: "wallet_risk", hardGate: true, maxTier: "yellow" },
  { type: "source_listing", hardGate: false }
];
const salt = randomSalt();

async function main() {
  const manifest = await buildHeldoutManifest({
    intent: "Buy an RTX 4090 under 700 HBAR from a seller with a valid wallet + shipping proof.",
    publicChecks,
    hiddenChecks,
    salt,
    createdAt: "2026-06-13T00:00:00.000Z"
  });

  check("manifest hides hidden-check plaintext (commit only)", !JSON.stringify(manifest).includes("wallet_risk"), "manifest leaked a hidden check type");
  check("manifest discloses hidden count only", manifest.hiddenCount === hiddenChecks.length);

  // ---- 1. Honest reveal verifies + resolves to public + hidden ----------
  const honest: HeldoutReveal = { hiddenChecks, salt };
  const okHonest = await verifyHeldoutReveal(manifest, honest);
  check("honest reveal is valid against the commitment", okHonest.valid);
  check(
    "valid reveal resolves to public + hidden checks",
    okHonest.resolvedChecks?.length === publicChecks.length + hiddenChecks.length,
    String(okHonest.resolvedChecks?.length)
  );

  // ---- 2. Tamper paths are rejected -------------------------------------
  const swappedChecks: CheckSpec[] = [
    { type: "wallet_risk", hardGate: true, maxTier: "red" }, // loosened after the fact
    { type: "source_listing", hardGate: false }
  ];
  const tamperedChecks = await verifyHeldoutReveal(manifest, { hiddenChecks: swappedChecks, salt });
  check("reveal with altered hidden checks is rejected", !tamperedChecks.valid);

  const tamperedSalt = await verifyHeldoutReveal(manifest, { hiddenChecks, salt: randomSalt() });
  check("reveal with a different salt is rejected", !tamperedSalt.valid);

  const droppedCheck = await verifyHeldoutReveal(manifest, { hiddenChecks: [hiddenChecks[0]], salt });
  check("reveal with the wrong hidden count is rejected", !droppedCheck.valid);

  // ---- 3. Store degrades to local, never throws -------------------------
  const prevPub = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER;
  const prevTimeout = process.env.NEXT_PUBLIC_WALRUS_TIMEOUT_MS;
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER = "http://127.0.0.1:1/__bogus__";
  process.env.NEXT_PUBLIC_WALRUS_TIMEOUT_MS = "1500";

  let local;
  try {
    local = await storeHeldoutReveal(honest);
  } catch (e) {
    failures++;
    console.error(`FAIL  storeHeldoutReveal threw on bogus publisher — ${String(e)}`);
  }
  if (local) {
    check("storeHeldoutReveal (bogus publisher) → store === 'local'", local.store === "local", local.store);
    check("storeHeldoutReveal (bogus publisher) → valid sha256 anchor", /^[0-9a-f]{64}$/.test(local.hash), local.hash);
  }

  if (prevPub === undefined) delete process.env.NEXT_PUBLIC_WALRUS_PUBLISHER;
  else process.env.NEXT_PUBLIC_WALRUS_PUBLISHER = prevPub;
  if (prevTimeout === undefined) delete process.env.NEXT_PUBLIC_WALRUS_TIMEOUT_MS;
  else process.env.NEXT_PUBLIC_WALRUS_TIMEOUT_MS = prevTimeout;

  // ---- 4. Best-effort live round-trip (informational) -------------------
  console.log("\n— best-effort live Walrus reveal round-trip (informational) —");
  try {
    const live = await storeHeldoutReveal(honest);
    if (live.store === "walrus" && live.blobId) {
      console.log(`  LIVE OK  reveal stored on Walrus: blobId=${live.blobId}`);
      const verified = await fetchAndVerifyHeldoutReveal(manifest, live.blobId);
      console.log(
        `  LIVE ${verified.retrieved ? "OK" : "SKIP"}  re-fetched=${verified.retrieved} valid=${verified.valid}` +
          (verified.retrieved ? "" : " (aggregator not yet serving — expected-OK)")
      );
    } else {
      console.log("  LIVE SKIP  publisher unreachable / shape drift → local fallback (expected-OK)");
    }
    console.log(`           reveal hash anchor = ${live.hash}`);
  } catch (e) {
    console.log(`  LIVE SKIP  storeHeldoutReveal rejected unexpectedly — ${String(e)}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall held-out reveal-store checks passed");
}

void main();
