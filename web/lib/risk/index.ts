export type {
  VerdictTier,
  RiskVerdict,
  Signal,
  SignalCode,
  AddressBookEntry,
  RecipientHistory,
  EnsInfo,
  ScoreInput
} from "./types.ts";
export { scoreRecipient } from "./verdict.ts";
export { findAddressLookalike, levenshtein, sameAddress } from "./lookalike.ts";
export { findNameLookalike, foldName, hasSuspiciousChars } from "./names.ts";
export {
  ALICE_ADDRESS,
  ALICE_NAME,
  POISONED_LOOKALIKE,
  DEMO_ADDRESS_BOOK,
  KNOWN_NAMES
} from "./fixtures.ts";

import type { RiskVerdict } from "./types.ts";

/** kept for the scaffold page; real callers use scoreRecipient */
export function emptyVerdict(): RiskVerdict {
  return {
    tier: "yellow",
    reasons: ["Risk engine scaffolded; deterministic signals not wired yet."],
    signals: []
  };
}
