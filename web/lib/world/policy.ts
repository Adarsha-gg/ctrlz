import type { SplitScore, SubScore } from "../scoring/score.ts";

export const WORLD_FREE_TRIAL_LIMIT = 3;
export const WORLD_HUMAN_TRUST_BOOST_POINTS = 12;
export const WORLD_HUMAN_TRUST_BOOST_CAP = 60;
export const WORLD_ENTERPRISE_TRUST_BOOST_POINTS = 18;
export const WORLD_ENTERPRISE_TRUST_BOOST_CAP = 70;
export const WORLD_HUMAN_AGENT_ID = "agent:world-human-backed-demo";

export type WorldBackingKind = "human" | "enterprise" | "none";
export type WorldBackingSource = "agentbook" | "idkit" | "enterprise" | "demo" | "none";

export type WorldAgentIdentity = {
  agentId: string;
  humanBacked: boolean;
  backingKind?: WorldBackingKind;
  source: WorldBackingSource;
  ownerAddress?: string;
  nullifierHash?: string;
  clusterId?: string;
  enterpriseName?: string;
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
  backingKind: WorldBackingKind;
  reputationSubject: WorldReputationSubject;
};

export type WorldReputationSubject = {
  kind: WorldBackingKind;
  subjectId: string;
  label: string;
  sharedAcrossAgents: boolean;
};

export function mergeWorldIdentities(
  agentbook: WorldAgentIdentity,
  idkit?: WorldAgentIdentity
): WorldAgentIdentity {
  if (!agentbook.humanBacked || !idkit?.humanBacked) return agentbook;
  return {
    ...agentbook,
    humanBacked: true,
    backingKind: "human",
    source: idkit.source,
    nullifierHash: idkit.nullifierHash ?? agentbook.nullifierHash,
    clusterId: idkit.clusterId ?? idkit.nullifierHash ?? agentbook.clusterId ?? agentbook.nullifierHash
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

export function reputationSubjectFor(
  identity: WorldAgentIdentity | undefined,
  agentId: string
): WorldReputationSubject {
  const backingKind = identity?.backingKind ?? (identity?.humanBacked ? "human" : "none");

  if (backingKind === "human" && identity?.clusterId) {
    return {
      kind: "human",
      subjectId: `world-human:${identity.clusterId}`,
      label: "World human-backed cluster",
      sharedAcrossAgents: true
    };
  }

  if (backingKind === "human" && identity?.nullifierHash) {
    return {
      kind: "human",
      subjectId: `world-human:${identity.nullifierHash}`,
      label: "World human-backed cluster",
      sharedAcrossAgents: true
    };
  }

  if (backingKind === "enterprise" && identity?.clusterId) {
    return {
      kind: "enterprise",
      subjectId: `enterprise:${identity.clusterId}`,
      label: identity.enterpriseName ? `${identity.enterpriseName} enterprise cluster` : "Enterprise-backed cluster",
      sharedAcrossAgents: true
    };
  }

  if (backingKind === "enterprise" && identity?.ownerAddress) {
    return {
      kind: "enterprise",
      subjectId: `enterprise-wallet:${identity.ownerAddress.toLowerCase()}`,
      label: identity.enterpriseName ? `${identity.enterpriseName} enterprise wallet` : "Enterprise-backed wallet",
      sharedAcrossAgents: true
    };
  }

  return {
    kind: "none",
    subjectId: `agent:${agentId}`,
    label: "Unbacked agent",
    sharedAcrossAgents: false
  };
}

function trustBoostConfig(kind: WorldBackingKind) {
  if (kind === "enterprise") {
    return { points: WORLD_ENTERPRISE_TRUST_BOOST_POINTS, cap: WORLD_ENTERPRISE_TRUST_BOOST_CAP };
  }
  if (kind === "human") {
    return { points: WORLD_HUMAN_TRUST_BOOST_POINTS, cap: WORLD_HUMAN_TRUST_BOOST_CAP };
  }
  return { points: 0, cap: 0 };
}

function boostedTrust(before: SubScore, kind: WorldBackingKind): SubScore {
  if (before.status === "fail" || before.status === "strong") {
    return before;
  }
  const config = trustBoostConfig(kind);
  if (config.points === 0) return before;

  const boosted = Math.max(before.score, Math.min(before.score + config.points, config.cap));
  return { score: boosted, status: boosted >= 70 ? "strong" : "weak" };
}

export function applyWorldTrustBoost(
  split: SplitScore,
  gate: WorldGateDecision,
  identity?: WorldAgentIdentity
): { split: SplitScore; boost: WorldTrustBoost } {
  const before = split.agentTrust;
  const backingKind = identity?.backingKind ?? (gate.humanBacked ? "human" : "none");
  const subject = reputationSubjectFor(identity, gate.agentId);
  const config = trustBoostConfig(backingKind);
  const after = backingKind !== "none" ? boostedTrust(before, backingKind) : before;
  const boosted: SplitScore = { ...split, agentTrust: after };

  return {
    split: boosted,
    boost: {
      applied: backingKind !== "none" && after.score > before.score,
      before,
      after,
      points: config.points,
      cap: config.cap,
      backingKind,
      reputationSubject: subject
    }
  };
}
