/**
 * Demo fixtures for the /verify page (B2 demo / §13).
 *
 * The one demo task — "Buy an RTX 4090 under 700 USDC from a seller with a
 * valid wallet + shipping proof" — plus its acceptance spec and two one-click
 * sample submissions:
 *
 *   CLEAN — known seller (alice), under budget, plausible source → proceed
 *   BAD   — POISONED_LOOKALIKE wallet AND over budget → reject / pause
 *
 * Reuses the merged risk-engine fixtures so the wallet-risk checker reacts to
 * the same planted poisoning attack the risk demo uses.
 */

import {
  ALICE_ADDRESS,
  ALICE_NAME,
  POISONED_LOOKALIKE
} from "../../lib/risk/index.ts";
import type { CheckSpec, WorkerSubmission } from "../../lib/checkers/index.ts";
import type { CheckerOutcomeRecord } from "../../lib/checkers/metaReputation.ts";
import type { RecipientHistory } from "../../lib/risk/index.ts";

export const DEMO_INTENT =
  "Buy an RTX 4090 under 700 USDC from a seller with a valid wallet + shipping proof.";

/** The acceptance spec (manifest) for the demo task — §4 shape. */
export const DEMO_ACCEPTANCE_SPEC: { intent: string; checks: CheckSpec[] } = {
  intent: DEMO_INTENT,
  checks: [
    {
      type: "schema",
      hardGate: true,
      requiredFields: ["invoiceId", "seller", "item", "amount", "currency"]
    },
    { type: "price_max", hardGate: true, value: 700, currency: "USDC" },
    { type: "wallet_risk", hardGate: true, maxTier: "yellow" },
    { type: "source_listing", hardGate: false }
  ]
};

/** alice's seeded settlement history — feeds wallet-risk + agentTrust. */
export const ALICE_HISTORY: RecipientHistory = {
  sealedCount: 1402,
  distinctSenders: 890,
  flagCount: 0,
  fraudRecallCount: 0,
  firstSeenDaysAgo: 240
};

export type DemoSubmission = {
  id: string;
  label: string;
  hint: string;
  submission: WorkerSubmission;
  /** worker history for the split-score agentTrust input (undefined → weak) */
  workerHistory?: RecipientHistory;
  /** wallet-risk history override, passed through on the wallet_risk check */
  recipientHistory?: RecipientHistory;
};

/** CLEAN: known seller, 689 USDC (< 700), recognizable source → proceed. */
export const CLEAN_SUBMISSION: DemoSubmission = {
  id: "clean",
  label: "Run valid output",
  hint: "Known seller, under budget, plausible source",
  workerHistory: ALICE_HISTORY,
  recipientHistory: ALICE_HISTORY,
  submission: {
    recipientAddress: ALICE_ADDRESS,
    recipientName: ALICE_NAME,
    invoice: {
      invoiceId: "INV-4090-0001",
      seller: ALICE_NAME,
      item: "NVIDIA GeForce RTX 4090 Founders Edition",
      amount: 689,
      currency: "USDC"
    },
    sourceListing: {
      url: "https://www.newegg.com/p/rtx-4090-fe",
      marketplace: "Newegg",
      title: "NVIDIA GeForce RTX 4090 24GB GDDR6X Founders Edition"
    },
    shippingProof: { carrier: "UPS", tracking: "1Z999AA10123456784" },
    evidenceHash: "0xclean000000000000000000000000000000000000000000000000000000clean"
  }
};

/** CLEAN but thin history: same valid output, but the agent has no track record. */
export const UNKNOWN_CLEAN_SUBMISSION: DemoSubmission = {
  id: "unknown-clean",
  label: "Run valid output / new agent",
  hint: "Valid output from an agent with no settlement history → weaker agent trust",
  // no workerHistory → weak agentTrust, even though the output passes every gate
  recipientHistory: ALICE_HISTORY,
  submission: {
    recipientAddress: ALICE_ADDRESS,
    recipientName: ALICE_NAME,
    invoice: {
      invoiceId: "INV-4090-0003",
      seller: ALICE_NAME,
      item: "NVIDIA GeForce RTX 4090 Founders Edition",
      amount: 689,
      currency: "USDC"
    },
    sourceListing: {
      url: "https://www.newegg.com/p/rtx-4090-fe",
      marketplace: "Newegg",
      title: "NVIDIA GeForce RTX 4090 24GB GDDR6X Founders Edition"
    },
    shippingProof: { carrier: "UPS", tracking: "1Z999AA10123456784" },
    evidenceHash: "0xunknown000000000000000000000000000000000000000000000000unknown"
  }
};

/** BAD: poisoned lookalike wallet AND 879 USDC (> 700) → reject/pause. */
export const BAD_SUBMISSION: DemoSubmission = {
  id: "bad",
  label: "Run bad output",
  hint: "Poisoned lookalike wallet + price over 700 USDC",
  // no workerHistory → weak agentTrust; no recipientHistory → unknown wallet
  submission: {
    recipientAddress: POISONED_LOOKALIKE,
    recipientName: ALICE_NAME,
    invoice: {
      invoiceId: "INV-4090-0002",
      seller: ALICE_NAME,
      item: "NVIDIA GeForce RTX 4090 Founders Edition",
      amount: 879,
      currency: "USDC"
    },
    sourceListing: {
      url: "https://deals-rtx4090.example",
      marketplace: "unknown",
      title: "GPU clearance lot"
    },
    evidenceHash: "0xbad00000000000000000000000000000000000000000000000000000000000bad"
  }
};

export const DEMO_SUBMISSIONS: DemoSubmission[] = [
  CLEAN_SUBMISSION,
  UNKNOWN_CLEAN_SUBMISSION,
  BAD_SUBMISSION
];

export const CHECKER_HISTORY: CheckerOutcomeRecord[] = [
  {
    checker: "schema-checker",
    result: "pass",
    confidence: 0.98,
    settledOutcome: "paid",
    amountUsd: 689,
    settledAt: "2026-06-10T12:00:00.000Z"
  },
  {
    checker: "price-checker",
    result: "fail",
    confidence: 1,
    settledOutcome: "refunded",
    amountUsd: 879,
    settledAt: "2026-06-11T12:00:00.000Z"
  },
  {
    checker: "wallet-risk-checker",
    result: "fail",
    confidence: 0.95,
    settledOutcome: "refunded",
    amountUsd: 879,
    settledAt: "2026-06-12T12:00:00.000Z"
  },
  {
    checker: "source-listing-checker",
    result: "pass",
    confidence: 0.92,
    settledOutcome: "refunded",
    amountUsd: 760,
    settledAt: "2026-06-12T08:00:00.000Z"
  },
  {
    checker: "source-listing-checker",
    result: "fail",
    confidence: 0.86,
    settledOutcome: "paid",
    amountUsd: 540,
    settledAt: "2026-05-29T08:00:00.000Z"
  },
  {
    checker: "source-listing-checker",
    result: "uncertain",
    confidence: 0.55,
    settledOutcome: "buyer_accepted",
    amountUsd: 620,
    settledAt: "2026-05-24T08:00:00.000Z"
  }
];
