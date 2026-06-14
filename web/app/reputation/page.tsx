"use client";

import { useMemo, useState } from "react";
import { TerminalHeader } from "@/app/components/TerminalHeader";
import {
  REPUTATION_CONFIG,
  scoreCluster,
  type FraudEvent,
  type OperatorCluster
} from "@/lib/reputation";

// Fixed clock so fraud is "fresh" (age 0) and the demo is deterministic.
const NOW = Date.parse("2026-06-14T00:00:00Z");
const NOW_ISO = "2026-06-14T00:00:00Z";

type AgentMeta = { id: string; label: string; role: string };

const AGENTS: AgentMeta[] = [
  { id: "0xA1", label: "scraper-01", role: "proven — 70 earned" },
  { id: "0xA2", label: "indexer-02", role: "mid — 30 earned" },
  { id: "0xA3", label: "fresh-03", role: "new sibling — 0 earned" }
];

const BASE: OperatorCluster = {
  operatorRoot: "enterprise:acme.com",
  tier: "enterprise",
  standing: 80,
  agents: [
    { agentId: "0xA1", earned: 70 },
    { agentId: "0xA2", earned: 30 },
    { agentId: "0xA3", earned: 0 }
  ],
  fraudEvents: []
};

function barColor(trust: number): string {
  if (trust >= 60) return "#2ecc71";
  if (trust >= 25) return "#f1c40f";
  return "#e74c3c";
}

export default function ReputationDemoPage() {
  const [fraud, setFraud] = useState<FraudEvent[]>([]);

  const cluster = useMemo<OperatorCluster>(() => ({ ...BASE, fraudEvents: fraud }), [fraud]);
  const scored = useMemo(() => scoreCluster(cluster, NOW), [cluster]);
  const patternOn = scored.some((a) => a.breakdown.patternEscalated);

  const addFraud = (agentId: string) =>
    setFraud((prev) => [...prev, { agentId, kind: "poisoning", at: NOW_ISO }]);
  const reset = () => setFraud([]);

  const narrative = patternOn
    ? `PATTERN: ${fraud.length} fraud events across the cluster — this operator is the problem, so the whole cluster collapses to 0 (and bonds slash).`
    : fraud.length > 0
      ? `One fraud is "easy to share": it dragged every sibling by up to ${REPUTATION_CONFIG.MAX_SIBLING_DRAG}, and the offending agent itself dropped to ~0 — while clean siblings stay above 0 (hard, not auto-0).`
      : `Good reputation is "hard to share": fresh-03 inherits only a discounted, capped floor (${REPUTATION_CONFIG.DISCOUNT}× the operator's standing), never full trust. Now inject fraud and watch it propagate.`;

  return (
    <main className="terminal-page">
      <TerminalHeader active="reputation" />

      <section className="terminal-shell">
        <div className="terminal-hero">
          <p className="terminal-eyebrow">Operator-cluster reputation</p>
          <h1>Good reputation is hard to share. Fraud reputation is easy to share.</h1>
          <p>
            This runs the real <code>web/lib/reputation</code> engine in your browser. Operator{" "}
            <strong>acme.com</strong> (enterprise, standing 80) owns 3 sibling agents. Inject fraud and
            watch the cluster react — the math is{" "}
            <code>clamp(floor + earned − contamination, 0, cap)</code>.
          </p>
        </div>

        <section className={patternOn ? "terminal-panel tier-red" : "terminal-panel"}>
          <div className="panel-header">
            <div>
              <p className="terminal-eyebrow">Cluster — enterprise:acme.com</p>
              <h2>{fraud.length} fraud event{fraud.length === 1 ? "" : "s"}</h2>
            </div>
            <button className="secondary-action" onClick={reset} disabled={fraud.length === 0}>
              reset
            </button>
          </div>

          <p className="muted">{narrative}</p>

          <div className="key-value-list" style={{ marginTop: "1rem", gap: "1rem" }}>
            {scored.map((a, i) => {
              const meta = AGENTS[i];
              const b = a.breakdown;
              return (
                <div key={a.agentId} style={{ display: "block", borderTop: "1px solid #222", paddingTop: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <strong>
                      {meta.label}{" "}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        · {meta.role}
                      </span>
                      {b.offender ? (
                        <span style={{ color: "#e74c3c", marginLeft: 8 }}>OFFENDER</span>
                      ) : null}
                    </strong>
                    <strong style={{ color: barColor(a.trust), fontSize: "1.4rem" }}>{a.trust}</strong>
                  </div>

                  <div
                    style={{
                      height: 10,
                      background: "#1a1a1a",
                      borderRadius: 5,
                      overflow: "hidden",
                      margin: "0.4rem 0"
                    }}
                  >
                    <div
                      style={{
                        width: `${(a.trust / b.cap) * 100}%`,
                        height: "100%",
                        background: barColor(a.trust),
                        transition: "width 0.25s ease"
                      }}
                    />
                  </div>

                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    floor <strong>+{b.floor}</strong> &nbsp;·&nbsp; earned <strong>+{b.earned}</strong>{" "}
                    &nbsp;·&nbsp; contamination{" "}
                    <strong style={{ color: b.contamination > 0 ? "#e74c3c" : undefined }}>
                      −{b.contamination}
                    </strong>{" "}
                    &nbsp;·&nbsp; cap {b.cap}
                  </div>

                  <button
                    className="primary-action"
                    style={{ marginTop: "0.5rem" }}
                    onClick={() => addFraud(a.agentId)}
                  >
                    🚩 mark {meta.label} fraud
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="terminal-grid two">
          <div className="terminal-panel">
            <p className="terminal-eyebrow">Why it can't be gamed</p>
            <ul className="muted" style={{ lineHeight: 1.7 }}>
              <li>Upside is discounted ({REPUTATION_CONFIG.DISCOUNT}×) + capped → you can't spin up a fresh agent under a star operator and inherit full trust.</li>
              <li>Downside is fast + heavy ({REPUTATION_CONFIG.MAX_SIBLING_DRAG} drag) → you can't dodge a fraud mark by switching to a sibling.</li>
              <li>Fraud decays (half-life {REPUTATION_CONFIG.HALF_LIFE_DAYS}d) → one old mistake doesn't haunt a clean operator forever.</li>
              <li>A pattern (≥{REPUTATION_CONFIG.PATTERN_COUNT}) escalates → the operator, not one agent, is the problem → cluster → 0.</li>
            </ul>
          </div>
          <div className="terminal-panel">
            <p className="terminal-eyebrow">Engine</p>
            <div className="key-value-list">
              <div><span>Model</span><strong>clamp(floor + earned − contamination, 0, cap)</strong></div>
              <div><span>Source</span><code>web/lib/reputation</code></div>
              <div><span>Determinism</span><strong>clock passed in → replayable</strong></div>
              <div><span>Selfcheck</span><strong>7/7 invariants pass</strong></div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
