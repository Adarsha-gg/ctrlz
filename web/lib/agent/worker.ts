/**
 * The worker agent (§ A2A demo) — actually generates a fix with an LLM (Gemini).
 *
 * Given the buggy code + spec + ONE sample test (never the held-out tests, never
 * the answer), it asks the model for a corrected module and returns the source.
 * The verifier then runs that generated code against the full suite — so the
 * bounty is earned by real work, not a canned patch. No key → no fix (we never
 * fabricate a solution).
 *
 * Uses the Gemini API over plain REST (no SDK), authenticated by GEMINI_API_KEY.
 */

const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export type SolveInput = {
  buggySource: string;
  spec: string;
  publicTest: string;
  exportName: string;
};

export type SolveResult = {
  /** the corrected module source the worker produced */
  source: string;
  /** false when no API key / the call failed (no fix was generated) */
  usedLlm: boolean;
  note?: string;
};

function stripFences(s: string): string {
  const m = s.match(/```(?:[a-zA-Z]+)?\s*\n?([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

export async function solveTask(input: SolveInput): Promise<SolveResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { source: "", usedLlm: false, note: "GEMINI_API_KEY not set on the server — the worker can't generate a fix." };
  }

  const prompt = `You are an autonomous coding agent claiming a bug-fix bounty.
Fix the bug so the function satisfies its spec. Return ONLY the corrected
JavaScript module source — a single \`export function ${input.exportName}\` — with
NO markdown fences and NO commentary.

Spec: ${input.spec}
A sample test that must pass: ${input.publicTest}

Buggy module:
${input.buggySource}`;

  let data: unknown;
  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 }
      })
    });
    if (!res.ok) {
      return { source: "", usedLlm: false, note: `LLM request failed (${res.status})` };
    }
    data = await res.json();
  } catch (e) {
    return { source: "", usedLlm: false, note: `LLM request error: ${(e as Error).message}` };
  }

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    ?.candidates?.[0]?.content?.parts;
  const text = (parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    return { source: "", usedLlm: false, note: "LLM returned no text" };
  }
  return { source: stripFences(text), usedLlm: true };
}
