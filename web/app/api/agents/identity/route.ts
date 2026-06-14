/**
 * GET /api/agents/identity — the agents' HCS-14 universal agent IDs (§ A2A demo).
 *
 * Returns the worker/checker `uaid:aid:...` identities so the A2A flow can show
 * that each agent has a real, resolvable HCS-14 identity (not just a label).
 * Degrades to empty strings if minting is unavailable — never breaks the page.
 */

import { NextResponse } from "next/server";
import { ctrlzAgentUaidMap } from "@/lib/hcs14/identity";

export const runtime = "nodejs";

export async function GET() {
  const uaids = await ctrlzAgentUaidMap();
  return NextResponse.json(uaids);
}
