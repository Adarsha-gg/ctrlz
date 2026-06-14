/**
 * Reputation math (REPUTATION.md §6) — pure + deterministic.
 *
 * `now` (epoch ms) is always passed in, never read from the clock, so a score is
 * replayable: same (cluster, now) → same result. That's the same determinism
 * guarantee the checkers give, which is what makes dispute-by-re-execution work.
 */

import { REPUTATION_CONFIG as C, type Tier } from "./config.ts";
import type { AgentTrust, FraudEvent, OperatorCluster, TrustBreakdown } from "./types.ts";

const MS_PER_DAY = 86_400_000;

function ageDays(at: string, now: number): number {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now - t) / MS_PER_DAY);
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Fresh fraud hits full, halving every HALF_LIFE_DAYS (§6c). */
export function decay(daysOld: number): number {
  return Math.pow(0.5, Math.max(0, daysOld) / C.HALF_LIFE_DAYS);
}

/** §6a — the discounted, capped lift a sibling gets from operator standing. */
export function floorLift(tier: Tier, operatorStanding: number): number {
  return Math.min(C.FLOOR_CAP[tier], C.DISCOUNT * Math.max(0, operatorStanding));
}

function severityOf(e: FraudEvent): number {
  if (typeof e.severity === "number") return e.severity;
  return C.FRAUD_SEVERITY[e.kind] ?? C.FRAUD_SEVERITY.default;
}

/** ≥ PATTERN_COUNT fraud events inside the window → the operator is the problem (§6c). */
export function hasFraudPattern(fraudEvents: FraudEvent[], now: number): boolean {
  const recent = fraudEvents.filter((e) => ageDays(e.at, now) <= C.PATTERN_WINDOW_DAYS);
  return recent.length >= C.PATTERN_COUNT;
}

/**
 * §6c — sibling drag from fraud-class events: severity × decay, summed. Capped at
 * MAX_SIBLING_DRAG for an isolated incident (hard but not auto-0); a *pattern*
 * escalates past the cap and can zero the whole operator.
 */
export function contamination(
  fraudEvents: FraudEvent[],
  now: number
): { value: number; patternEscalated: boolean } {
  const raw = fraudEvents.reduce((sum, e) => sum + severityOf(e) * decay(ageDays(e.at, now)), 0);
  const patternEscalated = hasFraudPattern(fraudEvents, now);
  const value = patternEscalated ? raw * C.PATTERN_MULTIPLIER : Math.min(C.MAX_SIBLING_DRAG, raw);
  return { value, patternEscalated };
}

/**
 * Trust for one agent within its cluster. The offending agent forgoes the cluster
 * lift and keeps only a residual `earned`, so it is driven to ~0 while clean
 * siblings are only dragged (not zeroed) by an isolated fraud.
 */
export function trustForAgent(cluster: OperatorCluster, agentId: string, now: number): AgentTrust {
  const tier = cluster.tier;
  const cap = C.TRUST_CAP[tier];
  const earned = cluster.agents.find((a) => a.agentId === agentId)?.earned ?? 0;

  const isOffender = cluster.fraudEvents.some((e) => e.agentId === agentId);
  const floor = isOffender ? 0 : floorLift(tier, cluster.standing);
  const ownEarned = isOffender ? Math.min(earned, C.OFFENDER_RESIDUAL) : earned;
  const { value: contam, patternEscalated } = contamination(cluster.fraudEvents, now);

  const trust = clamp(floor + ownEarned - contam, 0, cap);

  const breakdown: TrustBreakdown = {
    floor: round(floor),
    earned: round(ownEarned),
    contamination: round(contam),
    cap,
    offender: isOffender,
    patternEscalated
  };

  return {
    agentId,
    operatorRoot: cluster.operatorRoot,
    tier,
    trust: round(trust),
    breakdown,
    siblingCount: cluster.agents.length
  };
}

/** Trust for every agent in the cluster (same `now` → fully replayable). */
export function scoreCluster(cluster: OperatorCluster, now: number): AgentTrust[] {
  return cluster.agents.map((a) => trustForAgent(cluster, a.agentId, now));
}
