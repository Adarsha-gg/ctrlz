import type { WorldAgentIdentity } from "./policy.ts";

export type IdKitProofPayload = {
  merkle_root?: string;
  nullifier_hash?: string;
  proof?: string;
  verification_level?: string;
  action?: string;
  signal?: string;
};

export type IdKitVerifyResult = {
  ok: boolean;
  mode: "portal" | "demo";
  nullifierHash?: string;
  error?: string;
};

function verifyEndpoint(): string | null {
  if (process.env.WORLD_ID_VERIFY_ENDPOINT) return process.env.WORLD_ID_VERIFY_ENDPOINT;
  if (process.env.WORLD_ID_APP_ID) {
    return `https://developer.worldcoin.org/api/v2/verify/${process.env.WORLD_ID_APP_ID}`;
  }
  return null;
}

export async function verifyIdKitProof(payload?: IdKitProofPayload): Promise<IdKitVerifyResult> {
  if (!payload?.proof) {
    return { ok: false, mode: "demo", error: "missing IDKit proof" };
  }

  const endpoint = verifyEndpoint();
  const rpId = process.env.WORLD_ID_RP_ID;
  const appId = process.env.WORLD_ID_APP_ID;

  if (!endpoint || (!rpId && !appId)) {
    const ok = payload.proof === "demo-valid-proof";
    return {
      ok,
      mode: "demo",
      nullifierHash: ok ? payload.nullifier_hash ?? "demo-nullifier" : undefined,
      error: ok ? undefined : "real World credentials missing and proof is not demo-valid-proof"
    };
  }

  try {
    const body = {
      ...payload,
      ...(rpId ? { rp_id: rpId } : { app_id: appId })
    };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; code?: string; detail?: string };
    return {
      ok: res.ok && data.success === true,
      mode: "portal",
      nullifierHash: payload.nullifier_hash,
      error:
        res.ok && data.success === true
          ? undefined
          : data.detail ?? data.code ?? "World developer portal verification failed"
    };
  } catch (error) {
    return {
      ok: false,
      mode: "portal",
      nullifierHash: payload.nullifier_hash,
      error: error instanceof Error ? error.message : "World developer portal verification failed"
    };
  }
}

export function identityFromIdKit(agentId: string, result: IdKitVerifyResult): WorldAgentIdentity {
  return {
    agentId,
    humanBacked: result.ok,
    source: result.mode === "portal" ? "idkit" : "demo",
    nullifierHash: result.nullifierHash
  };
}
