import assert from "node:assert/strict";
import {
  BASE_CAIP2,
  resetAgentKitDemoState,
  verifyAgentKitAccess,
  WORLD_CHAIN_CAIP2
} from "./agentkit.ts";
import {
  WORLD_FREE_TRIAL_LIMIT
} from "./policy.ts";

const headerName = "agentkit";
const signer = "0x1111111111111111111111111111111111111111";
let nonce = 0;

const sdk = {
  AGENTKIT: headerName,
  agentkitResourceServerExtension: {
    async enrichPaymentRequiredResponse() {
      return {};
    }
  },
  createAgentBookVerifier() {
    return {
      async lookupHuman() {
        return "human:demo";
      }
    };
  },
  declareAgentkitExtension() {
    return { [headerName]: {} };
  },
  parseAgentkitHeader(header: string) {
    return JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  },
  async validateAgentkitMessage(payload: unknown, resourceUri: string) {
    const parsed = payload as { nonce?: string; uri?: string; chainId?: string };
    return {
      valid:
        Boolean(parsed.nonce) &&
        parsed.uri === resourceUri &&
        [WORLD_CHAIN_CAIP2, BASE_CAIP2].includes(parsed.chainId ?? "")
    };
  },
  async verifyAgentkitSignature() {
    return { valid: true, address: signer };
  }
};

function request(header?: string) {
  return new Request("https://ctrlz.local/api/world/agentkit", {
    headers: header ? { [headerName]: header } : undefined
  });
}

function signedHeader(chainId = WORLD_CHAIN_CAIP2) {
  const payload = {
    nonce: `nonce-${++nonce}`,
    uri: "https://ctrlz.local/api/world/agentkit",
    chainId
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

resetAgentKitDemoState();

const missing = await verifyAgentKitAccess(request(), { sdk });
assert.equal(missing.ok, false);
assert.equal(missing.paymentRequired, true);
console.log("ok AgentKit: missing header requires payment");

for (let i = 1; i <= WORLD_FREE_TRIAL_LIMIT; i++) {
  const access = await verifyAgentKitAccess(request(signedHeader()), { sdk });
  assert.equal(access.ok, true);
  assert.equal(access.paymentRequired, false);
  assert.equal(access.identity?.clusterId, "human:demo");
  assert.equal(access.identity?.backingKind, "human");
  assert.equal(access.gate?.usedVerifications, i);
  assert.equal(access.gate?.freeUsesRemaining, WORLD_FREE_TRIAL_LIMIT - i);
}
console.log("ok AgentKit: AgentBook-backed agent receives exactly 3 free verification uses");

const exhausted = await verifyAgentKitAccess(request(signedHeader()), { sdk });
assert.equal(exhausted.ok, false);
assert.equal(exhausted.paymentRequired, true);
assert.equal(exhausted.error, "World AgentKit free trial exhausted");
console.log("ok AgentKit: fourth use falls back to payment required");

resetAgentKitDemoState();
const replayed = signedHeader();
const parallel = await Promise.all([
  verifyAgentKitAccess(request(replayed), { sdk }),
  verifyAgentKitAccess(request(replayed), { sdk }),
  verifyAgentKitAccess(request(replayed), { sdk })
]);
assert.equal(parallel.filter((result) => result.ok).length, 1);
assert.equal(parallel.filter((result) => result.error === "AgentKit nonce has already been used").length, 2);
console.log("ok AgentKit: concurrent nonce replay grants access only once");

const invalidChain = await verifyAgentKitAccess(request(signedHeader("eip155:1")), { sdk });
assert.equal(invalidChain.ok, false);
assert.equal(invalidChain.paymentRequired, true);
console.log("ok AgentKit: unsupported challenge chain fails closed");

console.log("all AgentKit selfchecks passed");
