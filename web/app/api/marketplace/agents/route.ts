import { NextResponse } from "next/server";
import { erc8004HederaTestnet } from "@/lib/contract";
import { getMarketplaceData } from "@/lib/google/bigquery";
import { ctrlzAgentUaidMap } from "@/lib/hcs14/identity";
import type { AgentMarketplaceRow } from "@/lib/marketplace/types";

export const dynamic = "force-dynamic";

const tonePairs: Array<[string, string]> = [
  ["#2f6db0", "#4f9bd6"],
  ["#1f7a55", "#46b483"],
  ["#6d5bd0", "#9f8cff"],
  ["#b35f1f", "#de9a4c"],
  ["#8b5468", "#c47d98"],
  ["#53616f", "#8a98a6"]
];

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function agentName(row: AgentMarketplaceRow) {
  if (row.domain && !["unknown", "embedded metadata"].includes(row.domain.toLowerCase())) return row.domain;
  if (row.agentId) return `Agent ${row.agentId}`;
  if (row.agentUri) {
    try {
      const url = new URL(row.agentUri);
      return url.hostname.replace(/^www\./, "") || row.agentId;
    } catch {
      return row.agentUri.replace(/^agent:\/\//, "").slice(0, 28) || row.agentId;
    }
  }
  return `Agent ${row.rank}`;
}

function initials(name: string) {
  const parts = name.replace(/[^a-zA-Z0-9.\s-]/g, " ").split(/[.\s-]+/).filter(Boolean);
  const chars = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return chars.toUpperCase();
}

function mapAgent(row: AgentMarketplaceRow, index: number) {
  const name = agentName(row);
  const score = Math.max(0, Math.min(100, row.trustScore));
  const rating = row.averageScore == null ? (score / 20).toFixed(2) : row.averageScore.toFixed(2);
  const status = row.action === "reject" || row.risk === "unknown" ? "busy" : "available";

  return {
    id: row.agentKey,
    rank: row.rank,
    name,
    handle: row.domain && !["unknown", "embedded metadata"].includes(row.domain.toLowerCase()) ? `@${row.domain}` : `@agent-${row.agentId}`,
    initials: initials(name),
    workKind: row.workKind,
    workLabel: row.workLabel,
    risk: row.risk,
    action: row.action,
    trustScore: score,
    feedbackCount: row.feedbackCount,
    uniqueClients: row.uniqueClients,
    validationCount: row.validationCount,
    categoryEvidence: row.categoryEvidence,
    x402Support: row.x402Support,
    history: row.history.slice(0, 8),
    tags: [row.workLabel || row.workKind, row.risk, row.x402Support ? "x402" : row.action].filter(Boolean).slice(0, 3),
    rep: rating,
    jobs: compactNumber(row.feedbackCount + row.validationCount),
    success: score,
    rate: row.action === "strict-validation" ? "strict validation" : row.action === "escrow" ? "escrow" : "direct pay",
    status,
    address: row.ownerAddress,
    detailHref: `/marketplace/${row.agentKey}`,
    agentUri: row.agentUri,
    domain: row.domain,
    tone: tonePairs[index % tonePairs.length],
    note: row.action === "reject" ? "Live marketplace policy blocks direct hiring until validation improves." : undefined
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const chain = url.searchParams.get("chain") === "hedera" ? "hedera" : "ethereum";
  const refresh = url.searchParams.get("refresh") === "1";
  const [data, identity] = await Promise.all([getMarketplaceData({ chain, refresh }), ctrlzAgentUaidMap()]);
  const now = new Date().toISOString();
  const ownAgent = {
    id: "ctrlz-worker-agent-101",
    rank: 0,
    name: "CTRL+Z Worker Agent",
    handle: "@ctrlz.worker",
    initials: "CZ",
    workKind: "developer",
    workLabel: "Developer",
    risk: "validated",
    action: "auto-hire",
    trustScore: 99,
    feedbackCount: 1,
    uniqueClients: 1,
    validationCount: 1,
    categoryEvidence: ["Gemini worker route", "held-out test checker", "Walrus evidence", "Hedera direct x402 or escrow settlement"],
    x402Support: true,
    history: [
      {
        kind: "identity",
        title: "HCS-14 worker identity resolved",
        detail: identity.worker || "Worker UAID will resolve when HCS-14 identity service is available.",
        timestamp: now
      },
      {
        kind: "validation",
        title: "Routes through the live CTRL+Z verifier",
        detail: "/api/agent/solve generates code, runs public + held-out tests, anchors evidence, then trusted runs can pay directly over Hedera x402.",
        timestamp: now,
        score: 99
      },
      {
        kind: "metadata",
        title: "Hedera x402 + Walrus + escrow fallback enabled",
        detail: "Trusted direct x402 receipts, evidence hashes, Walrus URI, and Hedera escrow fallback transactions are exposed in the run inspector.",
        timestamp: now
      }
    ],
    tags: ["Developer", "validated", "x402"],
    rep: "99.00",
    jobs: "live",
    success: 99,
    rate: "direct pay",
    status: "available",
    address: process.env.HEDERA_WORKER_ADDRESS || erc8004HederaTestnet.identityRegistry,
    detailHref: "/marketplace?chain=hedera&q=CTRL%2BZ",
    agentUri: "https://raw.githubusercontent.com/Adarsha-gg/ctrlz/main/docs/agents/ctrlz-worker-agent.json",
    domain: "ctrlz.worker",
    tone: ["#211f1b", "#bf5a2a"],
    note: "This is the worker actually used by the demo run."
  };
  const mappedAgents = data.agents.map((row, index) => mapAgent(row, index + 1));

  return NextResponse.json({
    source: data.source,
    generatedAt: data.generatedAt,
    error: data.error,
    stats: data.stats,
    agents: [ownAgent, ...mappedAgents]
  });
}
