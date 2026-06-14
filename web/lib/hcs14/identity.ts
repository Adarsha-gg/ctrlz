import "server-only";

import { erc8004HederaTestnet, hederaTestnet } from "@/lib/contract";

/**
 * HCS-14 Universal Agent IDs (UAID).
 *
 * Instead of reinventing agent identity, we stand on Hedera's stack: each CTRL+Z
 * agent already has an ERC-8004 identity (an integer agentId in the Hedera
 * IdentityRegistry). HCS-14 wraps that into a portable, deterministic
 * `uaid:aid:...` that resolves across web2 (A2A/REST) and web3 (EVM) without a
 * central authority. Generation is a pure deterministic hash of the canonical
 * agent data — no credentials, no network — so the UAIDs are stable and
 * re-derivable by anyone from the public on-chain identity.
 *
 * Tooling: `@hashgraphonline/standards-sdk` (`HCS14Client.createUaid`).
 */

export type CtrlzAgentRole = "worker" | "checker";

export type CtrlzAgentUaid = {
  role: CtrlzAgentRole;
  agentId: number;
  /** CAIP-10 nativeId: eip155:<chainId>:<identityRegistry>/<agentId> */
  caip10: string;
  /** Deterministic HCS-14 Universal Agent ID. */
  uaid: string;
};

export const CTRLZ_AGENTS: ReadonlyArray<{
  role: CtrlzAgentRole;
  agentId: number;
  name: string;
}> = [
  { role: "worker", agentId: 101, name: "CTRL+Z Worker Agent" },
  { role: "checker", agentId: 102, name: "CTRL+Z Checker Agent" }
];

/** ERC-8004 identity expressed as a CAIP-10 account on Hedera EVM. */
export function ctrlzAgentNativeId(agentId: number): string {
  return `eip155:${hederaTestnet.id}:${erc8004HederaTestnet.identityRegistry}/${agentId}`;
}

let cached: Promise<CtrlzAgentUaid[]> | null = null;

/**
 * Deterministic HCS-14 UAIDs for the CTRL+Z worker and checker agents.
 * Cached per server process — the inputs never change, so neither do the IDs.
 */
export function ctrlzAgentUaids(): Promise<CtrlzAgentUaid[]> {
  if (!cached) {
    cached = generate().catch((error) => {
      // Never let identity minting break a read path; clear cache so a later
      // call can retry, and surface empty UAIDs to the caller.
      cached = null;
      throw error;
    });
  }
  return cached;
}

/** Convenience: `{ worker, checker }` UAID strings, empty on failure. */
export async function ctrlzAgentUaidMap(): Promise<{ worker: string; checker: string }> {
  try {
    const uaids = await ctrlzAgentUaids();
    return {
      worker: uaids.find((u) => u.role === "worker")?.uaid ?? "",
      checker: uaids.find((u) => u.role === "checker")?.uaid ?? ""
    };
  } catch {
    return { worker: "", checker: "" };
  }
}

async function generate(): Promise<CtrlzAgentUaid[]> {
  const { createUaid } = await import("@hashgraphonline/standards-sdk");
  const out: CtrlzAgentUaid[] = [];
  for (const agent of CTRLZ_AGENTS) {
    const caip10 = ctrlzAgentNativeId(agent.agentId);
    const uaid = await createUaid({
      registry: "ctrlz",
      name: agent.name,
      version: "1.0.0",
      protocol: "a2a",
      nativeId: caip10,
      skills: []
    });
    out.push({ role: agent.role, agentId: agent.agentId, caip10, uaid });
  }
  return out;
}
