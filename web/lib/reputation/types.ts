/**
 * Reputation data model (REPUTATION.md §3/§7).
 *
 * An operator root owns a cluster of ERC-8004 agents. Each agent's trust is
 * derived only from settled, evidenced outcomes: its own `earned` record, the
 * shared operator lift, and the shared fraud drag. Pure data — the math in
 * `score.ts` is a deterministic function of these + a caller-supplied clock.
 */

import type { Tier } from "./config.ts";

export type { Tier } from "./config.ts";

/** Only `fraud` propagates to siblings; `quality` stays local; `success` lifts (§7). */
export type EventClass = "fraud" | "quality" | "success";

export type FraudKind = "poisoning" | "impersonation" | "undelivered" | "tampered_evidence" | "default";

/** A typed, timestamped fraud event bound to the offending agent (drives contamination). */
export type FraudEvent = {
  /** the offending agent's ERC-8004 id/key */
  agentId: string;
  kind: FraudKind;
  /** ISO timestamp of the event (decay is computed against the caller's `now`) */
  at: string;
  /** optional explicit severity override (0..100); defaults to FRAUD_SEVERITY[kind] */
  severity?: number;
};

export type AgentRecord = {
  agentId: string;
  /** the agent's own settlement-derived score, 0..100 (§6b — today's agentTrust) */
  earned: number;
};

export type OperatorCluster = {
  /** operator root identity (enterprise domain, human keypair, or unattached key) */
  operatorRoot: string;
  tier: Tier;
  /** aggregate settlement-derived standing of the cluster, 0..100 (§6) */
  standing: number;
  agents: AgentRecord[];
  /** fraud-class events across the cluster (any agent) */
  fraudEvents: FraudEvent[];
};

export type TrustBreakdown = {
  floor: number;
  earned: number;
  contamination: number;
  cap: number;
  /** this agent itself committed a fraud event → its own near-total hit applied */
  offender: boolean;
  /** a cluster-wide fraud pattern escalated the contamination */
  patternEscalated: boolean;
};

export type AgentTrust = {
  agentId: string;
  operatorRoot: string;
  tier: Tier;
  /** final trust, 0..cap */
  trust: number;
  breakdown: TrustBreakdown;
  /** for the "1 of N under <operator>" UI linkage (§5) */
  siblingCount: number;
};
