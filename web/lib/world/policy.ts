import type { SplitScore, SubScore } from "../scoring/score.ts";

export const WORLD_FREE_TRIAL_LIMIT = 3;
export const WORLD_TRUST_BOOST_POINTS = 12;
export const WORLD_TRUST_BOOST_CAP = 60;
export const WORLD_HUMAN_AGENT_ID = "agent:world-human-backed-demo";

export type WorldBackingSource = "agentbook" | "idkit" | "demo" | "none";

export type WorldAgentIdentity = {
  agentId: string;
  humanBacked: boolean;
  source: WorldBackingSource;
  ownerAddress?: string;
  nullifierHash?: string;
};

export type WorldGateStatus = "free" | "requires_payment";

export type WorldGateDecision = {
  agentId: string;
  humanBacked: boolean;
  source: WorldBackingSource;
  status: WorldGateStatus;
  paymentRequired: boolean;
  freeUsesRemaining: number;
  trialLimit: number;
  usedVerifications: number;
  reason: string;
};

export type WorldTrustBoost = {
  applied: boolean;
  before: SubScore;
  after: SubScore;
  points: number;
  cap: number;
};

export function mergeWorldIdentities(
  agentbook: WorldAgentIdentity,
  idkit?: WorldAgentIdentity
): WorldAgentIdentity {
  if (!agentbook.humanBacked || !idkit?.humanBacked) return agentbook;
  return {
    ...agentbook,
    humanBacked: true,
    source: idkit.source,
    nullifierHash: idkit.nullifierHash ?? agentbook.nullifierHash
  };
}

export function decideWorldGate(input: {
  agentId: string;
  usedVerifications: number;
  identity?: WorldAgentIdentity;
}): WorldGateDecision {
  const usedVerifications = Math.max(0, Math.floor(input.usedVerifications));
  const identity = input.identity;
  const humanBacked = Boolean(identity?.humanBacked);
  const freeUsesRemaining = humanBacked
    ? Math.max(WORLD_FREE_TRIAL_LIMIT - usedVerifications, 0)
    : 0;

  if (!humanBacked) {
    return {
      agentId: input.agentId,
      humanBacked: false,
      source: identity?.source ?? "none",
      status: "requires_payment",
      paymentRequired: true,
      freeUsesRemaining: 0,
      trialLimit: WORLD_FREE_TRIAL_LIMIT,
      usedVerifications,
      reason: "agent is not World human-backed"
    };
  }

  if (usedVerifications < WORLD_FREE_TRIAL_LIMIT) {
    return {
      agentId: input.agentId,
      humanBacked: true,
      source: identity?.source ?? "none",
      status: "free",
      paymentRequired: false,
      freeUsesRemaining,
      trialLimit: WORLD_FREE_TRIAL_LIMIT,
      usedVerifications,
      reason: "World human-backed agent is within the 3-use free trial"
    };
  }

  return {
    agentId: input.agentId,
    humanBacked: true,
    source: identity?.source ?? "none",
    status: "requires_payment",
    paymentRequired: true,
    freeUsesRemaining: 0,
    trialLimit: WORLD_FREE_TRIAL_LIMIT,
    usedVerifications,
    reason: "World human-backed free trial is exhausted"
  };
}

function boostedTrust(before: SubScore): SubScore {
  if (before.status === "fail" || before.status === "strong") {
    return before;
  }

  const boosted = Math.max(
    before.score,
    Math.min(before.score + WORLD_TRUST_BOOST_POINTS, WORLD_TRUST_BOOST_CAP)
  );
  return { score: boosted, status: boosted >= 70 ? "strong" : "weak" };
}

export function applyWorldTrustBoost(
  split: SplitScore,
  gate: WorldGateDecision
): { split: SplitScore; boost: WorldTrustBoost } {
  const before = split.agentTrust;
  const after = gate.humanBacked ? boostedTrust(before) : before;
  const boosted: SplitScore = { ...split, agentTrust: after };

  return {
    split: boosted,
    boost: {
      applied: gate.humanBacked && after.score > before.score,
      before,
      after,
      points: WORLD_TRUST_BOOST_POINTS,
      cap: WORLD_TRUST_BOOST_CAP
    }
  };
}
