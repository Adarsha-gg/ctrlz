/**
 * Patch commit-reveal for pay-on-green code work (§ pay-on-green).
 *
 * The exact analog of `reconcile.ts` for the dataset niche, but the expensive
 * artifact is a code patch instead of a row set. The worker COMMITS to the patch
 * (`patchCommit = sha256({diff})`) at lock — before the buyer reveals the
 * held-out test suite — so the held-out tests are run against precisely the patch
 * that was frozen. It cannot see which hidden tests will run and then quietly
 * swap in a different diff afterward.
 *
 * Pairs with `heldout.ts` (the buyer's hidden-test commitment): together they
 * pin BOTH sides before either is revealed — worker can't hardcode unseen tests,
 * buyer can't move the goalposts after seeing the patch.
 *
 * Async side (uses `hashBlob`); the pure verdict lives in `testsPass.ts`.
 */

import type { PatchArtifact } from "./types.ts";
import { hashBlob } from "../walrus/store.ts";

/**
 * The worker's commitment: canonical-JSON sha256 over the diff. Stable across
 * machines (same canonicalization the evidence layer uses), so anyone can
 * re-derive it from the revealed diff at resolution.
 */
export async function commitPatch(diff: string): Promise<string> {
  return hashBlob({ diff });
}

/** Did the revealed diff actually produce the committed hash? (anti-swap) */
export async function verifyPatchReveal(artifact: PatchArtifact): Promise<boolean> {
  return (await commitPatch(artifact.diff)) === artifact.patchCommit;
}
