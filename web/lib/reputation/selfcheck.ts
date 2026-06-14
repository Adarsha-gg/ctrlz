/**
 * Reputation selfcheck (REPUTATION.md §6/§7) — deterministic invariant tests.
 *
 * Proves the locked decisions hold against the config:
 *   #2 good rep is hard to share — a fresh sibling gets a partial (discounted,
 *      capped) lift, never the operator's full standing.
 *   #3 fraud propagates hard but not to 0 — one fraud drags a clean sibling
 *      heavily yet leaves it > 0; the offender itself goes to ~0; fraud decays;
 *      a pattern escalates and zeros the operator.
 *
 * Uses fixed timestamps + a fixed `now` so results are reproducible.
 */

import { REPUTATION_CONFIG as C } from "./config.ts";
import { contamination, floorLift, scoreCluster, trustForAgent } from "./score.ts";
import type { OperatorCluster } from "./types.ts";

const NOW = Date.parse("2026-06-14T00:00:00Z");
const TODAY = "2026-06-14T00:00:00Z";
const ONE_HALFLIFE_AGO = "2026-03-16T00:00:00Z"; // ~90 days before NOW

export type SelfcheckResult = { name: string; ok: boolean; detail: string };

function check(name: string, ok: boolean, detail: string): SelfcheckResult {
  return { name, ok, detail };
}

export function runReputationSelfcheck(): { ok: boolean; results: SelfcheckResult[] } {
  const results: SelfcheckResult[] = [];

  // 1. Fresh sibling of a strong enterprise operator: partial lift, not full.
  const strong: OperatorCluster = {
    operatorRoot: "enterprise:acme.com",
    tier: "enterprise",
    standing: 80,
    agents: [{ agentId: "0xA", earned: 0 }],
    fraudEvents: []
  };
  const fresh = trustForAgent(strong, "0xA", NOW);
  const expectedFloor = floorLift("enterprise", 80); // min(45, 0.5*80=40) = 40
  results.push(
    check(
      "fresh sibling gets discounted+capped lift, < operator standing",
      fresh.trust === expectedFloor && fresh.trust < strong.standing && fresh.trust > 0,
      `trust=${fresh.trust} floor=${expectedFloor} standing=${strong.standing}`
    )
  );

  // 2. Unattached (none) tier: no free lift.
  const none: OperatorCluster = { ...strong, tier: "none", operatorRoot: "key:0x1" };
  const noneTrust = trustForAgent(none, "0xA", NOW);
  results.push(
    check("unattached tier gets ~0 lift with no earned record", noneTrust.trust === 0, `trust=${noneTrust.trust}`)
  );

  // 3. One fresh fraud by a SIBLING drags a clean sibling heavily but not to 0.
  const oneFraud: OperatorCluster = {
    operatorRoot: "enterprise:acme.com",
    tier: "enterprise",
    standing: 80,
    agents: [
      { agentId: "0xCLEAN", earned: 60 },
      { agentId: "0xBAD", earned: 50 }
    ],
    fraudEvents: [{ agentId: "0xBAD", kind: "poisoning", at: TODAY }]
  };
  const clean = trustForAgent(oneFraud, "0xCLEAN", NOW);
  const cleanNoFraud = trustForAgent({ ...oneFraud, fraudEvents: [] }, "0xCLEAN", NOW);
  const drag = cleanNoFraud.trust - clean.trust;
  results.push(
    check(
      "isolated fraud drags clean sibling hard but leaves it > 0",
      clean.trust > 0 && drag >= 30,
      `clean=${clean.trust} (was ${cleanNoFraud.trust}, drag=${round(drag)})`
    )
  );

  // 4. The offending agent itself goes to ~0.
  const offender = trustForAgent(oneFraud, "0xBAD", NOW);
  results.push(
    check("offending agent driven to ~0", offender.trust <= 5 && offender.breakdown.offender, `trust=${offender.trust}`)
  );

  // 5. Fraud decays: same event one half-life old drags ~half as much.
  const aged = contamination([{ agentId: "0xBAD", kind: "poisoning", at: ONE_HALFLIFE_AGO }], NOW).value;
  const freshC = contamination([{ agentId: "0xBAD", kind: "poisoning", at: TODAY }], NOW).value;
  results.push(
    check(
      "fraud contamination halves after one half-life",
      Math.abs(aged - freshC / 2) < 1,
      `fresh=${round(freshC)} aged=${round(aged)}`
    )
  );

  // 6. Pattern (≥ PATTERN_COUNT recent fraud) escalates and zeros the operator.
  const pattern: OperatorCluster = {
    operatorRoot: "enterprise:acme.com",
    tier: "enterprise",
    standing: 90,
    agents: [{ agentId: "0xCLEAN", earned: 70 }],
    fraudEvents: Array.from({ length: C.PATTERN_COUNT }, (_, i) => ({
      agentId: `0xBAD${i}`,
      kind: "tampered_evidence" as const,
      at: TODAY
    }))
  };
  const underPattern = trustForAgent(pattern, "0xCLEAN", NOW);
  results.push(
    check(
      "cluster fraud pattern escalates → operator zeroed",
      underPattern.trust === 0 && underPattern.breakdown.patternEscalated,
      `trust=${underPattern.trust} escalated=${underPattern.breakdown.patternEscalated}`
    )
  );

  // 7. scoreCluster is consistent with per-agent scoring.
  const all = scoreCluster(oneFraud, NOW);
  const consistent = all.find((a) => a.agentId === "0xCLEAN")?.trust === clean.trust;
  results.push(check("scoreCluster matches trustForAgent", Boolean(consistent), `cluster size=${all.length}`));

  return { ok: results.every((r) => r.ok), results };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
