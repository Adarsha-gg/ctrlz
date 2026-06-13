import { keccak256, toBytes } from "viem";
import { loadDotenv, optionalEnv, parseArgs, printJson } from "./env.mjs";
import {
  HEDERA_ERC8004_VALIDATION_REGISTRY,
  getHederaEvmClients,
  normalizeBytes32,
  readAbi,
} from "./evm.mjs";

const args = parseArgs();
loadDotenv();

if (!args.agentId) throw new Error("Missing --agent-id=101");
if (!args.validator) throw new Error("Missing --validator=0x...");

const agentId = BigInt(args.agentId);
const validator = args.validator;
const requestURI = args.requestUri ?? "";
const requestHash = args.requestHash
  ? normalizeBytes32(args.requestHash)
  : keccak256(toBytes(JSON.stringify({ agentId: agentId.toString(), validator, requestURI })));
const validationRegistryAddress = optionalEnv(
  "ERC8004_VALIDATION_REGISTRY",
  HEDERA_ERC8004_VALIDATION_REGISTRY,
);

const validationAbi = readAbi("./abis/ValidationRegistry.json");
const { account, publicClient, walletClient } = getHederaEvmClients([
  "HEDERA_WORKER_PRIVATE_KEY",
  "HEDERA_EVM_PRIVATE_KEY",
  "HEDERA_PAYER_PRIVATE_KEY"
]);

const hash = await walletClient.writeContract({
  address: validationRegistryAddress,
  abi: validationAbi,
  functionName: "validationRequest",
  args: [validator, agentId, requestURI, requestHash],
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });

printJson({
  network: "hedera-testnet",
  validationRegistry: validationRegistryAddress,
  requester: account.address,
  validator,
  agentId: agentId.toString(),
  requestURI,
  requestHash,
  transactionHash: hash,
  status: receipt.status,
  blockNumber: receipt.blockNumber.toString(),
});
