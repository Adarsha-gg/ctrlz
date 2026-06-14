/**
 * Reputation constants (REPUTATION.md §6/§7) — one tunable block.
 *
 * The model: trust(agent) = clamp(floor + earned − contamination, 0, cap).
 * `floor` is the (discounted, capped) lift a fresh sibling gets from a strong
 * operator; `earned` is the agent's own settled record; `contamination` is the
 * fraud drag shared across the cluster. Locked decisions this encodes:
 *   #2 good rep is hard to share — `DISCOUNT`<1 + `FLOOR_CAP` keep the lift partial.
 *   #3 fraud propagates hard but not to 0 — `MAX_SIBLING_DRAG` caps a clean
 *      sibling's drag; only a PATTERN (≥`PATTERN_COUNT` in the window) escalates
 *      past it and can zero the whole operator.
 */

export type Tier = "human" | "enterprise" | "none";

export const REPUTATION_CONFIG = {
  /** max lift a fresh sibling gets from operator standing, by tier (§6a) */
  FLOOR_CAP: { enterprise: 45, human: 25, none: 0 } as Record<Tier, number>,
  /** a star cluster can't hand a fresh sibling full trust (§6a) */
  DISCOUNT: 0.5,
  /** max a single/total fraud set drags an otherwise-clean sibling (§6c) */
  MAX_SIBLING_DRAG: 40,
  /** fraud severity halves every HALF_LIFE_DAYS (§6c) */
  HALF_LIFE_DAYS: 90,
  /** trust ceiling by tier (§6 cap) */
  TRUST_CAP: { enterprise: 100, human: 95, none: 70 } as Record<Tier, number>,
  /** the offending agent's own residual after a fraud event — near-total hit (§6c) */
  OFFENDER_RESIDUAL: 2,
  /** pattern escalation: ≥ PATTERN_COUNT fraud events within PATTERN_WINDOW_DAYS (§6c) */
  PATTERN_COUNT: 3,
  PATTERN_WINDOW_DAYS: 30,
  /** contamination multiplier once a cluster fraud pattern is detected (can zero the operator) */
  PATTERN_MULTIPLIER: 5,
  /** default fraud severities (drag units), by kind (§7) */
  FRAUD_SEVERITY: {
    poisoning: 40,
    impersonation: 40,
    undelivered: 30,
    tampered_evidence: 40,
    default: 30
  } as Record<string, number>
} as const;
