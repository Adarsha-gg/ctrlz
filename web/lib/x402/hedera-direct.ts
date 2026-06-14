import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicClient, createWalletClient, http, isAddress, parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "@/lib/contract";

export type HederaDirectX402Input = {
  payTo: string;
  amountHbar: string;
  payment: string;
  resource: string;
};

export type HederaDirectX402Receipt = {
  mode: "hedera-direct";
  transaction: `0x${string}`;
  payer: Address;
  payTo: Address;
  amountHbar: string;
  network: "eip155:296" | string;
  asset: "HBAR";
  status: string;
  blockNumber: string;
  explorer: string;
  raw: {
    payment: string;
    resource: string;
    chainId: number;
  };
};

let envLoaded = false;

function loadRootEnvOnce(): void {
  if (envLoaded) return;
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      for (const line of readFileSync(candidate, "utf8").split("\n")) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (process.env[key] === undefined) {
          process.env[key] = rawValue.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
        }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  envLoaded = true;
}

function env(name: string, fallback = "") {
  loadRootEnvOnce();
  return process.env[name]?.trim() || fallback;
}

function normalizeKey(value: string): `0x${string}` {
  return (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
}

function payerKey(): string | undefined {
  return env("HEDERA_X402_PAYER_PRIVATE_KEY") || env("HEDERA_PAYER_PRIVATE_KEY") || env("HEDERA_EVM_PRIVATE_KEY");
}

export function hederaDirectX402Configured(): boolean {
  return Boolean(payerKey());
}

export async function settleHederaDirectX402(input: HederaDirectX402Input): Promise<HederaDirectX402Receipt> {
  const key = payerKey();
  if (!key) {
    throw new Error("Hedera x402 direct settlement is enabled, but HEDERA_X402_PAYER_PRIVATE_KEY/HEDERA_PAYER_PRIVATE_KEY is not configured");
  }
  if (!isAddress(input.payTo)) {
    throw new Error(`Hedera x402 payTo must be an EVM address, got ${input.payTo}`);
  }

  const rpcUrl = env("HEDERA_RPC_URL", hederaTestnet.rpcUrl);
  const chainId = Number(env("HEDERA_CHAIN_ID", String(hederaTestnet.id)));
  const chain = {
    id: chainId,
    name: "Hedera Testnet",
    nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } }
  };
  const account = privateKeyToAccount(normalizeKey(key));
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const payTo = input.payTo as Address;
  const transaction = await walletClient.sendTransaction({
    to: payTo,
    value: parseEther(input.amountHbar)
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transaction });

  return {
    mode: "hedera-direct",
    transaction,
    payer: account.address,
    payTo,
    amountHbar: input.amountHbar,
    network: `eip155:${chainId}`,
    asset: "HBAR",
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    explorer: `https://hashscan.io/testnet/transaction/${transaction}`,
    raw: {
      payment: input.payment,
      resource: input.resource,
      chainId
    }
  };
}
