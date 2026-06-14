/**
 * The worker agent (§ A2A demo) — actually generates a fix with Claude.
 *
 * Given the buggy code + spec + ONE sample test (never the held-out tests, never
 * the answer), it asks the model for a corrected module and returns the source.
 * The verifier then runs that generated code against the full suite — so the
 * bounty is earned by real work, not a canned patch. No key → no fix (we never
 * fabricate a solution).
 */

import Anthropic from "@anthropic-ai/sdk";

// Fast + more than capable for a one-line bug fix — keeps the live demo snappy.
const MODEL = "claude-haiku-4-5-20251001";

export type SolveInput = {
  buggySource: string;
  spec: string;
  publicTest: string;
  exportName: string;
};

export type SolveResult = {
  /** the corrected module source the worker produced */
  source: string;
  /** false when no API key is configured (no fix was generated) */
  usedLlm: boolean;
  note?: string;
};

function stripFences(s: string): string {
  const m = s.match(/```(?:[a-zA-Z]+)?\s*\n([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

export async function solveWithClaude(input: SolveInput): Promise<SolveResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { source: "", usedLlm: false, note: "ANTHROPIC_API_KEY not set on the server — the worker can't generate a fix." };
  }

  const prompt = `You are an autonomous coding agent claiming a bug-fix bounty.
Fix the bug so the function satisfies its spec. Return ONLY the corrected
JavaScript module source — a single \`export function ${input.exportName}\` — with
NO markdown fences and NO commentary.

Spec: ${input.spec}
A sample test that must pass: ${input.publicTest}

Buggy module:
${input.buggySource}`;

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }]
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return { source: stripFences(text), usedLlm: true };
}
