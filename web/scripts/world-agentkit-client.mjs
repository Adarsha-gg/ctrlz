#!/usr/bin/env node

import { createAgentkitClient } from "@worldcoin/agentkit";
import { privateKeyToAccount } from "viem/accounts";

const target = process.env.WORLD_AGENTKIT_TARGET_URL ?? "http://localhost:3000/api/world/agentkit";
const privateKey = process.env.WORLD_AGENTKIT_AGENT_PRIVATE_KEY;
const chainId = process.env.WORLD_AGENTKIT_SIGNER_CHAIN_ID ?? "eip155:480";

if (!privateKey) {
  throw new Error("WORLD_AGENTKIT_AGENT_PRIVATE_KEY is required; register this wallet in AgentBook first.");
}

const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
const events = [];
const agentkit = createAgentkitClient({
  signer: {
    address: account.address,
    chainId,
    type: "eip191",
    signMessage: (message) => account.signMessage({ message })
  },
  onEvent: (event) => events.push(event)
});

const response = await agentkit.fetch(target);
const text = await response.text();

console.log(
  JSON.stringify(
    {
      target,
      signer: account.address,
      chainId,
      status: response.status,
      events,
      body: parseBody(text)
    },
    null,
    2
  )
);

function parseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
