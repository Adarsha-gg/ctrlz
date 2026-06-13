/**
 * P2.5 — on-chain reputation reads.
 *
 * Reads a recipient's reputation counters from the deployed CTRL+Z escrow on
 * Arc and shapes them into `RecipientHistory` for the deterministic risk
 * engine. These counters are maintained ON SEAL only (see `_recordSealed` in
 * CtrlZEscrow.sol) — so only CLAIMED payments count toward reputation. We never
 * count PENDING payments ourselves (ethos guard #1); we only READ what the
 * contract already enforces.
 *
 * Resilience (ethos guard #2): every read is wrapped so an unreachable RPC or a
 * recipient with no on-chain presence yields `undefined` rather than throwing.
 * The verdict engine maps absent history to a cautious tier, so the buyer card
 * still renders.
 */

import {
  createPublicClient,
  http,
  getAddress,
  type Address,
  type PublicClient
} from "viem";
import {
  arcTestnet,
  ctrlzEscrowAbi,
  ctrlzEscrowAddress,
  ctrlzEscrowDeployBlock
} from "@/lib/contract";
import type { RecipientHistory } from "@/lib/risk";

/**
 * CtrlZEscrow.RecallReason enum (from contracts/src/CtrlZEscrow.sol):
 *   WRONG_ADDRESS = 0   (neutral — buyer fat-fingered the address)
 *   WRONG_AMOUNT  = 1   (neutral — buyer fixed the amount)
 *   FRAUD_SUSPECTED = 2 (early-warning — counts as a fraud recall)
 */
const RECALL_REASON_FRAUD_SUSPECTED = 2;

let cachedClient: PublicClient | undefined;

function getClient(): PublicClient {
  if (cachedClient) return cachedClient;
  const rpcUrl = arcTestnet.rpcUrl ?? process.env.NEXT_PUBLIC_ARC_RPC_URL;
  cachedClient = createPublicClient({
    chain: {
      id: arcTestnet.id,
      name: arcTestnet.name,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } }
    },
    transport: http(rpcUrl)
  }) as PublicClient;
  return cachedClient;
}

function readCounter(
  client: PublicClient,
  functionName: "firstSeen" | "sealedCount" | "distinctSenderCount" | "flagCount",
  account: Address
): Promise<bigint> {
  return client.readContract({
    address: ctrlzEscrowAddress,
    abi: ctrlzEscrowAbi,
    functionName,
    args: [account]
  }) as Promise<bigint>;
}

/**
 * Derive the fraud-recall count from `Recalled` events emitted against this
 * recipient with reason == FRAUD_SUSPECTED. Kept best-effort: if the log query
 * fails (RPC range limits, etc.) we fall back to 0 rather than failing the
 * whole history read — a missing early-warning signal degrades safely.
 */
async function fetchFraudRecallCount(
  client: PublicClient,
  recipient: Address
): Promise<number> {
  try {
    const logs = await client.getLogs({
      address: ctrlzEscrowAddress,
      event: {
        type: "event",
        name: "Recalled",
        inputs: [
          { name: "id", type: "uint256", indexed: true },
          { name: "sender", type: "address", indexed: true },
          { name: "recipient", type: "address", indexed: true },
          { name: "amount", type: "uint256", indexed: false },
          { name: "reason", type: "uint8", indexed: false }
        ]
      },
      args: { recipient },
      fromBlock: BigInt(ctrlzEscrowDeployBlock),
      toBlock: "latest"
    });
    return logs.filter(
      (log) => Number(log.args.reason) === RECALL_REASON_FRAUD_SUSPECTED
    ).length;
  } catch {
    // Best-effort: never let a log-query failure block the verdict.
    return 0;
  }
}

/**
 * Read a recipient's on-chain reputation. Returns `undefined` when the
 * recipient has no on-chain presence (firstSeen == 0) or when the RPC is
 * unreachable, so the verdict degrades to "no history".
 */
export async function fetchRecipientHistory(
  address: string
): Promise<RecipientHistory | undefined> {
  let recipient: Address;
  try {
    recipient = getAddress(address);
  } catch {
    return undefined; // not a valid address — nothing to read
  }

  try {
    const client = getClient();

    const [firstSeenRaw, sealedRaw, distinctRaw, flagRaw] = await Promise.all([
      readCounter(client, "firstSeen", recipient),
      readCounter(client, "sealedCount", recipient),
      readCounter(client, "distinctSenderCount", recipient),
      readCounter(client, "flagCount", recipient)
    ]);

    // firstSeen is set on the first SEAL; 0 means no claimed-payment presence.
    if (firstSeenRaw === 0n) return undefined;

    const fraudRecallCount = await fetchFraudRecallCount(client, recipient);

    const firstSeenMs = Number(firstSeenRaw) * 1000;
    const firstSeenDaysAgo = Math.max(
      0,
      Math.floor((Date.now() - firstSeenMs) / 86_400_000)
    );

    return {
      sealedCount: Number(sealedRaw),
      distinctSenders: Number(distinctRaw),
      flagCount: Number(flagRaw),
      fraudRecallCount,
      firstSeenDaysAgo
    };
  } catch {
    // RPC unreachable / read failure — degrade to "no history" (guard #2).
    return undefined;
  }
}
