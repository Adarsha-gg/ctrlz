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
7. **Settlement is live on Hedera; reputation writes are wired.**
   The Solidity verify escrow is deployed on Hedera testnet and the demo
   lock/accept/submit/resolve path has real tx hashes. HCS receipt,
   ERC-8004 agent registration, and ERC-8004 feedback scripts are present but
   still need live completion.

## Architecture

| Layer | Role | Current status |
|---|---|---|
| Web verification UI | `/verify` demo flow with clean and bad submissions, split scores, checker reports, World gate, and LLM explanation | Shipped |
| Checkers | Schema, price, wallet-risk, source/listing; registry + runner | Shipped |
| Checker meta-reputation | Seeded outcome history, replay comparison, influence weighting in scoring/UI | Shipped locally; ERC-8004 write path still incomplete |
| Walrus evidence | Manifest/evidence hashing, publisher/aggregator support, local fallback on failure | Shipped |
| Hedera EVM escrow | Verify lifecycle contract, live deploy, and live lock/resolve demo | Shipped live on Hedera testnet |
| Hedera HCS | Receipt topic/message script | Built; live write still incomplete |
| ERC-8004 | Hedera testnet IdentityRegistry and ReputationRegistry scripts | Built; live writes still incomplete |
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
- Hedera EVM sanity transfer plus live verify escrow deploy/lock/accept/submit/resolve
  txs on testnet.
- Scripts for HCS receipts, ERC-8004 agent registration, and ERC-8004
  reputation feedback.
- Prior Arc escrow work exists as reference/stretch, including the old
  sender-undo state machine and risk engine history reads.

### Blocked / Not Shipped

- **C3 HCS receipt write:** script exists, but native Hedera SDK writes are
  currently timing out from this environment.
- **D1 ERC-8004 IdentityRegistry registration:** script exists; live registry tx
  still needs a real service/checker registration URI.
- **D2 ERC-8004 ReputationRegistry feedback:** script exists; live tx still
  needs D1 agent ids and the evidence URI/hash.
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

# Hedera live EVM txs
npm run hedera:evm-sanity
npm run hedera:verify-demo

# Hedera scripts still needing live completion
pnpm hedera:hcs -- --task-id=demo --evidence-hash=0x0 --score-bps=9200 --recommendation=proceed
pnpm hedera:agent -- --agent-uri=https://example.com/ctrlz-agent.json
pnpm hedera:feedback -- --agent-id=1 --feedback-uri=walrus://demo --feedback-hash=0x0000000000000000000000000000000000000000000000000000000000000000
```

`npm run hedera:evm-sanity` and `npm run hedera:verify-demo` return real
Hedera testnet tx hashes with the current env. Do not claim live HCS/ERC-8004
registry writes until the C3/D1/D2 commands confirm their own tx hashes.

## Local Development

```sh
pnpm install
pnpm --filter web dev
```

Open the web app and use `/verify` for the current CTRL+Z Verify demo.

## Submission Positioning

Use this phrasing:

- **Hedera:** C1 sanity transfer and C2 verify escrow deploy/lock/resolve are
  live on testnet; HCS/ERC-8004 scripts are implemented but not live-completed.
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
