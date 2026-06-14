/**
 * The bounty task a worker agent actually solves (§ A2A demo).
 *
 * Deliberately tiny + unambiguous so a live LLM fix is bulletproof on camera —
 * but real: the worker sees only the buggy code + spec + ONE sample test, and
 * must produce a fix that also passes the HELD-OUT tests it never saw.
 */

export type SolveCase = { name: string; args: unknown[]; expect: unknown };

export type AgentTask = {
  id: string;
  exportName: string;
  spec: string;
  buggySource: string;
  /** human-readable sample test shown to the worker */
  publicTest: string;
  /** which case names are public (the rest are held out) */
  publicCaseNames: string[];
  /** all cases — public + held-out */
  cases: SolveCase[];
};

export const MAX_TASK: AgentTask = {
  id: "max-bugfix",
  exportName: "max",
  spec: "max(a, b) must return the larger of the two numbers.",
  buggySource: "export function max(a, b) {\n  // BUG: returns the smaller value\n  return a < b ? a : b;\n}\n",
  publicTest: "max(2, 5) === 5",
  publicCaseNames: ["max(2,5)"],
  cases: [
    { name: "max(2,5)", args: [2, 5], expect: 5 },
    { name: "max(9,1)", args: [9, 1], expect: 9 },
    { name: "max(-3,-7)", args: [-3, -7], expect: -3 }
  ]
};
