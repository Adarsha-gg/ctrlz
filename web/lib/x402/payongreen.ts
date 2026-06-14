import "server-only";

import { settleHederaDirectX402, type HederaDirectX402Receipt } from "./hedera-direct";

export type X402PaymentState =
  | { required: false; enabled: false }
  | { required: true; paid: false; requirements: X402PaymentRequirements; error?: string }
  | { required: true; paid: true; requirements: X402PaymentRequirements; receipt: X402Receipt };

export type X402SettlementMode = "escrow-after-verification" | "direct-worker-trusted";

export type X402PaymentRequirements = {
  scheme: "exact";
  network: string;
  asset: string;
  maxAmountRequired: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType: "application/json";
  outputSchema?: Record<string, unknown>;
  extra: {
    protocol: "x402";
    x402Version: 2;
    paymentHeader: "PAYMENT-SIGNATURE";
    settlementHeader: "PAYMENT-RESPONSE";
    product: "ctrlz.payongreen";
    settlement: X402SettlementMode;
    trustPolicy?: string;
    paymentIdentifier?: "supported";
  };
};

export type X402Receipt = HederaDirectX402Receipt | {
  mode: "facilitator" | "demo";
  transaction?: string;
  payer?: string;
  raw: unknown;
};

function env(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

export function x402Required() {
  return env("X402_PAYONGREEN_REQUIRED") === "1";
}

export type X402PaymentOptions = {
  payTo?: string;
  network?: string;
  asset?: string;
  amount?: string;
  description?: string;
  settlement?: X402SettlementMode;
  trustPolicy?: string;
};

export function paymentRequirements(resource: string, options: X402PaymentOptions = {}): X402PaymentRequirements {
  const settlement = options.settlement ?? "escrow-after-verification";
  return {
    scheme: "exact",
    network: options.network ?? env("X402_NETWORK", "eip155:296"),
    asset: options.asset ?? env("X402_ASSET", "HBAR"),
    maxAmountRequired: options.amount ?? env("X402_AMOUNT", "0.01"),
    payTo: options.payTo ?? env("X402_RECEIVER_ADDRESS", "0x0000000000000000000000000000000000000000"),
    resource,
    description:
      options.description ??
      (settlement === "direct-worker-trusted"
        ? "CTRL+Z trusted-agent direct payment. The worker is paid through the x402 V2 HTTP flow with Hedera testnet settlement; verification still records evidence and reputation."
        : "CTRL+Z pay-on-green verification run. Payment is accepted before verification; escrow settlement still depends on the test verdict."),
    mimeType: "application/json",
    outputSchema: {
      type: "object",
      required: ["recommendation", "settlement", "evidenceHash"],
      properties: {
        recommendation: { type: "string" },
        evidenceHash: { type: "string" },
        settlement: { type: "object" }
      }
    },
    extra: {
      protocol: "x402",
      x402Version: 2,
      paymentHeader: "PAYMENT-SIGNATURE",
      settlementHeader: "PAYMENT-RESPONSE",
      product: "ctrlz.payongreen",
      settlement,
      paymentIdentifier: "supported",
      ...(options.trustPolicy ? { trustPolicy: options.trustPolicy } : {})
    }
  };
}

function paymentHeader(request: Request) {
  return (
    request.headers.get("payment-signature") ??
    request.headers.get("PAYMENT-SIGNATURE") ??
    request.headers.get("x-payment") ??
    request.headers.get("X-PAYMENT") ??
    ""
  );
}

function encodeHeaderJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeHeaderJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

async function verifyWithFacilitator(payment: string, requirements: X402PaymentRequirements): Promise<X402Receipt> {
  const facilitator = env("X402_FACILITATOR_URL");
  if (!facilitator) {
    throw new Error("X402_FACILITATOR_URL is not configured");
  }

  const response = await fetch(facilitator.replace(/\/$/, "") + "/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payment, paymentRequirements: requirements })
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || data?.valid === false || data?.isValid === false) {
    throw new Error(typeof data?.error === "string" ? data.error : `x402 facilitator rejected payment (${response.status})`);
  }

  return {
    mode: "facilitator",
    transaction: typeof data?.transaction === "string" ? data.transaction : undefined,
    payer: typeof data?.payer === "string" ? data.payer : undefined,
    raw: data ?? { status: response.status }
  };
}

async function verifyWithHederaDirect(payment: string, requirements: X402PaymentRequirements): Promise<X402Receipt> {
  if (env("X402_HEDERA_DIRECT_SETTLE", "1") === "0") {
    throw new Error("Hedera x402 direct settlement is disabled by X402_HEDERA_DIRECT_SETTLE=0");
  }
  validateHederaPaymentPayload(payment, requirements);
  return settleHederaDirectX402({
    payTo: requirements.payTo,
    amountHbar: requirements.maxAmountRequired,
    payment,
    resource: requirements.resource
  });
}

const usedPaymentIdentifiers = new Set<string>();

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" ? found : undefined;
}

function validateHederaPaymentPayload(payment: string, requirements: X402PaymentRequirements) {
  let decoded: unknown;
  try {
    decoded = decodeHeaderJson(payment);
  } catch {
    throw new Error("PAYMENT-SIGNATURE must be base64-encoded JSON for Hedera x402 direct settlement");
  }
  if (!decoded || typeof decoded !== "object") {
    throw new Error("PAYMENT-SIGNATURE decoded to an invalid x402 payment payload");
  }

  const payload = (decoded as Record<string, unknown>).payload;
  const version = (decoded as Record<string, unknown>).x402Version;
  const scheme = stringField(decoded, "scheme");
  const network = stringField(decoded, "network");
  const amount = stringField(payload, "amount") ?? stringField(decoded, "amount");
  const payTo = stringField(payload, "payTo") ?? stringField(decoded, "payTo");
  const asset = stringField(payload, "asset") ?? stringField(decoded, "asset");
  const resource = stringField(payload, "resource") ?? stringField(decoded, "resource");
  const paymentIdentifier = stringField(payload, "paymentIdentifier") ?? stringField(decoded, "paymentIdentifier");

  if (version !== 2) throw new Error("PAYMENT-SIGNATURE must use x402Version 2");
  if (scheme !== requirements.scheme) throw new Error("PAYMENT-SIGNATURE scheme does not match PAYMENT-REQUIRED");
  if (network !== requirements.network) throw new Error("PAYMENT-SIGNATURE network does not match PAYMENT-REQUIRED");
  if (asset !== requirements.asset) throw new Error("PAYMENT-SIGNATURE asset does not match PAYMENT-REQUIRED");
  if (amount !== requirements.maxAmountRequired) throw new Error("PAYMENT-SIGNATURE amount does not match PAYMENT-REQUIRED");
  if (payTo?.toLowerCase() !== requirements.payTo.toLowerCase()) {
    throw new Error("PAYMENT-SIGNATURE payTo does not match PAYMENT-REQUIRED");
  }
  if (resource !== requirements.resource) throw new Error("PAYMENT-SIGNATURE resource does not match PAYMENT-REQUIRED");
  if (!paymentIdentifier) throw new Error("PAYMENT-SIGNATURE must include a paymentIdentifier");
  if (usedPaymentIdentifiers.has(paymentIdentifier)) {
    throw new Error(`duplicate x402 paymentIdentifier: ${paymentIdentifier}`);
  }
  usedPaymentIdentifiers.add(paymentIdentifier);
}

function verifyDemoReceipt(payment: string): X402Receipt {
  if (env("X402_DEMO_MODE") !== "1") {
    throw new Error("x402 payment is required, but no facilitator is configured and X402_DEMO_MODE is not enabled");
  }
  if (!payment.startsWith("demo-x402:")) {
    throw new Error("demo x402 receipt must start with demo-x402:");
  }
  return {
    mode: "demo",
    transaction: payment.slice("demo-x402:".length) || "demo",
    raw: { payment }
  };
}

export async function verifyX402ForRequest(request: Request, options: X402PaymentOptions = {}): Promise<X402PaymentState> {
  if (!x402Required()) {
    return { required: false, enabled: false };
  }

  const requirements = paymentRequirements(new URL(request.url).pathname, options);
  const payment = paymentHeader(request);
  if (!payment) {
    return { required: true, paid: false, requirements };
  }

  try {
    const receipt =
      requirements.extra.settlement === "direct-worker-trusted"
        ? await verifyWithHederaDirect(payment, requirements)
        : env("X402_FACILITATOR_URL")
          ? await verifyWithFacilitator(payment, requirements)
          : verifyDemoReceipt(payment);
    return { required: true, paid: true, requirements, receipt };
  } catch (error) {
    return {
      required: true,
      paid: false,
      requirements,
      error: error instanceof Error ? error.message : "x402 payment verification failed"
    };
  }
}

export function x402ResponseHeaders(state: X402PaymentState): HeadersInit {
  if (!state.required || !state.paid) return {};
  const payload = encodeHeaderJson(state.receipt);
  return {
    "PAYMENT-RESPONSE": payload,
    "x-payment-response": JSON.stringify(state.receipt)
  };
}

export function x402RequiredHeaders(state: X402PaymentState): HeadersInit {
  if (!state.required || state.paid) return {};
  const payload = { x402Version: 2, accepts: [state.requirements], error: state.error ?? "payment required" };
  return {
    "PAYMENT-REQUIRED": encodeHeaderJson(payload),
    "x-payment-required": JSON.stringify(state.requirements)
  };
}
