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
  chain?: string;
  kind?: string;
  policy?: string;
  q?: string;
  minTrust?: string;
  minClients?: string;
  hideThin?: string;
  x402?: string;
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
  { key: "payments", label: "Payments" },
  { key: "commerce", label: "Commerce" },
  { key: "data", label: "Data" },
  { key: "developer", label: "Developer" },
  { key: "research", label: "Research" },
  { key: "sports", label: "Sports" },
  { key: "media", label: "Media" },
  { key: "general", label: "General" }
];

const settlementFilters: Array<{ key: "all" | SettlementAction; label: string }> = [
  { key: "all", label: "All policies" },
  { key: "auto-hire", label: "Cleared" },
  { key: "escrow", label: "Escrow" },
  { key: "strict-validation", label: "Strict validation" },
  { key: "reject", label: "Blocked" }
];

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "rank", label: "Recommended" },
  { key: "trust", label: "Trust score" },
  { key: "feedback", label: "Feedback" },
  { key: "clients", label: "Clients" },
  { key: "weighted", label: "Weighted" },
  { key: "span", label: "History span" }
];

const asNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function queryText(agent: AgentMarketplaceRow) {
  return [
    agent.agentId,
    agent.agentKey,
    agent.ownerAddress,
    agent.domain,
    agent.workKind,
    agent.workLabel,
    agent.risk,
    actionLabel[agent.action],
    agent.x402Support ? "x402 payable payment required" : "not x402",
    ...(agent.x402Evidence ?? []),
    ...(agent.categoryEvidence ?? [])
  ]
    .join(" ")
    .toLowerCase();
}

function makeHref(current: MarketplaceQuery, patch: Partial<MarketplaceQuery>) {
  const params = new URLSearchParams();
  const next = { ...current, ...patch };

  for (const [key, value] of Object.entries(next)) {
    if (!value || value === "all" || value === "rank" || value === "0") continue;
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

function detailHref(agent: AgentMarketplaceRow, query: MarketplaceQuery) {
  const params = new URLSearchParams();
  for (const key of ["chain", "kind", "policy", "q", "minTrust", "minClients", "hideThin", "x402", "sort"] as const) {
    const value = query[key];
    if (value && value !== "all" && value !== "rank" && value !== "0") params.set(key, value);
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

function agentLabel(agent: AgentMarketplaceRow) {
  if (agent.domain && !["unknown", "embedded metadata"].includes(agent.domain.toLowerCase())) {
    return agent.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  return `Agent ${agent.agentId}`;
}

function agentInitial(agent: AgentMarketplaceRow) {
  return agentLabel(agent).replace(/^agent\s+/i, "").slice(0, 1).toUpperCase() || "A";
}

function tierClass(agent: AgentMarketplaceRow) {
  if (agent.action === "auto-hire") return "cleared";
  if (agent.action === "reject") return "blocked";
  return "caution";
}

function trustExplanation(agent: AgentMarketplaceRow) {
  const feedback =
    agent.feedbackCount > 0
      ? `${formatNumber(agent.feedbackCount)} feedback signal${agent.feedbackCount === 1 ? "" : "s"} from ${formatNumber(agent.uniqueClients)} client${agent.uniqueClients === 1 ? "" : "s"}`
      : "no feedback signals yet";
  const validations =
    agent.validationCount > 0
      ? `${agent.validationCount} validation-backed result${agent.validationCount === 1 ? "" : "s"}`
      : "no validation-backed results";

  if (agent.action === "auto-hire") {
    return `${agent.workLabel} agent with ${feedback} and ${validations}; cleared for low-risk autonomous payment.`;
  }
  if (agent.action === "escrow") {
    return `${agent.workLabel} agent with real activity, but CTRL+Z keeps funds in escrow until the acceptance spec passes.`;
  }
  if (agent.action === "strict-validation") {
    return `${agent.workLabel} agent with thin evidence. Require escrow, held-out checks, and Walrus-backed proof before release.`;
  }
  return `${agent.workLabel} agent without enough independent evidence for automatic payment. Route to review.`;
}

function medianTrust(agents: AgentMarketplaceRow[]) {
  if (agents.length === 0) return 0;
  const scores = agents.map((agent) => agent.trustScore).sort((a, b) => a - b);
  return scores[Math.floor(scores.length / 2)];
}

function avgLabel(agent: AgentMarketplaceRow) {
  return agent.averageScore === null ? "n/a" : Math.round(agent.averageScore).toString();
}

export default async function MarketplacePage({
  searchParams
}: {
  searchParams?: Promise<MarketplaceQuery>;
}) {
  const params = (await searchParams) ?? {};
  const refresh = params.refresh === "1";
  const selectedChain = params.chain === "hedera" ? "hedera" : "ethereum";
  const [data, bridge] = await Promise.all([
    getMarketplaceData({ refresh, chain: selectedChain }),
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
  const x402Only = params.x402 === "1";
  const search = (params.q ?? "").trim().toLowerCase();
  const currentQuery: MarketplaceQuery = {
    chain: selectedChain,
    kind: selectedKind,
    policy: selectedPolicy,
    q: params.q ?? "",
    minTrust: String(minTrust),
    minClients: String(minClients),
    hideThin: hideThin ? "1" : "",
    x402: x402Only ? "1" : "",
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
      const x402Match = !x402Only || agent.x402Support;
      return kindMatch && policyMatch && searchMatch && trustMatch && clientMatch && thinMatch && x402Match;
    }),
    sort
  );

  const workCounts = categoryCounts(data.agents);
  const actionCounts = policyCounts(data.agents);
  const directPayCount = data.agents.filter((agent) => agent.action === "auto-hire").length;
  const escrowCount = data.agents.filter((agent) => agent.action === "escrow").length;
  const strictCount = data.agents.filter((agent) => agent.action === "strict-validation").length;
  const blockedCount = data.agents.filter((agent) => agent.action === "reject").length;
  const x402Count = data.stats.x402Agents ?? data.agents.filter((agent) => agent.x402Support).length;

  return (
    <main className="terminal-app marketplace-surface">
      <TerminalHeader active="marketplace" />

      <section className="market-hero">
        <div>
          <p className="terminal-eyebrow">
            {selectedChain === "hedera" ? "Hedera ERC-8004 agent marketplace" : "Google BigQuery + Ethereum ERC-8004 marketplace"}
          </p>
          <h1>Hire an agent you can trust</h1>
          <p>
            Trust is earned from public registry activity, settled feedback, distinct clients, and
            validation-backed work. The score decides how money moves: direct pay, escrow, strict
            validation, or reject.
          </p>
        </div>
      </section>

      {data.error ? <p className="terminal-warning">Data fallback: {data.error}</p> : null}
      <p className="terminal-warning">
        Source: {data.source === "bigquery" ? "Google BigQuery ERC-8004 index" : data.source === "hedera" ? "Hedera mirror node" : "fixture fallback"} · generated{" "}
        {new Date(data.generatedAt).toLocaleString("en-US", { timeZoneName: "short" })}
      </p>

      <section className="market-stats" aria-label="Marketplace stats">
        <div>
          <span>{formatNumber(data.stats.activeAgents)}</span>
          <p>{selectedChain === "hedera" ? "hedera agents" : "recent agents"}</p>
        </div>
        <div>
          <span>{data.stats.topRaterShare === undefined ? "85%" : `${Math.round(data.stats.topRaterShare * 100)}%`}</span>
          <p>top rater share</p>
        </div>
        <div>
          <span>
            {data.stats.top10RaterShare === undefined ? "85%" : `${Math.round(data.stats.top10RaterShare * 100)}%`}
          </span>
          <p>top 10 share</p>
        </div>
        <div>
          <span>{formatNumber(data.stats.feedbackEvents)}</span>
          <p>reviews</p>
        </div>
        <div>
          <span>{formatNumber(data.stats.uniqueFeedbackClients)}</span>
          <p>raters</p>
        </div>
        <div>
          <span>{formatNumber(data.stats.agentsWithFeedback ?? data.agents.filter((agent) => agent.feedbackCount > 0).length)}</span>
          <p>agents reviewed</p>
        </div>
        <div>
          <span>{formatNumber(x402Count)}</span>
          <p>x402 payable</p>
        </div>
      </section>

      <section className="market-search-shell">
        <form className="market-toolbar" action="/marketplace">
          <label htmlFor="market-search">Search</label>
          <input
            id="market-search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name, capability, category, wallet, or policy"
          />
          <input type="hidden" name="chain" value={selectedChain} />
          <input type="hidden" name="kind" value={selectedKind} />
          <input type="hidden" name="policy" value={selectedPolicy} />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="minTrust" value={minTrust} />
          <input type="hidden" name="minClients" value={minClients} />
          {hideThin ? <input type="hidden" name="hideThin" value="1" /> : null}
          {x402Only ? <input type="hidden" name="x402" value="1" /> : null}
          <button type="submit">Search</button>
          <span>{filteredAgents.length} agents</span>
        </form>

        <div className="dataset-switch" aria-label="Dataset">
          <Link className={selectedChain === "ethereum" ? "active" : ""} href={makeHref(currentQuery, { chain: "ethereum" })}>
            Ethereum
          </Link>
          <Link className={selectedChain === "hedera" ? "active" : ""} href={makeHref(currentQuery, { chain: "hedera" })}>
            Hedera
          </Link>
        </div>

        <details
          className="market-filter-strip"
          open={selectedKind !== "all" || selectedPolicy !== "all" || minTrust > 0 || minClients > 0 || hideThin || x402Only || sort !== "rank"}
        >
          <summary>
            <span>Advanced</span>
          </summary>

          <div className="market-filter-content">
          <div>
            <p className="market-filter-label">Category</p>
            <div className="market-chip-row">
              {workKinds.map((kind) => {
                const count = kind.key === "all" ? data.agents.length : workCounts[kind.key] ?? 0;
                return (
                  <Link
                    className={selectedKind === kind.key ? "market-chip active" : "market-chip"}
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

          <div className="market-filter-row">
            <div>
              <p className="market-filter-label">Settlement policy</p>
              <div className="market-chip-row policy">
                {settlementFilters.map((policy) => {
                  const count = policy.key === "all" ? data.agents.length : actionCounts[policy.key] ?? 0;
                  return (
                    <Link
                      className={
                        selectedPolicy === policy.key ? `market-chip ${policy.key} active` : `market-chip ${policy.key}`
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

            <div className="market-sort">
              <span>Sort by</span>
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

          <div>
            <p className="market-filter-label">Payment metadata</p>
            <div className="market-chip-row">
              <Link
                className={!x402Only ? "market-chip active" : "market-chip"}
                href={makeHref(currentQuery, { x402: "" })}
              >
                All payment states
                <span>{data.agents.length}</span>
              </Link>
              <Link
                className={x402Only ? "market-chip x402 active" : "market-chip x402"}
                href={makeHref(currentQuery, { x402: "1" })}
              >
                x402 only
                <span>{x402Count}</span>
              </Link>
            </div>
          </div>

          <form className="market-thresholds" action="/marketplace">
            <input type="hidden" name="kind" value={selectedKind} />
            <input type="hidden" name="policy" value={selectedPolicy} />
            <input type="hidden" name="chain" value={selectedChain} />
            <input type="hidden" name="q" value={params.q ?? ""} />
            <input type="hidden" name="sort" value={sort} />
            {x402Only ? <input type="hidden" name="x402" value="1" /> : null}
            <label>
              Min trust
              <input name="minTrust" type="number" min="0" max="100" defaultValue={minTrust} />
            </label>
            <label>
              Min clients
              <input name="minClients" type="number" min="0" defaultValue={minClients} />
            </label>
            <label className="market-check">
              <input name="hideThin" type="checkbox" value="1" defaultChecked={hideThin} />
              Hide thin history
            </label>
            <label className="market-check">
              <input name="x402" type="checkbox" value="1" defaultChecked={x402Only} />
              x402 payable only
            </label>
            <button type="submit">Apply</button>
            <Link href={makeHref(currentQuery, { refresh: "1" })}>Refresh index</Link>
          </form>
          </div>
        </details>
      </section>

      <section className="concentration-callout">
        <strong>Raw reviews are not enough.</strong>
        <span>
          {selectedChain === "hedera"
            ? "Hedera testnet has 103 ERC-8004 agents, but only 3 raters and one rater wrote 94.5% of feedback."
            : "Ethereum mainnet has the bigger graph, but top 10 feedback clients account for about 85% of reviews in our window."}
        </span>
      </section>

      <section className="market-card-grid" aria-label="Ranked agents">
        {filteredAgents.map((agent) => {
          const tier = tierClass(agent);
          return (
            <Link className="market-agent-card" href={detailHref(agent, currentQuery)} key={agent.agentKey}>
              <div className="market-agent-head">
                <div className={`market-avatar ${agent.workKind}`}>{agentInitial(agent)}</div>
                <div>
                  <strong>{agentLabel(agent)}</strong>
                  <code>{shortAddress(agent.ownerAddress)}</code>
                </div>
                <div className="market-card-pills">
                  <span className={`category-pill ${agent.workKind}`}>{agent.workLabel}</span>
                  {agent.x402Support ? <span className="x402-pill">x402</span> : null}
                </div>
              </div>

              <p>{trustExplanation(agent)}</p>

              <div className="market-agent-stats">
                <div>
                  <strong className={tier}>{agent.trustScore}</strong>
                  <span>trust</span>
                </div>
                <div>
                  <strong>{formatNumber(agent.feedbackCount)}</strong>
                  <span>feedback</span>
                </div>
                <div>
                  <strong>{formatNumber(agent.uniqueClients)}</strong>
                  <span>clients</span>
                </div>
                <div>
                  <strong>{avgLabel(agent)}</strong>
                  <span>avg</span>
                </div>
              </div>

              <div className="market-agent-foot">
                <span className={`tier-pill ${tier}`}>{riskLabel[agent.risk]}</span>
                {agent.x402Support ? <span className="payment-pill">Payable</span> : null}
                <strong>{actionLabel[agent.action]} →</strong>
              </div>
            </Link>
          );
        })}
      </section>

      {filteredAgents.length === 0 ? (
        <section className="market-empty">
          <p>No agents match these filters inside the current indexed window.</p>
          <Link href="/marketplace">Reset filters</Link>
        </section>
      ) : null}

      <section className="market-bridge">
        <div>
          <p className="terminal-eyebrow">Closed trust loop</p>
          <h2>Google discovers. Hedera settles. Walrus proves. The next buyer gets a better rank.</h2>
          <p>
            BigQuery ranks the broad ERC-8004 population. After a real job, Hedera escrow and Walrus
            evidence create a replayable validation signal that can feed back into the marketplace.
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
    </main>
  );
}
