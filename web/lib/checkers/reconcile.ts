/**
 * Sampled-recompute commit-reveal for data-aggregation work (§ deterministic
 * niche).
 *
 * The market we serve: work that is EXPENSIVE TO PRODUCE but CHEAP TO VERIFY
 * (cross-chain transfer reconciliation, multi-source aggregation, full-history
 * scans). If verifying cost ≈ producing cost, nobody would hire an agent —
 * they'd DIY. So we never re-run the whole job. The worker does N rows; the
 * verifier independently re-fetches ground truth for k randomly-chosen rows; a
 * deterministic checker compares only those k. Cheap probabilistic proof of
 * expensive work.
 *
 * Anti-gaming (mirrors held-out tests in `heldout.ts`): the worker COMMITS to
 * the full dataset (`rowsCommit = sha256({rows})`) at lock, before knowing which
 * rows get sampled — because the sample keys are DERIVED FROM the commit hash,
 * which is unpredictable until every row is frozen. It cannot pad the rows it
 * expects to be checked and fake the rest.
 *
 * This module is the async/seed side (uses `hashBlob`); the pure, sync verdict
 * lives in `dataReconcile.ts` (the registered checker), which only compares.
 */

import type { DataRecord, DatasetArtifact } from "./types.ts";
import { hashBlob } from "../walrus/store.ts";

/** Default number of rows spot-checked when a spec doesn't say. */
export const DEFAULT_SAMPLE_SIZE = 8;

/**
 * The worker's commitment: canonical-JSON sha256 over the rows. Stable across
 * machines (same canonicalization the evidence layer uses), so the buyer can
 * re-derive the same sample keys the checker will.
 */
export async function commitDataset(rows: DataRecord[]): Promise<string> {
  return hashBlob({ rows });
}

/** Did the revealed rows actually produce the committed hash? (anti-swap) */
export async function verifyDatasetReveal(artifact: DatasetArtifact): Promise<boolean> {
  return (await commitDataset(artifact.rows)) === artifact.rowsCommit;
}

/** mulberry32 — tiny deterministic PRNG, seeded from 32 bits of the commit. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromCommit(commit: string): number {
  return parseInt(commit.slice(0, 8) || "0", 16) >>> 0;
}

/**
 * Deterministically choose which row-keys to spot-check, seeded by the dataset
 * commit. Same commit → same keys (replayable: a disputing verifier re-derives
 * the identical set), but unpredictable before the worker has committed every
 * row. Returns a sorted, de-duplicated subset of `keys`.
 */
export function deriveSampleKeys(
  commit: string,
  keys: string[],
  sampleSize: number = DEFAULT_SAMPLE_SIZE
): string[] {
  const n = keys.length;
  if (n === 0) return [];
  const count = Math.max(1, Math.min(Math.floor(sampleSize), n));
  const rng = mulberry32(seedFromCommit(commit));
  const idx = keys.map((_, i) => i);
  // partial Fisher–Yates: only the first `count` positions need to be settled.
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx
    .slice(0, count)
    .map((i) => keys[i])
    .sort();
}
