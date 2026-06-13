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
    process.env[key] = rawValue.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

export function requireEnvAny(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.length > 0) return { name, value };
  }
  throw new Error(`Missing required env: one of ${names.join(", ")}`);
}

export function requireEnvPair(pairs) {
  for (const [idName, keyName] of pairs) {
    const id = process.env[idName];
    const key = process.env[keyName];
    if (id && key) return { idName, id, keyName, key };
  }
  throw new Error(
    `Missing required paired Hedera credentials: one of ${pairs
      .map(([idName, keyName]) => `${idName}+${keyName}`)
      .join(", ")}`,
  );
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
  const operatorEnv = requireEnvPair([
    ["HEDERA_OPERATOR_ID", "HEDERA_OPERATOR_KEY"],
    ["HEDERA_RESOLVER_ID", "HEDERA_RESOLVER_PRIVATE_KEY"],
    ["HEDERA_PAYER_ID", "HEDERA_PAYER_PRIVATE_KEY"]
  ]);
  const operatorId = AccountId.fromString(operatorEnv.id);
  const operatorKey = PrivateKey.fromString(operatorEnv.key);
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
