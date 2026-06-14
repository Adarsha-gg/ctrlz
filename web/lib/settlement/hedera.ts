import "server-only";

/**
 * On-chain settlement driver (server-only) — fuses a verify verdict to the
 * Hedera escrow in one call, so the /verify/reconcile UI can settle with a click
 * instead of shelling a script.
 *
 * It runs the same lifecycle the demo script does — lock → accept → submit →
 * resolve on `CtrlZVerifyEscrow` — but against the already-deployed contract
 * (`ctrlzVerifyEscrowAddress`) so there's no per-click deploy. The private keys
 * stay on the server (loaded from the repo-root `.env`); nothing key-bearing is
 * ever sent to the browser.
 *
 * The hashes (specHash / evidenceHash / recommendationHash) and the verdict
 * (result / scoreBps) come straight from `/verify/submit` — the chain only
 * records what the deterministic checkers already decided.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseEventLogs,
  type Address
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ctrlzVerifyEscrowAbi,
  ctrlzVerifyEscrowAddress,
  hederaTestnet
} from "../contract.ts";

const VERIFICATION_RESULT = { PASS: 0, FAIL: 1, UNCERTAIN: 2 } as const;
export type SettleResultLabel = keyof typeof VERIFICATION_RESULT;

/** Task struct → state ordinals (CtrlZVerifyEscrow.State). */
const STATE_LABEL: Record<number, string> = {
  0: "NONE",
  1: "LOCKED",
  2: "ACCEPTED",
  3: "SUBMITTED",
  4: "PAUSED",
  5: "PAID",
  6: "REFUNDED"
};

export type SettleInput = {
  specHash: `0x${string}`;
  evidenceHash: `0x${string}`;
  recommendationHash: `0x${string}`;
  result: SettleResultLabel;
  scoreBps: number;
};

export type SettleReceipt = {
  configured: true;
  chainId: number;
  escrowAddress: Address;
  taskId: string;
  result: SettleResultLabel;
  scoreBps: number;
  finalState: number;
  finalStateLabel: string;
  lockHash: `0x${string}`;
  acceptHash: `0x${string}`;
  submitHash: `0x${string}`;
  resolveHash: `0x${string}`;
  resolveStatus: string;
  explorer: string;
};

let envLoaded = false;
/** Load repo-root `.env` (walk up from cwd) without overriding real env vars. */
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

function normalizeKey(value: string): `0x${string}` {
  return (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
}

function payerKey(): string | undefined {
  return process.env.HEDERA_PAYER_PRIVATE_KEY || process.env.HEDERA_EVM_PRIVATE_KEY;
}
function resolverKey(): string | undefined {
  return (
    process.env.HEDERA_RESOLVER_PRIVATE_KEY ||
    process.env.HEDERA_PAYER_PRIVATE_KEY ||
    process.env.HEDERA_EVM_PRIVATE_KEY
  );
}

/** True when the server has the keys needed to settle on Hedera. */
export function hederaConfigured(): boolean {
  loadRootEnvOnce();
  return Boolean(payerKey() && resolverKey());
}

function chainConfig() {
  const rpcUrl = process.env.HEDERA_RPC_URL || hederaTestnet.rpcUrl;
  const id = Number(process.env.HEDERA_CHAIN_ID || hederaTestnet.id);
  return {
    rpcUrl,
    chain: {
      id,
      name: "Hedera Testnet",
      nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    }
  };
}

/** Run lock → accept → submit → resolve against the deployed escrow. */
export async function settleOnHedera(input: SettleInput): Promise<SettleReceipt> {
  loadRootEnvOnce();
  const pKey = payerKey();
  const rKey = resolverKey();
  if (!pKey || !rKey) {
    throw new Error("Hedera keys not configured on the server");
  }

  const { rpcUrl, chain } = chainConfig();
  const payer = privateKeyToAccount(normalizeKey(pKey));
  const resolver = privateKeyToAccount(normalizeKey(rKey));
  const worker = process.env.HEDERA_WORKER_PRIVATE_KEY
    ? privateKeyToAccount(normalizeKey(process.env.HEDERA_WORKER_PRIVATE_KEY))
    : payer;

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const payerClient = createWalletClient({ account: payer, chain, transport: http(rpcUrl) });
  const workerClient = createWalletClient({ account: worker, chain, transport: http(rpcUrl) });
  const resolverClient = createWalletClient({ account: resolver, chain, transport: http(rpcUrl) });

  const abi = ctrlzVerifyEscrowAbi;
  const address = ctrlzVerifyEscrowAddress;
  const amount = parseEther(process.env.HEDERA_VERIFY_DEMO_HBAR || "0.001");

  const lockHash = await payerClient.writeContract({
    address,
    abi,
    functionName: "lockTask",
    args: [worker.address, resolver.address, input.specHash],
    value: amount,
    gas: 500_000n
  });
  const lockReceipt = await publicClient.waitForTransactionReceipt({ hash: lockHash });

  // The escrow's `nextTaskId` isn't in the exported ABI, so read the new id off
  // the TaskLocked event the lock just emitted (robust against concurrent locks).
  const lockedEvents = parseEventLogs({ abi, logs: lockReceipt.logs, eventName: "TaskLocked" });
  const taskId = (lockedEvents[0]?.args as { id: bigint } | undefined)?.id;
  if (taskId === undefined) {
    throw new Error("lock succeeded but no TaskLocked event was found to read the task id");
  }

  const acceptHash = await workerClient.writeContract({
    address,
    abi,
    functionName: "acceptTask",
    args: [taskId],
    gas: 300_000n
  });
  await publicClient.waitForTransactionReceipt({ hash: acceptHash });

  const submitHash = await workerClient.writeContract({
    address,
    abi,
    functionName: "submitOutput",
    args: [taskId, input.evidenceHash],
    gas: 300_000n
  });
  await publicClient.waitForTransactionReceipt({ hash: submitHash });

  const resolveHash = await resolverClient.writeContract({
    address,
    abi,
    functionName: "resolve",
    args: [
      taskId,
      VERIFICATION_RESULT[input.result],
      input.evidenceHash,
      input.scoreBps,
      input.recommendationHash
    ],
    gas: 500_000n
  });
  const resolveReceipt = await publicClient.waitForTransactionReceipt({ hash: resolveHash });

  const task = (await publicClient.readContract({
    address,
    abi,
    functionName: "tasks",
    args: [taskId]
  })) as readonly unknown[];
  const finalState = Number(task[6]);

  return {
    configured: true,
    chainId: chain.id,
    escrowAddress: address,
    taskId: taskId.toString(),
    result: input.result,
    scoreBps: input.scoreBps,
    finalState,
    finalStateLabel: STATE_LABEL[finalState] ?? `state ${finalState}`,
    lockHash,
    acceptHash,
    submitHash,
    resolveHash,
    resolveStatus: resolveReceipt.status,
    explorer: `https://hashscan.io/testnet/transaction/${resolveHash}`
  };
}
