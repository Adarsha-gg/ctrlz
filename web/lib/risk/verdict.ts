/**
 * Verdict aggregator (P2.6) — deterministic, ordered rules. Signals DECIDE;
 * the LLM (Phase 3) only explains. Chain/ENS inputs (history, ens) are
 * optional until P2.4/P2.5 wire them — absence degrades to "no history".
 */

import type { RiskVerdict, ScoreInput, Signal, VerdictTier } from "./types.ts";
import { findAddressLookalike, sameAddress } from "./lookalike.ts";
import { findNameLookalike, hasSuspiciousChars } from "./names.ts";

const ESTABLISHED_SEALED = 5;
const ESTABLISHED_SENDERS = 3;
const FLAGGED_THRESHOLD = 2;
const YOUNG_NAME_DAYS = 7;

function worst(a: VerdictTier, b: VerdictTier): VerdictTier {
  const rank: Record<VerdictTier, number> = { green: 0, yellow: 1, red: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function scoreRecipient(input: ScoreInput): RiskVerdict {
  const signals: Signal[] = [];
  const knownEntry = input.addressBook.find((e) => sameAddress(e.address, input.address));

  // 1. Address-poisoning lookalike — the core check, never skipped.
  const addrHit = findAddressLookalike(input.address, input.addressBook);
  if (addrHit) {
    signals.push({
      code: "ADDRESS_LOOKALIKE",
      tier: "red",
      message:
        `Address mimics your saved contact ${addrHit.matchedName} ` +
        `(first ${addrHit.prefixLen} + last ${addrHit.suffixLen} characters match, ` +
        `but it is NOT that address). Classic poisoning pattern.`
    });
  }

  // 2. Name-poisoning lookalike — same scrutiny for names.
  const allKnownNames = [
    ...input.knownNames,
    ...input.addressBook.map((e) => e.name)
  ];
  if (input.typedName) {
    const nameHit = findNameLookalike(input.typedName, allKnownNames);
    if (nameHit) {
      signals.push({
        code: nameHit.homoglyph ? "NAME_HOMOGLYPH" : "NAME_LOOKALIKE",
        tier: nameHit.homoglyph || nameHit.editDistance === 1 ? "red" : "yellow",
        message: nameHit.homoglyph
          ? `"${input.typedName}" is a homoglyph impersonation of ${nameHit.matchedName} — different characters, identical look.`
          : `"${input.typedName}" is ${nameHit.editDistance} edit(s) away from ${nameHit.matchedName}.`
      });
    } else if (hasSuspiciousChars(input.typedName)) {
      signals.push({
        code: "NAME_HOMOGLYPH",
        tier: "yellow",
        message: `"${input.typedName}" contains characters a normalized ENS name never has (uppercase or non-Latin confusables).`
      });
    }
  }

  // 3. ENS forward/reverse mismatch.
  if (input.ens?.forwardReverseMatch === false) {
    signals.push({
      code: "ENS_MISMATCH",
      tier: "yellow",
      message: `Claims to be ${input.ens.name ?? "a named recipient"}, but forward and reverse ENS resolution do not match.`
    });
  }
  if (input.ens?.nameAgeDays !== undefined && input.ens.nameAgeDays < YOUNG_NAME_DAYS) {
    signals.push({
      code: "ENS_NAME_YOUNG",
      tier: "yellow",
      message: `ENS name is only ${input.ens.nameAgeDays} day(s) old.`
    });
  }

  // 4. Settlement history (on-chain counters; only CLAIMED payments count).
  const h = input.history;
  if (h && h.flagCount >= FLAGGED_THRESHOLD) {
    signals.push({
      code: "FLAGGED",
      tier: "red",
      message: `${h.flagCount} non-delivery flags from proven payers.`
    });
  }
  if (h && h.fraudRecallCount > 0) {
    signals.push({
      code: "FRAUD_RECALLS",
      tier: "yellow",
      message: `${h.fraudRecallCount} sender(s) recalled payments to this recipient citing suspected fraud.`
    });
  }
  if (h && h.sealedCount >= ESTABLISHED_SEALED && h.distinctSenders >= ESTABLISHED_SENDERS) {
    signals.push({
      code: "ESTABLISHED",
      tier: "green",
      message: `${h.sealedCount} sealed claims from ${h.distinctSenders} distinct senders, first seen ${h.firstSeenDaysAgo} days ago.`
    });
  } else if (!h || h.sealedCount === 0) {
    signals.push({
      code: "NO_HISTORY",
      tier: "yellow",
      message: "No sealed payment history — first-time or unknown recipient."
    });
  } else {
    signals.push({
      code: "LIMITED_HISTORY",
      tier: "yellow",
      message: `Only ${h.sealedCount} sealed claim(s) from ${h.distinctSenders} sender(s) so far.`
    });
  }

  // 5. Known contact — a green signal, but it never outranks a red one.
  if (knownEntry) {
    signals.push({
      code: "KNOWN_CONTACT",
      tier: "green",
      message: `Saved contact: ${knownEntry.name}.`
    });
  }

  // Aggregate: any red → red; else greens must outweigh… no — deterministic
  // and conservative: any red → red; no red but any green + no yellow beyond
  // history noise → green only when a green anchor (KNOWN_CONTACT or
  // ESTABLISHED) exists and nothing yellow other than that anchor's absence.
  let tier: VerdictTier = "yellow";
  const hasRed = signals.some((s) => s.tier === "red");
  const greenAnchor = signals.some(
    (s) => s.code === "KNOWN_CONTACT" || s.code === "ESTABLISHED"
  );
  const hardYellow = signals.some(
    (s) => s.tier === "yellow" && s.code !== "NO_HISTORY" && s.code !== "LIMITED_HISTORY"
  );
  if (hasRed) tier = "red";
  else if (greenAnchor && !hardYellow) tier = "green";
  else tier = "yellow";

  // KNOWN_CONTACT alone with zero history still deserves green only because
  // the sender explicitly saved it — but a fresh unknown stays yellow.
  if (tier === "green" && !greenAnchor) tier = worst(tier, "yellow");

  return {
    tier,
    reasons: signals.map((s) => s.message),
    signals
  };
}
