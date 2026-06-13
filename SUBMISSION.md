# CTRL+Z Verify Submission

## One-Liner

CTRL+Z Verify lets buyer agents hire worker agents with explicit acceptance
criteria, checker-agent verification, Walrus evidence, Hedera settlement hooks,
World-style access gating, and ERC-8004 reputation for both workers and
checkers.

## Current Story

The submission is **not** the old Arc undo-payment checkout as the primary
product. That work remains useful prior art and stretch material. The current
G2 framing is:

**Hedera + World AgentKit-style gating + Walrus + ERC-8004 checker reputation.**

The demo should emphasize that CTRL+Z Verify does not make a subjective oracle.
It turns task requirements into explicit constraints, runs bounded checkers, and
scores the checkers by whether later outcomes agreed with them.

## What Shipped

- `/verify` web demo for a GPU invoice task with clean and bad submissions.
- Checker registry and runner.
- Demo checkers: schema, price cap, wallet risk, and source/listing.
- Split scoring: output validity, agent trust, payment risk, recommendation.
- LLM explanation reused only as explanation, never as the decision engine.
- Walrus evidence layer for manifest/evidence hashes, publisher store, aggregator
  read, and local fallback.
- World AgentKit-style gate: human-backed agents get three free verification
  uses, unknown/exhausted agents are pay-gated, trust boost is capped.
- Checker meta-reputation in scoring/UI using seeded outcome history and replay
  checks.
- Hedera verify escrow contract and scripts for C1/C3/D1/D2 paths.
- ERC-8004 IdentityRegistry and ReputationRegistry write scripts targeting
  Hedera testnet registry defaults.

## Shipped vs Blocked

| Item | Status | Notes |
|---|---|---|
| A/B verification UI, checkers, split scoring | Shipped | Demo surface is live in the web app. |
| F1 World AgentKit-style gating | Shipped | Policy and IDKit plumbing with deterministic fallback when credentials are missing. |
| E1/E2 Walrus evidence | Shipped | Hash anchor always works; Walrus publisher/aggregator path is implemented. |
| B3 checker meta-reputation | Shipped locally | Influence weighting is in scoring/UI; ERC-8004 persistence is blocked. |
| C1 Hedera sanity write | Blocked | Requires funded `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY`. |
| C2 Hedera EVM escrow deploy + live lock/resolve | Blocked | Requires funded `HEDERA_EVM_PRIVATE_KEY`. |
| C3 HCS receipt | Blocked | Script exists; live message needs funded Hedera operator credentials. |
| D1 ERC-8004 identity registration | Blocked | Script exists; live tx needs funded Hedera EVM key. |
| D2 ERC-8004 reputation feedback | Blocked | Script exists; live tx needs funded Hedera EVM key and agent id. |
| Google BigQuery | Conditional / not shipped | Only claim if sponsor approves Hedera testnet ERC-8004/settlement data as an eligible source. |
| Arc / Ledger | Prior or stretch | Do not pitch as the primary G2 product. |

Do not overclaim live Hedera transactions. Until tx hashes exist from the
Hedera scripts, say the Hedera/EVM/HCS/ERC-8004 paths are implemented and
blocked on funded credentials.

## Demo Commands

```sh
# Web build
pnpm --filter web build

# Verification and checker meta-reputation selfcheck
node --experimental-strip-types web/lib/scoring/selfcheck.ts

# World gate selfcheck
node --experimental-strip-types web/lib/world/selfcheck.ts

# Hedera scripts: dry-run/fail-fast without funded credentials
pnpm hedera:sanity
pnpm hedera:hcs -- --task-id=demo --evidence-hash=0x0 --score-bps=9200 --recommendation=proceed
pnpm hedera:agent -- --agent-uri=https://example.com/ctrlz-agent.json
pnpm hedera:feedback -- --agent-id=1 --feedback-uri=walrus://demo --feedback-hash=0x0000000000000000000000000000000000000000000000000000000000000000
```

Expected current behavior: web/scoring/world checks should pass if dependencies
are installed; Hedera commands should fail fast without funded credentials or
return real tx hashes only after credentials are funded.

## Prize Box Language

- **Hedera:** implemented settlement/HCS/ERC-8004 scripts and Hedera verify
  escrow; live writes blocked on funded credentials.
- **World:** implemented World-style human-backed agent gating and capped trust
  lift.
- **Walrus:** implemented content-addressed manifest/evidence storage and read
  path, with local fallback.
- **ERC-8004:** implemented the checker/worker reputation model and write
  scripts; live writes blocked.
- **Google BigQuery:** not shipped unless sponsor approves the Hedera data
  source.

## G Status

- **G1:** leave undone until the demo runs clean start-to-finish five times.
- **G2:** complete for docs/submission framing. The shipped-vs-blocked boundary
  is explicit and does not claim live Hedera transactions.
