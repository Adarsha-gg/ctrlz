/**
 * Recipient resolution for the buyer verdict card (P6.1).
 *
 * The deterministic risk engine scores an *address*; the buyer may type an
 * address, a name, or both. ENS resolution (P2.4) isn't wired yet, so we
 * resolve names against the same demo fixtures the engine already trusts:
 * the sender's address book + alice. This keeps the demo one-click without
 * inventing a fake network call.
 *
 * Ethos guard #5 ("raw 0x on screen = a bug"): once we resolve a known
 * address back to a name, callers prefer that name in the card/headline.
 */

import { ALICE_ADDRESS, ALICE_NAME, DEMO_ADDRESS_BOOK } from "@/lib/risk";

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export type ResolvedRecipient = {
  /** the 0x address the engine scores (may be empty if a name didn't resolve) */
  address: string;
  /** the name the user typed, if it looked like a name (passed to the engine) */
  typedName?: string;
  /**
   * the best human label for display — a known name when we have one, else the
   * typed name, else the address. Card copy should prefer this over raw hex.
   */
  displayName?: string;
  /** true when `address` maps to a contact we can name (drives guard #5) */
  isKnownName: boolean;
};

/** Look up a known name for an address (address book first, then alice). */
export function nameForAddress(address: string): string | undefined {
  if (!address) return undefined;
  const entry = DEMO_ADDRESS_BOOK.find((e) => sameAddress(e.address, address));
  if (entry) return entry.name;
  if (sameAddress(address, ALICE_ADDRESS)) return ALICE_NAME;
  return undefined;
}

/** Look up an address for a typed name (address book first, then alice). */
function addressForName(name: string): string | undefined {
  const folded = name.trim().toLowerCase();
  if (!folded) return undefined;
  const entry = DEMO_ADDRESS_BOOK.find((e) => e.name.toLowerCase() === folded);
  if (entry) return entry.address;
  if (folded === ALICE_NAME.toLowerCase()) return ALICE_ADDRESS;
  return undefined;
}

/**
 * Parse whatever the buyer pasted into the engine's `{ address, typedName }`.
 * Accepts a bare address, a bare name, or "name 0xabc…" / "0xabc… name".
 */
export function resolveRecipient(raw: string): ResolvedRecipient {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);

  let address = "";
  let typedName: string | undefined;
  for (const token of tokens) {
    if (ADDR_RE.test(token)) address = token;
    else if (!typedName) typedName = token;
  }

  // A typed name with no pasted address: try to resolve it to one so the
  // engine has an address to score (the address-poisoning check needs it).
  if (!address && typedName) {
    const resolved = addressForName(typedName);
    if (resolved) address = resolved;
  }

  const knownName = nameForAddress(address);
  const isKnownName = Boolean(knownName);
  const displayName = knownName ?? typedName ?? (address || undefined);

  return { address, typedName, displayName, isKnownName };
}
