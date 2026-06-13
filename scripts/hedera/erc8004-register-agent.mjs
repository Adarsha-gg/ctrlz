import { parseEventLogs, zeroAddress } from "viem";
import { loadDotenv, optionalEnv, parseArgs, printJson } from "./env.mjs";
import {
  HEDERA_ERC8004_IDENTITY_REGISTRY,
  getHederaEvmClients,
  readAbi,
} from "./evm.mjs";

const args = parseArgs();
loadDotenv();
const agentURI = args.agentUri;

if (!agentURI) {
  throw new Error("Missing --agent-uri=https://... registration JSON URI");
}

const identityRegistryAddress = optionalEnv(
  "ERC8004_IDENTITY_REGISTRY",
  HEDERA_ERC8004_IDENTITY_REGISTRY,
);
const identityAbi = readAbi("./abis/IdentityRegistry.json");
const { account, publicClient, walletClient } = getHederaEvmClients();

const hash = await walletClient.writeContract({
  address: identityRegistryAddress,
  abi: identityAbi,
  functionName: "register",
  args: [agentURI],
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
let agentId = null;

try {
  const transferLogs = parseEventLogs({
    abi: identityAbi,
    logs: receipt.logs,
    eventName: "Transfer",
  });
  const mint = transferLogs.find(
    (log) =>
      log.args.from?.toLowerCase() === zeroAddress &&
      log.args.to?.toLowerCase() === account.address.toLowerCase(),
  );
  agentId = mint?.args.tokenId?.toString() ?? null;
} catch {
  agentId = null;
}

printJson({
  network: "hedera-testnet",
  identityRegistry: identityRegistryAddress,
  owner: account.address,
  agentURI,
  transactionHash: hash,
  status: receipt.status,
  blockNumber: receipt.blockNumber.toString(),
  agentId,
});
