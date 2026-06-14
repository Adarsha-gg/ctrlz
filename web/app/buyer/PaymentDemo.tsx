"use client";

import { useMemo, useState } from "react";
import {
  CLEAN_SUBMISSION,
  DEMO_ACCEPTANCE_SPEC,
  type DemoSubmission
} from "@/app/verify/fixtures";
import {
  anchorEvidence,
  verifySubmission,
  type AcceptanceSpecInput,
  type EvidenceAnchors,
  type VerificationResult
} from "@/app/verify/run";
import type { BuyerQuery } from "./page";
import {
  ctrlzVerifyEscrowAddress,
  ctrlzVerifyEscrowDeployment,
  ctrlzWalrusEvidence,
  erc8004HederaTestnet
} from "@/lib/contract";
import type { CheckSpec } from "@/lib/checkers";

type PaymentMode = "Direct pay" | "Escrow" | "Strict validation" | "Reject";
type SpecId = "procurement-700" | "procurement-500" | "wallet-source";

type ValidationRegistryResult = {
  mode: "written" | "prepared" | "failed";
  requestHash: string;
  requestTx?: string;
  responseTx?: string;
  error?: string;
};

const steps = ["Spec", "Payment", "Execute", "Report", "Settle"] as const;
const demo = ctrlzVerifyEscrowDeployment.demo;

const modes: Array<{ key: PaymentMode; title: string; desc: string }> = [
  {
    key: "Direct pay",
    title: "Direct pay",
    desc: "Agent-to-agent transfer with no hold. Only for high-trust, validation-backed agents."
  },
  {
    key: "Escrow",
    title: "Escrow",
    desc: "Funds lock in Hedera escrow and release only after the acceptance spec matches."
  },
  {
    key: "Strict validation",
    title: "Strict validation",
    desc: "Lock funds and run ERC-8004 validation with Walrus proof before release."
  },
  {
    key: "Reject",
    title: "Reject / manual review",
    desc: "Block automatic payment and route the job to a human."
  }
];

const specVariants: Array<{
  id: SpecId;
  title: string;
  desc: string;
  spec: AcceptanceSpecInput;
}> = [
  {
    id: "procurement-700",
    title: "GPU procurement <= 700 HBAR",
    desc: "The live verify escrow demo: valid invoice schema, known seller wallet, source listing, and max price.",
    spec: DEMO_ACCEPTANCE_SPEC
  },
  {
    id: "procurement-500",
    title: "Strict budget <= 500 HBAR",
    desc: "Same task shape, but a tighter hidden-budget style gate. The sample output fails this one.",
    spec: {
      intent: "Buy an RTX 4090 under 500 HBAR from a seller with a valid wallet + shipping proof.",
      checks: DEMO_ACCEPTANCE_SPEC.checks.map((check) =>
        check.type === "price_max" ? { ...check, value: 500 } : check
      )
    }
  },
  {
    id: "wallet-source",
    title: "Wallet + source validation",
    desc: "Use this when price is negotiated elsewhere but wallet safety and source evidence still gate release.",
    spec: {
      intent: "Verify the seller wallet, invoice schema, and source listing before payment release.",
      checks: DEMO_ACCEPTANCE_SPEC.checks.filter((check) => check.type !== "price_max")
    }
  }
];

function modeFromPolicy(policy?: string): PaymentMode {
  if (policy === "auto-hire") return "Direct pay";
  if (policy === "strict-validation") return "Strict validation";
  if (policy === "reject") return "Reject";
  return "Escrow";
}

function short(value?: string, head = 10, tail = 8) {
  if (!value) return "pending";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function hederaTxUrl(hash?: string) {
  return hash && hash.startsWith("0x") ? `https://hashscan.io/testnet/transaction/${hash}` : undefined;
}

function bytes32(value: string): `0x${string}` {
  return value.startsWith("0x") ? (value as `0x${string}`) : (`0x${value}` as `0x${string}`);
}

function agentName(query: BuyerQuery) {
  if (query.domain && query.domain !== "embedded metadata") return query.domain;
  if (query.agent) return query.agent;
  return "selected ERC-8004 agent";
}

function workLabel(query: BuyerQuery) {
  return query.workLabel ?? query.kind ?? "Agent work";
}

function trustScore(query: BuyerQuery) {
  const parsed = Number(query.score);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 77;
}

function scoreAfter(score: number, mode: PaymentMode, passed: boolean) {
  if (!passed || mode === "Reject") return score;
  if (mode === "Strict validation") return Math.min(100, score + 7);
  if (mode === "Escrow") return Math.min(100, score + 5);
  return Math.min(100, score + 2);
}

function specDetail(check: CheckSpec, submission: DemoSubmission) {
  if (check.type === "schema") {
    const fields = Array.isArray(check.requiredFields) ? check.requiredFields.join(", ") : "required fields";
    return { title: "Deliverable matches schema", detail: fields };
  }
  if (check.type === "price_max") {
    return {
      title: "Invoice stays under committed cap",
      detail: `max ${String(check.value)} ${String(check.currency ?? "HBAR")} · sample ${submission.submission.invoice.amount} HBAR`
    };
  }
  if (check.type === "wallet_risk") {
    return {
      title: "Recipient wallet clears risk gate",
      detail: `${submission.submission.recipientName ?? "recipient"} · ${short(submission.submission.recipientAddress, 8, 6)}`
    };
  }
  if (check.type === "source_listing") {
    return {
      title: "Source listing attached",
      detail: submission.submission.sourceListing?.url ?? "source evidence required"
    };
  }
  return { title: `${check.type} check`, detail: check.hardGate ? "hard gate" : "advisory" };
}

function modeCopy(mode: PaymentMode) {
  if (mode === "Direct pay") {
    return {
      execTitle: "Re-running checks before direct pay",
      execSub: "No escrow hold. CTRL+Z still recomputes the spec before transfer.",
      lockLabel: "Transfer pending",
      reportTitle: "Spec matched. Direct payment allowed.",
      reportSub: "The agent clears the trust threshold and the output is reproducible.",
      endTitle: "Paid - direct transfer",
      fundsLabel: "Transferred",
      impactNote: "Direct-pay success adds a small validation-backed trust lift."
    };
  }
  if (mode === "Strict validation") {
    return {
      execTitle: "Locking funds and running strict validation",
      execSub: "Escrow stays locked until all checks pass and the validation proof is written.",
      lockLabel: "Locked + validating",
      reportTitle: "Validation proof generated.",
      reportSub: "The committed spec, evidence blob, and checker reports all matched or failed deterministically.",
      endTitle: "Escrow resolved - validation recorded",
      fundsLabel: "Released from escrow",
      impactNote: "Strict validation creates stronger marketplace evidence than plain feedback."
    };
  }
  if (mode === "Reject") {
    return {
      execTitle: "Automatic payment blocked",
      execSub: "No value moves. The job is routed to manual review.",
      lockLabel: "Not moved",
      reportTitle: "Manual review required.",
      reportSub: "Trust or spec signals are insufficient for autonomous settlement.",
      endTitle: "Paused - manual review",
      fundsLabel: "Held",
      impactNote: "No positive trust update until a reviewer resolves the job."
    };
  }
  return {
    execTitle: "Locking escrow and running checks",
    execSub: "Escrow is held until every hard-gate check passes and the spec is met.",
    lockLabel: "Locked in escrow",
    reportTitle: "Spec recomputed. Escrow can resolve.",
    reportSub: "The worker output was checked against the chosen acceptance spec.",
    endTitle: "Paid - escrow released",
    fundsLabel: "Released from escrow",
    impactNote: "Escrow release becomes validation-backed evidence for the next buyer."
  };
}

export function PaymentDemo({ query }: { query: BuyerQuery }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<PaymentMode>(() => modeFromPolicy(query.policy));
  const [specId, setSpecId] = useState<SpecId>("procurement-700");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [anchors, setAnchors] = useState<EvidenceAnchors | null>(null);
  const [validationWrite, setValidationWrite] = useState<ValidationRegistryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const selectedSpec = specVariants.find((item) => item.id === specId) ?? specVariants[0];
  const copy = useMemo(() => modeCopy(mode), [mode]);
  const rejected = mode === "Reject";
  const score = trustScore(query);
  const passed = result ? result.split.recommendation === "proceed" : false;
  const finalScore = scoreAfter(score, mode, passed);
  const budget = selectedSpec.id === "procurement-500" ? 500 : 700;
  const validationTx =
    validationWrite?.responseTx ??
    (validationWrite?.mode === "prepared" ? validationWrite.requestHash : demo.validationResponseHash);
  const walrusLabel =
    anchors?.evidence.store === "walrus"
      ? `blob:${anchors.evidence.blobId}`
      : anchors
        ? "local sha256 fallback"
        : `blob:${ctrlzWalrusEvidence.blobId}`;

  const checks = [
    "Selected ERC-8004 marketplace agent",
    mode === "Direct pay" ? "Direct-pay policy accepted" : "Hedera escrow lock available",
    "Chosen acceptance spec loaded",
    "Deterministic checker runtime replayed",
    "Walrus evidence store attempted",
    "ERC-8004 ValidationRegistry response prepared"
  ];

  async function runSettlementChecks() {
    if (rejected) {
      setStep(4);
      return;
    }

    setStep(2);
    setRunning(true);
    setRunError(null);
    setResult(null);
    setAnchors(null);
    setValidationWrite(null);

    try {
      const verification = verifySubmission(CLEAN_SUBMISSION, selectedSpec.spec);
      setResult(verification);
      const nextAnchors = await anchorEvidence(verification);
      setAnchors(nextAnchors);

      if (query.agentId && /^\d+$/.test(query.agentId)) {
        const res = await fetch("/api/erc8004/validation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agentId: query.agentId,
            score: verification.split.outputValidity.score,
            requestURI: nextAnchors.evidence.uri ?? ctrlzWalrusEvidence.uri,
            responseURI: nextAnchors.evidence.uri ?? ctrlzWalrusEvidence.uri,
            responseHash: bytes32(nextAnchors.evidence.hash),
            tag: "ctrlz.marketplace.payment"
          })
        });
        const data = (await res.json()) as ValidationRegistryResult;
        setValidationWrite(data);
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Payment proof generation failed");
    } finally {
      setRunning(false);
    }
  }

  function nextStep() {
    if (step === 1) {
      void runSettlementChecks();
      return;
    }
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  const primaryLabel =
    step === 0
      ? "Continue to payment"
      : step === 1
        ? rejected
          ? "Send to manual review"
          : mode === "Direct pay"
            ? "Recompute then pay"
            : mode === "Escrow"
              ? "Lock escrow & run checks"
              : "Lock & generate validation proof"
        : step === 2
          ? running
            ? "Generating proof..."
            : "Open proof report"
          : step === 3
            ? "Settle & release"
            : "Settlement complete";

  const proofRows = [
    {
      key: "Walrus evidence",
      value: walrusLabel,
      sub: anchors?.evidence.uri ?? ctrlzWalrusEvidence.uri,
      href: anchors?.evidence.uri ?? ctrlzWalrusEvidence.uri
    },
    {
      key: "Evidence sha256",
      value: anchors ? bytes32(anchors.evidence.hash) : demo.evidenceHash,
      sub: "content-addressed proof"
    },
    {
      key: "Acceptance spec hash",
      value: anchors ? bytes32(anchors.manifestHash) : demo.specHash,
      sub: selectedSpec.title
    },
    {
      key: "Hedera lock tx",
      value: demo.lockHash,
      sub: `escrow ${ctrlzVerifyEscrowAddress}`,
      href: hederaTxUrl(demo.lockHash)
    },
    {
      key: "Hedera resolve tx",
      value: demo.resolveHash,
      sub: `task #${demo.taskId}`,
      href: hederaTxUrl(demo.resolveHash)
    },
    {
      key: "ERC-8004 validation",
      value: rejected ? "manual review" : validationTx,
      sub:
        validationWrite?.mode === "written"
          ? "new ValidationRegistry write"
          : validationWrite?.mode === "prepared"
            ? "prepared - signer env missing"
            : `registry ${erc8004HederaTestnet.validationRegistry}`,
      href: validationWrite?.responseTx
        ? hederaTxUrl(validationWrite.responseTx)
        : validationWrite?.requestTx
          ? hederaTxUrl(validationWrite.requestTx)
          : hederaTxUrl(demo.validationResponseHash)
    }
  ];

  return (
    <section className="payment-demo">
      <aside className="payment-summary">
        <p className="terminal-eyebrow">Buyer settlement</p>
        <h1>{selectedSpec.spec.intent}</h1>
        <div className="payment-agent-card">
          <div>
            <span>Hired agent</span>
            <strong>{agentName(query)}</strong>
            <p>
              {workLabel(query)} · trust {score}
            </p>
          </div>
          <div className="payment-score">{score}</div>
        </div>
        <dl className="payment-ledger">
          <div>
            <dt>Budget</dt>
            <dd>{budget} HBAR</dd>
          </div>
          <div>
            <dt>Policy</dt>
            <dd>{mode}</dd>
          </div>
          <div>
            <dt>Spec hash</dt>
            <dd>{anchors ? bytes32(anchors.manifestHash) : "generated on run"}</dd>
          </div>
          <div>
            <dt>Escrow</dt>
            <dd>{mode === "Direct pay" || rejected ? "not required" : short(ctrlzVerifyEscrowAddress)}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{short(query.owner)}</dd>
          </div>
        </dl>
      </aside>

      <div className="payment-workspace">
        <nav className="payment-steps" aria-label="Payment steps">
          {steps.map((label, index) => (
            <button
              key={label}
              className={index === step ? "active" : index < step ? "done" : ""}
              type="button"
              onClick={() => setStep(index)}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>

        {step === 0 ? (
          <div className="payment-panel">
            <h2>Choose the acceptance spec</h2>
            <p>
              The buyer chooses the machine-checkable spec before funds move. The worker output is
              recomputed against this exact manifest, then the evidence is anchored.
            </p>
            <div className="payment-mode-list spec-choice-list">
              {specVariants.map((item) => (
                <button
                  key={item.id}
                  className={specId === item.id ? "active" : ""}
                  type="button"
                  onClick={() => setSpecId(item.id)}
                >
                  <span className="payment-radio">
                    <span />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.desc}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="payment-spec-list">
              {selectedSpec.spec.checks.map((check) => {
                const detail = specDetail(check, CLEAN_SUBMISSION);
                return (
                  <div key={`${check.type}-${detail.detail}`}>
                    <span>{check.hardGate ? "!" : "i"}</span>
                    <div>
                      <strong>{detail.title}</strong>
                      <p>{detail.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="payment-panel">
            <h2>Payment mode</h2>
            <p>Pre-selected from the marketplace trust policy. You can override; the choice changes settlement terms.</p>
            <div className="payment-mode-list">
              {modes.map((item) => (
                <button
                  key={item.key}
                  className={mode === item.key ? "active" : ""}
                  type="button"
                  onClick={() => setMode(item.key)}
                >
                  <span className="payment-radio">
                    <span />
                  </span>
                  <span>
                    <strong>
                      {item.title}
                      {item.key === modeFromPolicy(query.policy) ? <em>policy pick</em> : null}
                    </strong>
                    <small>{item.desc}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="payment-panel">
            <div className="payment-panel-head">
              <div>
                <h2>{copy.execTitle}</h2>
                <p>{copy.execSub}</p>
              </div>
              <div>
                <span>{copy.lockLabel}</span>
                <strong>{budget} HBAR</strong>
              </div>
            </div>
            {runError ? (
              <div className="payment-banner reject">
                <span>!</span>
                <div>
                  <strong>Proof run failed</strong>
                  <p>{runError}</p>
                </div>
              </div>
            ) : null}
            <div className="payment-check-list">
              {checks.map((check, index) => (
                <div key={check}>
                  <span>{running && index > 2 ? "..." : result || index < 3 ? "✓" : "-"}</span>
                  <p>{check}</p>
                  <strong>{running && index > 2 ? "running" : result || index < 3 ? "pass" : "pending"}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="payment-panel">
            <div className={passed ? "payment-banner" : "payment-banner reject"}>
              <span>{passed ? "✓" : "!"}</span>
              <div>
                <strong>{passed ? copy.reportTitle : "Spec did not clear."}</strong>
                <p>
                  {passed
                    ? copy.reportSub
                    : "The selected spec is real: if the checks fail, the UI does not pretend the escrow should release."}
                </p>
              </div>
            </div>
            <div className="payment-proof-list">
              {proofRows.map((row) => (
                <div key={row.key}>
                  <span>
                    <strong>{row.key}</strong>
                    <small>{row.sub}</small>
                  </span>
                  {row.href ? (
                    <a href={row.href} target="_blank" rel="noreferrer">
                      {row.value}
                    </a>
                  ) : (
                    <code>{row.value}</code>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="payment-panel">
            <div className={passed && !rejected ? "payment-banner" : "payment-banner reject"}>
              <span>{passed && !rejected ? "✓" : "!"}</span>
              <div>
                <strong>{passed && !rejected ? copy.endTitle : "Not auto-settled"}</strong>
                <p>
                  {passed && !rejected
                    ? "The payment result is now reputation evidence for the marketplace ranking."
                    : "Funds did not move automatically because the policy or selected spec blocked it."}
                </p>
              </div>
            </div>
            <div className="payment-settlement-grid">
              <div>
                <p>Funds</p>
                <dl>
                  <div>
                    <dt>{copy.fundsLabel}</dt>
                    <dd>{passed && !rejected ? `${budget} HBAR` : "0 HBAR"}</dd>
                  </div>
                  <div>
                    <dt>Live tx shown</dt>
                    <dd>{passed && !rejected ? short(demo.resolveHash) : "none"}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <p>Trust score impact</p>
                <div className="payment-impact">
                  <span>{score}</span>
                  <small>to</small>
                  <span className={finalScore === score ? "flat" : ""}>{finalScore}</span>
                  <em>{finalScore === score ? "+0" : `+${finalScore - score}`}</em>
                </div>
                <small>{copy.impactNote}</small>
              </div>
            </div>
          </div>
        ) : null}

        <div className="payment-actions">
          <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || running}>
            Back
          </button>
          <button type="button" onClick={nextStep} disabled={step === steps.length - 1 || running}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
