import { WORLD_HUMAN_AGENT_ID, type WorldAgentIdentity } from "./policy.ts";

const WORLD_CHAIN_ID_HEX = "0x1e0"; // World Chain mainnet, used only as a sanity check.

export const DEMO_WORLD_AGENTS: Record<string, WorldAgentIdentity> = {
  [WORLD_HUMAN_AGENT_ID]: {
    agentId: WORLD_HUMAN_AGENT_ID,
    humanBacked: true,
    source: "demo",
    ownerAddress: "0x1111111111111111111111111111111111111111",
    nullifierHash: "demo-nullifier-human-backed-agent"
  }
};

function demoLookup(agentId: string): WorldAgentIdentity {
  return DEMO_WORLD_AGENTS[agentId] ?? { agentId, humanBacked: false, source: "none" };
}

async function worldChainConfigured(): Promise<boolean> {
  const rpcUrl = process.env.WORLD_CHAIN_RPC_URL;
  const agentBook = process.env.WORLD_AGENTBOOK_ADDRESS;
  if (!rpcUrl || !agentBook) return false;

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] })
    });
    const data = (await res.json()) as { result?: string };
    return typeof data.result === "string" && data.result.toLowerCase() === WORLD_CHAIN_ID_HEX;
  } catch {
    return false;
  }
}

export async function lookupAgentBacking(agentId: string): Promise<WorldAgentIdentity> {
  const resolverUrl = process.env.WORLD_AGENTBOOK_LOOKUP_URL;
  if (resolverUrl) {
    try {
      const res = await fetch(resolverUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId })
      });
      if (res.ok) {
        const data = (await res.json()) as Partial<WorldAgentIdentity>;
        return {
          agentId,
          humanBacked: Boolean(data.humanBacked),
          source: "agentbook",
          ownerAddress: data.ownerAddress,
          nullifierHash: data.nullifierHash
        };
      }
    } catch {
      // Configured AgentBook lookup must fail closed, not fall back to demo.
    }
    return { agentId, humanBacked: false, source: "agentbook" };
  }

  if (await worldChainConfigured()) {
    // The deployed demo can provide WORLD_AGENTBOOK_LOOKUP_URL for the exact ABI.
    // Without it, keep policy deterministic instead of guessing call data.
    return { agentId, humanBacked: false, source: "agentbook" };
  }

  return demoLookup(agentId);
}
