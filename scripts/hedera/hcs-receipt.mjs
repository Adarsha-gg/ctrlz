#!/usr/bin/env node

import { TopicCreateTransaction, TopicId, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { getHederaClient, optionalEnv, printJson } from "./env.mjs";

const DEFAULT_HCS_TOPIC_ID = "0.0.9222881";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  })
);

const contractAddress = optionalArg(
  "contract",
  optionalEnv("NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS", ""),
);
const evidenceHash = optionalArg("evidence-hash", "");
const scoreBps = Number(optionalArg("score-bps", ""));
const recommendation = optionalArg("recommendation", "");

if (
  !/^0x[0-9a-fA-F]{40}$/.test(contractAddress) ||
  contractAddress.toLowerCase() === `0x${"0".repeat(40)}`
) {
  throw new Error("Missing or invalid --contract=0x... verify escrow address");
}
if (
  !/^0x[0-9a-fA-F]{64}$/.test(evidenceHash) ||
  evidenceHash.toLowerCase() === `0x${"0".repeat(64)}`
) {
  throw new Error("Missing or invalid --evidence-hash=0x... bytes32");
}
if (!Number.isInteger(scoreBps) || scoreBps < 0 || scoreBps > 10000) {
  throw new Error("Missing or invalid --score-bps integer from 0 to 10000");
}
if (!["proceed", "proceed_with_protection", "pause", "reject"].includes(recommendation)) {
  throw new Error(
    "Missing or invalid --recommendation; expected proceed, proceed_with_protection, pause, or reject",
  );
}

const { client, operatorId } = getHederaClient();
const topicId = await getOrCreateTopic();
const payload = {
  kind: "ctrlz.verify.receipt",
  taskId: optionalArg("task-id", "demo-task"),
  contractAddress,
  evidenceHash,
  scoreBps,
  recommendation,
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
  const configured = optionalEnv("HEDERA_HCS_TOPIC_ID", DEFAULT_HCS_TOPIC_ID);
  if (configured === "new") return createTopic();
  if (configured) return TopicId.fromString(configured);

  return createTopic();
}

async function createTopic() {
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
