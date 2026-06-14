import "server-only";
import type { RiskVerdict } from "@/lib/risk";

/**
 * P3.1 — the AI explainer. ONE Gemini call that turns the deterministic
 * verdict's signals into a plain-English explanation for the payment sender.
 *
 * Ethos guard: the LLM EXPLAINS, it never DECIDES. `verdict.tier` is computed
 * by the deterministic risk engine (web/lib/risk) and is the single source of
 * truth — this call never changes it. Every failure path (no key, API error,
 * empty output) degrades to the raw deterministic reasons so a send is never
 * blocked on the model.
 *
 * Uses the Gemini API over plain REST (no SDK), authenticated by GEMINI_API_KEY
 * — the same path as the worker agent (web/lib/agent/worker.ts).
 */

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const TIER_LABEL: Record<RiskVerdict["tier"], string> = {
  red: "HIGH RISK",
  yellow: "CAUTION",
  green: "LOW RISK"
};

const SYSTEM = [
  "You explain a crypto-payment risk verdict to the person about to send HBAR.",
  "A deterministic risk engine has ALREADY decided the verdict tier and produced",
  "the signal list. Your only job is to explain that verdict in 1-2 short, plain",
  "sentences a non-technical sender understands.",
  "",
  "Rules:",
  "- Never contradict or soften the given tier. If it is HIGH RISK, sound the alarm.",
  "- Only use the facts in the signals. Do not invent history, names, or numbers.",
  "- No preamble, no markdown, no bullet points — just the sentences.",
  "- Never show raw 0x addresses; refer to recipients by name when one is given."
].join("\n");

/** Deterministic fallback — what the user sees if the model is unavailable. */
export function fallbackExplanation(verdict: RiskVerdict): string {
  if (verdict.reasons.length === 0) return "No risk signals to report.";
  return verdict.reasons.join(" ");
}

function buildPrompt(verdict: RiskVerdict): string {
  const signals =
    verdict.signals.length > 0
      ? verdict.signals.map((s) => `- [${s.tier}] ${s.message}`).join("\n")
      : "- (no signals)";
  return [
    `Verdict tier: ${TIER_LABEL[verdict.tier]}`,
    "Signals the engine fired:",
    signals,
    "",
    "Explain this verdict to the sender."
  ].join("\n");
}

export async function explainVerdict(verdict: RiskVerdict): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackExplanation(verdict);

  let data: unknown;
  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: buildPrompt(verdict) }] }],
        // thinkingBudget 0 — this is a short explanation; without it Gemini 2.5
        // Flash spends the token budget "thinking" and truncates the answer.
        generationConfig: { temperature: 0, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } }
      })
    });
    if (!res.ok) return fallbackExplanation(verdict);
    data = await res.json();
  } catch {
    // Network error, bad key, rate limit — never block a send on the explainer.
    return fallbackExplanation(verdict);
  }

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    ?.candidates?.[0]?.content?.parts;
  const text = (parts ?? []).map((p) => p.text ?? "").join("").trim();

  return text || fallbackExplanation(verdict);
}
