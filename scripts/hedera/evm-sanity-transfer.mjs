#!/usr/bin/env node

import { parseEther } from "viem";
import { loadDotenv, optionalEnv, printJson } from "./env.mjs";
import { getHederaEvmClients } from "./evm.mjs";

loadDotenv();

const { account, publicClient, walletClient } = getHederaEvmClients();
const recipient =
  optionalEnv("HEDERA_EVM_SANITY_TO_ADDRESS", "") ||
  optionalEnv("HEDERA_RESOLVER_ADDRESS", "") ||
  optionalEnv("HEDERA_PAYER_ADDRESS", "");

if (!recipient) {
  throw new Error(
    "Missing recipient: set HEDERA_EVM_SANITY_TO_ADDRESS, HEDERA_RESOLVER_ADDRESS, or HEDERA_PAYER_ADDRESS",
  );
}

if (recipient.toLowerCase() === account.address.toLowerCase()) {
  throw new Error("EVM sanity recipient matches sender; use a distinct address");
}

const value = parseEther(optionalEnv("HEDERA_EVM_SANITY_HBAR", "0.001"));
const hash = await walletClient.sendTransaction({ to: recipient, value });
const receipt = await publicClient.waitForTransactionReceipt({ hash });

printJson({
  type: "hedera_evm_sanity_transfer",
  chainId: publicClient.chain.id,
  from: account.address,
  to: recipient,
  valueHbar: optionalEnv("HEDERA_EVM_SANITY_HBAR", "0.001"),
  transactionHash: hash,
  status: receipt.status,
  blockNumber: receipt.blockNumber.toString(),
});
