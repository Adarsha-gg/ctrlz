# CTRL+Z Verify

**CTRL+Z Verify lets agents safely hire and pay other agents by making the work
verifiable before settlement.** A buyer agent posts a task with explicit
acceptance criteria, a worker agent accepts and submits evidence, checker agents
run bounded checks, and the result drives payment plus reputation.

The current project is no longer primarily the old Arc "undo payment" product.
That earlier escrow/reputation work is useful prior art and reusable contract
scaffolding, but the ETHGlobal G2 submission story is:

**Hedera settlement + Walrus (Sui) verifiable evidence + ERC-8004 worker/checker
reputation, with Google BigQuery discovery over the ERC-8004 population.**

The honest claim:

> We do not promise the work is perfect. We promise the decision is
> constraint-based, reputation-weighted, and accountable.

## Why now — the x402 gap

Agents already pay each other: **x402** moves **$600M+** across **69k+ agents**, with
every payment *final and non-refundable*. The economy solved **payment** and skipped
**verification** — existing escrow checks only `2xx` + JSON schema (shape, not
correctness). CTRL+Z Verify is the missing half: it holds the payment until the work
is proven correct, then settles and updates reputation. We're the **verification +
reputation layer**, not a marketplace — the marketplace is the front door that
showcases it and seeds the reputation graph.

## The wedge — pay-on-green

The flagship is the narrowest verifiable job, where "correct" is binary and cheap to
check: **a worker fixes a failing test; the payment releases the moment the suite goes
green.** Expensive to produce (real engineering), cheap to verify (run the tests once),
no completeness hole. It's the SWE-bench format wired to escrow + reputation instead of
a leaderboard. See **[PAY_ON_GREEN.md](PAY_ON_GREEN.md)** for the full rationale and the
prior-art landscape (why this wedge, and why not chain-datasets or swaps).

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
6. **Evidence is provably retrievable, not just claimed.**
   The evidence blob is stored on Walrus (Sui's decentralized blob store) and
   then round-tripped: CTRL+Z re-fetches it from the aggregator and recomputes
   the sha256 to prove the bytes are content-addressed and retrievable. The hash
   anchor is always computed first, so the decision survives Walrus being down.
7. **Settlement and ERC-8004 reputation are live on Hedera.**
   The Solidity verify escrow is deployed on Hedera testnet and the demo
   lock/accept/submit/resolve path has real tx hashes. Worker/checker agent
   identities and feedback writes are also live in the ERC-8004 registries. The
   HCS receipt is live on topic `0.0.9222881`.

## Architecture

| Layer | Role | Current status |
|---|---|---|
| Web verification UI | `/verify` demo flow with clean and bad submissions, split scores, checker reports, evidence anchor, and LLM explanation | Shipped |
| Checkers | Schema, price, wallet-risk, source/listing; registry + runner | Shipped |
| Checker meta-reputation | Seeded outcome history, replay comparison, influence weighting in scoring/UI | Shipped; checker accuracy feedback live in ERC-8004 |
| Walrus (Sui) evidence | Manifest/evidence hashing, publisher/aggregator store+read, round-trip retrievability proof, local fallback on failure | Shipped |
| Hedera EVM escrow | Verify lifecycle contract, live deploy, and live lock/resolve demo | Shipped live on Hedera testnet |
| Hedera HCS | Receipt topic/message script | Shipped live on topic `0.0.9222881` |
| ERC-8004 | Hedera testnet IdentityRegistry and ReputationRegistry scripts | Shipped live for worker/checker identity and feedback |
| Google / ERC-8004 validation | BigQuery explorer over mainnet ERC-8004 data + CTRL+Z as a live ERC-8004 **validator** (the unsolved 3rd pillar) | Planned; Validation Registry confirmed live on Hedera — see [GOOGLE.md](GOOGLE.md) |

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
- Walrus (Sui) evidence layer computes stable content hashes, stores/reads via
  Walrus, and round-trips the blob to prove retrievability, with a local hash
  fallback.
- Hedera EVM sanity transfer plus live verify escrow deploy/lock/accept/submit/resolve
  txs on testnet.
- HCS receipt topic/message for the C2 evidence hash, score, and recommendation.
- ERC-8004 worker/checker agent registrations and reputation feedback txs.
- Prior Arc escrow work exists as reference/stretch, including the old
  sender-undo state machine and risk engine history reads.

### Blocked / Not Shipped

- **Google / ERC-8004 validation lane:** planned, not yet built. The angle is the
  *validation pillar* (see [GOOGLE.md](GOOGLE.md)): a BigQuery explorer over
  **mainnet/Base** ERC-8004 data, plus CTRL+Z writing verdicts to the canonical
  ERC-8004 **Validation Registry** — confirmed live on Hedera testnet at
  `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`. Does **not** depend on Google
  indexing Hedera. Forward design lives in [REPUTATION.md](REPUTATION.md) +
  [GOOGLE.md](GOOGLE.md); open work is tracked in [TODO.md](TODO.md).
- **Arc and Ledger:** prior/stretch material, not the primary G2 submission.
  Do not pitch live Arc transactions or Ledger signing as the current core.

## Demo Checks

Run from the repo root unless noted.

```sh
# Web production build
pnpm --filter web build

# Verification/scoring selfcheck
node --experimental-strip-types web/lib/scoring/selfcheck.ts

# Hedera live EVM txs
npm run hedera:evm-sanity
npm run hedera:verify-demo

# Store evidence on Walrus → prints a real aggregator URI + sha256 anchor
node --experimental-strip-types scripts/hedera/store-evidence.mjs \
  --task-id=1 \
  --contract=0xa2ac71dd9e7835af08e6be33ec047c47a35b2462 \
  --spec-hash=0xc558bf1d075e6d7c622aaba021c8409b1cbbdf17c8cc527aa59c7326e9279d84 \
  --evidence-hash=0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7 \
  --score-bps=9200 --recommendation=proceed

# Hedera HCS receipt — --walrus-uri must be a real Walrus URI (printed above);
# a GitHub or other non-Walrus link is rejected.
npm run hedera:hcs -- \
  --task-id=1 \
  --contract=0xa2ac71dd9e7835af08e6be33ec047c47a35b2462 \
  --evidence-hash=0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7 \
  --score-bps=9200 \
  --recommendation=proceed \
  --walrus-uri=https://aggregator.walrus-testnet.walrus.space/v1/blobs/eDxE69ZD3dua2R7xO8Z1KlYa9RvKgpNZHzXIkO63frk
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
- **Walrus (Sui):** evidence hashing, Walrus store/read, and a round-trip
  retrievability proof are implemented; the sha256 hash anchor is always shown
  even if publisher access fails.
- **ERC-8004:** worker/checker identities and reputation feedback are live;
  feedback should be described as settlement-derived and evidence-linked, not
  self-attested.
- **Google BigQuery:** optional analytics only, pending sponsor approval of the
  Hedera data source.

Leave G1 open until the full demo has been rehearsed end-to-end. G2 is complete
when these docs and the submission framing stay coherent and honest.
