/**
 * source-listing-checker (B2) — advisory, deterministic, pure.
 *
 * A plausibility HEURISTIC over the worker's claimed source listing. It is an
 * advisory check (`hardGate: false`): it never gates money on its own — it only
 * moves the score and can push the recommendation to `pause`.
 *
 * Ethos guard: NO LLM decision here. An LLM may later *summarize* a listing,
 * but this checker is a fixed set of mechanical plausibility rules so it stays
 * replayable. Mismatches → `uncertain` (worth a human look), not `fail`.
 */

import type { Checker, CheckerReport, CheckSpec, TaskContext } from "./types.ts";

const CHECKER = "source-listing-checker";

const KNOWN_MARKETPLACES = ["newegg", "amazon", "bestbuy", "microcenter", "ebay"];

export const sourceListingChecker: Checker = (
  _check: CheckSpec,
  ctx: TaskContext
): CheckerReport => {
  const listing = ctx.submission.sourceListing;
  const item = ctx.submission.invoice.item ?? "";
  const evidenceHash = ctx.submission.evidenceHash;

  if (!listing || (!listing.url && !listing.marketplace && !listing.title)) {
    return {
      checker: CHECKER,
      result: "uncertain",
      confidence: 0.5,
      detail: "No source listing was provided — sourcing plausibility cannot be assessed.",
      evidenceHash
    };
  }

  const reasons: string[] = [];

  // Heuristic 1: a recognizable marketplace (from url or marketplace field).
  const haystack = `${listing.url ?? ""} ${listing.marketplace ?? ""}`.toLowerCase();
  const knownMarket = KNOWN_MARKETPLACES.some((m) => haystack.includes(m));
  if (knownMarket) {
    reasons.push("listed on a recognized marketplace");
  } else {
    reasons.push("marketplace is not in the recognized set");
  }

  // Heuristic 2: the listing title plausibly references the invoiced item.
  const titleWords = (listing.title ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const itemWords = item.toLowerCase().split(/\s+/).filter(Boolean);
  const overlap = itemWords.filter((w) => w.length > 2 && titleWords.includes(w));
  const titleMatches = overlap.length > 0;
  if (titleMatches) {
    reasons.push(`listing title references the item (${overlap.join(", ")})`);
  } else if (listing.title) {
    reasons.push("listing title does not reference the invoiced item");
  }

  // Plausible only when both signals are positive; otherwise advisory-uncertain.
  const plausible = knownMarket && titleMatches;

  return {
    checker: CHECKER,
    result: plausible ? "pass" : "uncertain",
    confidence: plausible ? 0.7 : 0.55,
    detail: `Advisory: ${reasons.join("; ")}.`,
    evidenceHash
  };
};
