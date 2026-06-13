#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadDotenv(path = resolve(root, ".env")) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

function hasEnv(name) {
  return Boolean(process.env[name] && process.env[name].trim().length > 0);
}

function hasAnyEnv(names) {
  return names.some((name) => hasEnv(name));
}

function hasEnvPair(pairs) {
  return pairs.some(([idName, keyName]) => hasEnv(idName) && hasEnv(keyName));
}

function statusLine(label, ok, detail) {
  const marker = ok ? "ok" : "warn";
  console.log(`  ${marker} ${label}${detail ? ` - ${detail}` : ""}`);
}

function runStep(label, command, args, options = {}) {
  console.log(`\n== ${label} ==`);
  return new Promise((resolveStep) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: process.env,
      stdio: "inherit"
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`== ${label}: PASS ==`);
        resolveStep({ label, ok: true, code });
      } else {
        console.log(`== ${label}: FAIL (${code}) ==`);
        resolveStep({ label, ok: false, code });
      }
    });

    child.on("error", (error) => {
      console.log(`== ${label}: FAIL (${error.message}) ==`);
      resolveStep({ label, ok: false, error });
    });
  });
}

function reportHederaReadiness() {
  console.log("\n== Hedera env readiness ==");
  loadDotenv();

  const network = process.env.HEDERA_NETWORK || "testnet";
  const rpcUrl = process.env.HEDERA_RPC_URL || process.env.NEXT_PUBLIC_HEDERA_RPC_URL;
  statusLine("network", true, network);
  statusLine("rpc url", true, rpcUrl ? "configured" : "using Hashio testnet default");

  const groups = [
    {
      label: "C1/C3 SDK txs",
      pairs: [
        ["HEDERA_OPERATOR_ID", "HEDERA_OPERATOR_KEY"],
        ["HEDERA_RESOLVER_ID", "HEDERA_RESOLVER_PRIVATE_KEY"],
        ["HEDERA_PAYER_ID", "HEDERA_PAYER_PRIVATE_KEY"]
      ],
      note: "needed as a matched account id + private key pair for native SDK/HCS"
    },
    {
      label: "C2/D1/D2 EVM txs",
      any: [["HEDERA_EVM_PRIVATE_KEY", "HEDERA_PAYER_PRIVATE_KEY", "HEDERA_RESOLVER_PRIVATE_KEY"]],
      note: "needed for escrow deploy/resolve and ERC-8004 writes"
    },
    {
      label: "C3 existing HCS topic",
      vars: ["HEDERA_HCS_TOPIC_ID"],
      note: "optional; script uses the committed CTRL+Z topic when omitted",
      optional: true
    },
    {
      label: "ERC-8004 registries",
      vars: ["ERC8004_IDENTITY_REGISTRY", "ERC8004_REPUTATION_REGISTRY"],
      note: "defaults are acceptable when unset",
      optional: true
    },
    {
      label: "verify escrow address",
      vars: ["NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS"],
      note: "env override is optional; web has a committed Hedera testnet fallback",
      optional: true
    }
  ];

  for (const group of groups) {
    const missing = group.pairs
      ? hasEnvPair(group.pairs)
        ? []
        : [group.pairs.map(([idName, keyName]) => `${idName}+${keyName}`).join(" or ")]
      : group.any
      ? group.any
          .map((names) => (hasAnyEnv(names) ? null : names.join(" or ")))
          .filter(Boolean)
      : group.vars.filter((name) => !hasEnv(name));
    if (group.optional && missing.length > 0) {
      statusLine(group.label, true, `${group.note}; using script defaults`);
      continue;
    }
    statusLine(
      group.label,
      missing.length === 0,
      missing.length === 0 ? "configured" : `${group.note}; missing ${missing.join(", ")}`
    );
  }

  console.log("  info no secrets printed, no transactions sent");
}

console.log("CTRL+Z G1 local demo readiness check");
console.log("G1 remains not done until five manual rehearsals and video capture are complete.");

const results = [];
results.push(
  await runStep("web scoring selfcheck", "node", [
    "--experimental-strip-types",
    "web/lib/scoring/selfcheck.ts"
  ])
);
results.push(
  await runStep("world selfcheck", "node", [
    "--experimental-strip-types",
    "web/lib/world/selfcheck.ts"
  ])
);
results.push(
  await runStep("world agentkit selfcheck", "node", [
    "--experimental-strip-types",
    "web/lib/world/agentkit-selfcheck.ts"
  ])
);
results.push(await runStep("web build", "npm", ["run", "build"], { cwd: resolve(root, "web") }));

reportHederaReadiness();

const failed = results.filter((result) => !result.ok);
console.log("\n== Summary ==");
for (const result of results) {
  console.log(`  ${result.ok ? "PASS" : "FAIL"} ${result.label}`);
}
console.log("  INFO Hedera readiness is informational and does not gate local checks.");
console.log("  INFO G1 remains [ ] until five manual rehearsals/video are complete.");

if (failed.length > 0) {
  process.exitCode = 1;
}
