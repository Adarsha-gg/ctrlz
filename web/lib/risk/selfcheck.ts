/**
 * Deterministic self-check for the risk engine — runs with plain Node
 * (type stripping), no test framework:
 *
 *   node --experimental-strip-types web/lib/risk/selfcheck.ts
 *
 * Each case maps to a demo beat; if one fails, that beat dies on stage.
 */

import { scoreRecipient } from "./verdict.ts";
import { foldName } from "./names.ts";
import {
  ALICE_ADDRESS,
  ALICE_NAME,
  DEMO_ADDRESS_BOOK,
  KNOWN_NAMES,
  POISONED_LOOKALIKE
} from "./fixtures.ts";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const base = { addressBook: DEMO_ADDRESS_BOOK, knownNames: KNOWN_NAMES };

// Demo beat 1: paste the planted poisoned lookalike → RED
{
  const v = scoreRecipient({ ...base, address: POISONED_LOOKALIKE });
  check("poisoned lookalike address → red", v.tier === "red", JSON.stringify(v));
  check(
    "…and the reason names the impersonated contact",
    v.signals.some((s) => s.code === "ADDRESS_LOOKALIKE" && s.message.includes(ALICE_NAME))
  );
}

// Demo beat 2: alice with seeded history → GREEN with the rich stats
{
  const v = scoreRecipient({
    ...base,
    address: ALICE_ADDRESS,
    typedName: ALICE_NAME,
    history: {
      sealedCount: 1402,
      distinctSenders: 890,
      flagCount: 0,
      fraudRecallCount: 0,
      firstSeenDaysAgo: 240
    },
    ens: { name: ALICE_NAME, forwardReverseMatch: true, nameAgeDays: 240 }
  });
  check("alice (seeded history, fwd+rev ok) → green", v.tier === "green", JSON.stringify(v));
  check(
    "…and carries the established stats",
    v.signals.some((s) => s.code === "ESTABLISHED" && s.message.includes("1402"))
  );
}

// Name poisoning: capital-I homoglyph → RED
{
  const v = scoreRecipient({
    ...base,
    address: "0xDEAD00000000000000000000000000000000beef",
    typedName: "aIice.ctrlz.eth"
  });
  check("aIice (capital I) homoglyph name → red", v.tier === "red", JSON.stringify(v));
}

// Name poisoning: Cyrillic а → RED
{
  const cyrillic = "аlice.ctrlz.eth"; // а + lice
  check("fold(Cyrillic аlice) == fold(alice)", foldName(cyrillic) === foldName(ALICE_NAME));
  const v = scoreRecipient({
    ...base,
    address: "0xDEAD00000000000000000000000000000000beef",
    typedName: cyrillic
  });
  check("Cyrillic аlice homoglyph name → red", v.tier === "red", JSON.stringify(v));
}

// ENS forward/reverse mismatch → YELLOW (not green even if name looks fine)
{
  const v = scoreRecipient({
    ...base,
    address: "0xCafe000000000000000000000000000000001234",
    typedName: "carol.ctrlz.eth",
    ens: { name: "carol.ctrlz.eth", forwardReverseMatch: false },
    history: {
      sealedCount: 10,
      distinctSenders: 6,
      flagCount: 0,
      fraudRecallCount: 0,
      firstSeenDaysAgo: 30
    }
  });
  check("fwd/rev mismatch caps verdict at yellow", v.tier === "yellow", JSON.stringify(v));
}

// Fresh unknown recipient → YELLOW (never green, never silently fine)
{
  const v = scoreRecipient({ ...base, address: "0xF4e5000000000000000000000000000000000aaa" });
  check("fresh unknown recipient → yellow", v.tier === "yellow", JSON.stringify(v));
}

// Flagged recipient → RED regardless of volume
{
  const v = scoreRecipient({
    ...base,
    address: "0xBad0000000000000000000000000000000000bad",
    history: {
      sealedCount: 50,
      distinctSenders: 40,
      flagCount: 3,
      fraudRecallCount: 2,
      firstSeenDaysAgo: 90
    }
  });
  check("flagged recipient → red despite volume", v.tier === "red", JSON.stringify(v));
}

// Exact alice address but NO history yet (pre-seed) → still not red, known contact
{
  const v = scoreRecipient({ ...base, address: ALICE_ADDRESS });
  check("known contact without history wired → green (sender saved them)", v.tier === "green", JSON.stringify(v));
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall risk-engine checks passed");
