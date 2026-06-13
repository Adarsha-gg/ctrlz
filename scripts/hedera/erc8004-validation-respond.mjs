import { loadDotenv, optionalEnv, parseArgs, printJson } from "./env.mjs";
import {
  HEDERA_ERC8004_VALIDATION_REGISTRY,
  getHederaEvmClients,
  normalizeBytes32,
  readAbi,
} from "./evm.mjs";

const args = parseArgs();
loadDotenv();

if (!args.requestHash) throw new Error("Missing --request-hash=0x...");

const requestHash = normalizeBytes32(args.requestHash);
const response = Number(args.response ?? "92");
const responseURI = args.responseUri ?? "";
const responseHash = normalizeBytes32(args.responseHash);
const tag = args.tag ?? "ctrlz.verify";
const validationRegistryAddress = optionalEnv(
  "ERC8004_VALIDATION_REGISTRY",
  HEDERA_ERC8004_VALIDATION_REGISTRY,
);

if (!Number.isInteger(response) || response < 0 || response > 100) {
  throw new Error("--response must be an integer from 0 to 100");
}

const validationAbi = readAbi("./abis/ValidationRegistry.json");
const { account, publicClient, walletClient } = getHederaEvmClients([
  "HEDERA_RESOLVER_PRIVATE_KEY",
  "HEDERA_FEEDBACK_PRIVATE_KEY",
  "HEDERA_EVM_PRIVATE_KEY"
]);

const hash = await walletClient.writeContract({
  address: validationRegistryAddress,
  abi: validationAbi,
  functionName: "validationResponse",
  args: [requestHash, response, responseURI, responseHash, tag],
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });

let validationStatus = null;
try {
  validationStatus = await publicClient.readContract({
    address: validationRegistryAddress,
    abi: validationAbi,
    functionName: "getValidationStatus",
    args: [requestHash],
  });
} catch {
  validationStatus = null;
}

printJson({
  network: "hedera-testnet",
  validationRegistry: validationRegistryAddress,
  validator: account.address,
  requestHash,
  response,
  responseURI,
  responseHash,
  tag,
  transactionHash: hash,
  status: receipt.status,
  blockNumber: receipt.blockNumber.toString(),
  validationStatus: validationStatus === null ? null : Number(validationStatus),
});
