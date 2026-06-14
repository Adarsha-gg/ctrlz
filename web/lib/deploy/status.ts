import "server-only";

type EnvState = {
  configured: boolean;
  vars: string[];
  missing: string[];
};

function has(name: string) {
  return Boolean(process.env[name]?.trim());
}

function group(vars: string[], mode: "all" | "any" = "all"): EnvState {
  const present = vars.filter(has);
  const missing = vars.filter((name) => !has(name));
  return {
    configured: mode === "all" ? missing.length === 0 : present.length > 0,
    vars: present,
    missing
  };
}

export function deploymentStatus() {
  const google = group(["GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"], "any");
  const googleCredentials = group(["GOOGLE_APPLICATION_CREDENTIALS_JSON", "GOOGLE_CLOUD_CREDENTIALS"], "any");
  const hederaPayer = group(["HEDERA_PAYER_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"], "any");
  const hederaResolver = group(["HEDERA_RESOLVER_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"], "any");
  const erc8004Requester = group(["HEDERA_WORKER_PRIVATE_KEY", "HEDERA_PAYER_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"], "any");
  const erc8004Validator = group(["HEDERA_RESOLVER_PRIVATE_KEY", "HEDERA_FEEDBACK_PRIVATE_KEY", "HEDERA_EVM_PRIVATE_KEY"], "any");
  const x402Required = process.env.X402_PAYONGREEN_REQUIRED === "1";
  const x402Receiver = group(["X402_RECEIVER_ADDRESS"], "any");
  const x402Facilitator = group(["X402_FACILITATOR_URL"], "any");
  const x402DemoMode = process.env.X402_DEMO_MODE === "1";

  return {
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local",
    vercel: Boolean(process.env.VERCEL),
    bigQuery: {
      configured: google.configured && googleCredentials.configured,
      project: google,
      credentials: googleCredentials
    },
    hederaSettlement: {
      configured: hederaPayer.configured && hederaResolver.configured,
      payer: hederaPayer,
      resolver: hederaResolver
    },
    erc8004Validation: {
      configured: erc8004Requester.configured && erc8004Validator.configured,
      requester: erc8004Requester,
      validator: erc8004Validator
    },
    x402PayOnGreen: {
      configured: !x402Required || (x402Receiver.configured && (x402Facilitator.configured || x402DemoMode)),
      required: x402Required,
      facilitator: x402Facilitator,
      demoMode: x402DemoMode,
      receiver: x402Receiver
    },
    payOnGreenRunner: {
      demoEnabled: true,
      demoExecutor: "in-process",
      sandboxEnabled: process.env.PAYONGREEN_SANDBOX === "1",
      sandboxAuthenticated:
        !!process.env.VERCEL_OIDC_TOKEN ||
        (!!process.env.VERCEL_TOKEN && !!process.env.VERCEL_TEAM_ID && !!process.env.VERCEL_PROJECT_ID),
      localSubprocessEnabled: process.env.PAYONGREEN_ALLOW_RUN === "1"
    },
    walrus: {
      configured: true,
      publisherOverride: group(["NEXT_PUBLIC_WALRUS_PUBLISHER"], "any"),
      aggregatorOverride: group(["NEXT_PUBLIC_WALRUS_AGGREGATOR"], "any")
    }
  };
}
