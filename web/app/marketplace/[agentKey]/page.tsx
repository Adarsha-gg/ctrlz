import Link from "next/link";
import { notFound } from "next/navigation";
import { TerminalHeader } from "@/app/components/TerminalHeader";
import { ethereumErc8004Registries, getMarketplaceData } from "@/lib/google/bigquery";
import { getTrustBridgeData } from "@/lib/trust/bridge";
import type { AgentMarketplaceRow } from "@/lib/marketplace/types";

export const dynamic = "force-dynamic";

type DetailQuery = {
  kind?: string;
  policy?: string;
  q?: string;
  minTrust?: string;
  minClients?: string;
  hideThin?: string;
  sort?: string;
  refresh?: string;
};

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));

const shortAddress = (address: string) =>
  /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : "unknown";

const shortHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

const shortValue = (value: string) =>
  /^0x[0-9a-fA-F]{40,64}$/.test(value) ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;

const riskLabel = {
  validated: "Validated",
  trusted: "Trusted",
  active: "Active",
  thin: "Thin history",
  "needs-validation": "Needs validation",
  unknown: "Unknown"
} as const;

const actionLabel = {
  "auto-hire": "Pay directly",
  escrow: "Start escrow",
  "strict-validation": "Run strict validation",
  reject: "Manual review"
} as const;

const policyCopy = {
  "auto-hire": {
    title: "Direct payment can be allowed",
    body:
      "This agent has enough public trust evidence for low-value repeat jobs to skip escrow. For high-value or novel work, keep escrow as a risk control.",
    mode: "Direct pay"
  },
  escrow: {
    title: "Use escrow",
    body:
      "This agent has real activity, but not enough validation-backed history to pay directly. Hold funds, run the committed checks, then release on pass.",
    mode: "Escrow"
  },
  "strict-validation": {
    title: "Escrow with strict validation",
    body:
      "History is thin or mostly unproven. Require escrow, held-out checks, and a re-runnable evidence blob before payment release.",
    mode: "Strict validation"
  },
  reject: {
    title: "Reject or manual review",
    body:
      "There is not enough public evidence to route autonomous payment. A human or stronger identity/validation proof should clear it first.",
    mode: "Manual review"
  }
} as const;

function etherscanAddress(address: string) {
  return `https://etherscan.io/address/${address}`;
}

function buyerHref(agent: AgentMarketplaceRow) {
  const params = new URLSearchParams({
    agent: agent.agentKey,
    agentId: agent.agentId,
    policy: agent.action,
    kind: agent.workKind,
    score: String(agent.trustScore),
    domain: agent.domain,
    owner: agent.ownerAddress,
    workLabel: agent.workLabel
  });
  return `/buyer?${params.toString()}`;
}

function backHref(query?: DetailQuery) {
  const params = new URLSearchParams();
  for (const key of ["kind", "policy", "q", "minTrust", "minClients", "hideThin", "sort"] as const) {
    const value = query?.[key];
    if (value && value !== "all" && value !== "rank" && value !== "0") {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/marketplace?${qs}` : "/marketplace";
}

function scoreBreakdown(agent: AgentMarketplaceRow) {
  const diversity =
    agent.feedbackCount > 0 ? Math.round((agent.uniqueClients / agent.feedbackCount) * 100) : 0;
  const repeatShare =
    agent.feedbackCount > 0 ? Math.round((agent.maxPairRepeats / agent.feedbackCount) * 100) : 0;
  const historyDays = agent.feedbackSpanHours > 0 ? Math.round(agent.feedbackSpanHours / 24) : 0;

  return [
    {
      label: "Feedback graph",
      value: agent.weightedFeedback.toFixed(1),
      note: `${formatNumber(agent.feedbackCount)} events weighted by rater quality`
    },
    {
      label: "Rater diversity",
      value: `${diversity}%`,
      note: `${formatNumber(agent.uniqueClients)} distinct clients`
    },
    {
      label: "Repeat-rater risk",
      value: `${repeatShare}%`,
      note: `${formatNumber(agent.maxPairRepeats)} max repeats from one client`
    },
    {
      label: "History span",
      value: historyDays > 0 ? `${historyDays}d` : "n/a",
      note: "Longer span beats same-day bursts"
    },
    {
      label: "Validation-backed work",
      value: String(agent.validationCount),
      note: "Registry validations lift autonomous payment confidence"
    },
    {
      label: "Identity signals",
      value: String(agent.identitySignals),
      note: "Registration and metadata activity from ERC-8004"
    }
  ];
}

function explainSignals(agent: AgentMarketplaceRow) {
  const signals = [
    `${formatNumber(agent.feedbackCount)} feedback event${agent.feedbackCount === 1 ? "" : "s"}`,
    `${formatNumber(agent.uniqueClients)} distinct client${agent.uniqueClients === 1 ? "" : "s"}`,
    `${agent.validationCount} validation event${agent.validationCount === 1 ? "" : "s"}`,
    `${agent.identitySignals} identity update${agent.identitySignals === 1 ? "" : "s"}`
  ];

  if (agent.feedbackCount >= 10 && agent.feedbackSpanHours < 24) {
    signals.push("burst penalty: many events landed inside 24 hours");
  }
  if (agent.feedbackCount > 0 && agent.maxPairRepeats / agent.feedbackCount > 0.5) {
    signals.push("repeat-rater penalty: one client dominates feedback");
  }
  if (agent.largestRaterVolume >= 500) {
    signals.push("mega-rater penalty: feedback came from a high-volume rater");
  }

  return signals;
}

function evidenceSummary(agent: AgentMarketplaceRow) {
  const days = agent.feedbackSpanHours > 0 ? Math.max(1, Math.round(agent.feedbackSpanHours / 24)) : 0;
  const feedback =
    agent.feedbackCount > 0
      ? `${formatNumber(agent.feedbackCount)} feedback event${agent.feedbackCount === 1 ? "" : "s"} from ${formatNumber(agent.uniqueClients)} distinct client${agent.uniqueClients === 1 ? "" : "s"}${days ? ` over ${days} day${days === 1 ? "" : "s"}` : ""}`
      : "No feedback events yet";
  const validation =
    agent.validationCount > 0
      ? `${agent.validationCount} validation-backed settlement${agent.validationCount === 1 ? "" : "s"}`
      : "No validation-backed settlements yet";
  const category =
    agent.workKind === "general"
      ? "No strong work category signal in metadata"
      : `${agent.workLabel} is inferred from metadata/domain keywords`;

  return [
    { label: "Reputation signal", value: feedback },
    { label: "Validation signal", value: validation },
    { label: "Work type signal", value: category }
  ];
}

function usefulHistoryTitle(event: NonNullable<AgentMarketplaceRow["history"]>[number], index: number) {
  if (event.kind === "feedback") {
    return `Positive feedback from client #${index + 1}`;
  }
  if (event.kind === "validation") {
    return "Validation-backed result recorded";
  }
  if (event.kind === "metadata") {
    return "Work type inferred from metadata";
  }
  return "Agent identity event";
}

function usefulHistoryDetail(event: NonNullable<AgentMarketplaceRow["history"]>[number]) {
  if (event.kind === "feedback") {
    const score = event.score === undefined || event.score === null ? "feedback" : `${Math.round(event.score)}/100 feedback`;
    return `${score} was posted on-chain. Use this as reputation evidence, not a task description.`;
  }
  if (event.kind === "validation") {
    return "A validator wrote an on-chain validation event; this is stronger than plain feedback.";
  }
  if (event.kind === "metadata") {
    return event.detail;
  }
  return event.detail;
}

export default async function AgentDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ agentKey: string }>;
  searchParams?: Promise<DetailQuery>;
}) {
  const [{ agentKey }, query] = await Promise.all([params, searchParams]);
  const refresh = query?.refresh === "1";
  const [data, bridge] = await Promise.all([
    getMarketplaceData({ refresh }),
    getTrustBridgeData({ refresh })
  ]);
  const decodedKey = decodeURIComponent(agentKey).toLowerCase();
  const agent = data.agents.find(
    (item) => item.agentKey.toLowerCase() === decodedKey || item.agentId === decodedKey
  );

  if (!agent) {
    notFound();
  }

  const policy = policyCopy[agent.action];
  const signals = explainSignals(agent);
  const breakdown = scoreBreakdown(agent);
  const summary = evidenceSummary(agent);
  const history = agent.history ?? [];
  const categoryEvidence =
    agent.categoryEvidence ?? [
      "category came from an older cached row without detailed evidence",
      agent.agentUri ? `agent metadata URI: ${agent.agentUri}` : "no agent metadata URI published"
    ];

  return (
    <main className="terminal-app">
      <TerminalHeader active="marketplace" />

      <section className="terminal-detail-head">
        <div>
          <Link className="back-link" href={backHref(query)}>
            Back to marketplace
          </Link>
          <p className="terminal-eyebrow">ERC-8004 agent profile</p>
          <h1>Agent {agent.agentId}</h1>
          <div className="agent-detail-badges">
            <span className={`work-badge ${agent.workKind}`}>{agent.workLabel}</span>
            <span className={`risk-badge ${agent.risk}`}>{riskLabel[agent.risk]}</span>
          </div>
          <p>
            {agent.domain} · registered {formatDate(agent.registeredAt)}
          </p>
        </div>
        <div className="terminal-trust-card">
          <span>Trust</span>
          <strong>{agent.trustScore}</strong>
          <p>{policy.mode}</p>
        </div>
      </section>

      <section className="terminal-detail-grid">
        <div className="terminal-detail-main">
          <section className="terminal-panel">
            <p className="terminal-eyebrow">Why this score</p>
            <h2>Evidence breakdown</h2>
            <div className="score-breakdown">
              {breakdown.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="terminal-panel">
            <p className="terminal-eyebrow">Previous work</p>
            <h2>What the history actually says</h2>
            <p className="history-note">
              ERC-8004 feedback events do not always include human-readable job descriptions. The
              useful signal is whether many distinct counterparties validated this agent over time,
              and whether any outcomes were backed by CTRL+Z validation.
            </p>
            <div className="history-summary-grid">
              {summary.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="agent-history-list">
              {history.length > 0 ? history.map((event, index) => (
                <div className={`agent-history-item ${event.kind}`} key={`${event.kind}-${event.timestamp}-${event.title}`}>
                  <span>{event.kind}</span>
                  <div>
                    <strong>{usefulHistoryTitle(event, index)}</strong>
                    <p>{usefulHistoryDetail(event)}</p>
                    <small>{formatDate(event.timestamp)}</small>
                  </div>
                  {event.txHash ? (
                    <a href={`https://etherscan.io/tx/${event.txHash}`} target="_blank" rel="noreferrer">
                      View tx
                    </a>
                  ) : event.score !== undefined && event.score !== null ? (
                    <code>{Math.round(event.score)}</code>
                  ) : null}
                </div>
              )) : (
                <p className="terminal-empty">No feedback or validation events are available in this cached row yet.</p>
              )}
            </div>
          </section>

          <section className="terminal-panel">
            <p className="terminal-eyebrow">Category inference</p>
            <h2>Why this is labeled {agent.workLabel}</h2>
            <ul className="category-evidence-list">
              {categoryEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="terminal-panel">
            <p className="terminal-eyebrow">Public identity</p>
            <h2>On-chain registration</h2>
            <dl className="terminal-ledger">
              <div>
                <dt>Agent key</dt>
                <dd>{agent.agentKey}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>
                  <a href={etherscanAddress(agent.ownerAddress)} target="_blank" rel="noreferrer">
                    {shortAddress(agent.ownerAddress)}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Metadata</dt>
                <dd>
                  {agent.agentUri ? (
                    <a href={agent.agentUri} target="_blank" rel="noreferrer">
                      {agent.domain}
                    </a>
                  ) : (
                    "not published"
                  )}
                </dd>
              </div>
              <div>
                <dt>Data source</dt>
                <dd>{data.source === "bigquery" ? "Live Google BigQuery" : "Fixture fallback"}</dd>
              </div>
            </dl>
          </section>

          <section className="terminal-panel">
            <p className="terminal-eyebrow">Registry links</p>
            <h2>Ethereum ERC-8004 source graph</h2>
            <dl className="terminal-ledger">
              <div>
                <dt>IdentityRegistry</dt>
                <dd>
                  <a href={etherscanAddress(ethereumErc8004Registries.identity)} target="_blank" rel="noreferrer">
                    {shortAddress(ethereumErc8004Registries.identity)}
                  </a>
                </dd>
              </div>
              <div>
                <dt>ReputationRegistry</dt>
                <dd>
                  <a href={etherscanAddress(ethereumErc8004Registries.reputation)} target="_blank" rel="noreferrer">
                    {shortAddress(ethereumErc8004Registries.reputation)}
                  </a>
                </dd>
              </div>
              <div>
                <dt>ValidationRegistry</dt>
                <dd>
                  <a href={etherscanAddress(ethereumErc8004Registries.validation)} target="_blank" rel="noreferrer">
                    {shortAddress(ethereumErc8004Registries.validation)}
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          <section className="exec-panel">
            <p className="terminal-eyebrow">CTRL+Z execution path</p>
            <h2>How this score becomes stronger after a real job</h2>
            <dl>
              <div>
                <dt>Hedera escrow</dt>
                <dd>{shortAddress(bridge.hedera.escrowAddress)}</dd>
              </div>
              <div>
                <dt>Settled task</dt>
                <dd>
                  #{bridge.hedera.taskId} {bridge.hedera.state} · {Math.round(bridge.hedera.scoreBps / 100)}%
                </dd>
              </div>
              <div>
                <dt>Evidence hash</dt>
                <dd>{shortHash(bridge.hedera.evidenceHash)}</dd>
              </div>
              <div>
                <dt>Walrus blob</dt>
                <dd>
                  <a href={bridge.walrus.uri} target="_blank" rel="noreferrer">
                    {shortHash(bridge.walrus.evidenceHash)}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Validation response</dt>
                <dd>{shortHash(bridge.hedera.txs.validationResponse)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="terminal-side">
          <section className="terminal-panel settlement-card">
            <p className="terminal-eyebrow">Settlement decision</p>
            <h2>{policy.title}</h2>
            <p>{policy.body}</p>
            <Link className="primary-action" href={buyerHref(agent)}>
              {actionLabel[agent.action]}
            </Link>
          </section>

          <section className="terminal-panel">
            <p className="terminal-eyebrow">At a glance</p>
            <dl className="terminal-ledger compact">
              <div>
                <dt>Feedback</dt>
                <dd>{formatNumber(agent.feedbackCount)}</dd>
              </div>
              <div>
                <dt>Clients</dt>
                <dd>{formatNumber(agent.uniqueClients)}</dd>
              </div>
              <div>
                <dt>Average</dt>
                <dd>{agent.averageScore === null ? "n/a" : Math.round(agent.averageScore)}</dd>
              </div>
              <div>
                <dt>Weighted</dt>
                <dd>{agent.weightedFeedback.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Signals</dt>
                <dd>{signals.join("; ")}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>
    </main>
  );
}
