import { WORLD_FREE_TRIAL_LIMIT, decideWorldGate, type WorldAgentIdentity } from "./policy.ts";

export const WORLD_CHAIN_CAIP2 = "eip155:480";
export const BASE_CAIP2 = "eip155:8453";
export const WORLD_AGENTBOOK_CANONICAL = "0xA23aB2712eA7BBa896930544C7d6636a96b944dA";
export const WORLD_AGENTKIT_PATH = "/api/world/agentkit";

type AgentKitSdk = {
  AGENTKIT: string;
  agentkitResourceServerExtension: {
    enrichPaymentRequiredResponse(declaration: unknown, context: unknown): Promise<unknown>;
  };
  createAgentBookVerifier(options?: {
    rpcUrl?: string;
    contractAddress?: `0x${string}`;
  }): {
    lookupHuman(address: string): Promise<string | null>;
  };
  declareAgentkitExtension(options?: Record<string, unknown>): Record<string, unknown>;
  parseAgentkitHeader(header: string): unknown;
  validateAgentkitMessage(
    payload: unknown,
    resourceUri: string,
    options?: { checkNonce?: (nonce: string) => boolean | Promise<boolean> }
  ): Promise<{ valid: boolean; error?: string }>;
  verifyAgentkitSignature(
    payload: unknown,
    rpcUrl?: string
  ): Promise<{ valid: boolean; address?: string; error?: string }>;
};

export type AgentKitAccessResult = {
  ok: boolean;
  sdkAvailable: boolean;
  paymentRequired: boolean;
  gate?: ReturnType<typeof decideWorldGate>;
  identity?: WorldAgentIdentity;
  agentAddress?: string;
  humanId?: string;
  error?: string;
};

const nonces = new Set<string>();
const pendingNonces = new Set<string>();
const usage = new Map<string, number>();

export async function buildAgentKitPaymentRequired(request: Request, error?: string) {
  const sdk = await loadAgentKitSdk();
  const resourceUri = resourceUriFor(request);
  const declaration = sdk.declareAgentkitExtension({
    resourceUri,
    network: [WORLD_CHAIN_CAIP2, BASE_CAIP2],
    statement: "Verify your agent is backed by a real human before using CTRL+Z Verify",
    mode: { type: "free-trial", uses: WORLD_FREE_TRIAL_LIMIT }
  })[sdk.AGENTKIT];

  const payTo = payToAddress();
  const extension = await sdk.agentkitResourceServerExtension.enrichPaymentRequiredResponse(declaration, {
    resourceInfo: { url: resourceUri },
    requirements: [
      { network: WORLD_CHAIN_CAIP2, scheme: "exact", price: "$0.01", payTo },
      { network: BASE_CAIP2, scheme: "exact", price: "$0.01", payTo }
    ]
  });

  return {
    x402Version: 1,
    error: error ?? "AgentKit verification or x402 payment required",
    accepts: [
      {
        scheme: "exact",
        network: WORLD_CHAIN_CAIP2,
        price: "$0.01",
        payTo
      },
      {
        scheme: "exact",
        network: BASE_CAIP2,
        price: "$0.01",
        payTo
      }
    ],
    extensions: { [sdk.AGENTKIT]: extension }
  };
}

export async function verifyAgentKitAccess(
  request: Request,
  options: {
    path?: string;
    sdk?: AgentKitSdk;
    lookupHuman?: (address: string) => Promise<string | null>;
  } = {}
): Promise<AgentKitAccessResult> {
  let sdk: AgentKitSdk;
  try {
    sdk = options.sdk ?? (await loadAgentKitSdk());
  } catch (error) {
    return {
      ok: false,
      sdkAvailable: false,
      paymentRequired: true,
      error: error instanceof Error ? error.message : "AgentKit SDK unavailable"
    };
  }

  const header = request.headers.get(sdk.AGENTKIT) ?? request.headers.get(sdk.AGENTKIT.toLowerCase());
  if (!header) {
    return { ok: false, sdkAvailable: true, paymentRequired: true, error: "missing AgentKit header" };
  }

  try {
    const payload = sdk.parseAgentkitHeader(header) as { nonce?: string };
    if (!reserveNonce(payload.nonce)) {
      return fail("AgentKit nonce has already been used");
    }

    const validation = await sdk.validateAgentkitMessage(payload, resourceUriFor(request), {
      checkNonce: (nonce: string) => pendingNonces.has(nonce) && !nonces.has(nonce)
    });
    if (!validation.valid) {
      releaseNonce(payload.nonce);
      return fail(`AgentKit message invalid: ${validation.error ?? "unknown validation error"}`);
    }

    const signature = await sdk.verifyAgentkitSignature(payload, process.env.WORLD_AGENTKIT_RPC_URL);
    if (!signature.valid || !signature.address) {
      releaseNonce(payload.nonce);
      return fail(`AgentKit signature invalid: ${signature.error ?? "missing recovered address"}`);
    }

    commitNonce(payload.nonce);

    const humanId = await lookupHumanId(sdk, signature.address, options.lookupHuman);
    if (!humanId) {
      const identity: WorldAgentIdentity = {
        agentId: signature.address,
        humanBacked: false,
        backingKind: "none",
        source: "agentbook",
        ownerAddress: signature.address
      };
      return {
        ok: false,
        sdkAvailable: true,
        paymentRequired: true,
        identity,
        agentAddress: signature.address,
        error: "agent wallet is not registered in AgentBook"
      };
    }

    const endpoint = options.path ?? new URL(request.url).pathname;
    const usedBefore = usage.get(usageKey(endpoint, humanId)) ?? 0;
    const identity: WorldAgentIdentity = {
      agentId: signature.address,
      humanBacked: true,
      backingKind: "human",
      source: "agentbook",
      ownerAddress: signature.address,
      nullifierHash: humanId,
      clusterId: humanId
    };
    const gate = decideWorldGate({
      agentId: signature.address,
      usedVerifications: usedBefore,
      identity
    });

    if (gate.paymentRequired) {
      return {
        ok: false,
        sdkAvailable: true,
        paymentRequired: true,
        gate,
        identity,
        agentAddress: signature.address,
        humanId,
        error: "World AgentKit free trial exhausted"
      };
    }

    const usedAfter = usedBefore + 1;
    usage.set(usageKey(endpoint, humanId), usedAfter);
    const remaining = Math.max(WORLD_FREE_TRIAL_LIMIT - usedAfter, 0);

    return {
      ok: true,
      sdkAvailable: true,
      paymentRequired: false,
      gate: { ...gate, usedVerifications: usedAfter, freeUsesRemaining: remaining },
      identity,
      agentAddress: signature.address,
      humanId
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "AgentKit verification failed");
  }

  function fail(error: string): AgentKitAccessResult {
    return { ok: false, sdkAvailable: true, paymentRequired: true, error };
  }
}

export function resetAgentKitDemoState() {
  nonces.clear();
  pendingNonces.clear();
  usage.clear();
}

function reserveNonce(nonce: string | undefined) {
  if (!nonce) return false;
  if (nonces.has(nonce) || pendingNonces.has(nonce)) return false;
  pendingNonces.add(nonce);
  return true;
}

function commitNonce(nonce: string | undefined) {
  if (!nonce) return;
  pendingNonces.delete(nonce);
  nonces.add(nonce);
}

function releaseNonce(nonce: string | undefined) {
  if (!nonce) return;
  pendingNonces.delete(nonce);
}

async function loadAgentKitSdk(): Promise<AgentKitSdk> {
  return (await import("@worldcoin/agentkit")) as unknown as AgentKitSdk;
}

async function lookupHumanId(
  sdk: AgentKitSdk,
  address: string,
  lookupHuman?: (address: string) => Promise<string | null>
) {
  if (lookupHuman) return lookupHuman(address);
  const verifier = sdk.createAgentBookVerifier({
    rpcUrl: process.env.WORLD_CHAIN_RPC_URL || process.env.WORLD_AGENTKIT_RPC_URL || undefined,
    contractAddress: (process.env.WORLD_AGENTBOOK_ADDRESS || WORLD_AGENTBOOK_CANONICAL) as `0x${string}`
  });
  return verifier.lookupHuman(address);
}

function resourceUriFor(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}${WORLD_AGENTKIT_PATH}`;
}

function usageKey(endpoint: string, humanId: string) {
  return `${endpoint}:${humanId}`;
}

function payToAddress() {
  const configured = process.env.WORLD_AGENTKIT_PAY_TO;
  if (configured && /^0x[a-fA-F0-9]{40}$/.test(configured) && !/^0x0{40}$/i.test(configured)) {
    return configured;
  }
  const demo = process.env.NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS || process.env.HEDERA_PAYER_ADDRESS;
  if (demo && /^0x[a-fA-F0-9]{40}$/.test(demo) && !/^0x0{40}$/i.test(demo)) {
    return demo;
  }
  throw new Error("WORLD_AGENTKIT_PAY_TO must be set to a non-zero EVM address before advertising x402 payment.");
}
