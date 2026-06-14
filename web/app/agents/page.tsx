"use client";

import { useState } from "react";
import { TerminalHeader } from "@/app/components/TerminalHeader";

type Phase = "idle" | "posted" | "claimed" | "verifying" | "settling" | "done";
type Actor = "buyer" | "worker" | "verifier" | "settle" | "rep" | "system";

type LogEntry = { actor: Actor; text: string };

type PogResponse = {
  error?: string;
  specHash?: string;
  evidenceHash?: string;
  evidenceUri?: string | null;
  recommendation?: string;
  settlement?: {
    resultLabel: "PASS" | "FAIL" | "UNCERTAIN";
    releases: boolean;
    scoreBps: number;
    recommendationHash: string;
  };
  erc8004Validation?: { mode?: string; responseTx?: string };
};

type SettleResponse = {
  configured?: boolean;
  error?: string;
  finalStateLabel?: string;
  taskId?: string;
  resolveHash?: string;
  escrowAddress?: string;
};

const ACTOR_LABEL: Record<Actor, string> = {
  buyer: "🤖 buyer-agent",
  worker: "🛠️ worker-agent",
  verifier: "🔍 ctrl+z verifier",
  settle: "💸 settlement",
  rep: "⭐ reputation",
  system: "·"
};

function short(v?: string | null) {
  if (!v) return "n/a";
  return v.length <= 20 ? v : `${v.slice(0, 10)}…${v.slice(-6)}`;
}

export default function AgentsDemoPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [bounty, setBounty] = useState("1");
  const [buyerId] = useState("buyer-0x9f4c");
  const [workerId, setWorkerId] = useState("101");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pog, setPog] = useState<PogResponse | null>(null);
  const [settle, setSettle] = useState<SettleResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const say = (actor: Actor, text: string) => setLog((prev) => [...prev, { actor, text }]);

  function reset() {
    setPhase("idle");
    setLog([]);
    setPog(null);
    setSettle(null);
    setBusy(false);
  }

  function postTask() {
    reset();
    setPhase("posted");
    say("buyer", `posted task "fix the failing empty-input test" · bounty ${bounty} HBAR · held-out tests committed (worker can't see them)`);
    say("system", "task is open on the board…");
    // worker autonomously discovers the open task
    window.setTimeout(() => {
      setPhase("claimed");
      say("worker", "scanning the board… found a task I can do → claimed it. preparing a patch.");
    }, 1300);
  }

  async function workerSubmit(variant: "green" | "cheat") {
    setBusy(true);
    setPhase("verifying");
    say("worker", variant === "green" ? "submitting an honest fix (a − b → a + b)." : "submitting a patch that hardcodes the visible test (a cheat).");
    try {
      const res = await fetch("/verify/payongreen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demo: variant, agentId: workerId, writeValidation: true, recipientName: "worker-agent" })
      });
      const data = (await res.json()) as PogResponse;
      setPog(data);
      if (data.error || !data.settlement) {
        say("verifier", `error: ${data.error ?? "no verdict"}`);
        setBusy(false);
        setPhase("done");
        return;
      }
      const s = data.settlement;
      say(
        "verifier",
        s.resultLabel === "PASS"
          ? `ran the suite — public ✓ and held-out ✓ → PASS (${s.scoreBps} bps). evidence on Walrus ${short(data.evidenceUri)}.`
          : `ran the suite — visible test passed but HELD-OUT tests failed → FAIL. the cheat is caught.`
      );
      if (data.erc8004Validation?.mode === "written") {
        say("verifier", `wrote ERC-8004 validation on-chain (tx ${short(data.erc8004Validation.responseTx)}).`);
      }
      await settleOnChain(data);
    } catch (e) {
      say("verifier", `request failed: ${e instanceof Error ? e.message : "unknown"}`);
      setBusy(false);
      setPhase("done");
    }
  }

  async function settleOnChain(data: PogResponse) {
    if (!data.specHash || !data.evidenceHash || !data.settlement) return;
    setPhase("settling");
    const s = data.settlement;
    say("settle", "submitting resolve() to the Hedera escrow…");
    try {
      const res = await fetch("/verify/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          specHash: data.specHash,
          evidenceHash: data.evidenceHash,
          recommendationHash: s.recommendationHash,
          result: s.resultLabel,
          scoreBps: s.scoreBps
        })
      });
      const r = (await res.json()) as SettleResponse;
      setSettle(r);
      if (r.configured === false) {
        say("settle", "on-chain settle not configured on this deploy — verdict + evidence still anchored.");
      } else if (r.error) {
        say("settle", `settle error: ${r.error}`);
      } else if (r.finalStateLabel === "PAID") {
        say("settle", `escrow → PAID. worker-agent received ${bounty} HBAR. tx ${short(r.resolveHash)} (task #${r.taskId}).`);
        say("rep", "worker-agent +1 (verified delivery) · buyer-agent +1 (well-specified task).");
      } else if (r.finalStateLabel === "REFUNDED") {
        say("settle", `escrow → REFUNDED. buyer-agent made whole; the cheat earns nothing. tx ${short(r.resolveHash)} (task #${r.taskId}).`);
        say("rep", "worker-agent −heavy (fraud-class: gamed the visible test) · buyer-agent protected.");
      }
    } catch (e) {
      say("settle", `settle request failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
      setPhase("done");
    }
  }

  const settled = settle && (settle.finalStateLabel === "PAID" || settle.finalStateLabel === "REFUNDED");
  const paid = settle?.finalStateLabel === "PAID";

  return (
    <main className="terminal-page">
      <TerminalHeader active="agents" />

      <section className="terminal-shell">
        <div className="terminal-hero">
          <p className="terminal-eyebrow">Agent-to-agent commerce</p>
          <h1>One agent hires another, and only pays when the work is provably correct.</h1>
          <p>
            You act as the <strong>buyer agent</strong> and post a task. A{" "}
            <strong>worker agent</strong> autonomously picks it up, does the work, and submits. CTRL+Z
            verifies it and <strong>settles on Hedera</strong> — real <code>resolve()</code>, real HBAR.
          </p>
        </div>

        <div className="terminal-grid two">
          <section className="terminal-panel">
            <div className="panel-header">
              <div>
                <p className="terminal-eyebrow">You — {buyerId}</p>
                <h2>Buyer agent</h2>
              </div>
            </div>
            <div className="agent-filter-grid">
              <label>
                <span>Escrow amount (HBAR, settled on-chain)</span>
                <input value={bounty} onChange={(e) => setBounty(e.target.value)} />
              </label>
              <label>
                <span>Worker agent id (ERC-8004)</span>
                <input value={workerId} onChange={(e) => setWorkerId(e.target.value)} />
              </label>
            </div>
            <div className="action-row">
              <button className="primary-action" onClick={postTask} disabled={busy}>
                Post bug-fix task
              </button>
              <button className="secondary-action" onClick={reset} disabled={phase === "idle"}>
                reset
              </button>
            </div>
          </section>

          <section className={settled ? `terminal-panel ${paid ? "tier-green" : "tier-red"}` : "terminal-panel"}>
            <div className="panel-header">
              <div>
                <p className="terminal-eyebrow">Autonomous — worker-{workerId}</p>
                <h2>Worker agent</h2>
              </div>
            </div>
            {phase === "idle" || phase === "posted" ? (
              <p className="muted">{phase === "posted" ? "worker-agent is discovering the open task…" : "Post a task and a worker will pick it up."}</p>
            ) : (
              <>
                <p className="muted">The worker claimed the task. Choose how it behaves (this is the demo's lever):</p>
                <div className="action-row">
                  <button className="primary-action" disabled={busy || phase === "done"} onClick={() => void workerSubmit("green")}>
                    {busy ? "working…" : "Submit honest fix → get paid"}
                  </button>
                  <button className="secondary-action" disabled={busy || phase === "done"} onClick={() => void workerSubmit("cheat")}>
                    Try to cheat → get caught
                  </button>
                </div>
                {settled ? (
                  <div className="key-value-list" style={{ marginTop: "1rem" }}>
                    <div><span>Outcome</span><strong>{settle?.finalStateLabel}</strong></div>
                    <div><span>Escrow</span><code>{short(settle?.escrowAddress)}</code></div>
                    <div><span>resolve tx</span><code>{short(settle?.resolveHash)}</code></div>
                    <div><span>Evidence (Walrus)</span><code>{short(pog?.evidenceUri)}</code></div>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>

        <section className="terminal-panel">
          <p className="terminal-eyebrow">Live transcript</p>
          {log.length === 0 ? (
            <p className="muted">No activity yet — post a task to start the loop.</p>
          ) : (
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.9rem", lineHeight: 1.9 }}>
              {log.map((e, i) => (
                <div key={i}>
                  <strong style={{ opacity: 0.85 }}>{ACTOR_LABEL[e.actor]}</strong>{" "}
                  <span className="muted">{e.text}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
