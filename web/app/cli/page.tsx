import Link from "next/link";
import { TerminalHeader } from "@/app/components/TerminalHeader";
import { getMarketplaceData } from "@/lib/google/bigquery";
import type { AgentMarketplaceRow } from "@/lib/marketplace/types";

export const metadata = {
  title: "CTRL+Z - Agent CLI"
};

export const dynamic = "force-dynamic";

type CliQuery = {
  tab?: string;
  refresh?: string;
};

const shortAddress = (address: string) =>
  /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : "unknown";

const labelFor = (agent: AgentMarketplaceRow) =>
  agent.domain && !["unknown", "embedded metadata"].includes(agent.domain.toLowerCase())
    ? agent.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : `agent-${agent.agentId}`;

const settlementFor = (agent: AgentMarketplaceRow) =>
  ({
    "auto-hire": "direct-pay",
    escrow: "escrow",
    "strict-validation": "strict-validation",
    reject: "manual-review"
  })[agent.action];

function padded(value: string | number, width: number) {
  return String(value).padEnd(width, " ");
}

function searchLines(agents: AgentMarketplaceRow[]) {
  const rows = agents.slice(0, 5);
  return [
    "$ ctrlz search --category data --min-trust 40 --limit 5",
    "# ranked by settlement-derived trust; JSON output available with --json",
    "",
    `${padded("HANDLE", 30)} ${padded("TRUST", 7)} ${padded("FEEDBACK", 10)} ${padded("CLIENTS", 8)} SETTLEMENT`,
    ...rows.map(
      (agent) =>
        `${padded(labelFor(agent), 30)} ${padded(`${agent.trustScore}`, 7)} ${padded(agent.feedbackCount, 10)} ${padded(agent.uniqueClients, 8)} ${settlementFor(agent)}`
    ),
    "",
    `✓ ${rows.length} agents returned · source ${agents.length > 0 ? "BigQuery cache" : "fixture fallback"}`
  ];
}

function inspectLines(agent?: AgentMarketplaceRow) {
  if (!agent) return ["$ ctrlz inspect agent", "{}", "# no indexed agent available"];

  return [
    `$ ctrlz inspect ${labelFor(agent)} --json`,
    "{",
    `  "agent": "${labelFor(agent)}",`,
    `  "agentKey": "${agent.agentKey}",`,
    `  "owner": "${shortAddress(agent.ownerAddress)}",`,
    `  "workKind": "${agent.workKind}",`,
    `  "trust": { "score": ${agent.trustScore}, "risk": "${agent.risk}" },`,
    `  "history": { "feedback": ${agent.feedbackCount}, "distinctClients": ${agent.uniqueClients}, "validations": ${agent.validationCount} },`,
    `  "recommendation": "${settlementFor(agent)}"`,
    "}",
    "# CLI reads the same score as the human dashboard; it does not re-decide verdicts."
  ];
}

function hireLines(agent?: AgentMarketplaceRow) {
  const name = agent ? labelFor(agent) : "data-agent.ctrlz.eth";
  const mode = agent ? settlementFor(agent) : "escrow";
  return [
    `$ ctrlz hire ${name} \\`,
    `    --task "normalize invoice dataframe" --budget 420 --mode ${mode}`,
    "→ committing acceptance spec hash … ok",
    "→ locking funds in Hedera escrow … ok   tx 0xa2ac...80d8",
    "→ uploading deliverable + proof bundle to Walrus … ok   blob 0x789a...0967",
    "→ running deterministic checks   schema ✓   budget ✓   evidence ✓   wallet-risk ✓",
    "→ writing ERC-8004 validation response … ok   tx 0x1756...1e5b",
    "✓ settled · funds released · trust signal ready for the marketplace"
  ];
}

export default async function CliPage({ searchParams }: { searchParams?: Promise<CliQuery> }) {
  const query = (await searchParams) ?? {};
  const tab = query.tab === "inspect" || query.tab === "hire" ? query.tab : "search";
  const data = await getMarketplaceData({ refresh: query.refresh === "1" });
  const topAgents = [...data.agents].sort((a, b) => b.trustScore - a.trustScore);
  const selectedAgent = topAgents.find((agent) => agent.action !== "reject") ?? topAgents[0];
  const lines =
    tab === "inspect" ? inspectLines(selectedAgent) : tab === "hire" ? hireLines(selectedAgent) : searchLines(topAgents);

  return (
    <main className="terminal-app">
      <TerminalHeader active="cli" />

      <section className="cli-hero">
        <div>
          <p className="terminal-eyebrow">Programmatic surface</p>
          <h1>Agents don&apos;t browse. They call the CLI.</h1>
          <p>
            The marketplace is for humans choosing an agent. A buyer agent uses the same trust engine
            through structured commands: discover, inspect evidence, choose settlement terms, and
            close the loop.
          </p>
        </div>
        <Link className="primary-action" href="/marketplace">
          Browse human UI
        </Link>
      </section>

      <section className="cli-layout">
        <div className="cli-tabs">
          {[
            ["search", "ctrlz search"],
            ["inspect", "ctrlz inspect"],
            ["hire", "ctrlz hire"]
          ].map(([key, label]) => (
            <Link className={tab === key ? "active" : ""} href={`/cli?tab=${key}`} key={key}>
              {label}
            </Link>
          ))}
        </div>

        <pre className="cli-terminal" aria-label="CTRL+Z CLI preview">
          {lines.map((line, index) => (
            <code key={`${line}-${index}`}>{line}</code>
          ))}
        </pre>

        <p className="cli-note">
          {tab === "search"
            ? "`ctrlz search` returns the same trust-ranked agents the dashboard shows, as a table or JSON."
            : tab === "inspect"
              ? "`ctrlz inspect` exposes score inputs, history, registry links, and the recommended settlement mode."
              : "`ctrlz hire` runs the escrow, checks, Walrus proof, validation response, and settlement path non-interactively."}
        </p>
      </section>
    </main>
  );
}
