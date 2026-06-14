import { optionalEnv } from "./env.mjs";
import { HEDERA_ERC8004_IDENTITY_REGISTRY } from "./evm.mjs";

/**
 * HCS-14 tooling layer on top of ERC-8004.
 *
 * ERC-8004 stays the source of truth: the agent is the integer agentId minted in
 * the Hedera IdentityRegistry. HCS-14 just wraps that identity into a portable,
 * deterministic Universal Agent ID (`uaid:aid:...`) so the same agent resolves
 * across web2 (A2A/REST) and web3 (EVM). Generation is a pure offline hash of the
 * canonical agent data — no credentials, no network — so it is purely additive:
 * if it ever fails, the on-chain ERC-8004 write is unaffected.
 *
 * Tooling: `@hashgraphonline/standards-sdk` (`createUaid`).
 */

/** ERC-8004 identity expressed as a CAIP-10 account on Hedera EVM. */
export function agentNativeId(agentId, options = {}) {
  const chainId = Number(options.chainId ?? optionalEnv("HEDERA_CHAIN_ID", "296"));
  const registry = options.identityRegistry ?? HEDERA_ERC8004_IDENTITY_REGISTRY;
  return `eip155:${chainId}:${registry}/${agentId}`;
}

/**
 * Deterministic HCS-14 UAID for an ERC-8004 agentId. Returns
 * `{ uaid, nativeId }`, or `null` if generation fails (never throws) so callers
 * can annotate output without risking the primary on-chain operation.
 */
export async function agentUaid({ agentId, name = "CTRL+Z Agent", registry = "ctrlz", options = {} } = {}) {
  if (agentId === undefined || agentId === null) return null;
  const nativeId = agentNativeId(agentId, options);
  try {
    const { createUaid } = await import("@hashgraphonline/standards-sdk");
    const uaid = await createUaid({
      registry,
      name,
      version: "1.0.0",
      protocol: "a2a",
      nativeId,
      skills: []
    });
    return { uaid, nativeId };
  } catch (error) {
    return { uaid: null, nativeId, error: error instanceof Error ? error.message : String(error) };
  }
}
