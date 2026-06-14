"use client";

import { useState } from "react";
import { TerminalHeader } from "@/app/components/TerminalHeader";

type DemoMode = "green" | "cheat";

type PayOnGreenResponse = {
  error?: string;
  accepts?: Array<Record<string, unknown>>;
  x402?: {
    required?: boolean;
    paid?: boolean;
    requirements?: {
      network?: string;
      asset?: string;
      maxAmountRequired?: string;
      payTo?: string;
    };
    receipt?: {
      mode?: string;
      transaction?: string;
    };
    error?: string;
  };
  recommendation?: string;
  evidenceHash?: string;
  evidenceUri?: string | null;
  settlement?: {
    resultLabel: "PASS" | "FAIL";
    releases: boolean;
    scoreBps: number;
    detail: string;
  };
  split?: {
    outputValidity: { score: number; status: string };
    agentTrust: { score: number; status: string };
    paymentRisk: { score: number; status: string };
  };
  replay?: {
    protocol?: string;
    runner?: {
      source?: string;
      sandbox?: string;
    };
    workspace?: {
      files?: Record<string, string>;
    };
    results?: Array<{ name: string; status: string }>;
  };
  erc8004Validation?: {
    mode: "written" | "prepared" | "failed" | "skipped";
    requestHash?: string;
    responseTx?: string;
    validationStatus?: number;
    error?: string;
  };
};

function short(value?: string | null) {
  if (!value) return "n/a";
  if (value.length <= 22) return value;
  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function statusClass(result?: PayOnGreenResponse["settlement"]) {
  if (!result) return "terminal-panel";
  return result.releases ? "terminal-panel tier-green" : "terminal-panel tier-red";
}

export default function PayOnGreenDemoPage() {
  const [mode, setMode] = useState<DemoMode>("green");
  const [payment, setPayment] = useState("");
  const [agentId, setAgentId] = useState("101");
  const [pending, setPending] = useState(false);
  const [response, setResponse] = useState<PayOnGreenResponse | null>(null);

  async function runDemo(nextMode = mode) {
    setPending(true);
    setResponse(null);
    try {
      const headers: HeadersInit = { "content-type": "application/json" };
      if (payment.trim()) headers["x-payment"] = payment.trim();
      const res = await fetch("/verify/payongreen", {
        method: "POST",
        headers,
        body: JSON.stringify({
          demo: nextMode,
          agentId,
          writeValidation: true,
          recipientName: "solver-7"
        })
      });
      const data = (await res.json()) as PayOnGreenResponse;
      setResponse(data);
    } catch (error) {
      setResponse({ error: error instanceof Error ? error.message : "pay-on-green request failed" });
    } finally {
      setPending(false);
    }
  }

  const settlement = response?.settlement;
  const requirements = response?.x402?.requirements;
  const notification = settlement
    ? settlement.releases
      ? "paid solver-7 after green tests"
      : "refunded buyer after held-out tests failed"
    : response?.error
      ? "action required"
      : "ready";

  return (
    <main className="terminal-page">
      <TerminalHeader active="verify" />

      <section className="terminal-shell">
        <div className="terminal-hero">
          <p className="terminal-eyebrow">Pay-on-green verifier</p>
          <h1>Run the suite, anchor replay evidence, then settle the result.</h1>
          <p>
            This page drives the real `/verify/payongreen` route. It shows the x402 gate when enabled,
            the replay bundle that gets anchored with evidence, and the ERC-8004 validation write status.
          </p>
        </div>

        <div className="terminal-grid two">
          <section className="terminal-panel">
            <div className="panel-header">
              <div>
                <p className="terminal-eyebrow">Demo controls</p>
                <h2>Fixture run</h2>
              </div>
            </div>

            <div className="agent-filter-grid">
              <label>
                <span>Variant</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as DemoMode)}>
                  <option value="green">green patch</option>
                  <option value="cheat">cheat patch</option>
                </select>
              </label>
              <label>
                <span>Agent ID</span>
                <input value={agentId} onChange={(event) => setAgentId(event.target.value)} />
              </label>
              <label>
                <span>X-PAYMENT</span>
                <input
                  value={payment}
                  placeholder="demo-x402:vercel-demo"
                  onChange={(event) => setPayment(event.target.value)}
                />
              </label>
            </div>

            <div className="action-row">
              <button
                className="primary-action"
                disabled={pending}
                onClick={() => {
                  setMode("green");
                  void runDemo("green");
                }}
              >
                {pending && mode === "green" ? "running..." : "Run green"}
              </button>
              <button
                className="secondary-action"
                disabled={pending}
                onClick={() => {
                  setMode("cheat");
                  void runDemo("cheat");
                }}
              >
                {pending && mode === "cheat" ? "running..." : "Run cheat"}
              </button>
            </div>
          </section>

          <section className={statusClass(settlement)}>
            <div className="panel-header">
              <div>
                <p className="terminal-eyebrow">Notification</p>
                <h2>{notification}</h2>
              </div>
            </div>

            {response?.error ? (
              <div className="notice warning">
                <strong>{response.error}</strong>
                {requirements ? (
                  <p>
                    Pay {requirements.maxAmountRequired} {requirements.asset} on {requirements.network} to{" "}
                    <code>{short(requirements.payTo)}</code>, then retry with an `X-PAYMENT` header.
                  </p>
                ) : null}
              </div>
            ) : settlement ? (
              <div className="key-value-list">
                <div>
                  <span>Result</span>
                  <strong>{settlement.resultLabel}</strong>
                </div>
                <div>
                  <span>Settlement</span>
                  <strong>{settlement.releases ? "release worker payment" : "refund buyer"}</strong>
                </div>
                <div>
                  <span>Score</span>
                  <strong>{settlement.scoreBps} bps</strong>
                </div>
                <div>
                  <span>Evidence</span>
                  <code>{short(response.evidenceHash)}</code>
                </div>
              </div>
            ) : (
              <p className="muted">No run yet.</p>
            )}
          </section>
        </div>

        {response ? (
          <div className="terminal-grid three">
            <section className="terminal-panel">
              <p className="terminal-eyebrow">Replay evidence</p>
              <h2>{response.replay?.protocol ?? "not anchored yet"}</h2>
              <div className="key-value-list">
                <div>
                  <span>Runner</span>
                  <strong>{response.replay?.runner?.source ?? "n/a"}</strong>
                </div>
                <div>
                  <span>Sandbox</span>
                  <strong>{response.replay?.runner?.sandbox ?? "n/a"}</strong>
                </div>
                <div>
                  <span>Files</span>
                  <strong>{Object.keys(response.replay?.workspace?.files ?? {}).length}</strong>
                </div>
                <div>
                  <span>Evidence URI</span>
                  <code>{short(response.evidenceUri)}</code>
                </div>
              </div>
            </section>

            <section className="terminal-panel">
              <p className="terminal-eyebrow">ERC-8004 validation</p>
              <h2>{response.erc8004Validation?.mode ?? "not requested"}</h2>
              <div className="key-value-list">
                <div>
                  <span>Request hash</span>
                  <code>{short(response.erc8004Validation?.requestHash)}</code>
                </div>
                <div>
                  <span>Response tx</span>
                  <code>{short(response.erc8004Validation?.responseTx)}</code>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{response.erc8004Validation?.validationStatus ?? "n/a"}</strong>
                </div>
                {response.erc8004Validation?.error ? (
                  <div>
                    <span>Error</span>
                    <strong>{response.erc8004Validation.error}</strong>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="terminal-panel">
              <p className="terminal-eyebrow">x402</p>
              <h2>{response.x402?.required ? (response.x402.paid ? "paid" : "required") : "disabled"}</h2>
              <div className="key-value-list">
                <div>
                  <span>Mode</span>
                  <strong>{response.x402?.receipt?.mode ?? "n/a"}</strong>
                </div>
                <div>
                  <span>Transaction</span>
                  <code>{short(response.x402?.receipt?.transaction)}</code>
                </div>
                <div>
                  <span>Amount</span>
                  <strong>
                    {requirements?.maxAmountRequired ?? "n/a"} {requirements?.asset ?? ""}
                  </strong>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
