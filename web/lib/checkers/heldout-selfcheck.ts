/**
 * Deterministic self-check for the held-out commit-reveal layer — runs with
 *
 *   node --experimental-strip-types web/lib/checkers/heldout-selfcheck.ts
 *
 * Proves the security properties the escrow flow relies on:
 *  1. the worker-visible manifest leaks no hidden-check content;
 *  2. the commitment is deterministic + hiding (salt-dependent);
 *  3. a reveal that tampers with the hidden checks, the salt, or the count fails;
 *  4. held-out checks catch a deliverable that was gamed to pass the public set.
 */

import type { CheckSpec } from "./types.ts";
import {
  assembleResolvedChecks,
  buildHeldoutManifest,
  commitHiddenChecks,
  randomSalt,
  verifyReveal,
  type HeldoutManifest,
  type HeldoutReveal
} from "./heldout.ts";

let failures = 0;
function check(label: string, cond: boolean): void {
  console.log(`  ${cond ? "ok " : "XX "} ${label}`);
  if (!cond) failures++;
}

async function main() {
  // A buyer's spec: public checks the worker sees, hidden checks held out. The
  // "secret-marker" param lets us prove the manifest never leaks hidden content.
  const publicChecks: CheckSpec[] = [
    { type: "schema", hardGate: true },
    { type: "price_max", hardGate: true, value: 700 }
  ];
  const hiddenChecks: CheckSpec[] = [
    { type: "price_max", hardGate: true, value: 700, sampleUrl: "SECRET-PAGE-42" },
    { type: "source_listing", hardGate: false, sampleUrl: "SECRET-PAGE-77" }
  ];
  const salt = randomSalt();

  const manifest = await buildHeldoutManifest({
    intent: "scrape products into schema; prices must be correct",
    publicChecks,
    hiddenChecks,
    salt,
    resolutionPolicy: "auto_on_hardgates"
  });

  // 1. No leakage — the worker-visible manifest must not contain hidden plaintext.
  const manifestJSON = JSON.stringify(manifest);
  check("worker-visible manifest carries the public checks", manifestJSON.includes("price_max"));
  check("worker-visible manifest does NOT leak hidden check content", !manifestJSON.includes("SECRET-PAGE"));
  check("manifest discloses hidden COUNT but not content", manifest.hiddenCount === 2);
  check("manifest exposes only a commitment for the hidden set", /^[0-9a-f]{64}$/.test(manifest.hiddenChecksCommit));

  // 2. Determinism + hiding.
  const again = await commitHiddenChecks(hiddenChecks, salt);
  check("commitment is deterministic (same checks+salt → same hash)", again === manifest.hiddenChecksCommit);
  const otherSalt = await commitHiddenChecks(hiddenChecks, randomSalt());
  check("commitment is hiding (different salt → different hash)", otherSalt !== manifest.hiddenChecksCommit);

  // 3. Reveal verification + tamper detection.
  const honestReveal: HeldoutReveal = { hiddenChecks, salt };
  check("honest reveal verifies against the commitment", await verifyReveal(manifest, honestReveal));

  const tamperedChecks: CheckSpec[] = [
    { type: "price_max", hardGate: true, value: 700, sampleUrl: "SECRET-PAGE-42" },
    { type: "source_listing", hardGate: false, sampleUrl: "SWAPPED-PAGE-99" } // changed
  ];
  check("reveal with swapped hidden check is rejected", !(await verifyReveal(manifest, { hiddenChecks: tamperedChecks, salt })));
  check("reveal with wrong salt is rejected", !(await verifyReveal(manifest, { hiddenChecks, salt: randomSalt() })));
  check(
    "reveal with a dropped hidden check is rejected (count guard)",
    !(await verifyReveal(manifest, { hiddenChecks: [hiddenChecks[0]], salt }))
  );

  // 4. Held-out checks catch a gamed deliverable. The worker hardcoded answers for
  // the cases it could see (public) but not the unseen held-out cases.
  const gamedAnswers: Record<string, boolean> = {
    // public cases the worker knew about → satisfied
    "public-A": true,
    "public-B": true
    // hidden SECRET-PAGE-* cases → NOT satisfied (worker never saw them)
  };
  const evaluate = (checks: CheckSpec[]): boolean =>
    checks.every((c) => {
      const key = (c.sampleUrl as string | undefined) ?? "public-A";
      return gamedAnswers[key] === true;
    });

  const publicOnlyPasses = evaluate(manifest.publicChecks);
  const fullChecks = assembleResolvedChecks(manifest, honestReveal);
  const fullPasses = evaluate(fullChecks);
  check("gamed deliverable PASSES the public-only checks (overfit succeeds)", publicOnlyPasses);
  check("gamed deliverable FAILS once held-out checks are revealed (overfit caught)", !fullPasses);
  check("resolved check set = public + hidden", fullChecks.length === publicChecks.length + hiddenChecks.length);

  // 5. Salt floor guard.
  let threw = false;
  try {
    await commitHiddenChecks(hiddenChecks, "short");
  } catch {
    threw = true;
  }
  check("commit rejects a too-short salt", threw);

  if (failures > 0) {
    console.log(`\n${failures} held-out check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nall held-out commit-reveal checks passed");
}

void main();
