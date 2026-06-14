import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RiskVerdict } from "@/lib/risk";

/**
 * P3.1 — the AI explainer. ONE Claude call that turns the deterministic
 * verdict's signals into a plain-English explanation for the payment sender.
 *
 * Ethos guard: the LLM EXPLAINS, it never DECIDES. `verdict.tier` is computed
 * by the deterministic risk engine (web/lib/risk) and is the single source of
 * truth — this call never changes it. Every failure path (no key, API error,
 * refusal, empty output) degrades to the raw deterministic reasons so a send
 * is never blocked on the model.
 */

// Default per the claude-api skill; the explainer is a small, latency-sensitive
// call so it runs at low effort.
const MODEL = "claude-opus-4-8";

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackExplanation(verdict);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(verdict) }]
    });

    // Safety classifiers can decline (HTTP 200, stop_reason "refusal").
    if (response.stop_reason === "refusal") return fallbackExplanation(verdict);

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    return text || fallbackExplanation(verdict);
  } catch {
    // Network error, bad key, rate limit — never block a send on the explainer.
    return fallbackExplanation(verdict);
  }
}
