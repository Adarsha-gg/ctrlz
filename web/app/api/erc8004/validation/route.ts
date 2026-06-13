import { NextResponse } from "next/server";
import { writeValidationResponse } from "@/lib/erc8004/validation";

export const runtime = "nodejs";

type ValidationRequestBody = {
  agentId?: string;
  score?: number;
  requestURI?: string;
  responseURI?: string;
  responseHash?: string;
  tag?: string;
};

function isBytes32(value: string | undefined): value is `0x${string}` {
  return !!value && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ValidationRequestBody | null;

  if (!body?.agentId || !/^\d+$/.test(body.agentId)) {
    return NextResponse.json({ error: "agentId must be a decimal ERC-8004 agent id" }, { status: 400 });
  }
  const score = body.score;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return NextResponse.json({ error: "score must be a number from 0 to 100" }, { status: 400 });
  }
  if (!isBytes32(body.responseHash)) {
    return NextResponse.json({ error: "responseHash must be bytes32" }, { status: 400 });
  }

  const result = await writeValidationResponse({
    agentId: body.agentId,
    score,
    requestURI: body.requestURI ?? body.responseURI ?? "",
    responseURI: body.responseURI ?? body.requestURI ?? "",
    responseHash: body.responseHash,
    tag: body.tag ?? "ctrlz.verify"
  });

  return NextResponse.json(result, { status: result.mode === "failed" ? 502 : 200 });
}
