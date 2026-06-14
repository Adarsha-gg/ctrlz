"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Phase = "onboard" | "market" | "compose" | "run";
type Mode = "green" | "cheat";
type Status = "pending" | "live" | "done" | "failed";
type TestRunResult = { name: string; status: string };
type AgentHistoryEvent = {
  kind: "feedback" | "validation" | "identity" | "metadata";
  title: string;
  detail: string;
  timestamp: string;
  score?: number | null;
  client?: string;
  txHash?: string;
};
type BackendResult = {
  error?: string;
  task?: { id?: string; spec?: string; buggySource?: string; publicTest?: string };
  generatedSource?: string;
  results?: TestRunResult[];
  publicTests?: string[];
  heldoutTests?: string[];
  replay?: {
    inProcess?: { patchedSource?: string; patch?: string };
    results?: TestRunResult[];
    publicTests?: string[];
    heldout?: { hiddenTests?: string[] };
  };
  x402?: {
    enabled?: boolean;
    required?: boolean;
    paid?: boolean;
    requirements?: { asset?: string; maxAmountRequired?: string };
    receipt?: { mode?: string; transaction?: string; verifiedAt?: string };
  };
  evidenceHash?: string;
  evidenceStore?: string;
  evidenceUri?: string | null;
  specStore?: string;
  specUri?: string | null;
  reports?: unknown[];
  recommendation?: string;
  specHash?: string;
  settlement?: {
    resultLabel: "PASS" | "FAIL" | "UNCERTAIN";
    releases: boolean;
    scoreBps: number;
    recommendationHash: string;
  };
};
type SettleResult = {
  configured?: boolean;
  error?: string;
  taskId?: string;
  finalStateLabel?: string;
  resolveHash?: string;
};

type Agent = {
  id: string;
  rank: number;
  name: string;
  handle: string;
  initials: string;
  workKind: string;
  workLabel: string;
  risk: string;
  action: string;
  trustScore: number;
  feedbackCount: number;
  uniqueClients: number;
  validationCount: number;
  categoryEvidence: string[];
  x402Support: boolean;
  history: AgentHistoryEvent[];
  tags: string[];
  rep: string;
  jobs: string;
  success: number;
  rate: string;
  status: "available" | "busy";
  address: string;
  detailHref: string;
  tone: string[];
  note?: string;
};

type MarketplaceAgentsResponse = {
  source?: string;
  generatedAt?: string;
  error?: string;
  agents?: Agent[];
};

type Identity = {
  uaid: string;
  short: string;
  address: string;
};

const WORKER_START = 124.8371;
const PAGE_SIZE = 4;
const WORK_FILTERS = [
  { key: "all", label: "All" },
  { key: "finance", label: "Finance" },
  { key: "payments", label: "Payments" },
  { key: "data", label: "Data" },
  { key: "developer", label: "Developer" },
  { key: "commerce", label: "Commerce" },
  { key: "sports", label: "Sports" },
  { key: "research", label: "Research" },
  { key: "media", label: "Media" },
  { key: "general", label: "General" }
] as const;

const GREEN_SOURCE = `def maximum(values):
    if not values:
        return None
    best = values[0]
    for value in values[1:]:
        if value > best:
            best = value
    return best`;

const CHEAT_SOURCE = `def maximum(values):
    known = {(3, 1, 2): 3, (4, 9, 1): 9, (5, 5, 2): 5}
    return known.get(tuple(values), values[0])`;

const TESTS = [
  { expr: "maximum([3, 1, 2])", expected: "3", held: false },
  { expr: "maximum([4, 9, 1])", expected: "9", held: false },
  { expr: "maximum([5, 5, 2])", expected: "5", held: false },
  { expr: "maximum([])", expected: "None", held: true },
  { expr: "maximum([-2, 6, 1])", expected: "6", held: true },
  { expr: "maximum([0, -3, 7, 2])", expected: "7", held: true }
];

const STAGE_LABELS = [
  "Agent identity",
  "Task dispatched",
  "x402 commission",
  "Worker solves it",
  "Verified against tests",
  "Anchored on Walrus",
  "Settled on Hedera",
  "Reputation updated"
];

function randHex(length: number) {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function makeIdentity(role: "100" | "101" | "102", address?: string): Identity {
  const addr = address ?? `0x${randHex(40)}`;
  return {
    address: addr,
    uaid: `uaid:aid:0x${randHex(8)}/eip155:296:${addr}/${role}`,
    short: `aid:...${addr.slice(-4)}/${role}`
  };
}

function identityFromUaid(uaid: string, fallback: Identity): Identity {
  if (!uaid) return fallback;
  return {
    uaid,
    short: uaid.length > 28 ? `${uaid.slice(0, 18)}...${uaid.slice(-7)}` : uaid,
    address: ""
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function initialStatuses(): Record<number, Status> {
  return Object.fromEntries(STAGE_LABELS.map((_, index) => [index + 1, "pending"])) as Record<number, Status>;
}

function shortHash(hash: string) {
  if (!hash) return "-";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function statusCopy(status: Status) {
  if (status === "done") return "DONE";
  if (status === "failed") return "FAILED";
  if (status === "live") return "LIVE";
  return "PENDING";
}

export default function CtrlZConsole({ escrowAddress }: { escrowAddress: string | null }) {
  const [phase, setPhase] = useState<Phase>("onboard");
  const [minting, setMinting] = useState(false);
  const [buyer, setBuyer] = useState<Identity | null>(null);
  const [checker, setChecker] = useState<Identity | null>(null);
  const [worker, setWorker] = useState<Identity | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState("");
  const [agentsSource, setAgentsSource] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [workFilter, setWorkFilter] = useState("all");
  const [agentPage, setAgentPage] = useState(1);
  const [bounty, setBounty] = useState(5);
  const [mode, setMode] = useState<Mode>("green");
  const [statuses, setStatuses] = useState<Record<number, Status>>(initialStatuses);
  const [current, setCurrent] = useState(0);
  const [typed, setTyped] = useState(0);
  const [testsShown, setTestsShown] = useState(0);
  const [verdict, setVerdict] = useState<"PASS" | "FAIL" | null>(null);
  const [runDone, setRunDone] = useState(false);
  const [hbar, setHbar] = useState(WORKER_START);
  const [backendSource, setBackendSource] = useState("");
  const [runResults, setRunResults] = useState<TestRunResult[]>([]);
  const [runReceipt, setRunReceipt] = useState<BackendResult | null>(null);
  const [publicTests, setPublicTests] = useState<string[]>([]);
  const [heldoutTests, setHeldoutTests] = useState<string[]>([]);
  const [runError, setRunError] = useState("");
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [x402Receipt, setX402Receipt] = useState("");
  const [inspectedStage, setInspectedStage] = useState<number | null>(null);
  const [hashes, setHashes] = useState({
    spec: "",
    specUri: "",
    evidence: "",
    evidenceUri: "",
    x402: "",
    blob: "",
    resolve: "",
    task: ""
  });
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const intervals = useRef<Array<ReturnType<typeof setInterval>>>([]);

  const agent = useMemo(() => agents.find((item) => item.id === selectedId) ?? agents[0] ?? null, [agents, selectedId]);
  const filteredAgents = useMemo(
    () => agents.filter((item) => workFilter === "all" || item.workKind === workFilter),
    [agents, workFilter]
  );
  const pageCount = Math.max(1, Math.ceil(filteredAgents.length / PAGE_SIZE));
  const pageAgents = filteredAgents.slice((agentPage - 1) * PAGE_SIZE, agentPage * PAGE_SIZE);
  const source = backendSource || (mode === "green" ? GREEN_SOURCE : CHEAT_SOURCE);
  const passed = verdict === "PASS";
  const cheat = mode === "cheat";
  const progress = Math.max(0, Math.min(100, (current / STAGE_LABELS.length) * 100));

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      setAgentsLoading(true);
      setAgentsError("");
      try {
        const data = (await fetch("/api/marketplace/agents").then((res) => res.json())) as MarketplaceAgentsResponse;
        if (cancelled) return;
        const nextAgents = data.agents ?? [];
        setAgents(nextAgents);
        setAgentsSource(data.source ?? "");
        setSelectedId((current) => current ?? nextAgents[0]?.id ?? null);
        if (data.error) setAgentsError(data.error);
        if (!data.error && nextAgents.length === 0) setAgentsError("Live marketplace returned no hireable agents.");
      } catch (error) {
        if (!cancelled) setAgentsError(error instanceof Error ? error.message : "Could not load marketplace agents.");
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    }

    loadAgents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setAgentPage(1);
    setSelectedId(filteredAgents[0]?.id ?? null);
    setDetailOpen(false);
  }, [filteredAgents]);

  useEffect(() => {
    setAgentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  useEffect(() => {
    return () => clearRunTimers();
  }, []);

  function clearRunTimers() {
    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    timers.current = [];
    intervals.current = [];
  }

  async function boot() {
    if (minting || buyer) return;
    setMinting(true);
    try {
      const identity = (await fetch("/api/agents/identity").then((res) => res.json())) as {
        worker?: string;
        checker?: string;
      };
      setBuyer(makeIdentity("100"));
      setWorker(identityFromUaid(identity.worker ?? "", makeIdentity("101", agent?.address)));
      setChecker(identityFromUaid(identity.checker ?? "", makeIdentity("102")));
      setPhase("market");
    } catch {
      setBuyer(makeIdentity("100"));
      setWorker(makeIdentity("101", agent?.address));
      setChecker(makeIdentity("102"));
      setPhase("market");
    } finally {
      setMinting(false);
    }
  }

  function inspectAgent(next: Agent) {
    setSelectedId(next.id);
    setDetailOpen(true);
  }

  function hireAgent(next = agent) {
    if (!next || next.status !== "available") return;
    setSelectedId(next.id);
    setDetailOpen(false);
    setWorker((prev) => prev ?? makeIdentity("101", next.address));
    setPhase("compose");
  }

  async function dispatch(nextMode: Mode) {
    if (!agent) {
      setRunError("No live marketplace agent is available to dispatch.");
      return;
    }

    clearRunTimers();
    setMode(nextMode);
    setPhase("run");
    setStatuses(initialStatuses());
    setCurrent(0);
    setTyped(0);
    setTestsShown(0);
    setVerdict(null);
    setRunDone(false);
    setHbar(WORKER_START);
    setBackendSource("");
    setRunResults([]);
    setRunReceipt(null);
    setPublicTests([]);
    setHeldoutTests([]);
    setRunError("");
    setSettleResult(null);
    setX402Receipt("");
    setInspectedStage(null);
    setHashes({
      spec: "",
      specUri: "",
      evidence: "",
      evidenceUri: "",
      x402: "",
      blob: "",
      resolve: "",
      task: ""
    });

    const go = (stage: number) => {
      setCurrent(stage);
      setStatuses((prev) => ({ ...prev, [stage]: "live" }));
    };
    const finish = (stage: number, status: Status = "done") => {
      setStatuses((prev) => ({ ...prev, [stage]: status }));
    };

    try {
      go(1);
      await wait(350);
      finish(1);

      go(2);
      await wait(450);
      finish(2);

      go(3);
      const data = await runBackend(nextMode);
      if (data.error || !data.settlement) {
        setRunError(data.error ?? "backend did not return a settlement plan");
        finish(3, "failed");
        setRunDone(true);
        return;
      }

      const x402Tx = data.x402?.receipt?.transaction ?? "";
      setRunReceipt(data);
      setX402Receipt(x402Tx);
      finish(3);

      const generated =
        data.generatedSource ??
        data.replay?.inProcess?.patchedSource ??
        data.replay?.inProcess?.patch ??
        (nextMode === "green" ? GREEN_SOURCE : CHEAT_SOURCE);
      setBackendSource(generated);
      setRunResults(data.results ?? data.replay?.results ?? []);
      setPublicTests(data.publicTests ?? data.replay?.publicTests ?? []);
      setHeldoutTests(data.heldoutTests ?? data.replay?.heldout?.hiddenTests ?? []);
      setHashes({
        spec: data.specHash ?? "",
        specUri: data.specUri ?? "",
        evidence: data.evidenceHash ?? "",
        evidenceUri: data.evidenceUri ?? "",
        x402: x402Tx,
        blob: data.evidenceHash ?? "",
        resolve: "",
        task: ""
      });

      go(4);
      await typeGeneratedSource(generated);
      finish(4);

      go(5);
      await revealBackendTests(data.results ?? data.replay?.results ?? []);
      const result = data.settlement.resultLabel === "PASS" ? "PASS" : "FAIL";
      setVerdict(result);
      finish(5, result === "PASS" ? "done" : "failed");

      go(6);
      await wait(450);
      finish(6);

      go(7);
      const settle = await settleOnChain(data);
      setSettleResult(settle);
      setHashes((prev) => ({
        ...prev,
        resolve: settle?.resolveHash ?? "",
        task: settle?.taskId ?? ""
      }));
      if (result === "PASS" && settle?.finalStateLabel === "PAID") {
        countBalance();
        await wait(1300);
      } else {
        await wait(500);
      }
      finish(7, settle?.finalStateLabel || settle?.configured === false ? "done" : "failed");

      go(8);
      await wait(500);
      finish(8, result === "PASS" ? "done" : "failed");
      setRunDone(true);
      setCurrent(8);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "backend request failed");
      setStatuses((prev) => ({ ...prev, [Math.max(current, 1)]: "failed" }));
      setRunDone(true);
    }
  }

  async function runBackend(nextMode: Mode): Promise<BackendResult> {
    if (nextMode === "green") {
      const llmRun = (await fetch("/api/agent/solve", {
        method: "POST",
        headers: { "x-payment": "demo-x402:homepage" }
      }).then((res) => res.json())) as BackendResult;
      if (!llmRun.error) return llmRun;
      if (!llmRun.error.includes("GEMINI_API_KEY")) return llmRun;

      return fetch("/verify/payongreen", {
        method: "POST",
        headers: { "content-type": "application/json", "x-payment": "demo-x402:homepage" },
        body: JSON.stringify({
          demo: "green",
          agentId: "101",
          writeValidation: true,
          recipientName: agent?.name ?? "marketplace-agent"
        })
      }).then((res) => res.json());
    }

    return fetch("/verify/payongreen", {
      method: "POST",
      headers: { "content-type": "application/json", "x-payment": "demo-x402:homepage" },
      body: JSON.stringify({
        demo: "cheat",
        agentId: "101",
        writeValidation: true,
        recipientName: agent?.name ?? "marketplace-agent"
      })
    }).then((res) => res.json());
  }

  async function settleOnChain(data: BackendResult): Promise<SettleResult | null> {
    if (!data.specHash || !data.evidenceHash || !data.settlement) return null;
    return fetch("/verify/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        specHash: data.specHash,
        evidenceHash: data.evidenceHash,
        recommendationHash: data.settlement.recommendationHash,
        result: data.settlement.resultLabel,
        scoreBps: data.settlement.scoreBps
      })
    })
      .then((res) => res.json())
      .catch((error) => ({ error: error instanceof Error ? error.message : "settlement request failed" }));
  }

  async function typeGeneratedSource(code: string) {
    setTyped(0);
    for (let i = 0; i < code.length; i += 4) {
      setTyped(Math.min(code.length, i + 4));
      await wait(16);
    }
    setTyped(code.length);
  }

  async function revealBackendTests(results: TestRunResult[]) {
    setTestsShown(0);
    const count = results.length || TESTS.length;
    for (let i = 1; i <= count; i += 1) {
      setTestsShown(i);
      await wait(260);
    }
  }

  function countBalance() {
    const target = WORKER_START + bounty;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      const p = Math.min(1, ticks / 24);
      const eased = 1 - Math.pow(1 - p, 3);
      setHbar(WORKER_START + (target - WORKER_START) * eased);
      if (p >= 1) clearInterval(id);
    }, 50);
    intervals.current.push(id);
  }

  function marketFromHeader(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (!buyer) {
      boot();
      return;
    }
    clearRunTimers();
    setPhase("market");
  }

  return (
    <main className="cz-shell">
      <header className="cz-topbar">
        <button className="cz-brand" type="button" onClick={() => setPhase(buyer ? "market" : "onboard")}>
          <span className="cz-logo">
            CTRL<span>+Z</span>
          </span>
          <span className="cz-product">VERIFY</span>
          <span className="cz-divider" />
          <span className="cz-tagline">trust layer - agents paying agents</span>
        </button>
        <div className="cz-toplinks">
          {buyer ? (
            <span className="cz-identity">
              <span className="cz-live-dot" />
              {buyer.short}
              <span>you - buyer</span>
            </span>
          ) : null}
          <a href="/marketplace" onClick={marketFromHeader}>
            explore agents <span>/marketplace</span>
          </a>
        </div>
      </header>

      {phase === "onboard" ? (
        <section className="cz-hero">
          <div className="cz-kicker">
            <span className="cz-live-dot" />
            live mission control - v0.9
          </div>
          <h1>
            Hire an AI agent.
            <span>Pay only for provably-correct work.</span>
          </h1>
          <p>
            One agent hires another. The bounty sits in escrow and only settles once the work
            passes tests the worker never saw, then real money moves on-chain.
          </p>
          <button className="cz-primary cz-hero-cta" type="button" onClick={boot}>
            {minting ? <span className="cz-spinner" /> : <span className="cz-power">IO</span>}
            {minting ? "minting identity..." : "Boot my agent"}
          </button>
          <div className="cz-subnote">mints your HCS-14 buyer identity - opens the agent marketplace</div>

          <div className="cz-steps">
            <Step number="01" title="HIRE" body="pick a worker from the market" />
            <Step number="02" title="VERIFY" body="unseen tests prove the work" />
            <Step number="03" title="SETTLE" body="HBAR moves on-chain via escrow" />
          </div>
        </section>
      ) : null}

      {phase === "market" ? (
        <section className="cz-page">
          <PageIntro
            kicker="AGENT MARKETPLACE - STEP 1 OF 2"
            title="Choose a worker to hire"
            body="Every agent has on-chain reputation. Pick one to assign your task; they only get paid if it passes hidden tests."
          />
          <TaskStrip right={agentsSource ? `live ${agentsSource} ranking` : "loading live ranking"} />
          <div className="cz-filterbar" aria-label="Filter agents by work type">
            {WORK_FILTERS.map((filter) => {
              const count = filter.key === "all" ? agents.length : agents.filter((item) => item.workKind === filter.key).length;
              return (
                <button
                  className={workFilter === filter.key ? "active" : ""}
                  key={filter.key}
                  type="button"
                  onClick={() => setWorkFilter(filter.key)}
                >
                  <span>{filter.label}</span>
                  <small>{count}</small>
                </button>
              );
            })}
          </div>
          {agentsLoading ? <p className="cz-agent-note">Loading live marketplace agents...</p> : null}
          {agentsError ? <p className="cz-agent-note">{agentsError}</p> : null}
          <div className={detailOpen ? "cz-market-layout has-detail" : "cz-market-layout"}>
            <div className="cz-agent-grid">
              {pageAgents.map((item) => (
                <article
                  className={`cz-agent-card ${item.id === selectedId && detailOpen ? "is-selected" : ""}`}
                  key={item.id}
                  onClick={() => inspectAgent(item)}
                >
                  <AgentHeader agent={item} />
                  <div className="cz-tags">
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <div className="cz-metrics">
                    <Metric label="RATING" value={item.rep} />
                    <Metric label="JOBS" value={item.jobs} />
                    <Metric label="SUCCESS" value={`${item.success.toFixed(1)}%`} tone={item.success >= 97 ? "good" : "warn"} />
                  </div>
                  <div className="cz-card-bottom">
                    <span>{item.rate} / job</span>
                    <button
                      type="button"
                      disabled={item.status !== "available"}
                      onClick={(event) => {
                        event.stopPropagation();
                        hireAgent(item);
                      }}
                    >
                      Hire & assign -&gt;
                    </button>
                  </div>
                  {item.note ? <p className="cz-agent-note">{item.note}</p> : null}
                </article>
              ))}
            </div>
            {detailOpen && agent ? <AgentHistoryPanel agent={agent} onClose={() => setDetailOpen(false)} onHire={() => hireAgent(agent)} /> : null}
          </div>
          <div className="cz-pager">
            <button type="button" disabled={agentPage <= 1} onClick={() => setAgentPage((page) => Math.max(1, page - 1))}>
              &lt;- Previous
            </button>
            <span>
              Page {agentPage} / {pageCount} · {filteredAgents.length} agents
            </span>
            <button type="button" disabled={agentPage >= pageCount} onClick={() => setAgentPage((page) => Math.min(pageCount, page + 1))}>
              Next -&gt;
            </button>
          </div>
        </section>
      ) : null}

      {phase === "compose" && agent ? (
        <section className="cz-compose">
          <div className="cz-compose-head">
            <span>ASSIGN TASK - STEP 2 OF 2</span>
            <button type="button" onClick={() => setPhase("market")}>
              &lt;- change worker
            </button>
          </div>
          <h2>Assign the job and set the bounty</h2>

          <div className="cz-hired">
            <Avatar agent={agent} compact />
            <div>
              <span>WORKER HIRED</span>
              <strong>{agent.name}</strong>
              <code>{agent.handle}</code>
            </div>
            <Metric label={`${agent.jobs} jobs`} value={agent.rep} />
          </div>

          <div className="cz-job-card">
            <div className="cz-job-main">
              <span className="cz-task-badge">TASK</span>
              <div>
                <h3>
                  Fix the failing <code>maximum()</code> bug
                </h3>
                <p>
                  A reference implementation returns the wrong value on negatives and crashes on
                  empty input. The worker must make all tests pass.
                </p>
                <pre>$ pytest test_maximum.py -&gt; 2 failed, 1 passed</pre>
              </div>
            </div>
            <div className="cz-bounty">
              <span>BOUNTY (HELD IN ESCROW)</span>
              <div>
                {[2, 5, 10].map((value) => (
                  <button
                    className={bounty === value ? "active" : ""}
                    key={value}
                    type="button"
                    onClick={() => setBounty(value)}
                  >
                    {value} HBAR
                  </button>
                ))}
              </div>
            </div>
            <div className="cz-lock-note">
              <span>LOCK</span>
              <p>3 held-out tests will be hashed and sealed before dispatch. The worker never sees them.</p>
            </div>
          </div>

          <button className="cz-primary cz-dispatch" type="button" onClick={() => dispatch("green")}>
            Dispatch to {agent.name} -&gt;
          </button>
          <button className="cz-link-button" type="button" onClick={() => dispatch("cheat")}>
            simulate a cheating worker
          </button>
        </section>
      ) : null}

      {phase === "run" && agent ? (
        <section className="cz-run">
          <div className="cz-run-head">
            <div>
              <span>{cheat ? "LIVE RUN - CHEAT PATH" : "LIVE RUN - MISSION CONTROL"}</span>
              <h2>
                {agent.name} is fixing <code>maximum()</code>
              </h2>
            </div>
            <div className="cz-balance">
              <span>WORKER BALANCE</span>
              <strong className={cheat ? "" : "good"}>{hbar.toFixed(4)} HBAR</strong>
            </div>
          </div>

          <div className="cz-timeline" style={{ "--progress": `${progress}%` } as React.CSSProperties}>
            {STAGE_LABELS.map((label, index) => {
              const stage = index + 1;
              const status = statuses[stage];
              return (
                <Stage
                  agent={agent}
                  bounty={bounty}
                  checker={checker}
                  cheat={cheat}
                  current={current}
                  hashes={hashes}
                  hbar={hbar}
                  heldoutTests={heldoutTests}
                  inspected={inspectedStage === stage}
                  key={label}
                  label={label}
                  mode={mode}
                  onInspect={() => setInspectedStage((open) => (open === stage ? null : stage))}
                  passed={passed}
                  publicTests={publicTests}
                  runReceipt={runReceipt}
                  runError={runError}
                  runResults={runResults}
                  settleResult={settleResult}
                  source={source}
                  stage={stage}
                  status={status}
                  testsShown={testsShown}
                  typed={typed}
                  verdict={verdict}
                  worker={worker}
                />
              );
            })}
          </div>

          {runDone ? (
            <Receipt
              agent={agent}
              bounty={bounty}
              cheat={cheat}
              hashes={hashes}
              runReceipt={runReceipt}
              runError={runError}
              settleResult={settleResult}
              onMarket={() => setPhase("market")}
              onOther={() => dispatch(cheat ? "green" : "cheat")}
              onReplay={() => dispatch(mode)}
              worker={worker}
            />
          ) : null}
        </section>
      ) : null}

      <footer className="cz-footer">
        <span>CTRL+Z VERIFY</span>
        <span>Live BigQuery marketplace</span>
        <span>Walrus evidence</span>
        <span>Hedera escrow: {escrowAddress ?? "not deployed"}</span>
      </footer>
    </main>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div>
      <span>
        {number} - {title}
      </span>
      <p>{body}</p>
    </div>
  );
}

function PageIntro({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div className="cz-page-intro">
      <span>{kicker}</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function formatAgentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncateText(value: string, limit = 150) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function policyLabel(action: string) {
  if (action === "auto-hire") return "Direct pay";
  if (action === "strict-validation") return "Strict validation";
  return action.replace("-", " ");
}

function AgentHistoryPanel({ agent, onClose, onHire }: { agent: Agent; onClose: () => void; onHire: () => void }) {
  return (
    <aside className="cz-agent-detail">
      <div className="cz-detail-toolbar">
        <span>Agent detail</span>
        <button type="button" onClick={onClose}>
          close
        </button>
      </div>
      <div className="cz-agent-detail-head">
        <AgentHeader agent={agent} />
        <a href={agent.detailHref} target="_blank" rel="noreferrer">
          full profile -&gt;
        </a>
      </div>

      <div className="cz-detail-grid">
        <Metric label="TRUST" value={`${agent.trustScore.toFixed(0)}%`} tone={agent.trustScore >= 80 ? "good" : "warn"} />
        <Metric label="CLIENTS" value={String(agent.uniqueClients)} />
        <Metric label="FEEDBACK" value={String(agent.feedbackCount)} />
        <Metric label="VALIDATIONS" value={String(agent.validationCount)} />
      </div>

      <div className="cz-agent-policy">
        <span>{agent.workLabel || agent.workKind}</span>
        <strong>{policyLabel(agent.action)}</strong>
        <small>{agent.x402Support ? "x402 payable" : "escrow/checker routed"}</small>
      </div>

      {agent.categoryEvidence.length > 0 ? (
        <div className="cz-evidence-list">
          {agent.categoryEvidence.slice(0, 3).map((item) => (
            <span key={item} title={item}>
              {truncateText(item, 90)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="cz-history">
        <div className="cz-history-title">
          <span>RECENT HISTORY</span>
          <small>rank #{agent.rank}</small>
        </div>
        {agent.history.length > 0 ? (
          agent.history.map((event, index) => (
            <div className="cz-history-row" key={`${event.timestamp}-${event.title}-${index}`}>
              <span>{event.kind}</span>
              <strong>{event.title}</strong>
              <p title={event.detail}>{truncateText(event.detail, 180)}</p>
              <small>
                {formatAgentTime(event.timestamp)}
                {typeof event.score === "number" ? ` · score ${Math.round(event.score)}` : ""}
              </small>
            </div>
          ))
        ) : (
          <p className="cz-empty-history">No recent event history returned by the live index.</p>
        )}
      </div>

      <button className="cz-primary cz-detail-hire" type="button" disabled={agent.status !== "available"} onClick={onHire}>
        Hire {agent.name} -&gt;
      </button>
    </aside>
  );
}

function TaskStrip({ right }: { right: string }) {
  return (
    <div className="cz-task-strip">
      <span>TASK</span>
      <p>
        To assign: <strong>Fix the failing</strong> <code>maximum()</code> <strong>bug</strong> - 2 tests failing
      </p>
      <small>{right}</small>
    </div>
  );
}

function Avatar({ agent, compact = false }: { agent: Agent; compact?: boolean }) {
  return (
    <span
      className={compact ? "cz-avatar compact" : "cz-avatar"}
      style={{ "--tone-a": agent.tone[0], "--tone-b": agent.tone[1] } as React.CSSProperties}
    >
      {agent.initials}
    </span>
  );
}

function AgentHeader({ agent }: { agent: Agent }) {
  const category = agent.workLabel || agent.workKind;
  return (
    <div className="cz-agent-header">
      <Avatar agent={agent} />
      <div>
        <strong>{agent.name}</strong>
        <code>{agent.handle}</code>
      </div>
      <span className="cz-status available">{category}</span>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className={tone ? `cz-metric ${tone}` : "cz-metric"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Stage(props: {
  agent: Agent;
  bounty: number;
  checker: Identity | null;
  cheat: boolean;
  current: number;
  hashes: { spec: string; specUri: string; evidence: string; evidenceUri: string; x402: string; blob: string; resolve: string; task: string };
  heldoutTests: string[];
  hbar: number;
  inspected: boolean;
  label: string;
  mode: Mode;
  onInspect: () => void;
  passed: boolean;
  publicTests: string[];
  runReceipt: BackendResult | null;
  runError: string;
  runResults: TestRunResult[];
  settleResult: SettleResult | null;
  source: string;
  stage: number;
  status: Status;
  testsShown: number;
  typed: number;
  verdict: "PASS" | "FAIL" | null;
  worker: Identity | null;
}) {
  const { label, stage, status } = props;
  const collapsed = status === "done" || status === "failed";
  const glyph = status === "done" ? "OK" : status === "failed" ? "X" : String(stage);

  return (
    <article className={`cz-stage ${status}`} onClick={props.onInspect}>
      <span className="cz-stage-dot">{glyph}</span>
      <div className="cz-stage-title">
        <h3>{label}</h3>
        <div className="cz-stage-actions">
          <span className="cz-stage-toggle">{props.inspected ? "hide" : "inspect"}</span>
          <span>{statusCopy(status)}</span>
        </div>
      </div>
      {status === "live" ? <StageLive {...props} /> : null}
      {collapsed ? <StageSummary {...props} /> : null}
      {props.inspected ? <StageInspection {...props} /> : null}
    </article>
  );
}

function StageInspection(props: Parameters<typeof Stage>[0]) {
  const {
    agent,
    bounty,
    checker,
    hashes,
    heldoutTests,
    publicTests,
    runReceipt,
    runResults,
    settleResult,
    source,
    stage,
    verdict,
    worker
  } = props;
  const x402Receipt = runReceipt?.x402?.receipt as { mode?: string; transaction?: string; verifiedAt?: string } | undefined;
  const x402Requirements = runReceipt?.x402?.requirements;
  const x402Mode =
    runReceipt?.x402?.enabled === false
      ? "disabled in env"
      : x402Receipt?.mode ?? (runReceipt?.x402?.paid ? "paid" : runReceipt?.x402?.required ? "required" : "pending");

  if (stage === 1) {
    return (
      <div className="cz-inspector" onClick={(event) => event.stopPropagation()}>
        <InfoBlock label="SELECTED AGENT" value={`${agent.name} · ${agent.handle}`} />
        <InfoBlock label="WORKER UAID" value={worker?.uaid ?? "-"} blue />
        <InfoBlock label="CHECKER UAID" value={checker?.uaid ?? "-"} blue />
      </div>
    );
  }

  if (stage === 2) {
    return (
      <div className="cz-inspector" onClick={(event) => event.stopPropagation()}>
        <InfoBlock label="BOUNTY" value={`${bounty} HBAR`} />
        <InfoBlock label="TASK" value={runReceipt?.task?.spec ?? "Fix the failing maximum() implementation."} />
        <InfoBlock label="SPEC HASH" value={hashes.spec || "pending backend response"} blue />
        <InfoBlock label="PUBLIC TESTS" value={publicTests.length ? publicTests.join(", ") : "pending"} />
        <InfoBlock label="HELD-OUT TESTS" value={heldoutTests.length ? heldoutTests.join(", ") : "sealed until checker run"} />
      </div>
    );
  }

  if (stage === 3) {
    return (
      <div className="cz-inspector" onClick={(event) => event.stopPropagation()}>
        <InfoBlock label="x402 MODE" value={x402Mode} />
        <InfoBlock label="x402 TRANSACTION / RECEIPT" value={x402Receipt?.transaction ?? hashes.x402 ?? "not issued"} blue />
        <InfoBlock label="ASSET" value={x402Requirements?.asset ?? "HBAR"} />
        <InfoBlock label="MAX REQUIRED" value={x402Requirements?.maxAmountRequired ?? "0.01"} />
      </div>
    );
  }

  if (stage === 4) {
    return (
      <div className="cz-inspector" onClick={(event) => event.stopPropagation()}>
        <InfoBlock label="GENERATED BY" value="Gemini worker route /api/agent/solve" />
        <CodeWindow code={source || "pending generated source"} typing={false} />
      </div>
    );
  }

  if (stage === 5) {
    return (
      <div className="cz-inspector" onClick={(event) => event.stopPropagation()}>
        <InfoBlock label="VERDICT" value={verdict ?? runReceipt?.settlement?.resultLabel ?? "pending"} blue={verdict === "PASS"} danger={verdict === "FAIL"} />
        <InfoBlock label="SCORE BPS" value={String(runReceipt?.settlement?.scoreBps ?? "-")} />
        <InfoBlock label="RECOMMENDATION HASH" value={runReceipt?.settlement?.recommendationHash ?? "-"} />
        <div className="cz-tests">
          {runResults.map((result) => (
            <div className={`cz-test ${result.status === "passed" ? "pass" : "fail"}`} key={result.name}>
              <span>{result.status === "passed" ? "OK" : "X"}</span>
              <code>{result.name}</code>
              <small>{heldoutTests.includes(result.name) ? "held-out" : "public"}</small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (stage === 6) {
    return (
      <div className="cz-inspector" onClick={(event) => event.stopPropagation()}>
        <InfoBlock label="EVIDENCE STORE" value={runReceipt?.evidenceStore ?? "Walrus/local fallback"} />
        <InfoBlock label="EVIDENCE HASH" value={hashes.evidence || "pending"} blue />
        {hashes.evidenceUri ? (
          <a className="cz-proof-link" href={hashes.evidenceUri} target="_blank" rel="noreferrer">
            Open evidence URI -&gt;
          </a>
        ) : null}
      </div>
    );
  }

  if (stage === 7) {
    return (
      <div className="cz-inspector" onClick={(event) => event.stopPropagation()}>
        <InfoBlock label="FINAL STATE" value={settleResult?.finalStateLabel ?? "pending"} blue={settleResult?.finalStateLabel === "PAID"} />
        <InfoBlock label="TASK ID" value={settleResult?.taskId ?? "-"} />
        <InfoBlock label="RESOLVE TX" value={settleResult?.resolveHash ?? "-"} blue />
        {settleResult?.resolveHash ? (
          <a className="cz-proof-link" href={`https://hashscan.io/testnet/transaction/${settleResult.resolveHash}`} target="_blank" rel="noreferrer">
            Open HashScan transaction -&gt;
          </a>
        ) : null}
        {settleResult?.error ? <p className="cz-red-text">{settleResult.error}</p> : null}
      </div>
    );
  }

  return (
    <div className="cz-inspector" onClick={(event) => event.stopPropagation()}>
      <InfoBlock label="REPUTATION RESULT" value={props.cheat ? `${agent.name} marked failed; buyer protected` : `${agent.name} credited for verified work`} />
      <InfoBlock label="MARKET SIGNAL" value="The settlement result can be fed back into ERC-8004 reputation." blue />
    </div>
  );
}

function StageLive(props: Parameters<typeof Stage>[0]) {
  const {
    agent,
    bounty,
    checker,
    cheat,
    hashes,
    heldoutTests,
    hbar,
    runReceipt,
    runError,
    runResults,
    settleResult,
    source,
    stage,
    testsShown,
    typed,
    verdict,
    worker
  } = props;

  if (stage === 1) {
    return (
      <div className="cz-stage-body">
        <p>HCS-14 universal agent IDs resolved on the Hedera Consensus Service.</p>
        <InfoBlock label={`WORKER - ${agent.name} - role 101`} value={worker?.uaid ?? "-"} />
        <InfoBlock label="CHECKER - role 102" value={checker?.uaid ?? "-"} blue />
      </div>
    );
  }
  if (stage === 2) {
    return (
      <div className="cz-stage-body">
        <div className="cz-two">
          <InfoBlock label="BOUNTY ESCROWED" value={`${bounty} HBAR`} />
          <InfoBlock label="SPEC HASH (committed)" value={hashes.spec} />
        </div>
        <p className="cz-green-note">3 held-out tests committed and sealed before dispatch.</p>
      </div>
    );
  }
  if (stage === 3) {
    if (runError) {
      return (
        <div className="cz-stage-body">
          <p className="cz-red-text">{runError}</p>
        </div>
      );
    }
    if (runReceipt?.x402?.enabled === false) {
      return (
        <div className="cz-stage-body">
          <p>x402 is disabled in the current environment. The run still uses the real verifier, Walrus evidence, and Hedera settlement path.</p>
        </div>
      );
    }
    const x402Tx = hashes.x402;
    const x402HasChainReceipt = isTxHash(x402Tx);
    return (
      <div className="cz-stage-body">
        <p>Calling the real verification backend and x402 payment gate.</p>
        <div className="cz-ledger">
          <span>asset</span>
          <strong>{runReceipt?.x402?.requirements?.asset ?? "HBAR"}</strong>
          <span>maxAmountRequired</span>
          <strong>{runReceipt?.x402?.requirements?.maxAmountRequired ?? "0.01"}</strong>
          <span>{x402HasChainReceipt ? "receipt" : "gate"}</span>
          {x402HasChainReceipt ? (
            <a href={`https://hashscan.io/testnet/transaction/${x402Tx}`} target="_blank">
              {shortHash(x402Tx)}
            </a>
          ) : (
            <strong>{runReceipt?.x402?.receipt?.mode === "demo" ? "demo accepted" : x402Tx || "accepted"}</strong>
          )}
        </div>
      </div>
    );
  }
  if (stage === 4) {
    return (
      <div className="cz-stage-body">
        <p>{agent.name} is writing the patch in <code>solution.py</code>.</p>
        <CodeWindow code={source.slice(0, typed)} typing={typed < source.length} />
      </div>
    );
  }
  if (stage === 5) {
    const rows =
      runResults.length > 0
        ? runResults.map((result) => ({
            name: result.name,
            status: result.status,
            held: heldoutTests.includes(result.name)
          }))
        : TESTS.map((test, index) => ({
            name: test.expr,
            status: index < testsShown ? (cheat && test.held ? "failed" : "passed") : "pending",
            held: test.held
          }));
    return (
      <div className="cz-stage-body">
        <div className="cz-tests">
          {rows.map((test, index) => {
            const shown = index < testsShown;
            const failed = shown && test.status !== "passed";
            return (
              <div className={`cz-test ${shown ? (failed ? "fail" : "pass") : ""}`} key={test.name}>
                <span>{shown ? (failed ? "X" : "OK") : "-"}</span>
                <code>{test.name}</code>
                <small>{test.held ? "held-out" : "public"}</small>
              </div>
            );
          })}
        </div>
        {verdict ? (
          <div className={`cz-verdict ${verdict === "PASS" ? "pass" : "fail"}`}>
            <strong>{verdict}</strong>
            <span>{verdict === "PASS" ? "6/6 passed including hidden tests" : "3/6 passed; hidden tests caught the shortcut"}</span>
          </div>
        ) : null}
      </div>
    );
  }
  if (stage === 6) {
    return (
      <div className="cz-stage-body">
        <p>The full evidence bundle is stored as an immutable Walrus blob.</p>
        <InfoBlock label={hashes.evidenceUri ? "WALRUS URI" : "EVIDENCE HASH"} value={hashes.evidenceUri || hashes.evidence} blue />
      </div>
    );
  }
  if (stage === 7) {
    const settleLabel =
      settleResult?.configured === false
        ? "NOT CONFIGURED"
        : settleResult?.finalStateLabel ?? (verdict === "PASS" ? "PASS" : "FAIL");
    return (
      <div className="cz-stage-body">
        <div className="cz-two">
          <InfoBlock label="ESCROW RESULT" value={settleLabel} danger={cheat || settleResult?.configured === false} blue={!cheat} />
          <InfoBlock label="WORKER BALANCE" value={`${hbar.toFixed(4)} HBAR`} blue={!cheat} />
        </div>
        {settleResult?.configured === false ? <p className="cz-red-text">{settleResult.error}</p> : null}
        <div className="cz-ledger">
          <span>task #</span>
          <strong>{hashes.task || "pending"}</strong>
          <span>resolve tx</span>
          {hashes.resolve ? (
            <a href={`https://hashscan.io/testnet/transaction/${hashes.resolve}`} target="_blank">
              {shortHash(hashes.resolve)}
            </a>
          ) : (
            <strong>not submitted</strong>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="cz-stage-body">
      <p className={cheat ? "cz-red-text" : "cz-green-text"}>{cheat ? `${agent.name} -1 - fraud-class` : `${agent.name} +1 - buyer +1`}</p>
    </div>
  );
}

function StageSummary({
  agent,
  bounty,
  cheat,
  hashes,
  hbar,
  heldoutTests,
  runError,
  runResults,
  settleResult,
  source,
  stage,
  worker
}: Parameters<typeof Stage>[0]) {
  if (runError && stage === 3) return <p className="cz-stage-summary cz-red-text">{runError}</p>;
  const summaries: Record<number, string> = {
    1: `${worker?.short ?? "worker"} - checker bound`,
    2: `${bounty} HBAR escrowed - held-out tests committed`,
    3: `Hedera x402 gate accepted - ${shortHash(hashes.x402)}`,
    4: `patch generated - ${source.split("\n").length} lines - ${source.length} B`,
    5:
      runResults.length > 0
        ? `${runResults.filter((r) => r.status === "passed").length}/${runResults.length} passed - ${heldoutTests.length} held-out`
        : cheat
          ? "3/6 passed - all held-out tests failed"
          : "6/6 passed - verified",
    6: `evidence anchored - ${shortHash(hashes.evidence)}`,
    7:
      settleResult?.configured === false
        ? "settlement not configured - verdict still anchored"
        : settleResult?.finalStateLabel
          ? `${settleResult.finalStateLabel} - ${shortHash(settleResult.resolveHash ?? "")}`
          : cheat
            ? `REFUNDED - balance ${hbar.toFixed(4)} HBAR`
            : `PAID - +${bounty.toFixed(4)} HBAR`,
    8: cheat ? `${agent.name} -1 - escrow refunded` : `${agent.name} +1 - buyer +1`
  };
  return <p className="cz-stage-summary">{summaries[stage]}</p>;
}

function InfoBlock({ label, value, blue, danger }: { label: string; value: string; blue?: boolean; danger?: boolean }) {
  return (
    <div className={`cz-info ${blue ? "blue" : ""} ${danger ? "danger" : ""}`}>
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function CodeWindow({ code, typing }: { code: string; typing: boolean }) {
  return (
    <div className="cz-code-window">
      <div>
        <span />
        <span />
        <span />
        <small>solution.py</small>
      </div>
      <pre>
        {code}
        {typing ? <b>_</b> : null}
      </pre>
    </div>
  );
}

function rawProofHref(label: string, value: string) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(`${label}\n\n${value}`)}`;
}

function jsonProofHref(label: string, value: unknown) {
  return rawProofHref(label, JSON.stringify(value, null, 2));
}

function isTxHash(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function ProofTile({ href, label, value, action = "open proof ->" }: { href: string; label: string; value: string; action?: string }) {
  const safeValue = value || "-";
  return (
    <a className="cz-proof-tile" href={href} target="_blank" rel="noreferrer" title={`Open ${label.toLowerCase()}`}>
      <span>{label}</span>
      <code>{safeValue}</code>
      <small>{action}</small>
    </a>
  );
}

function Receipt({
  agent,
  bounty,
  cheat,
  hashes,
  runReceipt,
  runError,
  settleResult,
  onMarket,
  onOther,
  onReplay,
  worker
}: {
  agent: Agent;
  bounty: number;
  cheat: boolean;
  hashes: { spec: string; specUri: string; evidence: string; evidenceUri: string; x402: string; blob: string; resolve: string; task: string };
  runReceipt: BackendResult | null;
  runError: string;
  settleResult: SettleResult | null;
  onMarket: () => void;
  onOther: () => void;
  onReplay: () => void;
  worker: Identity | null;
}) {
  if (runError) {
    return (
      <div className="cz-receipt fail">
        <span>BACKEND STOPPED</span>
        <h2>The real backend rejected this run.</h2>
        <p>{runError}</p>
        <div className="cz-receipt-actions">
          <button className="cz-primary" type="button" onClick={onReplay}>
            Retry
          </button>
          <button type="button" onClick={onOther}>
            {cheat ? "Run honest path" : "Try cheat path"}
          </button>
        </div>
      </div>
    );
  }
  const settlementLabel = settleResult?.configured === false ? "SETTLEMENT - NOT CONFIGURED" : cheat ? "SETTLEMENT - REFUNDED" : "SETTLEMENT - PAID";
  const settlementValue = settleResult?.configured === false ? (settleResult.error ?? "missing Hedera keys") : hashes.resolve;
  const scoreValue = runReceipt?.settlement ? `${runReceipt.settlement.scoreBps} bps - ${runReceipt.settlement.resultLabel}` : cheat ? "3300 bps - FAIL" : `10000 bps - paid ${bounty} HBAR`;
  const x402Transaction = runReceipt?.x402?.receipt?.transaction ?? hashes.x402;
  const hasX402ChainReceipt = isTxHash(x402Transaction);
  const evidenceProofHref =
    hashes.evidenceUri ||
    jsonProofHref("EVIDENCE HASH PROOF", {
      evidenceHash: hashes.evidence,
      store: runReceipt?.evidenceStore ?? null,
      note: "Walrus URI was unavailable; verify this hash against the evidence bundle returned by the backend."
    });
  const proofRows = [
    {
      label: "WORKER IDENTITY",
      value: worker?.uaid ?? worker?.short ?? "-",
      href: "/api/agents/identity",
      action: "open identity ->"
    },
    {
      label: "SPEC MANIFEST",
      value: hashes.spec,
      href:
        hashes.specUri ||
        jsonProofHref("SPEC MANIFEST PROOF", {
          specHash: hashes.spec,
          task: runReceipt?.task ?? null,
          publicTests: runReceipt?.publicTests ?? [],
          heldoutTests: runReceipt?.heldoutTests ?? [],
          specStore: runReceipt?.specStore ?? null,
          note: "This is the acceptance manifest hash; when Walrus returns a specUri this tile opens that stored manifest directly."
        }),
      action: hashes.specUri ? "open manifest ->" : "open hash record ->"
    },
    {
      label: "EVIDENCE",
      value: hashes.evidenceUri || hashes.evidence,
      href: evidenceProofHref,
      action: hashes.evidenceUri ? "open walrus ->" : "open hash record ->"
    },
    {
      label: hasX402ChainReceipt ? "x402 RECEIPT" : "x402 GATE",
      value: hasX402ChainReceipt ? x402Transaction : runReceipt?.x402?.receipt?.mode === "demo" ? "demo accepted" : x402Transaction || "accepted",
      href: hasX402ChainReceipt
        ? `https://hashscan.io/testnet/transaction/${x402Transaction}`
        : jsonProofHref("x402 RECEIPT PROOF", {
            x402: runReceipt?.x402 ?? null,
            note: "No external x402 transaction is available in demo mode. Configure X402_FACILITATOR_URL to emit a chain/verifier receipt."
          }),
      action: hasX402ChainReceipt ? "open receipt ->" : "open gate record ->"
    },
    {
      label: settlementLabel,
      value: settlementValue,
      href: isTxHash(settlementValue) ? `https://hashscan.io/testnet/transaction/${settlementValue}` : jsonProofHref("SETTLEMENT PROOF", settleResult ?? {}),
      action: isTxHash(settlementValue) ? "open hashscan ->" : "open record ->"
    },
    {
      label: "SCORE",
      value: scoreValue,
      href: hashes.evidenceUri || jsonProofHref("SCORE PROOF", {
        settlement: runReceipt?.settlement ?? null,
        recommendation: runReceipt?.recommendation ?? null,
        reports: runReceipt?.reports ?? [],
        results: runReceipt?.results ?? [],
        publicTests: runReceipt?.publicTests ?? [],
        heldoutTests: runReceipt?.heldoutTests ?? []
      }),
      action: hashes.evidenceUri ? "open evidence ->" : "open score record ->"
    }
  ];

  return (
    <div className={`cz-receipt ${cheat ? "fail" : ""}`}>
      <span>{cheat ? "FRAUD CAUGHT - NO PAYMENT" : "VERIFIED AND PAID - END TO END"}</span>
      <h2>{cheat ? "The worker passed the visible tests and still got nothing." : "Real code, unseen tests, real HBAR moved."}</h2>
      <p>
        {cheat
          ? "The shortcut passed public cases but failed every held-out test. Escrow refunded the buyer automatically."
          : `${agent.name} wrote a real fix, passed tests it never saw, and got paid on-chain.`}
      </p>
      <div className="cz-proof-grid">
        {proofRows.map((row) => (
          <ProofTile key={row.label} href={row.href} label={row.label} value={row.value} action={row.action} />
        ))}
      </div>
      <div className="cz-receipt-actions">
        <button className="cz-primary" type="button" onClick={onReplay}>
          Run it again
        </button>
        <button type="button" onClick={onOther}>
          {cheat ? "Run honest path" : "Try cheat path"}
        </button>
        <button type="button" onClick={onMarket}>
          Hire another
        </button>
      </div>
    </div>
  );
}
