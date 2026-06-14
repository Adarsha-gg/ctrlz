/**
 * POST /verify/settle — one-click on-chain settlement for the reconcile UI.
 *
 * Takes the verdict + hashes that /verify/submit already produced and drives the
 * Hedera escrow lifecycle (lock → accept → submit → resolve) against the deployed
 * `CtrlZVerifyEscrow`. The deterministic checkers already decided; this only
 * records that decision on-chain and moves the money (PAID vs REFUNDED).
 *
 * Keys stay server-side. If the server has no Hedera creds, returns
 * { configured: false } (200) so the UI degrades gracefully instead of erroring.
 */

import { NextResponse } from "next/server";
import {
  hederaConfigured,
  settleOnHedera,
  type SettleResultLabel
} from "@/lib/settlement/hedera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESULTS: SettleResultLabel[] = ["PASS", "FAIL", "UNCERTAIN"];
// Accept hashes with or without the 0x prefix — /verify/submit emits bare sha256
// hex — and normalize to the 0x bytes32 the contract call needs.
const BYTES32 = /^(0x)?[0-9a-fA-F]{64}$/;
const to0x = (v: string): `0x${string}` =>
  (v.startsWith("0x") ? v : `0x${v}`) as `0x${string}`;

type SettleBody = {
  specHash?: string;
  evidenceHash?: string;
  recommendationHash?: string;
  result?: string;
  scoreBps?: number;
};

/** Status probe — lets the UI show whether on-chain settle is available before a click. */
export async function GET() {
  return NextResponse.json({ configured: hederaConfigured() });
}

export async function POST(request: Request) {
  if (!hederaConfigured()) {
    return NextResponse.json({
      configured: false,
      error: "Hedera credentials are not set on the server (.env HEDERA_*_PRIVATE_KEY)."
    });
  }

  let body: SettleBody;
  try {
    body = (await request.json()) as SettleBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { specHash, evidenceHash, recommendationHash, result, scoreBps } = body;

  for (const [name, value] of [
    ["specHash", specHash],
    ["evidenceHash", evidenceHash],
    ["recommendationHash", recommendationHash]
  ] as const) {
    if (typeof value !== "string" || !BYTES32.test(value)) {
      return NextResponse.json({ error: `${name} must be a 32-byte hex string` }, { status: 400 });
    }
  }
  if (typeof result !== "string" || !RESULTS.includes(result as SettleResultLabel)) {
    return NextResponse.json({ error: "result must be PASS | FAIL | UNCERTAIN" }, { status: 400 });
  }
  if (typeof scoreBps !== "number" || !Number.isInteger(scoreBps) || scoreBps < 0 || scoreBps > 10000) {
    return NextResponse.json({ error: "scoreBps must be an integer 0..10000" }, { status: 400 });
  }

  try {
    const receipt = await settleOnHedera({
      specHash: to0x(specHash as string),
      evidenceHash: to0x(evidenceHash as string),
      recommendationHash: to0x(recommendationHash as string),
      result: result as SettleResultLabel,
      scoreBps
    });
    return NextResponse.json(receipt);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "settlement failed" },
      { status: 502 }
    );
  }
}
