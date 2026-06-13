import { NextResponse } from "next/server";
import {
  decideWorldGate,
  identityFromIdKit,
  lookupAgentBacking,
  mergeWorldIdentities,
  verifyIdKitProof,
  type IdKitProofPayload
} from "@/lib/world";

type WorldVerifyRequest = {
  agentId?: string;
  usedVerifications?: number;
  idkitProof?: IdKitProofPayload;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as WorldVerifyRequest;
  const agentId = body.agentId?.trim();

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  const agentbook = await lookupAgentBacking(agentId);
  const idkitResult = body.idkitProof ? await verifyIdKitProof(body.idkitProof) : undefined;
  const identity = mergeWorldIdentities(
    agentbook,
    idkitResult ? identityFromIdKit(agentId, idkitResult) : undefined
  );
  const gate = decideWorldGate({
    agentId,
    usedVerifications: body.usedVerifications ?? 0,
    identity
  });

  return NextResponse.json({
    identity,
    idkit: idkitResult,
    gate
  });
}
