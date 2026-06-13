"use client";

import { useState } from "react";
import type { CheckerReport } from "@/lib/checkers";
import type { Recommendation, SplitScore, SubScore } from "@/lib/scoring/score";
import {
  DEMO_INTENT,
  DEMO_ACCEPTANCE_SPEC,
  DEMO_SUBMISSIONS,
  type DemoSubmission
} from "./fixtures";
import {
  verifySubmission,
  anchorEvidence,
  type VerificationResult,
  type EvidenceAnchors
} from "./run";

/**
 * /verify (A3) — the verification surface. Shows the GPU-invoice demo task +
 * acceptance spec, runs the checkers over a one-click sample submission, renders
 * the split scores + every checker's report, and calls /api/explain to explain
 * the recommendation in plain English.
 *
 * Ethos guards: the checkers decide (verifySubmission is pure + deterministic);
 * the LLM only EXPLAINS the recommendation; the three scores stay separate; and
 * recipients are shown by name (no raw 0x in the headline copy) when known.
 */

const REC_LABEL: Record<Recommendation, string> = {
  proceed: "PROCEED",
  proceed_with_protection: "PROCEED WITH PROTECTION",
  pause: "PAUSE — buyer decision",
  reject: "REJECT"
};

const REC_EMOJI: Record<Recommendation, string> = {
  proceed: "🟢",
  proceed_with_protection: "🟡",
  pause: "🟡",
  reject: "🔴"
};

/** Map recommendation → the verdict-card tier class (reuse globals.css). */
const REC_TIER: Record<Recommendation, "tier-green" | "tier-yellow" | "tier-red"> = {
  proceed: "tier-green",
  proceed_with_protection: "tier-yellow",
  pause: "tier-yellow",
  reject: "tier-red"
};

const RESULT_EMOJI: Record<CheckerReport["result"], string> = {
  pass: "✅",
  fail: "❌",
  uncertain: "⚠️"
};

/**
 * Build the RiskVerdict-shaped payload the existing /api/explain route accepts,
 * so we reuse the merged explainer unchanged. The LLM explains this — it never
 * changes the recommendation, which is already decided deterministically.
 */
function toExplainPayload(split: SplitScore, reports: CheckerReport[]) {
  const tier =
    split.recommendation === "reject"
      ? "red"
      : split.recommendation === "proceed"
        ? "green"
        : "yellow";

  const signals = reports.map((r) => ({
    code: r.checker,
    tier: r.result === "fail" ? "red" : r.result === "pass" ? "green" : "yellow",
    message: r.detail
  }));

  const reasons = [
    `Recommendation: ${REC_LABEL[split.recommendation]}.`,
    `Output validity ${split.outputValidity.score}/100 (${split.outputValidity.status}); ` +
      `agent trust ${split.agentTrust.score}/100 (${split.agentTrust.status}); ` +
      `payment risk ${split.paymentRisk.score}/100 (${split.paymentRisk.status}).`,
    ...reports.map((r) => r.detail)
  ];

  return { tier, reasons, signals };
}

function ScoreTile({ label, sub }: { label: string; sub: SubScore }) {
  return (
    <div className="score-tile">
      <p className="score-label">{label}</p>
      <p className="score-value">{sub.score}</p>
      <p className={`score-status status-${sub.status}`}>{sub.status}</p>
    </div>
  );
}

export default function VerifyPage() {
  const [active, setActive] = useState<DemoSubmission | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [explaining, setExplaining] = useState(false);
  const [anchors, setAnchors] = useState<EvidenceAnchors | null>(null);
  const [anchoring, setAnchoring] = useState(false);

  async function run(demo: DemoSubmission) {
    const verification = verifySubmission(demo);
    setActive(demo);
    setResult(verification);
    setExplanation("");
    setExplaining(true);
    setAnchors(null);
    setAnchoring(true);

    // E2: anchor the evidence (Walrus → local fallback). Never throws; the
    // hash is always computed, so the evidence card always renders something.
    void anchorEvidence(verification)
      .then(setAnchors)
      .finally(() => setAnchoring(false));

    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verdict: toExplainPayload(verification.split, verification.reports)
        })
      });
      const data = (await res.json()) as { explanation?: string };
      setExplanation(data.explanation ?? "");
    } catch {
      setExplanation("");
    } finally {
      setExplaining(false);
    }
  }

  const split = result?.split;

  return (
    <main className="shell shell-wide">
      <section className="listing">
        <p className="eyebrow">CTRL+Z Verify · the one demo</p>
        <h1 style={{ fontSize: "1.6rem", marginBottom: 12 }}>Verify a hired agent&apos;s work</h1>
        <p className="muted-text" style={{ margin: "0 0 16px" }}>
          Buyer intent: <strong>{DEMO_INTENT}</strong>
        </p>

        <p className="field-label">Acceptance spec (the verifiable manifest)</p>
        <ul className="spec-list">
          {DEMO_ACCEPTANCE_SPEC.checks.map((c) => (
            <li key={c.type}>
              <code>{c.type}</code>
              <span className={`gate-badge ${c.hardGate ? "gate-hard" : "gate-advisory"}`}>
                {c.hardGate ? "hard-gate" : "advisory"}
              </span>
            </li>
          ))}
        </ul>

        <div className="demo-row" style={{ marginTop: 16 }}>
          <span className="demo-hint">Run a sample submission:</span>
          {DEMO_SUBMISSIONS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              className="demo-btn"
              onClick={() => void run(demo)}
              title={demo.hint}
            >
              {demo.label}
            </button>
          ))}
        </div>
        {!result && <p className="empty-note">Pick a submission to run the checkers.</p>}
      </section>

      {split && result && active && (
        <section className={`verdict-card ${REC_TIER[split.recommendation]}`}>
          <div className="verdict-head">
            <span className="verdict-emoji">{REC_EMOJI[split.recommendation]}</span>
            <div>
              <p className="verdict-tier">{REC_LABEL[split.recommendation]}</p>
              <p className="verdict-target">
                Seller{" "}
                <strong>{active.submission.recipientName ?? "(unnamed wallet)"}</strong> ·{" "}
                {active.submission.invoice.item} · {active.submission.invoice.amount}{" "}
                {active.submission.invoice.currency}
              </p>
            </div>
          </div>

          <div className="score-grid">
            <ScoreTile label="Output validity" sub={split.outputValidity} />
            <ScoreTile label="Agent trust" sub={split.agentTrust} />
            <ScoreTile label="Payment risk (safer = higher)" sub={split.paymentRisk} />
          </div>

          <div>
            <p className="field-label">Why this recommendation</p>
            <p className="verdict-explanation">
              {explaining
                ? "Asking the explainer…"
                : explanation || "The checks decided this; explainer unavailable."}
            </p>
            <p className="muted-text" style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>
              Checks decide. The LLM only explains this recommendation — it never sets the scores.
            </p>
          </div>

          <div>
            <p className="field-label">Checker reports</p>
            <ul className="report-list">
              {result.scored.map(({ check, report }) => (
                <li key={`${report.checker}`} className="report-item">
                  <span className="report-result">{RESULT_EMOJI[report.result]}</span>
                  <div>
                    <p className="report-head">
                      <strong>{report.checker}</strong>{" "}
                      <span className={`gate-badge ${check.hardGate ? "gate-hard" : "gate-advisory"}`}>
                        {check.hardGate ? "hard-gate" : "advisory"}
                      </span>{" "}
                      <span className="muted-text">conf {report.confidence}</span>
                    </p>
                    <p className="report-detail">{report.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="field-label">Evidence anchor (Walrus)</p>
            {anchoring && !anchors && (
              <p className="muted-text" style={{ fontSize: "0.82rem", margin: 0 }}>
                Anchoring evidence…
              </p>
            )}
            {anchors && (
              <div className="evidence-block">
                <p className="evidence-row">
                  <span className="evidence-key">Evidence hash (sha256)</span>
                  <code className="evidence-hash">{anchors.evidence.hash}</code>
                </p>
                <p className="evidence-row">
                  <span className="evidence-key">Acceptance-spec hash</span>
                  <code className="evidence-hash">{anchors.manifestHash}</code>
                </p>
                <p className="evidence-row">
                  <span className="evidence-key">Storage</span>
                  {anchors.evidence.store === "walrus" ? (
                    <span className="gate-badge gate-hard">Walrus</span>
                  ) : (
                    <span className="gate-badge gate-advisory">local (Walrus unavailable)</span>
                  )}
                </p>
                {anchors.evidence.store === "walrus" && anchors.evidence.blobId && (
                  <>
                    <p className="evidence-row">
                      <span className="evidence-key">Blob ID</span>
                      <code className="evidence-hash">{anchors.evidence.blobId}</code>
                    </p>
                    {anchors.evidence.uri && (
                      <p className="evidence-row">
                        <a
                          className="evidence-link"
                          href={anchors.evidence.uri}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View evidence on Walrus ↗
                        </a>
                      </p>
                    )}
                  </>
                )}
                <p className="muted-text" style={{ fontSize: "0.78rem", margin: "4px 0 0" }}>
                  The sha256 hash is the load-bearing anchor — always computed. Walrus is the
                  swappable store behind it; if it&apos;s down we keep the hash and degrade locally.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
