import assert from "node:assert/strict";
import { scoreSplit, type ScoredCheck } from "../scoring/score.ts";
import {
  applyWorldTrustBoost,
  decideWorldGate,
  mergeWorldIdentities,
  WORLD_FREE_TRIAL_LIMIT,
  WORLD_TRUST_BOOST_CAP
} from "./policy.ts";
import { lookupAgentBacking } from "./agentbook.ts";
import { verifyIdKitProof } from "./idkit.ts";

const passHardChecks: ScoredCheck[] = [
  {
    check: { type: "schema", hardGate: true },
    report: { checker: "schema-checker", result: "pass", confidence: 1, detail: "ok" },
    metaWeight: 1
  },
  {
    check: { type: "wallet_risk", hardGate: true },
    report: { checker: "wallet-risk-checker", result: "pass", confidence: 1, detail: "ok" },
    metaWeight: 1
  }
];

const failHardChecks: ScoredCheck[] = [
  {
    check: { type: "price_max", hardGate: true, value: 700, currency: "USDC" },
    report: { checker: "price-checker", result: "fail", confidence: 1, detail: "too expensive" },
    metaWeight: 1
  },
  {
    check: { type: "wallet_risk", hardGate: true },
    report: { checker: "wallet-risk-checker", result: "pass", confidence: 1, detail: "ok" },
    metaWeight: 1
  }
];

function human(usedVerifications: number) {
  return decideWorldGate({
    agentId: "agent:human-backed",
    usedVerifications,
    identity: { agentId: "agent:human-backed", humanBacked: true, source: "demo" }
  });
}

const first = human(0);
const third = human(WORLD_FREE_TRIAL_LIMIT - 1);
const fourth = human(WORLD_FREE_TRIAL_LIMIT);
const unknown = decideWorldGate({ agentId: "agent:unknown", usedVerifications: 0 });

assert.equal(first.status, "free");
assert.equal(first.paymentRequired, false);
assert.equal(third.status, "free");
assert.equal(third.paymentRequired, false);
assert.equal(fourth.status, "requires_payment");
assert.equal(fourth.paymentRequired, true);
assert.equal(unknown.status, "requires_payment");
assert.equal(unknown.paymentRequired, true);
console.log("ok World gate: human-backed first 3 free, 4th and unknown require payment");

const weakSplit = scoreSplit({ checks: passHardChecks });
const { split: boosted, boost } = applyWorldTrustBoost(weakSplit, first);
assert.equal(boost.applied, true);
assert.equal(boosted.agentTrust.score <= WORLD_TRUST_BOOST_CAP, true);
assert.equal(boosted.outputValidity.status, "pass");
assert.equal(boosted.paymentRisk.status, "pass");
console.log("ok World trust: human backing adds a capped baseline boost only to agentTrust");

const rejected = scoreSplit({ checks: failHardChecks });
const { split: rejectedBoosted } = applyWorldTrustBoost(rejected, first);
assert.equal(rejected.recommendation, "reject");
assert.equal(rejectedBoosted.recommendation, "reject");
assert.equal(rejectedBoosted.outputValidity.status, "fail");
console.log("ok World trust: hard-gate reject remains reject after human backing");

process.env.WORLD_AGENTBOOK_LOOKUP_URL = "http://127.0.0.1:1/unavailable";
const failedLookup = await lookupAgentBacking("agent:world-human-backed-demo");
assert.equal(failedLookup.humanBacked, false);
assert.equal(failedLookup.source, "agentbook");
delete process.env.WORLD_AGENTBOOK_LOOKUP_URL;
console.log("ok World fail-closed: configured AgentBook outage does not use demo fallback");

process.env.WORLD_ID_VERIFY_ENDPOINT = "data:application/json,{}";
process.env.WORLD_ID_RP_ID = "rp_demo";
const malformedPortal = await verifyIdKitProof({
  proof: "real-looking-proof",
  nullifier_hash: "nullifier"
});
assert.equal(malformedPortal.ok, false);
delete process.env.WORLD_ID_VERIFY_ENDPOINT;
delete process.env.WORLD_ID_RP_ID;
console.log("ok World fail-closed: portal verification requires explicit success true");

const unknownPlusValidIdKit = mergeWorldIdentities(
  { agentId: "agent:unknown", humanBacked: false, source: "none" },
  { agentId: "agent:unknown", humanBacked: true, source: "idkit", nullifierHash: "valid" }
);
assert.equal(unknownPlusValidIdKit.humanBacked, false);
console.log("ok World fail-closed: IDKit proof cannot upgrade an unknown AgentBook agent");

console.log("all World gating checks passed");
