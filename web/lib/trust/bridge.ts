import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient, http } from "viem";
import {
  ctrlzVerifyEscrowAbi,
  ctrlzVerifyEscrowAddress,
  ctrlzVerifyEscrowDeployment,
  ctrlzWalrusEvidence,
  erc8004HederaTestnet,
  hederaTestnet
} from "@/lib/contract";

type VerifyTaskState = "NONE" | "LOCKED" | "ACCEPTED" | "SUBMITTED" | "PAID" | "REFUNDED" | "PAUSED";

export type TrustBridgeData = {
  hedera: {
    chain: string;
    escrowAddress: string;
    taskId: number;
    state: VerifyTaskState;
    scoreBps: number;
    specHash: string;
    evidenceHash: string;
    recommendationHash: string;
    liveRead: boolean;
    error?: string;
    txs: {
      lock: string;
      accept: string;
      submit: string;
      resolve: string;
      validationRequest: string;
      validationResponse: string;
    };
    erc8004: {
      identityRegistry: string;
      reputationRegistry: string;
      validationRegistry: string;
      workerAgentId: number;
      checkerAgentId: number;
    };
  };
  walrus: {
    uri: string;
    blobId: string;
    evidenceHash: string;
  };
};

const STATE_LABELS: VerifyTaskState[] = [
  "NONE",
  "LOCKED",
  "ACCEPTED",
  "SUBMITTED",
  "PAID",
  "REFUNDED",
  "PAUSED"
];

const DEFAULT_BRIDGE_CACHE_SECONDS = 60;
const bridgeCacheSeconds = Number(process.env.TRUST_BRIDGE_CACHE_SECONDS ?? DEFAULT_BRIDGE_CACHE_SECONDS);

function fallbackBridge(error?: string): TrustBridgeData {
  const demo = ctrlzVerifyEscrowDeployment.demo;
  return {
    hedera: {
      chain: hederaTestnet.name,
      escrowAddress: ctrlzVerifyEscrowAddress,
      taskId: demo.taskId,
      state: "PAID",
      scoreBps: 9200,
      specHash: demo.specHash,
      evidenceHash: demo.evidenceHash,
      recommendationHash: demo.recommendationHash,
      liveRead: false,
      ...(error ? { error } : {}),
      txs: {
        lock: demo.lockHash,
        accept: demo.acceptHash,
        submit: demo.submitHash,
        resolve: demo.resolveHash,
        validationRequest: demo.validationRequestHash,
        validationResponse: demo.validationResponseHash
      },
      erc8004: {
        identityRegistry: erc8004HederaTestnet.identityRegistry,
        reputationRegistry: erc8004HederaTestnet.reputationRegistry,
        validationRegistry: erc8004HederaTestnet.validationRegistry,
        workerAgentId: 101,
        checkerAgentId: 102
      }
    },
    walrus: {
      uri: ctrlzWalrusEvidence.uri,
      blobId: ctrlzWalrusEvidence.blobId,
      evidenceHash: ctrlzWalrusEvidence.hash
    }
  };
}

async function readTrustBridgeData(): Promise<TrustBridgeData> {
  try {
    const client = createPublicClient({
      chain: {
        id: hederaTestnet.id,
        name: hederaTestnet.name,
        nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
        rpcUrls: { default: { http: [hederaTestnet.rpcUrl] } }
      },
      transport: http(hederaTestnet.rpcUrl)
    });

    const task = await client.readContract({
      address: ctrlzVerifyEscrowAddress,
      abi: ctrlzVerifyEscrowAbi,
      functionName: "tasks",
      args: [BigInt(ctrlzVerifyEscrowDeployment.demo.taskId)]
    });

    return {
      ...fallbackBridge(),
      hedera: {
        ...fallbackBridge().hedera,
        state: STATE_LABELS[Number(task[6])] ?? "NONE",
        scoreBps: Number(task[7]),
        specHash: task[4],
        evidenceHash: task[5],
        recommendationHash: task[8],
        liveRead: true
      }
    };
  } catch (error) {
    return fallbackBridge(error instanceof Error ? error.message : "Hedera RPC read failed");
  }
}

const getCachedTrustBridgeData = unstable_cache(readTrustBridgeData, ["ctrlz-trust-bridge-v1"], {
  revalidate: Number.isFinite(bridgeCacheSeconds) ? bridgeCacheSeconds : DEFAULT_BRIDGE_CACHE_SECONDS,
  tags: ["ctrlz-trust-bridge"]
});

export async function getTrustBridgeData(options?: { refresh?: boolean }): Promise<TrustBridgeData> {
  if (options?.refresh) {
    return readTrustBridgeData();
  }
  return getCachedTrustBridgeData();
}
