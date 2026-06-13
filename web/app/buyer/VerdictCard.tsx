"use client";

/**
 * Buyer verdict card (P6.1 + P3.2).
 *
 * The buyer is about to pay a stranger for a used GPU. They paste/type the
 * seller's recipient; we score it with the DETERMINISTIC engine (client-side,
 * pure TS) and render a 🔴/🟡/🟢 verdict. The LLM explanation from /api/explain
 * is *supplementary* — the tier and reasons render even if that call fails
 * (ethos guard #1). Resolved known recipients show their NAME, never raw hex
 * (ethos guard #5).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  scoreRecipient,
  DEMO_ADDRESS_BOOK,
  KNOWN_NAMES,
  ALICE_ADDRESS,
  ALICE_NAME,
  POISONED_LOOKALIKE,
  type RecipientHistory,
  type RiskVerdict,
  type VerdictTier
} from "@/lib/risk";
import { fetchRecipientHistory } from "@/lib/chain/history";
import { resolveRecipient, type ResolvedRecipient } from "./resolve";

const TIER_META: Record<VerdictTier, { emoji: string; label: string }> = {
  red: { emoji: "🔴", label: "Do not pay" },
  yellow: { emoji: "🟡", label: "Slow down" },
  green: { emoji: "🟢", label: "Looks safe" }
};

type ExplainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; text: string }
  | { status: "failed" };

export function VerdictCard() {
  const [raw, setRaw] = useState("");
  const [explain, setExplain] = useState<ExplainState>({ status: "idle" });
  // bump on each input so a stale /api/explain response can't overwrite a newer one
  const requestSeq = useRef(0);
  // On-chain reputation for the currently-resolved address (P2.5). `undefined`
  // means "no history / RPC unreachable" — the engine degrades to a cautious
  // tier. We key by address so a stale fetch can't poison a newer recipient.
  const [history, setHistory] = useState<{
    address: string;
    data: RecipientHistory | undefined;
  } | null>(null);

  const resolved: ResolvedRecipient | null = useMemo(
    () => (raw.trim() ? resolveRecipient(raw) : null),
    [raw]
  );

  // Fetch real on-chain history whenever the resolved address changes. This
  // never throws into the UI (fetchRecipientHistory swallows RPC failures and
  // returns undefined), so the card always renders.
  useEffect(() => {
    const address = resolved?.address;
    if (!address) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    void fetchRecipientHistory(address).then((data) => {
      if (!cancelled) setHistory({ address, data });
    });
    return () => {
      cancelled = true;
    };
  }, [resolved?.address]);

  // Only apply history once it matches the address we're actually scoring.
  const historyForResolved =
    resolved?.address && history?.address === resolved.address
      ? history.data
      : undefined;

  const verdict: RiskVerdict | null = useMemo(() => {
    if (!resolved || !resolved.address) return null;
    return scoreRecipient({
      address: resolved.address,
      typedName: resolved.typedName,
      addressBook: DEMO_ADDRESS_BOOK,
      knownNames: KNOWN_NAMES,
      history: historyForResolved
    });
  }, [resolved, historyForResolved]);

  const fetchExplanation = useCallback(async (v: RiskVerdict) => {
    const seq = ++requestSeq.current;
    setExplain({ status: "loading" });
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verdict: v })
      });
      if (!res.ok) throw new Error(`explain ${res.status}`);
      const data = (await res.json()) as { explanation?: string };
      if (seq !== requestSeq.current) return; // superseded
      if (data.explanation) setExplain({ status: "ok", text: data.explanation });
      else setExplain({ status: "failed" });
    } catch {
      if (seq !== requestSeq.current) return;
      setExplain({ status: "failed" });
    }
  }, []);

  const onChange = useCallback((value: string) => {
    setRaw(value);
  }, []);

  // (Re)fetch the LLM explanation whenever the deterministic verdict changes —
  // including when real on-chain history arrives and shifts the tier/reasons.
  useEffect(() => {
    if (verdict) {
      void fetchExplanation(verdict);
    } else {
      requestSeq.current++;
      setExplain({ status: "idle" });
    }
  }, [verdict, fetchExplanation]);

  return (
    <div className="verdict-wrap">
      <label className="field-label" htmlFor="recipient">
        Pay the seller
      </label>
      <input
        id="recipient"
        className="recipient-input"
        placeholder="Paste the seller's address or ENS name (e.g. alice.ctrlz.eth)"
        value={raw}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />

      <div className="demo-row">
        <span className="demo-hint">Try the demo:</span>
        <button type="button" className="demo-btn" onClick={() => onChange(POISONED_LOOKALIKE)}>
          Paste from history 🔴
        </button>
        <button type="button" className="demo-btn" onClick={() => onChange(ALICE_NAME)}>
          Pay {ALICE_NAME} 🟢
        </button>
        <button type="button" className="demo-btn" onClick={() => onChange(ALICE_ADDRESS)}>
          Pay alice by address
        </button>
      </div>

      {verdict && resolved ? (
        <Verdict verdict={verdict} resolved={resolved} explain={explain} />
      ) : raw.trim() ? (
        <p className="empty-note">
          That doesn&apos;t look like an address or a name we can resolve yet.
        </p>
      ) : null}
    </div>
  );
}

function Verdict({
  verdict,
  resolved,
  explain
}: {
  verdict: RiskVerdict;
  resolved: ResolvedRecipient;
  explain: ExplainState;
}) {
  const meta = TIER_META[verdict.tier];
  // Guard #5: prefer the resolved name; only fall back to hex if nameless.
  const headline = resolved.displayName ?? resolved.address;

  return (
    <div className={`verdict-card tier-${verdict.tier}`} role="status" aria-live="polite">
      <div className="verdict-head">
        <span className="verdict-emoji" aria-hidden>
          {meta.emoji}
        </span>
        <div>
          <p className="verdict-tier">{meta.label}</p>
          <p className="verdict-target">
            Paying <strong>{headline}</strong>
            {resolved.isKnownName && resolved.typedName && resolved.typedName !== headline ? (
              <span className="verdict-sub"> (you typed {resolved.typedName})</span>
            ) : null}
          </p>
        </div>
      </div>

      {explain.status === "ok" ? (
        <p className="verdict-explanation">{explain.text}</p>
      ) : explain.status === "loading" ? (
        <p className="verdict-explanation muted-text">Explaining…</p>
      ) : null}

      {/* Reasons always render — they are the deterministic source of truth and
          the fallback when the LLM explanation is unavailable (guard #1). */}
      {(explain.status === "failed" || explain.status === "ok" || explain.status === "loading") && (
        <ul className="verdict-reasons">
          {verdict.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={`pay-btn tier-${verdict.tier}`}
        disabled={verdict.tier === "red"}
      >
        {verdict.tier === "red"
          ? "Payment blocked"
          : `Pay with CTRL+Z${resolved.displayName ? ` → ${resolved.displayName}` : ""}`}
      </button>
    </div>
  );
}
