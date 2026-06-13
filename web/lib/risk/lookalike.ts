/**
 * Address-poisoning lookalike detection (P2.2).
 *
 * Poisoned addresses are vanity-generated to match the FIRST and LAST visible
 * characters of a victim's saved contact, because wallet UIs elide the middle
 * (0x1234…abcd). Prefix+suffix match on a different address is therefore the
 * primary signal; small overall edit distance is the secondary one.
 */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function stripHex(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "");
}

function sharedPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function sharedSuffixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

export function sameAddress(a: string, b: string): boolean {
  return stripHex(a) === stripHex(b);
}

export type AddressLookalikeHit = {
  /** the saved contact this address is impersonating */
  matchedName: string;
  matchedAddress: string;
  prefixLen: number;
  suffixLen: number;
  editDistance: number;
};

const MIN_VISIBLE_MATCH = 4; // wallet UIs show ~4 leading + 4 trailing hex chars
const NEAR_IDENTICAL_DISTANCE = 4;

export function findAddressLookalike(
  candidate: string,
  book: { name: string; address: string }[]
): AddressLookalikeHit | undefined {
  const cand = stripHex(candidate);
  for (const entry of book) {
    const saved = stripHex(entry.address);
    if (cand === saved) continue; // exact match is handled as KNOWN_CONTACT
    const prefixLen = sharedPrefixLen(cand, saved);
    const suffixLen = sharedSuffixLen(cand, saved);
    const editDistance = levenshtein(cand, saved);
    const visibleEndsMatch = prefixLen >= MIN_VISIBLE_MATCH && suffixLen >= MIN_VISIBLE_MATCH;
    const nearIdentical = editDistance <= NEAR_IDENTICAL_DISTANCE;
    if (visibleEndsMatch || nearIdentical) {
      return {
        matchedName: entry.name,
        matchedAddress: entry.address,
        prefixLen,
        suffixLen,
        editDistance
      };
    }
  }
  return undefined;
}
