import type { CheckSpec } from "./types.ts";

export type CheckerCodeVersion = {
  checkType: string;
  checker: string;
  version: string;
  codeHash: string;
  deterministic: boolean;
  frozenInputKeys: string[];
};

export type FrozenCheckerInput = {
  checker: string;
  key: string;
  source: string;
  value: unknown;
};

export type CheckerRuntimeManifest = {
  rule: "frozen_inputs_and_pinned_code_v1";
  runtimeId: "ctrlz-checker-runtime";
  bundleHash: string;
  checkers: CheckerCodeVersion[];
  frozenInputs: FrozenCheckerInput[];
};

export const CHECKER_SOURCE_HASHES = {
  "web/lib/checkers/registry.ts": "sha256:d62f8ad42c3e49d2bac10b264168b12fdf4984ad8b61f2ecdb494ab9d892994a",
  "web/lib/checkers/schema.ts": "sha256:689551bbc1d6244c6c981630ce456c8ffdc377ca46560b1a93d04abe0f1c86ca",
  "web/lib/checkers/price.ts": "sha256:91485392935900cd294f32ed8d896d5912c98df1fc585bfe5d02730a3ffc0fa7",
  "web/lib/checkers/walletRisk.ts": "sha256:de32013afadd0aa8ecaed4f4699e8a32d769037e3b411f0186a4475ce82d4625",
  "web/lib/checkers/sourceListing.ts": "sha256:0706f846ac371514befb689592400264d0e520712ae9b732992de9e683e48372",
  "web/lib/risk/fixtures.ts": "sha256:78decba39e34f14de5c23524c63fa05cd23cdd7db8bfbbfd31ad8a0ce29d212e",
  "web/lib/risk/index.ts": "sha256:310464d90b665cd7500dc2f52c5cbb270967fafc6c13ef2be1317ea6342551e7",
  "web/lib/risk/lookalike.ts": "sha256:d84fedbf2e36dd7abd23a406dda7c785ea80ef50957b8e3bc990fe8a63b9fe6c",
  "web/lib/risk/names.ts": "sha256:94ff1376efcdd0e08b1572f26d53bb1d10a00870e87b07c1e00da56edef68161",
  "web/lib/risk/types.ts": "sha256:e0ab860f68dc7068e78a0f0b1883e269a31b1a3868bfd5ddded5624d9e0488e5",
  "web/lib/risk/verdict.ts": "sha256:77846cb3fb24c420b5741868a3fd5c562a3b47e7f0c02df4673943d99c68c0bf"
} as const;

export const CHECKER_BUNDLE_HASH = "sha256:86ef800bae1715ab03a7ac85c8453af1be57f6c729410ab23278ef35e6f8fc6d";

export const CHECKER_CODE_VERSIONS: Record<string, CheckerCodeVersion> = {
  schema: {
    checkType: "schema",
    checker: "schema-checker",
    version: "schema-checker@1",
    codeHash: CHECKER_SOURCE_HASHES["web/lib/checkers/schema.ts"],
    deterministic: true,
    frozenInputKeys: []
  },
  price_max: {
    checkType: "price_max",
    checker: "price-checker",
    version: "price-checker@1",
    codeHash: CHECKER_SOURCE_HASHES["web/lib/checkers/price.ts"],
    deterministic: true,
    frozenInputKeys: []
  },
  wallet_risk: {
    checkType: "wallet_risk",
    checker: "wallet-risk-checker",
    version: "wallet-risk-checker@1",
    codeHash: CHECKER_SOURCE_HASHES["web/lib/checkers/walletRisk.ts"],
    deterministic: true,
    frozenInputKeys: ["check.history"]
  },
  source_listing: {
    checkType: "source_listing",
    checker: "source-listing-checker",
    version: "source-listing-checker@1",
    codeHash: CHECKER_SOURCE_HASHES["web/lib/checkers/sourceListing.ts"],
    deterministic: true,
    frozenInputKeys: []
  }
};

function frozenInputsFor(check: CheckSpec, version: CheckerCodeVersion): FrozenCheckerInput[] {
  if (check.type === "wallet_risk" && check.history !== undefined) {
    return [
      {
        checker: version.checker,
        key: "check.history",
        source: "acceptance_manifest.checks[].history",
        value: check.history
      }
    ];
  }
  return [];
}

function unregisteredVersion(check: CheckSpec): CheckerCodeVersion {
  return {
    checkType: check.type,
    checker: `unregistered:${check.type}`,
    version: "unregistered",
    codeHash: "unregistered",
    deterministic: false,
    frozenInputKeys: []
  };
}

export function buildCheckerRuntimeManifest(checks: CheckSpec[]): CheckerRuntimeManifest {
  const checkers = checks.map((check) => CHECKER_CODE_VERSIONS[check.type] ?? unregisteredVersion(check));
  return {
    rule: "frozen_inputs_and_pinned_code_v1",
    runtimeId: "ctrlz-checker-runtime",
    bundleHash: CHECKER_BUNDLE_HASH,
    checkers,
    frozenInputs: checks.flatMap((check, index) => frozenInputsFor(check, checkers[index]))
  };
}
