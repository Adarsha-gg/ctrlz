import "server-only";

export type X402PaymentState =
  | { required: false; enabled: false }
  | { required: true; paid: false; requirements: X402PaymentRequirements; error?: string }
  | { required: true; paid: true; requirements: X402PaymentRequirements; receipt: X402Receipt };

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
    product: "ctrlz.payongreen";
    settlement: "escrow-after-verification";
  };
};

export type X402Receipt = {
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

export function paymentRequirements(resource: string): X402PaymentRequirements {
  return {
    scheme: "exact",
    network: env("X402_NETWORK", "base-sepolia"),
    asset: env("X402_ASSET", "USDC"),
    maxAmountRequired: env("X402_AMOUNT", "0.01"),
    payTo: env("X402_RECEIVER_ADDRESS", "0x0000000000000000000000000000000000000000"),
    resource,
    description: "CTRL+Z pay-on-green verification run. Payment is accepted before verification; escrow settlement still depends on the test verdict.",
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
      product: "ctrlz.payongreen",
      settlement: "escrow-after-verification"
    }
  };
}

function paymentHeader(request: Request) {
  return request.headers.get("x-payment") ?? request.headers.get("payment-signature") ?? "";
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

export async function verifyX402ForRequest(request: Request): Promise<X402PaymentState> {
  if (!x402Required()) {
    return { required: false, enabled: false };
  }

  const requirements = paymentRequirements(new URL(request.url).pathname);
  const payment = paymentHeader(request);
  if (!payment) {
    return { required: true, paid: false, requirements };
  }

  try {
    const receipt = env("X402_FACILITATOR_URL")
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
  return {
    "x-payment-response": JSON.stringify(state.receipt)
  };
}

export function x402RequiredHeaders(state: X402PaymentState): HeadersInit {
  if (!state.required || state.paid) return {};
  return {
    "x-payment-required": JSON.stringify(state.requirements)
  };
}
