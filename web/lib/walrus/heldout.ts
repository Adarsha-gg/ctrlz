/**
 * Held-out test REVEAL store on Walrus (E + checkers/heldout, REPUTATION §8f).
 *
 * The commit-reveal primitive (`checkers/heldout.ts`) binds the hidden checks at
 * lock time via `sha256({hiddenChecks, salt})`, committed inside the acceptance
 * manifest whose hash is the on-chain `specHash`. That's the COMMIT side.
 *
 * This is the REVEAL side, and the second first-class Walrus use case: at
 * resolution the held-out checks get their own content-addressed Walrus (Sui)
 * blob. The reveal becomes a permanent, neutral, independently-fetchable artifact
 * — not a line item the resolver could quietly drop, lose, or alter after seeing
 * the work. Anyone holding the on-chain `specHash` (→ manifest →
 * `hiddenChecksCommit`) can fetch the reveal from Walrus and PROVE the buyer
 * revealed exactly the held-out checks they committed to before work started.
 *
 * Ethos guards mirror the evidence store (`store.ts`):
 *  1. The sha256 anchor is load-bearing and ALWAYS computed; Walrus is the
 *     swappable backend behind it.
 *  2. Never throws into the UI — store degrades to `{ store: "local", hash }`,
 *     read/verify degrade to `{ retrieved: false }`.
 *  3. Content-addressed: a fetched reveal is only trusted after it both
 *     round-trips by hash AND satisfies `verifyReveal` against the committed
 *     manifest — so a tampered or substituted blob is rejected, not run.
 *
 * The reveal blob is published ONLY at resolution. Pre-reveal, the sole on-chain/
 * manifest artifact is the hiding commitment, so storing the reveal on a public
 * network here does not leak the hidden checks early.
 */

import {
  assembleResolvedChecks,
  verifyReveal,
  type HeldoutManifest,
  type HeldoutReveal
} from "../checkers/heldout.ts";
import type { CheckSpec } from "../checkers/types.ts";
import { readEvidence, storeEvidence, type StoreResult } from "./store.ts";

/**
 * Pointer to the held-out reveal blob, suitable for embedding in the evidence
 * blob / surfacing in the UI. `hash` is the load-bearing sha256 anchor (always
 * present); `blobId`/`uri` are set when the reveal actually landed on Walrus.
 */
export type HeldoutRevealPointer = StoreResult;

/**
 * Outcome of fetching a reveal back from Walrus and checking it against the
 * committed manifest. `valid` is true ONLY when the blob round-tripped AND its
 * commitment matches the manifest's `hiddenChecksCommit`.
 */
export type HeldoutRevealVerification = {
  /** the aggregator returned a parseable reveal-shaped blob */
  retrieved: boolean;
  /** retrieved AND `verifyReveal` passed against the committed manifest */
  valid: boolean;
  /** the verified reveal (only when valid) */
  reveal?: HeldoutReveal;
  /** public + revealed hidden checks, ready to run (only when valid) */
  resolvedChecks?: CheckSpec[];
};

/**
 * Publish the held-out reveal to Walrus at resolution. Best-effort: on any Walrus
 * failure it degrades to `{ store: "local", hash }` with the sha256 anchor still
 * computed, exactly like the evidence store. NEVER throws.
 */
export async function storeHeldoutReveal(reveal: HeldoutReveal): Promise<HeldoutRevealPointer> {
  return storeEvidence(reveal);
}

/** Structural guard: is an arbitrary fetched value shaped like a HeldoutReveal? */
function isHeldoutReveal(value: unknown): value is HeldoutReveal {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.hiddenChecks) && typeof v.salt === "string";
}

/**
 * Fetch the reveal blob back from Walrus by blob id and verify it against the
 * committed manifest. The fetched bytes are NEVER trusted on retrieval alone —
 * they are only accepted after `verifyReveal` ties them back to the
 * `hiddenChecksCommit` the buyer locked in before work started. Best-effort and
 * never throws: any read/parse failure → `{ retrieved: false, valid: false }`.
 */
export async function fetchAndVerifyHeldoutReveal(
  manifest: HeldoutManifest,
  blobId: string
): Promise<HeldoutRevealVerification> {
  const fetched = await readEvidence(blobId);
  if (!isHeldoutReveal(fetched)) {
    return { retrieved: false, valid: false };
  }
  return { retrieved: true, ...(await verifyFetchedReveal(manifest, fetched)) };
}

/**
 * Verify an already-in-hand reveal (e.g. the local-fallback blob, or one embedded
 * in the evidence blob) against the committed manifest. Same trust rule as the
 * fetched path: accepted only when the commitment matches.
 */
export async function verifyHeldoutReveal(
  manifest: HeldoutManifest,
  reveal: HeldoutReveal
): Promise<Omit<HeldoutRevealVerification, "retrieved">> {
  return verifyFetchedReveal(manifest, reveal);
}

async function verifyFetchedReveal(
  manifest: HeldoutManifest,
  reveal: HeldoutReveal
): Promise<Omit<HeldoutRevealVerification, "retrieved">> {
  const ok = await verifyReveal(manifest, reveal);
  if (!ok) return { valid: false };
  return { valid: true, reveal, resolvedChecks: assembleResolvedChecks(manifest, reveal) };
}
