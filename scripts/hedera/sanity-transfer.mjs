#!/usr/bin/env node

import { AccountId, Hbar, TransferTransaction } from "@hashgraph/sdk";
import { getHederaClient, optionalEnv, printJson, requireEnv } from "./env.mjs";

const { client, operatorId } = getHederaClient();
const recipient = AccountId.fromString(requireEnv("HEDERA_SANITY_TO_ACCOUNT_ID"));
const tinybars = Number(optionalEnv("HEDERA_SANITY_TINYBARS", "100000"));

if (!Number.isSafeInteger(tinybars) || tinybars <= 0) {
  throw new Error("HEDERA_SANITY_TINYBARS must be a positive safe integer");
}

const amount = Hbar.fromTinybars(tinybars);
const tx = await new TransferTransaction()
  .addHbarTransfer(operatorId, amount.negated())
  .addHbarTransfer(recipient, amount)
  .execute(client);
const receipt = await tx.getReceipt(client);

printJson({
  type: "hedera_sanity_transfer",
  transactionId: tx.transactionId.toString(),
  status: receipt.status.toString(),
  from: operatorId.toString(),
  to: recipient.toString(),
  tinybars
});

client.close();
