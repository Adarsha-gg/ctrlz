import "server-only";

import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "@/lib/contract";

export const hederaValidationRegistryAddress =
  (process.env.ERC8004_VALIDATION_REGISTRY as Address | undefined) ??
  "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";

export const validationRegistryAbi = [
  {
    type: "function",
    name: "validationRequest",
    inputs: [
      { name: "validator", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "requestURI", type: "string" },
      { name: "requestHash", type: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "validationResponse",
    inputs: [
      { name: "requestHash", type: "bytes32" },
      { name: "response", type: "uint8" },
      { name: "responseURI", type: "string" },
      { name: "responseHash", type: "bytes32" },
      { name: "tag", type: "string" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getValidationStatus",
    inputs: [{ name: "requestHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view"
  }
] as const;

export type ValidationWriteInput = {
  agentId: string;
  score: number;
  requestURI: string;
  responseURI: string;
  responseHash: `0x${string}`;
  tag?: string;
};

export type ValidationWriteResult = {
  mode: "written" | "prepared" | "failed";
  validationRegistry: Address;
  agentId: string;
  validator?: Address;
  requestHash: `0x${string}`;
  requestURI: string;
  response: number;
  responseURI: string;
  responseHash: `0x${string}`;
  tag: string;
  requestTx?: `0x${string}`;
  responseTx?: `0x${string}`;
  validationStatus?: number;
  error?: string;
};

function privateKeyFromEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value.startsWith("0x") ? value : `0x${value}`;
  }
  return null;
}

function normalizeScore(score: number) {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function requestHashFor(input: ValidationWriteInput, validator?: Address): `0x${string}` {
  return keccak256(
    toBytes(
      JSON.stringify({
        protocol: "ctrlz.verify.validation.v1",
        agentId: input.agentId,
        validator: validator ?? "prepared",
        requestURI: input.requestURI,
        responseURI: input.responseURI,
        responseHash: input.responseHash,
        tag: input.tag ?? "ctrlz.verify"
      })
    )
  );
}

export async function writeValidationResponse(input: ValidationWriteInput): Promise<ValidationWriteResult> {
  const requesterKey = privateKeyFromEnv([
    "HEDERA_WORKER_PRIVATE_KEY",
    "HEDERA_PAYER_PRIVATE_KEY",
    "HEDERA_EVM_PRIVATE_KEY"
  ]);
  const validatorKey = privateKeyFromEnv([
    "HEDERA_RESOLVER_PRIVATE_KEY",
    "HEDERA_FEEDBACK_PRIVATE_KEY",
    "HEDERA_EVM_PRIVATE_KEY"
  ]);
  const tag = input.tag ?? "ctrlz.verify";
  const response = normalizeScore(input.score);

  if (!requesterKey || !validatorKey) {
    return {
      mode: "prepared",
      validationRegistry: hederaValidationRegistryAddress,
      agentId: input.agentId,
      requestHash: requestHashFor(input),
      requestURI: input.requestURI,
      response,
      responseURI: input.responseURI,
      responseHash: input.responseHash,
      tag,
      error: "Missing Hedera requester/validator private key env"
    };
  }

  const requester = privateKeyToAccount(requesterKey as `0x${string}`);
  const validator = privateKeyToAccount(validatorKey as `0x${string}`);
  const requestHash = requestHashFor(input, validator.address);
  const chain = {
    id: hederaTestnet.id,
    name: hederaTestnet.name,
    nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
    rpcUrls: { default: { http: [hederaTestnet.rpcUrl] } }
  };
  const publicClient = createPublicClient({ chain, transport: http(hederaTestnet.rpcUrl) });
  const requesterClient = createWalletClient({ account: requester, chain, transport: http(hederaTestnet.rpcUrl) });
  const validatorClient = createWalletClient({ account: validator, chain, transport: http(hederaTestnet.rpcUrl) });

  try {
    const requestTx = await requesterClient.writeContract({
      address: hederaValidationRegistryAddress,
      abi: validationRegistryAbi,
      functionName: "validationRequest",
      args: [validator.address, BigInt(input.agentId), input.requestURI, requestHash]
    });
    await publicClient.waitForTransactionReceipt({ hash: requestTx });

    const responseTx = await validatorClient.writeContract({
      address: hederaValidationRegistryAddress,
      abi: validationRegistryAbi,
      functionName: "validationResponse",
      args: [requestHash, response, input.responseURI, input.responseHash, tag]
    });
    await publicClient.waitForTransactionReceipt({ hash: responseTx });

    let validationStatus: number | undefined;
    try {
      const status = await publicClient.readContract({
        address: hederaValidationRegistryAddress,
        abi: validationRegistryAbi,
        functionName: "getValidationStatus",
        args: [requestHash]
      });
      validationStatus = Number(status);
    } catch {
      validationStatus = undefined;
    }

    return {
      mode: "written",
      validationRegistry: hederaValidationRegistryAddress,
      agentId: input.agentId,
      validator: validator.address,
      requestHash,
      requestURI: input.requestURI,
      response,
      responseURI: input.responseURI,
      responseHash: input.responseHash,
      tag,
      requestTx,
      responseTx,
      validationStatus
    };
  } catch (error) {
    return {
      mode: "failed",
      validationRegistry: hederaValidationRegistryAddress,
      agentId: input.agentId,
      validator: validator.address,
      requestHash,
      requestURI: input.requestURI,
      response,
      responseURI: input.responseURI,
      responseHash: input.responseHash,
      tag,
      error: error instanceof Error ? error.message : "ValidationRegistry write failed"
    };
  }
}
