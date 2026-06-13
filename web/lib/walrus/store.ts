/**
 * Walrus client + hash anchor (E1 / BUILD_PLAN §9).
 *
 * The load-bearing primitive is `hashBlob` — canonical-JSON → sha256 hex. That
 * hash is ALWAYS computed and is what every on-chain record points at. Walrus is
 * the swappable storage backend behind the hash.
 *
 * Ethos guards:
 *  1. Content-addressed; the sha256 anchor is load-bearing and always available.
 *  2. NEVER throw into the UI — any Walrus failure (unreachable, non-2xx, parse
 *     error) degrades to `{ store: "local", hash }`. The page still renders the hash.
 *  3. Endpoints + store/read paths are env-configurable (Walrus testnet HTTP
 *     paths have shifted across versions) with sensible testnet defaults; a
 *     differing response shape degrades gracefully rather than hard-failing.
 *
 * Runs in the browser, Node, and `--experimental-strip-types`: uses the Web
 * Crypto `crypto.subtle` digest (no Node-only imports) and global `fetch`.
 */

export type StoreResult = {
  /** which backend actually held the blob */
  store: "walrus" | "local";
  /** Walrus blob id, when store === "walrus" */
  blobId?: string;
  /** aggregator read URI, when store === "walrus" */
  uri?: string;
  /** the sha256 hex anchor — ALWAYS present */
  hash: string;
};

// ---------------------------------------------------------------------------
// Config — env-overridable, sensible testnet defaults. Walrus testnet HTTP
// paths have moved between releases, so the store/read path templates are env
// vars too. `{blobId}` in the read path is substituted at read time.
// ---------------------------------------------------------------------------

function env(key: string): string | undefined {
  // Guard for environments without `process` (some bundlers). NEXT_PUBLIC_* are
  // inlined at build for the browser; this also works under plain Node.
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[key];
}

/** Default public Walrus testnet endpoints (overridable via env). */
const DEFAULT_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
/** Default v1 HTTP paths; `{blobId}` is substituted on read. */
const DEFAULT_STORE_PATH = "/v1/blobs";
const DEFAULT_READ_PATH = "/v1/blobs/{blobId}";

export const WALRUS_CONFIG = {
  publisher: () => trimSlash(env("NEXT_PUBLIC_WALRUS_PUBLISHER") ?? DEFAULT_PUBLISHER),
  aggregator: () => trimSlash(env("NEXT_PUBLIC_WALRUS_AGGREGATOR") ?? DEFAULT_AGGREGATOR),
  storePath: () => env("NEXT_PUBLIC_WALRUS_STORE_PATH") ?? DEFAULT_STORE_PATH,
  readPath: () => env("NEXT_PUBLIC_WALRUS_READ_PATH") ?? DEFAULT_READ_PATH,
  /** store request timeout (ms) — best-effort; we fall back on timeout */
  timeoutMs: () => Number(env("NEXT_PUBLIC_WALRUS_TIMEOUT_MS") ?? "8000")
};

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Canonical JSON + sha256 anchor
// ---------------------------------------------------------------------------

/**
 * Canonical JSON: stable key ordering (recursively), so semantically-equal
 * objects serialize identically regardless of insertion order → a stable hash.
 * `undefined` values are dropped (same as JSON.stringify on objects).
 */
export function canonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] === undefined) continue;
    out[key] = canonicalize(obj[key]);
  }
  return out;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * The load-bearing anchor: canonical-JSON → sha256 hex. Deterministic — the same
 * blob (any key order) always yields the same hash; a different blob differs.
 */
export async function hashBlob(obj: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonicalJSON(obj));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

// ---------------------------------------------------------------------------
// Walrus store / read (best-effort; never throws into the UI)
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ms = WALRUS_CONFIG.timeoutMs();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the publisher response for a blob id. The testnet publisher returns one
 * of two shapes depending on whether the blob is newly created or already
 * certified:
 *   { newlyCreated: { blobObject: { blobId } } }
 *   { alreadyCertified: { blobId } }
 * We probe a few known locations and fall back to any `blobId`-ish field; if
 * none is found we return undefined (→ local fallback, no throw).
 */
export function parseBlobId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, any>;
  const candidates: unknown[] = [
    b.newlyCreated?.blobObject?.blobId,
    b.newlyCreated?.blobId,
    b.alreadyCertified?.blobId,
    b.blobId,
    b.blob_id,
    b.id
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

/** Build the aggregator read URI for a blob id, honoring the env read path. */
export function readUri(blobId: string): string {
  const base = WALRUS_CONFIG.aggregator();
  const path = WALRUS_CONFIG.readPath().replace("{blobId}", encodeURIComponent(blobId));
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Store the evidence/manifest blob. PUTs the canonical JSON to the Walrus
 * publisher, parses the returned blob id, and builds the aggregator URI.
 *
 * On ANY failure — unreachable, non-2xx, missing/unknown blob id, parse error,
 * timeout — degrades to `{ store: "local", hash }`. NEVER throws.
 * The sha256 hash anchor is always computed first and always returned.
 */
export async function storeEvidence(obj: unknown): Promise<StoreResult> {
  // 1. The anchor — computed ALWAYS, before any network I/O.
  const hash = await hashBlob(obj);
  const local: StoreResult = { store: "local", hash };

  try {
    const body = canonicalJSON(obj);
    const url = `${WALRUS_CONFIG.publisher()}${WALRUS_CONFIG.storePath()}`;
    const res = await fetchWithTimeout(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body
    });
    if (!res.ok) return local;

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return local;
    }

    const blobId = parseBlobId(parsed);
    if (!blobId) return local;

    return { store: "walrus", blobId, uri: readUri(blobId), hash };
  } catch {
    // Network down, abort/timeout, anything → degrade to the local hash anchor.
    return local;
  }
}

/**
 * Read a blob back from the aggregator (best-effort). Returns the parsed JSON,
 * or `undefined` on any failure (unreachable, non-2xx, parse error). Never throws.
 */
export async function readEvidence(blobId: string): Promise<unknown | undefined> {
  try {
    const res = await fetchWithTimeout(readUri(blobId), { method: "GET" });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}
