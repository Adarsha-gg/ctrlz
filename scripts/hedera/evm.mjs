import fs from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadDotenv, optionalEnv, requireEnvAny } from "./env.mjs";

export const HEDERA_ERC8004_IDENTITY_REGISTRY =
  "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const HEDERA_ERC8004_REPUTATION_REGISTRY =
  "0x8004B663056A597Dffe9eCcC1965A193B7388713";

export function readAbi(path) {
  return JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
}

export function getHederaEvmClients() {
  loadDotenv();
  const rpcUrl = optionalEnv("HEDERA_RPC_URL", "https://testnet.hashio.io/api");
  const chainId = Number(optionalEnv("HEDERA_CHAIN_ID", "296"));
  const privateKeyEnv = requireEnvAny([
    "HEDERA_EVM_PRIVATE_KEY",
    "HEDERA_PAYER_PRIVATE_KEY",
    "HEDERA_RESOLVER_PRIVATE_KEY"
  ]);
  const privateKey = privateKeyEnv.value.startsWith("0x")
    ? privateKeyEnv.value
    : `0x${privateKeyEnv.value}`;
  const account = privateKeyToAccount(privateKey);
  const chain = {
    id: chainId,
    name: "Hedera Testnet",
    nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };

  return {
    account,
    chain,
    publicClient: createPublicClient({ chain, transport: http(rpcUrl) }),
    walletClient: createWalletClient({ account, chain, transport: http(rpcUrl) }),
  };
}

export function normalizeBytes32(value) {
  if (!value || value === "0x") return `0x${"0".repeat(64)}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Expected bytes32 hex value like 0x followed by 64 hex chars");
  }
  return value;
}
