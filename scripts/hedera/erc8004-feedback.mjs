import { loadDotenv, optionalEnv, parseArgs, printJson } from "./env.mjs";
import {
  HEDERA_ERC8004_REPUTATION_REGISTRY,
  getHederaEvmClients,
  normalizeBytes32,
  readAbi,
} from "./evm.mjs";

const args = parseArgs();
loadDotenv();

if (!args.agentId) throw new Error("Missing --agent-id=123");

const agentId = BigInt(args.agentId);
const value = BigInt(args.value ?? "9200");
const valueDecimals = Number(args.decimals ?? "2");
const tag1 = args.tag1 ?? "ctrlz.verify";
const tag2 = args.tag2 ?? "worker.outcome";
const endpoint = args.endpoint ?? "";
const feedbackURI = args.feedbackUri ?? "";
const feedbackHash = normalizeBytes32(args.feedbackHash);
const reputationRegistryAddress = optionalEnv(
  "ERC8004_REPUTATION_REGISTRY",
  HEDERA_ERC8004_REPUTATION_REGISTRY,
);

if (!Number.isInteger(valueDecimals) || valueDecimals < 0 || valueDecimals > 18) {
  throw new Error("--decimals must be an integer from 0 to 18");
}

const reputationAbi = readAbi("./abis/ReputationRegistry.json");
const { account, publicClient, walletClient } = getHederaEvmClients();

const hash = await walletClient.writeContract({
  address: reputationRegistryAddress,
  abi: reputationAbi,
  functionName: "giveFeedback",
  args: [agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash],
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });

printJson({
  network: "hedera-testnet",
  reputationRegistry: reputationRegistryAddress,
  clientAddress: account.address,
  agentId: agentId.toString(),
  value: value.toString(),
  valueDecimals,
  tag1,
  tag2,
  endpoint,
  feedbackURI,
  feedbackHash,
  transactionHash: hash,
  status: receipt.status,
  blockNumber: receipt.blockNumber.toString(),
});
