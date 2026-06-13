#!/usr/bin/env node

import fs from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadDotenv, optionalEnv, printJson, requireEnvAny } from "./env.mjs";

loadDotenv();

const rpcUrl = optionalEnv("HEDERA_RPC_URL", "https://testnet.hashio.io/api");
const chainId = Number(optionalEnv("HEDERA_CHAIN_ID", "296"));
const chain = {
  id: chainId,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};

const payerKey = normalizePrivateKey(
  requireEnvAny(["HEDERA_PAYER_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"]).value,
);
const resolverKey = normalizePrivateKey(
  requireEnvAny(["HEDERA_RESOLVER_PRIVATE_KEY", "HEDERA_PAYER_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"]).value,
);
const payer = privateKeyToAccount(payerKey);
const resolver = privateKeyToAccount(resolverKey);
const workerKey = process.env.HEDERA_WORKER_PRIVATE_KEY
  ? normalizePrivateKey(process.env.HEDERA_WORKER_PRIVATE_KEY)
  : payerKey;
const worker = privateKeyToAccount(workerKey);
const configuredWorkerAddress = process.env.HEDERA_WORKER_ADDRESS?.trim();
if (configuredWorkerAddress && configuredWorkerAddress.toLowerCase() !== worker.address.toLowerCase()) {
  throw new Error(
    "HEDERA_WORKER_ADDRESS does not match HEDERA_WORKER_PRIVATE_KEY; unset it or provide the matching worker key",
  );
}
const amount = parseEther(optionalEnv("HEDERA_VERIFY_DEMO_HBAR", "0.001"));
const specHashInput = bytes32EnvOrDemo("HEDERA_VERIFY_SPEC_HASH", "ctrlz-demo-spec-v1");
const evidenceHashInput = bytes32EnvOrDemo("HEDERA_VERIFY_EVIDENCE_HASH", "ctrlz-demo-evidence-v1");
const recommendationHashInput = bytes32EnvOrDemo("HEDERA_VERIFY_RECOMMENDATION_HASH", "proceed");
const specHash = specHashInput.value;
const evidenceHash = evidenceHashInput.value;
const recommendationHash = recommendationHashInput.value;

const artifact = JSON.parse(
  fs.readFileSync("contracts/out/CtrlZVerifyEscrow.sol/CtrlZVerifyEscrow.json", "utf8"),
);
const abi = artifact.abi;
const bytecode = artifact.bytecode.object ?? artifact.bytecode;
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const payerClient = createWalletClient({ account: payer, chain, transport: http(rpcUrl) });
const workerClient = createWalletClient({ account: worker, chain, transport: http(rpcUrl) });
const resolverClient = createWalletClient({ account: resolver, chain, transport: http(rpcUrl) });
const deployGas = BigInt(optionalEnv("HEDERA_VERIFY_DEPLOY_GAS", "5000000"));
const lockGas = BigInt(optionalEnv("HEDERA_VERIFY_LOCK_GAS", "500000"));
const actionGas = BigInt(optionalEnv("HEDERA_VERIFY_ACTION_GAS", "300000"));
const resolveGas = BigInt(optionalEnv("HEDERA_VERIFY_RESOLVE_GAS", "500000"));

const deployHash = await payerClient.deployContract({ abi, bytecode, gas: deployGas });
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const escrowAddress = deployReceipt.contractAddress;
if (!escrowAddress) throw new Error("Deploy receipt did not include contract address");

const taskId = await publicClient.readContract({
  address: escrowAddress,
  abi,
  functionName: "nextTaskId",
});

const lockHash = await payerClient.writeContract({
  address: escrowAddress,
  abi,
  functionName: "lockTask",
  args: [worker.address, resolver.address, specHash],
  value: amount,
  gas: lockGas,
});
await publicClient.waitForTransactionReceipt({ hash: lockHash });

const acceptHash = await workerClient.writeContract({
  address: escrowAddress,
  abi,
  functionName: "acceptTask",
  args: [taskId],
  gas: actionGas,
});
await publicClient.waitForTransactionReceipt({ hash: acceptHash });

const submitHash = await workerClient.writeContract({
  address: escrowAddress,
  abi,
  functionName: "submitOutput",
  args: [taskId, evidenceHash],
  gas: actionGas,
});
await publicClient.waitForTransactionReceipt({ hash: submitHash });

const resolveHash = await resolverClient.writeContract({
  address: escrowAddress,
  abi,
  functionName: "resolve",
  args: [taskId, 0, evidenceHash, 9200, recommendationHash],
  gas: resolveGas,
});
const resolveReceipt = await publicClient.waitForTransactionReceipt({ hash: resolveHash });

const task = await publicClient.readContract({
  address: escrowAddress,
  abi,
  functionName: "tasks",
  args: [taskId],
});

printJson({
  type: "ctrlz_verify_escrow_demo",
  chainId,
  escrowAddress,
  taskId: taskId.toString(),
  payer: payer.address,
  worker: worker.address,
  resolver: resolver.address,
  amountHbar: optionalEnv("HEDERA_VERIFY_DEMO_HBAR", "0.001"),
  specHash,
  evidenceHash,
  recommendationHash,
  hashSources: {
    specHash: specHashInput.source,
    evidenceHash: evidenceHashInput.source,
    recommendationHash: recommendationHashInput.source,
  },
  deployHash,
  lockHash,
  acceptHash,
  submitHash,
  resolveHash,
  resolveStatus: resolveReceipt.status,
  finalTaskState: Number(task[6]),
});

function normalizePrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function bytes32EnvOrDemo(envName, demoSeed) {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return { value: normalizeBytes32(fromEnv), source: envName };
  return { value: keccak256(toBytes(demoSeed)), source: "demo-fixture" };
}

function normalizeBytes32(value) {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`Expected bytes32 hex value, got ${value}`);
  }
  return normalized;
}
