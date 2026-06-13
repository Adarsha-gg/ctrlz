/**
 * Name-poisoning detection (P2.3): the same scrutiny addresses get, applied to
 * ENS names — homoglyph folding + normalization + edit distance vs known names.
 * Closes the "you just swapped hex poisoning for aIice.eth poisoning" objection.
 *
 * Note: valid ENS names are already ENSIP-15 normalized (lowercase). Any
 * uppercase or confusable character in user input is itself a signal.
 */

import { levenshtein } from "./lookalike.ts";

/**
 * Fold visually-confusable characters to their ASCII lookalike BEFORE
 * lowercasing (capital I → l must happen first: lowercase would turn it into a
 * legitimate-looking i). Covers the common Latin-impersonation set: Cyrillic,
 * Greek, and digit/letter confusables.
 */
const CONFUSABLES: Record<string, string> = {
  // capital-I-as-l and digit confusables
  I: "l",
  "1": "l",
  "0": "o",
  // Cyrillic lowercase
  "а": "a", // а
  "е": "e", // е
  "о": "o", // о
  "р": "p", // р
  "с": "c", // с
  "у": "y", // у
  "х": "x", // х
  "і": "i", // і
  "ѕ": "s", // ѕ
  "ӏ": "l", // ӏ
  "ԁ": "d", // ԁ
  "ԛ": "q", // ԛ
  "ԝ": "w", // ԝ
  // Cyrillic uppercase (folded to lowercase Latin)
  "А": "a",
  "Е": "e",
  "О": "o",
  "Р": "p",
  "С": "c",
  "Х": "x",
  // Greek
  "ο": "o", // ο
  "α": "a", // α
  "ν": "v" // ν
};

export function foldName(name: string): string {
  let out = "";
  for (const ch of name.normalize("NFC")) {
    out += CONFUSABLES[ch] ?? ch;
  }
  return out.toLowerCase();
}

/** true if the raw input contains characters a normalized ENS name never would */
export function hasSuspiciousChars(name: string): boolean {
  return name !== name.normalize("NFC") || /[A-Z]/.test(name) || [...name].some((c) => c in CONFUSABLES && c !== c.toLowerCase());
}

export type NameLookalikeHit = {
  matchedName: string;
  /** true = identical after confusable folding (pure homoglyph attack) */
  homoglyph: boolean;
  editDistance: number;
};

export function findNameLookalike(
  candidate: string,
  knownNames: string[]
): NameLookalikeHit | undefined {
  const cand = foldName(candidate);
  for (const known of knownNames) {
    const target = foldName(known);
    if (candidate === known) continue; // exact known name, raw — not a lookalike
    if (cand === target) {
      return { matchedName: known, homoglyph: true, editDistance: 0 };
    }
    const editDistance = levenshtein(cand, target);
    if (editDistance <= 2) {
      return { matchedName: known, homoglyph: false, editDistance };
    }
  }
  return undefined;
}
