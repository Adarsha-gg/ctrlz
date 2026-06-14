#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");
    process.env[match[1]] = value;
  }
}

const groups = [
  {
    name: "BigQuery marketplace",
    anyGroups: [
      ["GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"],
      ["GOOGLE_APPLICATION_CREDENTIALS_JSON", "GOOGLE_CLOUD_CREDENTIALS"]
    ]
  },
  {
    name: "Hedera settlement",
    anyGroups: [
      ["HEDERA_PAYER_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"],
      ["HEDERA_RESOLVER_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"]
    ]
  },
  {
    name: "ERC-8004 validation writes",
    anyGroups: [
      ["HEDERA_WORKER_PRIVATE_KEY", "HEDERA_PAYER_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"],
      ["HEDERA_RESOLVER_PRIVATE_KEY", "HEDERA_FEEDBACK_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"]
    ]
  },
  {
    name: "x402 pay-on-green",
    optional: true,
    enabledBy: ["X402_PAYONGREEN_REQUIRED", "1"],
    required: ["X402_RECEIVER_ADDRESS"],
    any: ["X402_FACILITATOR_URL"],
    anyTruthy: [["X402_DEMO_MODE", "1"]]
  }
];

function present(name) {
  return Boolean(process.env[name]?.trim());
}

function checkGroup(group) {
  if (group.enabledBy && process.env[group.enabledBy[0]] !== group.enabledBy[1]) {
    return { configured: true, disabled: true, missingRequired: [], missingAny: [] };
  }
  const missingRequired = (group.required ?? []).filter((name) => !present(name));
  const missingAnyGroups = (group.anyGroups ?? []).filter((names) => !names.some(present));
  const hasAny = group.any ? group.any.some(present) : false;
  const hasTruthyAny = group.anyTruthy
    ? group.anyTruthy.some(([name, value]) => process.env[name] === value)
    : false;
  const missingPrimaryAny =
    group.any || group.anyTruthy
      ? hasAny || hasTruthyAny
        ? []
        : [[...(group.any ?? []), ...(group.anyTruthy ?? []).map(([name, value]) => `${name}=${value}`)]]
      : [];
  const missingAny = missingAnyGroups.concat(missingPrimaryAny);
  const configured = missingRequired.length === 0 && missingAny.length === 0;
  return { configured, missingRequired, missingAny };
}

let failures = 0;
for (const group of groups) {
  const result = checkGroup(group);
  const marker = result.disabled ? "disabled" : result.configured ? "ok" : "missing";
  console.log(`${marker} ${group.name}`);
  for (const name of result.missingRequired) {
    console.log(`  required: ${name}`);
  }
  for (const names of result.missingAny) {
    console.log(`  one of: ${names.join(", ")}`);
  }
  if (!result.configured && !group.optional) failures += 1;
}

if (failures > 0) {
  console.log("\nSet missing Vercel env vars with `vercel env add <NAME> production`.");
  process.exitCode = 1;
}
