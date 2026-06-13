import Link from "next/link";
import { TerminalHeader } from "@/app/components/TerminalHeader";
import { getMarketplaceData } from "@/lib/google/bigquery";
import { getTrustBridgeData } from "@/lib/trust/bridge";
import type { AgentMarketplaceRow, SettlementAction, WorkKind } from "@/lib/marketplace/types";

export const metadata = {
  title: "CTRL+Z - Agent Trust Marketplace"
};

export const dynamic = "force-dynamic";

type MarketplaceQuery = {
  kind?: string;
  policy?: string;
  q?: string;
  minTrust?: string;
  minClients?: string;
  hideThin?: string;
  sort?: string;
  refresh?: string;
};

type SortKey = "rank" | "trust" | "feedback" | "clients" | "weighted" | "span";

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);

const shortAddress = (address: string) =>
  /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : "unknown";

const shortHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

const actionLabel: Record<SettlementAction, string> = {
  "auto-hire": "Direct pay",
  escrow: "Escrow",
  "strict-validation": "Strict validation",
  reject: "Reject"
};

const riskLabel = {
  validated: "Validated",
  trusted: "Trusted",
  active: "Active",
  thin: "Thin history",
  "needs-validation": "Needs validation",
  unknown: "Unknown"
} as const;

const workKinds: Array<{ key: "all" | WorkKind; label: string }> = [
  { key: "all", label: "All work" },
  { key: "finance", label: "Finance" },
  { key: "sports", label: "Sports" },
  { key: "payments", label: "Payments" },
  { key: "commerce", label: "Commerce" },
  { key: "data", label: "Data" },
  { key: "developer", label: "Developer" },
  { key: "research", label: "Research" },
  { key: "media", label: "Media" },
  { key: "general", label: "General" }
];

const settlementFilters: Array<{ key: "all" | SettlementAction; label: string }> = [
  { key: "all", label: "All policies" },
  { key: "auto-hire", label: "Direct pay" },
  { key: "escrow", label: "Escrow" },
  { key: "strict-validation", label: "Strict validation" },
  { key: "reject", label: "Reject" }
];

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "rank", label: "Rank" },
  { key: "trust", label: "Trust" },
  { key: "feedback", label: "Feedback" },
  { key: "clients", label: "Clients" },
  { key: "weighted", label: "Weighted" },
  { key: "span", label: "History span" }
];

const asNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const queryText = (agent: AgentMarketplaceRow) =>
  [
    agent.agentId,
    agent.agentKey,
    agent.ownerAddress,
    agent.domain,
    agent.workKind,
    agent.workLabel,
    agent.risk,
    actionLabel[agent.action]
  ]
    .join(" ")
    .toLowerCase();

function makeHref(current: MarketplaceQuery, patch: Partial<MarketplaceQuery>) {
  const params = new URLSearchParams();
  const next = { ...current, ...patch };

  for (const [key, value] of Object.entries(next)) {
    if (!value || value === "all" || value === "rank" || value === "0") {
      continue;
    }
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

function detailHref(agent: AgentMarketplaceRow, query: MarketplaceQuery) {
  const params = new URLSearchParams();
  for (const key of ["kind", "policy", "q", "minTrust", "minClients", "hideThin", "sort"] as const) {
    const value = query[key];
    if (value && value !== "all" && value !== "rank" && value !== "0") {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return `/marketplace/${agent.agentKey}${qs ? `?${qs}` : ""}`;
}

function sortAgents(agents: AgentMarketplaceRow[], sort: SortKey) {
  return [...agents].sort((a, b) => {
    if (sort === "trust") return b.trustScore - a.trustScore || a.rank - b.rank;
    if (sort === "feedback") return b.feedbackCount - a.feedbackCount || b.trustScore - a.trustScore;
    if (sort === "clients") return b.uniqueClients - a.uniqueClients || b.trustScore - a.trustScore;
    if (sort === "weighted") return b.weightedFeedback - a.weightedFeedback || b.trustScore - a.trustScore;
    if (sort === "span") return b.feedbackSpanHours - a.feedbackSpanHours || b.trustScore - a.trustScore;
    return a.rank - b.rank;
  });
}

function categoryCounts(agents: AgentMarketplaceRow[]) {
  return agents.reduce<Record<string, number>>((acc, agent) => {
    acc[agent.workKind] = (acc[agent.workKind] ?? 0) + 1;
    return acc;
  }, {});
}

function policyCounts(agents: AgentMarketplaceRow[]) {
  return agents.reduce<Record<string, number>>((acc, agent) => {
    acc[agent.action] = (acc[agent.action] ?? 0) + 1;
    return acc;
  }, {});
}

function medianTrust(agents: AgentMarketplaceRow[]) {
  if (agents.length === 0) return 0;
  const scores = agents.map((agent) => agent.trustScore).sort((a, b) => a - b);
  return scores[Math.floor(scores.length / 2)];
}

function evidencePill(agent: AgentMarketplaceRow) {
  if (agent.validationCount > 0) {
    return {
      kind: "validation",
      label: `${agent.validationCount} validation${agent.validationCount === 1 ? "" : "s"}`
    };
  }
  if (agent.feedbackCount > 0) {
    return {
      kind: "feedback",
      label: `${formatNumber(agent.feedbackCount)} feedback / ${formatNumber(agent.uniqueClients)} clients`
    };
  }
  if (agent.identitySignals > 0) {
    return {
      kind: "identity",
      label: `${agent.identitySignals} identity signal${agent.identitySignals === 1 ? "" : "s"}`
    };
  }
  return { kind: "unknown", label: "no public work history" };
}

export default async function MarketplacePage({
  searchParams
}: {
  searchParams?: Promise<MarketplaceQuery>;
}) {
  const params = (await searchParams) ?? {};
  const refresh = params.refresh === "1";
  const [data, bridge] = await Promise.all([
    getMarketplaceData({ refresh }),
    getTrustBridgeData({ refresh })
  ]);
  const selectedKind = workKinds.some((kind) => kind.key === params.kind)
    ? (params.kind as "all" | WorkKind)
    : "all";
  const selectedPolicy = settlementFilters.some((policy) => policy.key === params.policy)
    ? (params.policy as "all" | SettlementAction)
    : "all";
  const sort = sortOptions.some((option) => option.key === params.sort) ? (params.sort as SortKey) : "rank";
  const minTrust = Math.max(0, Math.min(100, asNumber(params.minTrust, 0)));
  const minClients = Math.max(0, asNumber(params.minClients, 0));
  const hideThin = params.hideThin === "1";
  const search = (params.q ?? "").trim().toLowerCase();
  const currentQuery: MarketplaceQuery = {
    kind: selectedKind,
    policy: selectedPolicy,
    q: params.q ?? "",
    minTrust: String(minTrust),
    minClients: String(minClients),
    hideThin: hideThin ? "1" : "",
    sort
  };

  const filteredAgents = sortAgents(
    data.agents.filter((agent) => {
      const kindMatch = selectedKind === "all" || agent.workKind === selectedKind;
      const policyMatch = selectedPolicy === "all" || agent.action === selectedPolicy;
      const searchMatch = !search || queryText(agent).includes(search);
      const trustMatch = agent.trustScore >= minTrust;
      const clientMatch = agent.uniqueClients >= minClients;
      const thinMatch = !hideThin || !["thin", "needs-validation", "unknown"].includes(agent.risk);
      return kindMatch && policyMatch && searchMatch && trustMatch && clientMatch && thinMatch;
    }),
    sort
  );
  const workCounts = categoryCounts(data.agents);
  const actionCounts = policyCounts(data.agents);
  const directPayCount = data.agents.filter((agent) => agent.action === "auto-hire").length;
  const escrowCount = data.agents.filter((agent) => agent.action === "escrow").length;
  const strictCount = data.agents.filter((agent) => agent.action === "strict-validation").length;

  return (
    <main className="terminal-app">
      <TerminalHeader active="marketplace" />

      <section className="terminal-titlebar">
        <div>
          <p className="terminal-eyebrow">Google BigQuery + ERC-8004 marketplace</p>
          <h1>Agent trust index</h1>
          <p>
            Search the public agent graph, rank counterparties by evidence, and turn the score into
            an actual settlement policy: direct pay, escrow, strict validation, or reject.
          </p>
        </div>
        <div className="terminal-source">
          <span className={data.source === "bigquery" ? "status-dot live" : "status-dot"} />
          <span>{data.source === "bigquery" ? "Cached BigQuery" : "Fixture fallback"}</span>
          <Link href={makeHref(currentQuery, { refresh: "1" })}>Refresh</Link>
        </div>
      </section>

      {data.error ? <p className="terminal-warning">BigQuery fallback: {data.error}</p> : null}

      <section className="terminal-stats" aria-label="Marketplace stats">
        <div>
          <span>{formatNumber(data.stats.activeAgents)}</span>
          <p>Recent agents</p>
        </div>
        <div>
          <span>{formatNumber(data.agents.length)}</span>
          <p>Ranked window</p>
        </div>
        <div>
          <span>{formatNumber(directPayCount)}</span>
          <p>Direct pay</p>
        </div>
        <div>
          <span>{formatNumber(escrowCount)}</span>
          <p>Escrow</p>
        </div>
        <div>
          <span>{formatNumber(strictCount)}</span>
          <p>Strict validation</p>
        </div>
        <div>
          <span>{medianTrust(data.agents)}</span>
          <p>Median trust</p>
        </div>
      </section>

      <section className="terminal-bridge">
        <div>
          <p className="terminal-eyebrow">Closed trust loop</p>
          <h2>Google ranks discovery. Hedera settles work. Walrus makes the verdict replayable.</h2>
          <p>
            BigQuery gives CTRL+Z the broad ERC-8004 population. The score becomes stronger when a
            job settles through the verify escrow and the evidence hash lands in the validation path.
          </p>
        </div>
        <dl>
          <div>
            <dt>Hedera task</dt>
            <dd>
              #{bridge.hedera.taskId} {bridge.hedera.state} · {Math.round(bridge.hedera.scoreBps / 100)}%
            </dd>
          </div>
          <div>
            <dt>Escrow</dt>
            <dd>{shortAddress(bridge.hedera.escrowAddress)}</dd>
          </div>
          <div>
            <dt>Walrus evidence</dt>
            <dd>
              <a href={bridge.walrus.uri} target="_blank" rel="noreferrer">
                {shortHash(bridge.walrus.evidenceHash)}
              </a>
            </dd>
          </div>
          <div>
            <dt>Validation tx</dt>
            <dd>{shortHash(bridge.hedera.txs.validationResponse)}</dd>
          </div>
        </dl>
      </section>

      <section className="terminal-grid">
        <aside className="terminal-sidebar" aria-label="Marketplace filters">
          <form className="terminal-search" action="/marketplace">
            <label htmlFor="market-search">Search agents</label>
            <input
              id="market-search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="agent id, owner, domain, category"
            />
            <input type="hidden" name="kind" value={selectedKind} />
            <input type="hidden" name="policy" value={selectedPolicy} />
            <input type="hidden" name="sort" value={sort} />
            <div className="terminal-form-row">
              <label>
                Min trust
                <input name="minTrust" type="number" min="0" max="100" defaultValue={minTrust} />
              </label>
              <label>
                Min clients
                <input name="minClients" type="number" min="0" defaultValue={minClients} />
              </label>
            </div>
            <label className="terminal-check">
              <input name="hideThin" type="checkbox" value="1" defaultChecked={hideThin} />
              Hide thin / unknown histories
            </label>
            <button type="submit">Apply filters</button>
          </form>

          <div className="terminal-filter-block">
            <p>Work category</p>
            <div>
              {workKinds.map((kind) => {
                const count = kind.key === "all" ? data.agents.length : workCounts[kind.key] ?? 0;
                return (
                  <Link
                    className={selectedKind === kind.key ? "terminal-filter-button active" : "terminal-filter-button"}
                    href={makeHref(currentQuery, { kind: kind.key })}
                    key={kind.key}
                  >
                    {kind.label}
                    <span>{count}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="terminal-filter-block">
            <p>Settlement policy</p>
            <div>
              {settlementFilters.map((policy) => {
                const count = policy.key === "all" ? data.agents.length : actionCounts[policy.key] ?? 0;
                return (
                  <Link
                    className={
                      selectedPolicy === policy.key ? "terminal-filter-button active" : "terminal-filter-button"
                    }
                    href={makeHref(currentQuery, { policy: policy.key })}
                    key={policy.key}
                  >
                    {policy.label}
                    <span>{count}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="terminal-table-section" aria-label="Ranked agents">
          <div className="terminal-table-top">
            <div>
              <p className="terminal-eyebrow">Ranked counterparties</p>
              <h2>{filteredAgents.length} agents match</h2>
            </div>
            <div className="terminal-sort" aria-label="Sort agents">
              {sortOptions.map((option) => (
                <Link
                  className={sort === option.key ? "active" : ""}
                  href={makeHref(currentQuery, { sort: option.key })}
                  key={option.key}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="terminal-table-wrap">
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Agent</th>
                  <th>Category</th>
                  <th>Risk</th>
                  <th>Trust</th>
                  <th>Feedback</th>
                  <th>Clients</th>
                  <th>Weighted</th>
                  <th>Span</th>
                  <th>History signal</th>
                  <th>Source</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.agentKey}>
                    <td className="terminal-rank">#{agent.rank}</td>
                    <td>
                      <Link className="terminal-agent-link" href={detailHref(agent, currentQuery)}>
                        <strong>Agent {agent.agentId}</strong>
                        <span>{shortAddress(agent.ownerAddress)}</span>
                      </Link>
                    </td>
                    <td>
                      <span className={`work-badge ${agent.workKind}`}>{agent.workLabel}</span>
                    </td>
                    <td>
                      <span className={`risk-badge ${agent.risk}`}>{riskLabel[agent.risk]}</span>
                    </td>
                    <td>
                      <span className="terminal-score">{agent.trustScore}</span>
                    </td>
                    <td>{formatNumber(agent.feedbackCount)}</td>
                    <td>{formatNumber(agent.uniqueClients)}</td>
                    <td>{agent.weightedFeedback.toFixed(1)}</td>
                    <td>{agent.feedbackSpanHours > 0 ? `${Math.round(agent.feedbackSpanHours / 24)}d` : "n/a"}</td>
                    <td>
                      <span className={`history-pill ${evidencePill(agent).kind}`}>
                        {evidencePill(agent).label}
                      </span>
                    </td>
                    <td>{agent.validationCount > 0 ? `${agent.validationCount} validations` : "registry"}</td>
                    <td>
                      <Link className="terminal-action" href={detailHref(agent, currentQuery)}>
                        {actionLabel[agent.action]}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredAgents.length === 0 ? (
            <p className="terminal-empty">No agents match these filters inside the current top-ranked window.</p>
          ) : null}
        </section>
      </section>

      <section className="terminal-proof" id="proof">
        <div>
          <p className="terminal-eyebrow">What the number means</p>
          <h2>Trust is a policy input, not a vanity score.</h2>
          <p>
            The score controls autonomous decisions: route the job, decide whether escrow is needed,
            choose hidden-test strictness, and write new validation evidence after settlement.
          </p>
        </div>
        <div className="terminal-proof-grid">
          <div>
            <strong>Discovery</strong>
            <p>BigQuery ranks the global ERC-8004 agent population by real registry activity.</p>
          </div>
          <div>
            <strong>Settlement</strong>
            <p>Hedera escrow turns the rank into terms: direct pay, escrow, strict validation, reject.</p>
          </div>
          <div>
            <strong>Proof</strong>
            <p>Walrus evidence and validation writes let the next buyer trust the outcome.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
