#!/usr/bin/env node

import { TopicCreateTransaction, TopicId, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { getHederaClient, optionalEnv, printJson } from "./env.mjs";

const { client, operatorId } = getHederaClient();
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  })
);

const topicId = await getOrCreateTopic();
const payload = {
  kind: "ctrlz.verify.receipt",
  taskId: optionalArg("task-id", "demo-task"),
  contractAddress: optionalArg("contract", optionalEnv("NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS", "")),
  evidenceHash: optionalArg("evidence-hash", "0x0"),
  scoreBps: Number(optionalArg("score-bps", "0")),
  recommendation: optionalArg("recommendation", "pending"),
  walrusUri: optionalArg("walrus-uri", ""),
  createdAt: new Date().toISOString()
};

const submit = await new TopicMessageSubmitTransaction()
  .setTopicId(topicId)
  .setMessage(JSON.stringify(payload))
  .execute(client);
const receipt = await submit.getReceipt(client);

printJson({
  type: "hcs_receipt",
  operator: operatorId.toString(),
  topicId: topicId.toString(),
  transactionId: submit.transactionId.toString(),
  status: receipt.status.toString(),
  payload
});

client.close();

async function getOrCreateTopic() {
  const configured = optionalEnv("HEDERA_HCS_TOPIC_ID", "");
  if (configured) return TopicId.fromString(configured);

  const create = await new TopicCreateTransaction()
    .setTopicMemo("CTRL+Z Verify receipts")
    .execute(client);
  const receipt = await create.getReceipt(client);
  if (!receipt.topicId) throw new Error("HCS topic creation did not return topicId");
  return receipt.topicId;
}

function optionalArg(name, fallback) {
  const value = args.get(name);
  return value && value.length > 0 ? value : fallback;
}
