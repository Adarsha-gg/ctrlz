/**
 * Checker framework types (A1 / §6).
 *
 * A checker is a bounded, mostly-deterministic verifier that turns a single
 * acceptance-spec check + the task context into a machine-readable report.
 * The registry (B1) maps `check.type → checker`; the runner executes a spec's
 * checks and collects reports; the split-scoring engine (A2) consumes them.
 *
 * Ethos guard: checks DECIDE. The LLM is never in this path — it only EXPLAINS
 * the final recommendation downstream (via /api/explain). Deterministic
 * checkers are pure/replayable: same (check, ctx) → same report.
 */

/** The verdict a single checker emits. */
export type CheckResult = "pass" | "fail" | "uncertain";

/**
 * Machine-readable report — the schema Codex's ERC-8004 writer consumes to
 * grade checker accuracy later (§8a). Stable shape; keep it serializable.
 */
export type CheckerReport = {
  /** the checker's stable id, e.g. "wallet-risk-checker" */
  checker: string;
  result: CheckResult;
  /** 0..1 — how sure the checker is of `result` (used by calibration, §8a) */
  confidence: number;
  /** plain-English, evidence-grounded explanation of the result */
  detail: string;
  /** points into the Walrus evidence blob, when one exists */
  evidenceHash?: string;
};

/**
 * One entry from the acceptance spec's `checks[]`. `type` selects the checker
 * via the registry; `hardGate` declares whether it gates money (§3/§4).
 * Remaining params are check-specific (e.g. price_max carries `value`).
 */
export type CheckSpec = {
  /** registry key — which checker runs this check */
  type: string;
  /** true → gates money (deterministic objective fail → reject); false → advisory/attested, only moves the score */
  hardGate: boolean;
  [param: string]: unknown;
};

/** A line item on the worker's submitted invoice. */
export type InvoiceItem = {
  description: string;
  quantity: number;
  /** unit price in the invoice currency */
  unitPrice: number;
};

/**
 * The worker submission a checker reasons over — the invoice plus whatever
 * evidence the worker attached. Bounded + plain data so reports are replayable.
 */
export type WorkerSubmission = {
  /** the recipient/seller wallet the buyer would pay */
  recipientAddress: string;
  /** the name the worker presents the seller as, if any (used for poisoning checks + copy) */
  recipientName?: string;
  invoice: {
    invoiceId?: string;
    seller?: string;
    item?: string;
    amount?: number;
    currency?: string;
    items?: InvoiceItem[];
  };
  /** free-form source/listing the worker claims to have sourced from (advisory) */
  sourceListing?: {
    url?: string;
    marketplace?: string;
    title?: string;
  };
  /** attested shipping proof, if the worker provided one (advisory/attested) */
  shippingProof?: {
    carrier?: string;
    tracking?: string;
  };
  /** points into the Walrus evidence blob this submission was read from */
  evidenceHash?: string;
};

/**
 * The context every checker receives: the worker submission plus the resolved
 * recipient identity. Checkers read from here only — no I/O, no clock — so a
 * report is reproducible from (check, ctx) alone.
 */
export type TaskContext = {
  submission: WorkerSubmission;
  /** recipient address (0x) — checkers prefer `recipientName` in copy when known */
  recipientAddress: string;
  recipientName?: string;
};

/** A checker: pure function from (check, ctx) to a report. */
export type Checker = (check: CheckSpec, ctx: TaskContext) => CheckerReport;
