import fs from "node:fs";
import { AccountId, Client, PrivateKey } from "@hashgraph/sdk";

export function loadDotenv(path = ".env") {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

export function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, ...rawValue] = arg.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    args[key] = rawValue.length > 0 ? rawValue.join("=") : "true";
  }
  return args;
}

export function getHederaClient() {
  loadDotenv();
  const operatorId = AccountId.fromString(requireEnv("HEDERA_OPERATOR_ID"));
  const operatorKey = PrivateKey.fromString(requireEnv("HEDERA_OPERATOR_KEY"));
  const network = optionalEnv("HEDERA_NETWORK", "testnet");

  let client;
  if (network === "mainnet") client = Client.forMainnet();
  else if (network === "previewnet") client = Client.forPreviewnet();
  else client = Client.forTestnet();

  client.setOperator(operatorId, operatorKey);
  return { client, operatorId };
}

export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}
