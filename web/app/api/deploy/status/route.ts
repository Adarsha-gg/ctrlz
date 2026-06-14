import { NextResponse } from "next/server";
import { deploymentStatus } from "@/lib/deploy/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(deploymentStatus());
}
