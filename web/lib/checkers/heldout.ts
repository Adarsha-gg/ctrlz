/**
 * Held-out tests via commit-reveal (PITCH.md §"held-out tests" / REPUTATION.md §8e).
 *
 * The anti-gaming problem: if the worker sees every check, it can do the minimum
 * to pass them (Goodhart). The fix is to hold out some checks — but on-chain is
 * public, so you can't put the hidden checks in the lock txn. You put a *hash
 * commitment* of them instead, and reveal at resolution.
 *
 * Flow:
 *   lock   → buyer publishes a HeldoutManifest on Walrus: publicChecks (clear) +
 *            hiddenChecksCommit = sha256({hiddenChecks, salt}). Its hash is the
 *            on-chain `specHash`. The worker sees the public checks and that hidden
 *            checks EXIST and are bound — but not what they are.
 *   reveal → at resolution the buyer/resolver publishes {hiddenChecks, salt}.
 *            Anyone verifies sha256({hiddenChecks, salt}) == hiddenChecksCommit,
 *            then runs publicChecks + hiddenChecks. A disputing verifier re-runs
 *            the same way (the reveal lives in the evidence blob).
 *
 * Fairness rule (the manifest must obey, enforced socially / at dispute): held-out
 * *inputs*, not held-out *requirements*. The worker must be able to know WHAT is
 * required from the public spec; only WHICH specific cases get checked is hidden,
 * so it can't hardcode. (Like a train/held-out test split in ML.)
 *
 * Pure + deterministic: uses the same canonical-JSON sha256 (`hashBlob`) the
 * evidence layer uses, so commitments are stable and reproducible across machines.
 */

import type { CheckSpec } from "./types.ts";
import { hashBlob } from "../walrus/store.ts";

/** sha256 hex of the salted hidden-check set — published at lock, hides content. */
export type HiddenCommitment = string;

/**
 * What the WORKER sees (and what `specHash` commits on-chain). Contains the public
 * checks in the clear plus a hiding commitment to the held-out checks. It MUST NOT
 * contain hidden-check plaintext.
 */
export type HeldoutManifest = {
  intent: string;
  publicChecks: CheckSpec[];
  /** sha256({hiddenChecks, salt}) — binds the hidden checks without revealing them */
  hiddenChecksCommit: HiddenCommitment;
  /** how many hidden checks exist (safe to disclose; content stays hidden) */
  hiddenCount: number;
  resolutionPolicy?: string;
  createdAt?: string;
};

/** The reveal published at resolution; verifiable against the commitment. */
export type HeldoutReveal = {
  hiddenChecks: CheckSpec[];
  /** the random salt used at commit time (>= 16 hex chars) */
  salt: string;
};

const MIN_SALT_LEN = 16;

/**
 * The commitment: canonical-JSON sha256 over {hiddenChecks, salt}. The salt is what
 * makes it *hiding* — without it a worker could brute-force a small/guessable check
 * set straight out of the commitment.
 */
export async function commitHiddenChecks(
  hiddenChecks: CheckSpec[],
  salt: string
): Promise<HiddenCommitment> {
  if (!salt || salt.length < MIN_SALT_LEN) {
    throw new Error(`held-out salt must be >= ${MIN_SALT_LEN} chars (hiding requirement)`);
  }
  return hashBlob({ hiddenChecks, salt });
}

/**
 * Build the worker-visible manifest. The hidden-check plaintext + salt stay with
 * the buyer/resolver until reveal — they are NOT part of the returned manifest.
 */
export async function buildHeldoutManifest(input: {
  intent: string;
  publicChecks: CheckSpec[];
  hiddenChecks: CheckSpec[];
  salt: string;
  resolutionPolicy?: string;
  createdAt?: string;
}): Promise<HeldoutManifest> {
  const hiddenChecksCommit = await commitHiddenChecks(input.hiddenChecks, input.salt);
  return {
    intent: input.intent,
    publicChecks: input.publicChecks,
    hiddenChecksCommit,
    hiddenCount: input.hiddenChecks.length,
    ...(input.resolutionPolicy ? { resolutionPolicy: input.resolutionPolicy } : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {})
  };
}

/**
 * Resolution-time check: does the reveal match what was committed at lock? Guards
 * against a buyer swapping in different/unfair hidden checks after seeing the work
 * (any change to the checks OR the salt breaks the commitment hash).
 */
export async function verifyReveal(
  manifest: HeldoutManifest,
  reveal: HeldoutReveal
): Promise<boolean> {
  if (reveal.hiddenChecks.length !== manifest.hiddenCount) return false;
  const recomputed = await commitHiddenChecks(reveal.hiddenChecks, reveal.salt);
  return recomputed === manifest.hiddenChecksCommit;
}

/**
 * The full set of checks evaluated at resolution = public + revealed hidden. Only
 * call after `verifyReveal` returns true.
 */
export function assembleResolvedChecks(
  manifest: HeldoutManifest,
  reveal: HeldoutReveal
): CheckSpec[] {
  return [...manifest.publicChecks, ...reveal.hiddenChecks];
}

/** Generate a random salt (hex) for a new held-out commitment. */
export function randomSalt(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let hex = "";
  for (let i = 0; i < buf.length; i++) hex += buf[i].toString(16).padStart(2, "0");
  return hex;
}
