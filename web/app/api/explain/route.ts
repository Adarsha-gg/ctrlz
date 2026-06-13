import { NextResponse } from "next/server";
import { explainVerdict, fallbackExplanation } from "@/lib/llm/explain";
import type { RiskVerdict, VerdictTier } from "@/lib/risk";

/**
 * P3.1 — server route for the AI explainer. The risk verdict is computed
 * client-side (deterministic, in web/lib/risk); the browser POSTs it here so
 * the Claude call — and the API key — stay server-side. Returns the explanation
 * the verdict card (P3.2 / P6.1) renders.
 */

const TIERS: VerdictTier[] = ["red", "yellow", "green"];

function isVerdict(value: unknown): value is RiskVerdict {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    TIERS.includes(v.tier as VerdictTier) &&
    Array.isArray(v.reasons) &&
    Array.isArray(v.signals)
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const verdict = (body as { verdict?: unknown })?.verdict;
  if (!isVerdict(verdict)) {
    return NextResponse.json({ error: "missing or malformed verdict" }, { status: 400 });
  }

  // explainVerdict already degrades internally; the catch is belt-and-suspenders.
  try {
    const explanation = await explainVerdict(verdict);
    return NextResponse.json({ explanation });
  } catch {
    return NextResponse.json({ explanation: fallbackExplanation(verdict) });
  }
}
