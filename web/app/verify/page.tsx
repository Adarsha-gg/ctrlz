"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TerminalHeader } from "@/app/components/TerminalHeader";
import type { CheckerReport } from "@/lib/checkers";
import type { CheckerMeta } from "@/lib/checkers/metaReputation";
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

const POLICY_LABEL: Record<string, string> = {
  "auto-hire": "Direct pay",
  escrow: "Escrow",
  "strict-validation": "Strict validation",
  reject: "Manual review"
};

type ValidationRegistryResult = {
  mode: "written" | "prepared" | "failed";
  validationRegistry: string;
  agentId: string;
  validator?: string;
  requestHash: string;
  requestURI: string;
  response: number;
  responseURI: string;
  responseHash: string;
  tag: string;
  requestTx?: string;
  responseTx?: string;
  validationStatus?: number;
  error?: string;
};

function shortValue(value: string) {
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return `${value.slice(0, 10)}...${value.slice(-8)}`;
  }
  return value;
}

function selectedPolicyCopy(policy: string) {
  if (policy === "auto-hire") {
    return "This agent is trusted enough for direct payment on low-risk repeat work; this verification run records extra evidence instead of protecting every payment with escrow.";
  }
  if (policy === "escrow") {
    return "Funds should be locked until the committed checks pass. The checker result controls whether payment releases.";
  }
  if (policy === "strict-validation") {
    return "This agent has thin or risky history, so the job should use escrow plus stricter checks before payment.";
  }
  return "This agent should not receive autonomous payment without manual review.";
}

function CheckerMetaLine({ meta }: { meta?: CheckerMeta }) {
  if (!meta) return null;
  return (
    <div className="checker-meta-line">
      <span>accuracy {Math.round(meta.accuracy * 100)}%</span>
      <span>weight {Math.round(meta.weight * 100)}%</span>
      <span>replay {meta.replay.status}</span>
      <span>
        wrong {meta.falsePass + meta.falseFail}/{meta.sampleCount}
      </span>
    </div>
  );
}

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

function checkDetail(check: (typeof DEMO_ACCEPTANCE_SPEC.checks)[number]) {
  if (check.type === "schema") {
    return `Requires ${(check.requiredFields as string[] | undefined)?.join(", ") ?? "declared fields"}.`;
  }
  if (check.type === "price_max") {
    return `Amount must be <= ${check.value} ${check.currency}.`;
  }
  if (check.type === "wallet_risk") {
    return `Recipient wallet risk must be ${check.maxTier} or safer.`;
  }
  if (check.type === "source_listing") {
    return "Source/listing evidence is advisory and affects confidence.";
  }
  return "Registered checker recomputes this condition.";
}

function bytes32(value: string): `0x${string}` {
  return value.startsWith("0x") ? (value as `0x${string}`) : (`0x${value}` as `0x${string}`);
}

function VerifyPageInner() {
  const searchParams = useSearchParams();
  const [active, setActive] = useState<DemoSubmission | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const [explaining, setExplaining] = useState(false);
  const [anchors, setAnchors] = useState<EvidenceAnchors | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [validationWrite, setValidationWrite] = useState<ValidationRegistryResult | null>(null);
  const [writingValidation, setWritingValidation] = useState(false);
  const selectedAgent = searchParams.get("agent");
  const selectedAgentId = searchParams.get("agentId");
  const selectedPolicy = searchParams.get("policy") ?? "";
  const selectedKind = searchParams.get("kind");
  const selectedScore = searchParams.get("score");
  const selectedDomain = searchParams.get("domain");

  async function run(demo: DemoSubmission) {
    const verification = verifySubmission(demo);
    setActive(demo);
    setResult(verification);
    setExplanation("");
    setExplaining(true);
    setAnchors(null);
    setValidationWrite(null);
    setAnchoring(true);
    setWritingValidation(false);

    // E2: anchor the evidence (Walrus → local fallback). Never throws; the
    // hash is always computed, so the evidence card always renders something.
    void anchorEvidence(verification)
      .then(async (nextAnchors) => {
        setAnchors(nextAnchors);

        if (!selectedAgentId || !/^\d+$/.test(selectedAgentId)) {
          return;
        }

        setWritingValidation(true);
        try {
          const res = await fetch("/api/erc8004/validation", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              agentId: selectedAgentId,
              score: verification.split.outputValidity.score,
              requestURI: nextAnchors.evidence.uri ?? "",
              responseURI: nextAnchors.evidence.uri ?? "",
              responseHash: bytes32(nextAnchors.evidence.hash),
              tag: "ctrlz.verify"
            })
          });
          const data = (await res.json()) as ValidationRegistryResult;
          setValidationWrite(data);
        } catch {
          setValidationWrite(null);
        } finally {
          setWritingValidation(false);
        }
      })
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
    <main className="terminal-app verify-terminal">
      <TerminalHeader active="verify" />
      <div className="verify-grid">
      <section className="listing">
        <p className="eyebrow">CTRL+Z Verify · spec-locked task</p>
        <h1 style={{ fontSize: "1.6rem", marginBottom: 12 }}>Re-run the task before money moves</h1>
        {selectedAgent && (
          <div className="selected-agent-panel">
            <div>
              <p className="field-label">Selected marketplace agent</p>
              <p className="selected-agent-title">
                Agent {selectedAgentId ?? shortValue(selectedAgent)} ·{" "}
                {POLICY_LABEL[selectedPolicy] ?? "Policy selected"}
              </p>
              <p className="muted-text" style={{ fontSize: "0.82rem", margin: "4px 0 0" }}>
                {selectedKind ? `${selectedKind} agent` : "marketplace agent"}
                {selectedDomain ? ` · ${selectedDomain}` : ""}
                {selectedScore ? ` · trust ${selectedScore}` : ""}
              </p>
              <p className="muted-text" style={{ fontSize: "0.82rem", margin: "6px 0 0" }}>
                {selectedPolicyCopy(selectedPolicy)}
              </p>
            </div>
            <code>{shortValue(selectedAgent)}</code>
          </div>
        )}
        <div className="verify-flow">
          <div>
            <span>1</span>
            <strong>Buyer locks task</strong>
            <p>{DEMO_INTENT}</p>
          </div>
          <div>
            <span>2</span>
            <strong>Worker submits output</strong>
            <p>Invoice, seller wallet, listing source, and shipping evidence.</p>
          </div>
          <div>
            <span>3</span>
            <strong>CTRL+Z recomputes</strong>
            <p>Registered deterministic checkers rerun the committed acceptance spec.</p>
          </div>
          <div>
            <span>4</span>
            <strong>Settle + update trust</strong>
            <p>Pass releases payment; the evidence hash feeds marketplace reputation.</p>
          </div>
        </div>

        <div className="verify-spec-panel">
          <p className="field-label">Committed acceptance spec</p>
          <p className="muted-text" style={{ fontSize: "0.82rem", margin: "0 0 10px" }}>
            This is the thing the buyer would commit before work starts. For now the live demo uses
            public deterministic checks; held-out commit-reveal exists in code but is not wired into
            this screen yet.
          </p>
          <ul className="spec-list spec-card-list">
            {DEMO_ACCEPTANCE_SPEC.checks.map((c) => (
              <li key={c.type}>
                <div>
                  <code>{c.type}</code>
                  <span className={`gate-badge ${c.hardGate ? "gate-hard" : "gate-advisory"}`}>
                    {c.hardGate ? "hard-gate" : "advisory"}
                  </span>
                </div>
                <p>{checkDetail(c)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="demo-row" style={{ marginTop: 16 }}>
          <span className="demo-hint">Choose worker output to verify:</span>
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
        {!active ? (
          <p className="empty-note">Pick an output. CTRL+Z will recompute the spec against it.</p>
        ) : (
          <div className="worker-output-panel">
            <p className="field-label">Worker output being checked</p>
            <dl>
              <div>
                <dt>Seller</dt>
                <dd>{active.submission.recipientName ?? "unknown"}</dd>
              </div>
              <div>
                <dt>Wallet</dt>
                <dd>{shortValue(active.submission.recipientAddress)}</dd>
              </div>
              <div>
                <dt>Item</dt>
                <dd>{active.submission.invoice.item ?? "n/a"}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>
                  {active.submission.invoice.amount ?? "n/a"} {active.submission.invoice.currency ?? ""}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{active.submission.sourceListing?.marketplace ?? "missing"}</dd>
              </div>
            </dl>
          </div>
        )}
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

          <div className="recompute-panel">
            <p className="field-label">Deterministic recompute</p>
            <dl>
              <div>
                <dt>Spec checks</dt>
                <dd>{result.scored.length}</dd>
              </div>
              <div>
                <dt>Replay status</dt>
                <dd>
                  {result.checkerMeta.every((meta) => meta.replay.status === "match")
                    ? "all matched"
                    : "mismatch found"}
                </dd>
              </div>
              <div>
                <dt>Hard gates</dt>
                <dd>
                  {result.scored.filter(({ check }) => check.hardGate).length} checked before payment
                </dd>
              </div>
              <div>
                <dt>Decision source</dt>
                <dd>checker reports, not worker self-certification</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="field-label">Checker reports</p>
            <ul className="report-list">
              {result.scored.map(({ check, report }, index) => (
                <li key={`${report.checker}-${index}`} className="report-item">
                  <span className="report-result">{RESULT_EMOJI[report.result]}</span>
                  <div>
                    <p className="report-head">
                      <strong>{report.checker}</strong>{" "}
                      <span className={`gate-badge ${check.hardGate ? "gate-hard" : "gate-advisory"}`}>
                        {check.hardGate ? "hard-gate" : "advisory"}
                      </span>{" "}
                      <span className="muted-text">conf {report.confidence}</span>
                    </p>
                    <CheckerMetaLine meta={result.checkerMeta[index]} />
                    <p className="report-detail">{report.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="field-label">Evidence anchor (Walrus · Sui)</p>
            {anchoring && !anchors && (
              <p className="muted-text" style={{ fontSize: "0.82rem", margin: 0 }}>
                Anchoring evidence on Walrus…
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
                    <span className="gate-badge gate-hard">Walrus (Sui)</span>
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
                    <p className="evidence-row">
                      <span className="evidence-key">Retrievability</span>
                      {anchors.readback.retrieved && anchors.readback.hashMatches ? (
                        <span className="gate-badge gate-hard">
                          ✅ re-fetched from Walrus · hash matches
                        </span>
                      ) : anchors.readback.retrieved ? (
                        <span className="gate-badge gate-advisory">
                          ⚠️ re-fetched · hash mismatch
                        </span>
                      ) : (
                        <span className="gate-badge gate-advisory">
                          aggregator not yet serving blob
                        </span>
                      )}
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
                  The sha256 hash is the load-bearing anchor — always computed. The blob lives on
                  Walrus, Sui&apos;s decentralized store; we round-trip it from the aggregator and
                  recompute the hash to prove it&apos;s genuinely retrievable, not just claimed. If
                  Walrus is down we keep the hash and degrade locally.
                </p>
              </div>
            )}
          </div>

          {selectedAgent && (
            <div className="trust-impact-panel">
              <p className="field-label">Marketplace trust impact</p>
              <p className="trust-impact-title">
                This result would update Agent {selectedAgentId ?? shortValue(selectedAgent)}
              </p>
              <p className="muted-text" style={{ fontSize: "0.82rem", margin: "4px 0 0" }}>
                CTRL+Z now prepares an ERC-8004 validation response from this settled evidence. If
                Hedera requester + validator keys are configured, it writes request + response to
                the ValidationRegistry; otherwise the exact payload is shown for replay.
              </p>
              <dl className="trust-impact-ledger">
                <div>
                  <dt>Policy</dt>
                  <dd>{POLICY_LABEL[selectedPolicy] ?? (selectedPolicy || "selected by score")}</dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>{REC_LABEL[split.recommendation]}</dd>
                </div>
                <div>
                  <dt>Agent key</dt>
                  <dd>{shortValue(selectedAgent)}</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>{anchors ? shortValue(anchors.evidence.hash) : "anchoring..."}</dd>
                </div>
                <div>
                  <dt>Registry</dt>
                  <dd>
                    {writingValidation
                      ? "writing..."
                      : validationWrite
                        ? validationWrite.mode
                        : selectedAgentId
                          ? "pending"
                          : "no agent id"}
                  </dd>
                </div>
                {validationWrite && (
                  <>
                    <div>
                      <dt>Request hash</dt>
                      <dd>{shortValue(validationWrite.requestHash)}</dd>
                    </div>
                    <div>
                      <dt>Response</dt>
                      <dd>{validationWrite.response}/100 · {validationWrite.tag}</dd>
                    </div>
                    <div>
                      <dt>Validation tx</dt>
                      <dd>
                        {validationWrite.responseTx ? shortValue(validationWrite.responseTx) : validationWrite.error ?? "prepared"}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          )}
        </section>
      )}
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="terminal-app verify-terminal"><TerminalHeader active="verify" /><section className="listing">Loading verification flow...</section></main>}>
      <VerifyPageInner />
    </Suspense>
  );
}
