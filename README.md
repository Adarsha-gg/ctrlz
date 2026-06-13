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
7. **Settlement and ERC-8004 reputation are live on Hedera.**
   The Solidity verify escrow is deployed on Hedera testnet and the demo
   lock/accept/submit/resolve path has real tx hashes. Worker/checker agent
   identities and feedback writes are also live in the ERC-8004 registries. The
   HCS receipt is live on topic `0.0.9222881`.

## Architecture

| Layer | Role | Current status |
|---|---|---|
| Web verification UI | `/verify` demo flow with clean and bad submissions, split scores, checker reports, World gate, and LLM explanation | Shipped |
| Checkers | Schema, price, wallet-risk, source/listing; registry + runner | Shipped |
| Checker meta-reputation | Seeded outcome history, replay comparison, influence weighting in scoring/UI | Shipped; checker accuracy feedback live in ERC-8004 |
| Walrus evidence | Manifest/evidence hashing, publisher/aggregator support, local fallback on failure | Shipped |
| Hedera EVM escrow | Verify lifecycle contract, live deploy, and live lock/resolve demo | Shipped live on Hedera testnet |
| Hedera HCS | Receipt topic/message script | Shipped live on topic `0.0.9222881` |
| ERC-8004 | Hedera testnet IdentityRegistry and ReputationRegistry scripts | Shipped live for worker/checker identity and feedback |
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
- HCS receipt topic/message for the C2 evidence hash, score, and recommendation.
- ERC-8004 worker/checker agent registrations and reputation feedback txs.
- Prior Arc escrow work exists as reference/stretch, including the old
  sender-undo state machine and risk engine history reads.

### Blocked / Not Shipped

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

# Hedera HCS receipt
npm run hedera:hcs -- \
  --task-id=1 \
  --contract=0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4 \
  --evidence-hash=0x547ddf8be39080f6c01b007835654637ce68ac113470b3a1d6dbd38c02330e02 \
  --score-bps=9200 \
  --recommendation=proceed \
  --walrus-uri=https://github.com/Adarsha-gg/ctrlz/blob/main/SUBMISSION.md
```

`npm run hedera:evm-sanity` and `npm run hedera:verify-demo` return real
Hedera testnet tx hashes with the current env. ERC-8004 identity and feedback
writes have also confirmed live tx hashes. `npm run hedera:hcs` has confirmed a
live HCS receipt on topic `0.0.9222881`.

## Local Development

```sh
pnpm install
pnpm --filter web dev
```

Open the web app and use `/verify` for the current CTRL+Z Verify demo.

## Submission Positioning

Use this phrasing:

- **Hedera:** C1 sanity transfer, C2 verify escrow deploy/lock/resolve, and C3
  HCS receipt are live on testnet.
- **World:** World AgentKit-style gating is implemented as policy plus IDKit
  plumbing with deterministic fallback when credentials are absent.
- **Walrus:** evidence hashing and Walrus storage/read support are implemented;
  the hash anchor is always shown even if publisher access fails.
- **ERC-8004:** worker/checker identities and reputation feedback are live;
  feedback should be described as settlement-derived and evidence-linked, not
  self-attested.
- **Google BigQuery:** optional analytics only, pending sponsor approval of the
  Hedera data source.

Leave G1 open until the full demo has been rehearsed end-to-end. G2 is complete
when these docs and the submission framing stay coherent and honest.
