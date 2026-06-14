/**
 * Live operator clusters from real marketplace data (REPUTATION.md §3/§5).
 *
 * Feeds the reputation engine with REAL agents instead of seeded ones: group the
 * BigQuery/Hedera ERC-8004 rows by operator root (owner), derive each agent's
 * `earned` from its on-chain trust score, and run the same `trustForAgent` math.
 * This is the "1 of N under <operator>" sibling linkage on live data.
 *
 * Honest boundary: mainnet ERC-8004 rows carry no fraud signal, so
 * `fraudEvents` is empty here — contamination would come from CTRL+Z's own
 * settlement/fraud history (the v2 data source). So on live data this shows the
 * cluster LIFT + each agent's earned record; the fraud-propagation behavior is
 * exercised by the seeded `/reputation` demo.
 */

import type { AgentMarketplaceRow } from "../marketplace/types.ts";
import { trustForAgent } from "./score.ts";
import type { AgentTrust, OperatorCluster, Tier } from "./types.ts";

function inferTier(rows: AgentMarketplaceRow[]): Tier {
  // enterprise if the operator presents a real domain; human if the cluster has
  // earned on-chain feedback/validation; otherwise unattached.
  if (rows.some((r) => r.domain && r.domain.includes("."))) return "enterprise";
  if (rows.some((r) => r.feedbackCount > 0 || r.validationCount > 0)) return "human";
  return "none";
}

function clampScore(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}

/** Build a real operator cluster from the rows sharing an owner. */
export function marketplaceCluster(allAgents: AgentMarketplaceRow[], ownerAddress: string): OperatorCluster {
  const owner = ownerAddress.toLowerCase();
  const siblings = allAgents.filter((a) => a.ownerAddress.toLowerCase() === owner);
  const agents = siblings.map((a) => ({ agentId: a.agentKey, earned: clampScore(a.trustScore) }));
  const standing = agents.length
    ? Math.round(agents.reduce((sum, a) => sum + a.earned, 0) / agents.length)
    : 0;
  return {
    operatorRoot: ownerAddress,
    tier: inferTier(siblings),
    standing,
    agents,
    fraudEvents: []
  };
}

/** Run the reputation engine for one agent against its live cluster. */
export function marketplaceTrust(
  allAgents: AgentMarketplaceRow[],
  agentKey: string,
  ownerAddress: string,
  now: number
): AgentTrust {
  return trustForAgent(marketplaceCluster(allAgents, ownerAddress), agentKey, now);
}
