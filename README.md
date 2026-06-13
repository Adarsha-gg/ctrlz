# CTRL+Z Verify

**CTRL+Z Verify lets agents safely hire and pay other agents by making the work
verifiable before settlement.** A buyer agent posts a task with explicit
acceptance criteria, a worker agent accepts and submits evidence, checker agents
run bounded checks, and the result drives payment plus reputation.

The current project is no longer primarily the old Arc "undo payment" product.
That earlier escrow/reputation work is useful prior art and reusable contract
scaffolding, but the ETHGlobal G2 submission story is:

**Hedera settlement + World AgentKit-style gating + Walrus evidence + ERC-8004
worker/checker reputation.**

The honest claim:

> We do not promise the work is perfect. We promise the decision is
> constraint-based, reputation-weighted, and accountable.

## What It Solves

Autonomous agents need to buy services from other agents, but a normal payment
rail cannot answer the core question: did the worker satisfy the task? CTRL+Z
Verify turns the acceptance criteria into a verifiable manifest, stores the
evidence, runs checker agents, and records reputation for both the worker and
the checkers.

The important distinction is that no checker is treated as an oracle. Objective
checks can resolve automatically. Attested or subjective checks become signals
or buyer decisions. Checker agents earn influence only when their reports match
later outcomes.

## Product Flow

1. **Buyer agent creates an intent.**
   The intent includes a machine-readable acceptance spec: required schema,
   price cap, wallet-risk threshold, source/listing checks, and resolution
   policy.
2. **Spec is anchored.**
   The full manifest is stored through the Walrus evidence layer; its hash is
   the tamper-evident anchor intended for Hedera settlement records.
3. **Worker agent accepts and submits evidence.**
   The worker output, manifest, checker reports, split score, and
   recommendation are bundled into one evidence object.
4. **Checker agents run.**
   The demo includes schema, price, wallet-risk, and source/listing checkers.
   Deterministic checks are replayable; advisory checks are down-weighted by
   checker reputation.
5. **Split scoring resolves the task.**
   The UI keeps `outputValidity`, `agentTrust`, and `paymentRisk` separate.
   The LLM explains the recommendation but never decides it.
6. **World-style gate controls access.**
   Human-backed agents get a limited free verification quota and a capped
   baseline trust lift. Unknown agents are pay-gated. Human backing never
   replaces output checks.
7. **Settlement and reputation are wired for Hedera/ERC-8004.**
   The Solidity verify escrow, HCS receipt script, ERC-8004 agent registration
   script, and ERC-8004 feedback script are present. Live writes are blocked
   until funded Hedera credentials are provided.

## Architecture

| Layer | Role | Current status |
|---|---|---|
| Web verification UI | `/verify` demo flow with clean and bad submissions, split scores, checker reports, World gate, and LLM explanation | Shipped |
| Checkers | Schema, price, wallet-risk, source/listing; registry + runner | Shipped |
| Checker meta-reputation | Seeded outcome history, replay comparison, influence weighting in scoring/UI | Shipped locally; ERC-8004 write path blocked |
| Walrus evidence | Manifest/evidence hashing, publisher/aggregator support, local fallback on failure | Shipped |
| Hedera EVM escrow | Verify lifecycle contract and deployment script | Built/tested; live deploy blocked |
| Hedera HCS | Receipt topic/message script | Built; live write blocked |
| ERC-8004 | Hedera testnet IdentityRegistry and ReputationRegistry scripts | Built; live writes blocked |
| Google BigQuery | Reputation analytics/leaderboard over settlement + ERC-8004 data | Conditional; not shipped |

## Shipped vs Blocked

### Shipped

- Reframed CTRL+Z from undo-payment checkout to **Verify for agent work**.
- `/verify` page runs the GPU invoice demo with clean/bad submissions.
- Checker framework, checker registry, deterministic checkers, and advisory
  source checker.
- Split scoring: `outputValidity`, `agentTrust`, `paymentRisk`, and final
  recommendation are kept separate.
- LLM explanation route is reused only for explanation; deterministic scoring
  remains the decision source.
- Walrus evidence layer computes stable content hashes and can store/read via
  Walrus, with a local hash fallback.
- World AgentKit-style policy gate: human-backed agents get three free
  verification uses; unknown/exhausted agents are pay-gated.
- Hedera verify escrow contract and scripts for HCS receipts, ERC-8004 agent
  registration, and ERC-8004 reputation feedback.
- Prior Arc escrow work exists as reference/stretch, including the old
  sender-undo state machine and risk engine history reads.

### Blocked / Not Shipped

- **C1 Hedera sanity write:** blocked on funded `HEDERA_OPERATOR_ID` /
  `HEDERA_OPERATOR_KEY` and recipient testnet account.
- **C2 Hedera EVM escrow deployment and live lock/resolve:** blocked on funded
  `HEDERA_EVM_PRIVATE_KEY`.
- **C3 HCS receipt write:** blocked on funded Hedera operator credentials.
- **D1 ERC-8004 IdentityRegistry registration:** blocked on funded Hedera EVM
  private key.
- **D2 ERC-8004 ReputationRegistry feedback:** blocked on funded Hedera EVM
  private key and a live or seeded agent id.
- **Google BigQuery:** conditional and not shipped. It should only be claimed if
  the sponsor approves analytics over this Hedera testnet ERC-8004/settlement
  data; otherwise it remains a roadmap analytics layer.
- **Arc and Ledger:** prior/stretch material, not the primary G2 submission.
  Do not pitch live Arc transactions or Ledger signing as the current core.

## Demo Checks

Run from the repo root unless noted.

```sh
# Web production build
pnpm --filter web build

# Verification/scoring selfcheck
node --experimental-strip-types web/lib/scoring/selfcheck.ts

# World gate selfcheck
node --experimental-strip-types web/lib/world/selfcheck.ts

# Hedera scripts dry-run / fail-fast env checks
pnpm hedera:sanity
pnpm hedera:hcs -- --task-id=demo --evidence-hash=0x0 --score-bps=9200 --recommendation=proceed
pnpm hedera:agent -- --agent-uri=https://example.com/ctrlz-agent.json
pnpm hedera:feedback -- --agent-id=1 --feedback-uri=walrus://demo --feedback-hash=0x0000000000000000000000000000000000000000000000000000000000000000
```

Without funded Hedera credentials, the Hedera commands are expected to fail
early with missing-env or funding errors. That is intentional; the docs should
not claim live Hedera transactions until those commands confirm real tx hashes.

## Local Development

```sh
pnpm install
pnpm --filter web dev
```

Open the web app and use `/verify` for the current CTRL+Z Verify demo.

## Submission Positioning

Use this phrasing:

- **Hedera:** settlement, HCS receipts, and ERC-8004 scripts are implemented;
  live writes are blocked on funded credentials.
- **World:** World AgentKit-style gating is implemented as policy plus IDKit
  plumbing with deterministic fallback when credentials are absent.
- **Walrus:** evidence hashing and Walrus storage/read support are implemented;
  the hash anchor is always shown even if publisher access fails.
- **ERC-8004:** worker/checker reputation model and write scripts are present;
  feedback should be described as settlement-derived and evidence-linked, not
  live on-chain unless a real write has been submitted.
- **Google BigQuery:** optional analytics only, pending sponsor approval of the
  Hedera data source.

Leave G1 open until the full demo has been rehearsed end-to-end. G2 is complete
when these docs and the submission framing stay coherent and honest.
