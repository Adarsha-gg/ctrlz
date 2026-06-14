"use client";

import { useEffect, useMemo, useState } from "react";
import { TerminalHeader } from "@/app/components/TerminalHeader";

/**
 * /verify/reconcile — the data-work submission workflow (the missing spine made
 * visible). A worker submits an expensive data-aggregation output; CTRL+Z
 * spot-checks a commit-derived random sample against ground truth and produces
 * the settlement the escrow `resolve()` consumes.
 *
 * The checkers decide; nothing here trusts the worker's claims.
 */

type DataRecord = { key: string; value: Record<string, string | number> };

type SubmitResponse = {
  intent: string;
  rowsCommit: string;
  commitVerified: boolean;
  sampledKeys: string[];
  sampledCount: number;
  totalRows: number;
  reports: Array<{ checker: string; result: string; confidence: number; detail: string }>;
  split: {
    outputValidity: { score: number; status: string };
    agentTrust: { score: number; status: string };
    paymentRisk: { score: number; status: string };
    recommendation: string;
  };
  recommendation: string;
  evidenceHash: string;
  evidenceStore: string;
  evidenceUri: string | null;
  specHash: string;
  heldout: {
    used: boolean;
    auditKeys?: string[];
    hiddenCount?: number;
    commit?: string;
    revealVerified?: boolean;
    revealStore?: string;
    revealBlobId?: string | null;
    revealUri?: string | null;
    revealHash?: string;
  };
  settlement: {
    result: number;
    resultLabel: string;
    scoreBps: number;
    recommendation: string;
    recommendationHash: string;
    releases: boolean;
    detail: string;
  };
};

type SettleReceipt = {
  configured?: boolean;
  error?: string;
  chainId?: number;
  escrowAddress?: string;
  taskId?: string;
  result?: string;
  scoreBps?: number;
  finalState?: number;
  finalStateLabel?: string;
  lockHash?: string;
  acceptHash?: string;
  submitHash?: string;
  resolveHash?: string;
  resolveStatus?: string;
  explorer?: string;
};

const INTENT =
  "Reconcile every USDC transfer for the treasury wallet over the window, keyed by tx hash.";

/** A small honest dataset: tx hash → { amount, token }. Stands in for an expensive scan. */
const HONEST_ROWS: DataRecord[] = Array.from({ length: 24 }, (_, i) => ({
  key: `0x${(0xa1000 + i * 7).toString(16)}`,
  value: { amount: 1000 + i * 137, token: "USDC" }
}));

/** Ground truth a verifier independently re-fetches — here, the true chain values. */
const GROUND_TRUTH: DataRecord[] = HONEST_ROWS.map((r) => ({ key: r.key, value: { ...r.value } }));

/**
 * The buyer's SECRET audit set — committed before work, hidden from the worker.
 * It deliberately includes row 5 (the row the tampered worker fakes), so the
 * held-out audit catches a targeted fake even on a run where the random public
 * sample happens to miss it. The worker never sees these keys.
 */
const AUDIT_KEYS: string[] = [5, 11, 17].map((i) => HONEST_ROWS[i].key);

const short = (h: string) => (h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);

const RESULT_TONE: Record<string, string> = {
  PASS: "#3fb950",
  FAIL: "#f85149",
  UNCERTAIN: "#d29922"
};

export default function ReconcilePage() {
  const [mode, setMode] = useState<"honest" | "tampered">("honest");
  const [heldoutOn, setHeldoutOn] = useState(true);
  const [resp, setResp] = useState<SubmitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [settling, setSettling] = useState(false);
  const [settle, setSettle] = useState<SettleReceipt | null>(null);
  // null = unknown (still probing). Tells the UI whether the server can settle
  // on-chain, so a keyless deploy reads clearly instead of failing on click.
  const [chainReady, setChainReady] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/verify/settle")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => {
        if (live) setChainReady(Boolean(d.configured));
      })
      .catch(() => {
        if (live) setChainReady(false);
      });
    return () => {
      live = false;
    };
  }, []);

  // The tampered worker fakes one row's amount AFTER producing the data. Because
  // the spot-check sample is derived from the commit of its (faked) rows, it
  // cannot know whether the faked row will be the one re-checked.
  const rows = useMemo<DataRecord[]>(() => {
    if (mode === "honest") return HONEST_ROWS;
    const faked = HONEST_ROWS.map((r) => ({ key: r.key, value: { ...r.value } }));
    faked[5] = { key: faked[5].key, value: { ...faked[5].value, amount: 999999 } };
    return faked;
  }, [mode]);

  async function submit() {
    setBusy(true);
    setError("");
    setResp(null);
    try {
      const res = await fetch("/verify/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: INTENT,
          rows,
          sample: GROUND_TRUTH,
          sampleSize: 6,
          numericFields: ["amount"],
          tolerance: 0,
          recipientName: "treasury-indexer.agent",
          ...(heldoutOn
            ? { heldout: { auditKeys: AUDIT_KEYS, tolerance: 0, numericFields: ["amount"] } }
            : {})
        })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `submit failed (${res.status})`);
      }
      setResp((await res.json()) as SubmitResponse);
      setSettle(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "submit failed");
    } finally {
      setBusy(false);
    }
  }

  // One-click settlement: hand the verdict hashes to the server, which drives
  // the Hedera escrow lock→accept→submit→resolve. PASS → PAID, FAIL → REFUNDED.
  async function settleOnChain() {
    if (!resp) return;
    setSettling(true);
    setSettle(null);
    try {
      const res = await fetch("/verify/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          specHash: resp.specHash,
          evidenceHash: resp.evidenceHash,
          recommendationHash: resp.settlement.recommendationHash,
          result: resp.settlement.resultLabel,
          scoreBps: resp.settlement.scoreBps
        })
      });
      setSettle((await res.json()) as SettleReceipt);
    } catch (e) {
      setSettle({ error: e instanceof Error ? e.message : "settlement failed" });
    } finally {
      setSettling(false);
    }
  }

  const tampScratched =
    resp && mode === "tampered" && resp.settlement.resultLabel !== "FAIL";

  return (
    <main className="terminal-app verify-terminal">
      <TerminalHeader active="verify" />
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 64px" }}>
        <p className="eyebrow">CTRL+Z Verify · data-work submission</p>
        <h1 style={{ fontSize: "1.6rem", margin: "6px 0 8px" }}>
          Submit data work · verified by sampled recompute
        </h1>
        <p className="muted-text" style={{ maxWidth: 720 }}>
          The worker did the expensive job (reconcile every transfer). CTRL+Z does the cheap one:
          re-derive a random sample from the worker&apos;s own commitment and check only those rows
          against ground truth. Expensive to produce, cheap to verify — the only place a verifier
          earns its keep.
        </p>

        <section
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            margin: "20px 0"
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={mode === "honest" ? "primary-action" : ""}
              onClick={() => setMode("honest")}
              style={pill(mode === "honest")}
            >
              honest worker
            </button>
            <button
              type="button"
              className={mode === "tampered" ? "primary-action" : ""}
              onClick={() => setMode("tampered")}
              style={pill(mode === "tampered")}
            >
              worker fakes 1 row
            </button>
          </div>
          <button
            type="button"
            className={heldoutOn ? "primary-action" : ""}
            onClick={() => setHeldoutOn((v) => !v)}
            style={pill(heldoutOn)}
            title="Buyer commits a secret audit set before work; revealed + stored on Walrus at resolution"
          >
            {heldoutOn ? "✓ buyer holds out audit" : "buyer holds out audit"}
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} style={submitBtn(busy)}>
            {busy ? "verifying…" : `submit ${rows.length} rows →`}
          </button>
        </section>

        {error && (
          <p style={{ color: "#f85149", fontFamily: "monospace", fontSize: 13 }}>error: {error}</p>
        )}

        {resp && (
          <div style={{ display: "grid", gap: 16 }}>
            <Panel title="commit-reveal">
              <Row k="rows committed" v={`${resp.totalRows} rows`} />
              <Row k="rowsCommit" v={short(resp.rowsCommit)} mono />
              <Row
                k="reveal matches commit"
                v={resp.commitVerified ? "yes — not altered after commit" : "NO — tampered"}
                tone={resp.commitVerified ? "#3fb950" : "#f85149"}
              />
              <Row
                k="sampled keys (commit-derived)"
                v={`${resp.sampledCount}/${resp.totalRows} · ${resp.sampledKeys.map(short).join(", ")}`}
                mono
              />
            </Panel>

            {resp.heldout.used && (
              <Panel title="held-out audit · commit-reveal on Walrus">
                <Row k="hidden checks committed pre-work" v={`${resp.heldout.hiddenCount} (worker saw the count, not the keys)`} />
                <Row k="hiddenChecksCommit" v={short(resp.heldout.commit ?? "")} mono />
                <Row
                  k="reveal stored on"
                  v={
                    resp.heldout.revealStore === "walrus"
                      ? `Walrus (Sui) · ${short(resp.heldout.revealBlobId ?? "")}`
                      : "local (Walrus unavailable)"
                  }
                  tone={resp.heldout.revealStore === "walrus" ? "#3fb950" : "#d29922"}
                  mono
                />
                <Row
                  k="reveal matches commit"
                  v={resp.heldout.revealVerified ? "yes — buyer didn't move the goalposts" : "NO — commit mismatch"}
                  tone={resp.heldout.revealVerified ? "#3fb950" : "#f85149"}
                />
                <Row k="revealHash (sha256)" v={short(resp.heldout.revealHash ?? "")} mono />
                <Row
                  k="secret audit keys (now revealed)"
                  v={(resp.heldout.auditKeys ?? []).map(short).join(", ")}
                  mono
                />
                {resp.heldout.revealUri && (
                  <div style={{ padding: "3px 0" }}>
                    <a
                      href={resp.heldout.revealUri}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13, color: "#2f81f7" }}
                    >
                      view reveal blob on Walrus ↗
                    </a>
                  </div>
                )}
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#9aa4b2" }}>
                  The buyer committed these audit rows before work started (hash only). The worker
                  couldn&apos;t know which rows it would be held to, so it can&apos;t fake just the
                  publicly-sampled ones. At resolution the audit is revealed as its own
                  content-addressed Walrus blob — anyone can re-fetch it and prove it matches the
                  pre-work commit.
                </p>
              </Panel>
            )}

            <Panel title="checker reports">
              {resp.reports.map((r, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <Row
                    k={r.checker}
                    v={`${r.result.toUpperCase()} · conf ${r.confidence}`}
                    tone={r.result === "fail" ? "#f85149" : r.result === "pass" ? "#3fb950" : "#d29922"}
                  />
                  <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#9aa4b2" }}>{r.detail}</p>
                </div>
              ))}
            </Panel>

            <Panel title="split score — never collapsed">
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <Score label="output validity" {...resp.split.outputValidity} />
                <Score label="agent trust" {...resp.split.agentTrust} />
                <Score label="payment risk" {...resp.split.paymentRisk} />
              </div>
            </Panel>

            <Panel title="settlement — what resolve() gets">
              <Row
                k="VerificationResult"
                v={`${resp.settlement.resultLabel} (${resp.settlement.result})`}
                tone={RESULT_TONE[resp.settlement.resultLabel]}
                mono
              />
              <Row k="scoreBps" v={String(resp.settlement.scoreBps)} mono />
              <Row k="recommendation" v={resp.recommendation} mono />
              <Row k="recommendationHash" v={short(resp.settlement.recommendationHash)} mono />
              <Row k="specHash" v={short(resp.specHash)} mono />
              <Row
                k="evidenceHash"
                v={`${short(resp.evidenceHash)} (${resp.evidenceStore})`}
                mono
              />
              <Row
                k="escrow action"
                v={resp.settlement.releases ? "RELEASE to worker" : "HOLD / REFUND buyer"}
                tone={resp.settlement.releases ? "#3fb950" : "#f85149"}
              />
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#9aa4b2" }}>
                {resp.settlement.detail}
              </p>

              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid #21262d",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap"
                }}
              >
                <button
                  type="button"
                  onClick={() => void settleOnChain()}
                  disabled={settling || chainReady === false}
                  style={settleBtn(settling, resp.settlement.releases, chainReady === false)}
                >
                  {chainReady === false
                    ? "on-chain settle unavailable"
                    : settling
                      ? "settling on Hedera…"
                      : `settle on Hedera → ${resp.settlement.releases ? "pay worker" : "refund buyer"}`}
                </button>
                <span style={{ fontSize: 12, color: chainReady === false ? "#d29922" : "#7d8590" }}>
                  {chainReady === false
                    ? "server has no Hedera creds (.env HEDERA_*_PRIVATE_KEY) — settlement is read-only here"
                    : chainReady === null
                      ? "checking on-chain availability…"
                      : "drives lock→accept→submit→resolve on the live escrow"}
                </span>
              </div>

              {settle && (
                <div style={{ marginTop: 12 }}>
                  {settle.error ? (
                    <p style={{ color: "#f85149", fontFamily: "monospace", fontSize: 12.5 }}>
                      settlement error: {settle.error}
                    </p>
                  ) : settle.configured === false ? (
                    <p style={{ color: "#d29922", fontSize: 12.5 }}>
                      {settle.error ?? "Hedera creds not configured on the server."}
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 2 }}>
                      <Row
                        k="final escrow state"
                        v={`${settle.finalStateLabel} (${settle.finalState})`}
                        tone={settle.finalStateLabel === "PAID" ? "#3fb950" : settle.finalStateLabel === "REFUNDED" ? "#f85149" : "#d29922"}
                        mono
                      />
                      <Row k="escrow" v={short(settle.escrowAddress ?? "")} mono />
                      <Row k="taskId" v={settle.taskId ?? ""} mono />
                      <Row k="resolve tx" v={short(settle.resolveHash ?? "")} mono />
                      {settle.explorer && (
                        <div style={{ padding: "3px 0" }}>
                          <a
                            href={settle.explorer}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 13, color: "#2f81f7" }}
                          >
                            view resolve tx on HashScan ↗
                          </a>
                        </div>
                      )}
                      <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#9aa4b2" }}>
                        {settle.finalStateLabel === "PAID"
                          ? "Escrow released the locked HBAR to the worker — the verdict moved real money."
                          : settle.finalStateLabel === "REFUNDED"
                            ? "Escrow refunded the buyer — the caught liar got nothing."
                            : "Escrow is holding for the buyer to decide."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Panel>

            {tampScratched && (
              <p style={{ fontSize: 12.5, color: "#d29922" }}>
                Note: the faked row wasn&apos;t in this run&apos;s random sample, so it slipped through —
                that&apos;s spot-checking, not a bug. Turn on <strong>buyer holds out audit</strong>{" "}
                (the faked row is in the secret audit set) to catch it every time, or raise{" "}
                <code>sampleSize</code> and re-submit to re-roll the sample.
              </p>
            )}
            {resp.heldout.used && mode === "tampered" && resp.settlement.resultLabel === "FAIL" && (
              <p style={{ fontSize: 12.5, color: "#3fb950" }}>
                The held-out audit caught the faked row even though the public random sample might
                have missed it — that&apos;s the point of holding tests out.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 6,
    border: `1px solid ${active ? "#2f81f7" : "#30363d"}`,
    background: active ? "#1f6feb22" : "transparent",
    color: active ? "#fff" : "#9aa4b2",
    cursor: "pointer",
    fontSize: 13
  };
}

function submitBtn(busy: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #3fb950",
    background: busy ? "#23863633" : "#238636",
    color: "#fff",
    cursor: busy ? "wait" : "pointer",
    fontSize: 13
  };
}

function settleBtn(busy: boolean, releases: boolean, disabled = false): React.CSSProperties {
  const tone = disabled ? "#30363d" : releases ? "#3fb950" : "#f85149";
  return {
    padding: "7px 16px",
    borderRadius: 6,
    border: `1px solid ${tone}`,
    background: disabled ? "transparent" : busy ? `${tone}22` : tone,
    color: disabled ? "#7d8590" : "#fff",
    cursor: disabled ? "not-allowed" : busy ? "wait" : "pointer",
    fontSize: 13,
    fontWeight: 600
  };
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: "14px 16px",
        background: "#0d1117"
      }}
    >
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 11,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "#7d8590"
        }}
      >
        {title}
      </p>
      {children}
    </section>
  );
}

function Row({
  k,
  v,
  mono,
  tone
}: {
  k: string;
  v: string;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "3px 0" }}>
      <span style={{ fontSize: 13, color: "#9aa4b2" }}>{k}</span>
      <span
        style={{
          fontSize: 13,
          color: tone ?? "#e6edf3",
          fontFamily: mono ? "monospace" : "inherit",
          textAlign: "right"
        }}
      >
        {v}
      </span>
    </div>
  );
}

function Score({ label, score, status }: { label: string; score: number; status: string }) {
  return (
    <div style={{ minWidth: 120 }}>
      <p style={{ margin: 0, fontSize: 11, color: "#7d8590", textTransform: "uppercase" }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 600 }}>{score}</p>
      <p style={{ margin: 0, fontSize: 12, color: "#9aa4b2" }}>{status}</p>
    </div>
  );
}
