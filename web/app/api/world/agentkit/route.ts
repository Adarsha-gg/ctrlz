import { NextResponse } from "next/server";
import {
  buildAgentKitPaymentRequired,
  verifyAgentKitAccess,
  WORLD_AGENTKIT_PATH
} from "@/lib/world/agentkit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleAgentKitRequest(req);
}

export async function POST(req: Request) {
  return handleAgentKitRequest(req);
}

async function handleAgentKitRequest(req: Request) {
  const access = await verifyAgentKitAccess(req, { path: WORLD_AGENTKIT_PATH });

  if (access.ok) {
    return NextResponse.json({
      access: "granted",
      mode: "free-trial",
      identity: access.identity,
      gate: access.gate,
      agentAddress: access.agentAddress
    });
  }

  if (!access.sdkAvailable) {
    return NextResponse.json(
      { access: "blocked", error: access.error, gate: access.gate },
      { status: 503 }
    );
  }

  const paymentRequired = await buildAgentKitPaymentRequired(req, access.error);
  return NextResponse.json(
    {
      ...paymentRequired,
      access: "payment_required",
      gate: access.gate,
      identity: access.identity
    },
    { status: 402 }
  );
}
