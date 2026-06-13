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
- Hedera EVM sanity transfer, live verify escrow deployment, and lock/accept/submit/resolve transaction flow.
- HCS receipt topic/message for the C2 evidence hash, score, and recommendation.
- ERC-8004 IdentityRegistry registrations and ReputationRegistry feedback writes
  for the worker and checker agents on Hedera testnet.

## Shipped vs Blocked

| Item | Status | Notes |
|---|---|---|
| A/B verification UI, checkers, split scoring | Shipped | Demo surface is live in the web app. |
| F1 World AgentKit-style gating | Shipped | Policy and IDKit plumbing with deterministic fallback when credentials are missing. |
| E1/E2 Walrus evidence | Shipped | Hash anchor always works; Walrus publisher/aggregator path is implemented. |
| B3 checker meta-reputation | Shipped + persisted | Influence weighting is in scoring/UI; checker accuracy feedback is written to ERC-8004 agent `102`. |
| C1 Hedera sanity write | Shipped live | EVM sanity transfer tx: `0x9236c06cbd4021ce15c531a4d184d325b88c8ab852585bcf69c2a63733b09e97`. |
| C2 Hedera EVM escrow deploy + live lock/resolve | Shipped live | Escrow: `0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4`; deploy `0xd4b09a50ae6ef7c733ccdcdcbba3399838d950836dc95712310eed9cd39db792`; resolve `0x78c20ab96742a69f1d599109142f51d702cab12edaa4f1310a0bc0081239519f`. Current run used deterministic demo-fixture hashes; rerun with `HEDERA_VERIFY_SPEC_HASH`/`HEDERA_VERIFY_EVIDENCE_HASH` for exact `/verify` sha256 anchors. |
| C3 HCS receipt | Shipped live | Topic `0.0.9222881`; tx `0.0.9222066@1781349565.367938628`; payload references the C2 evidence hash, score `9200`, and recommendation `proceed`. |
| D1 ERC-8004 identity registration | Shipped live | Worker agent `101` tx `0xd4912aef78fb8f76a0e77e583516bcf0f84ac3e14de5d46d5c78c39dd0863c94`; checker agent `102` tx `0xff802ef5cd713ab8075e3b195329ac3664633dfa648f61fff156e84582d8f80f`. |
| D2 ERC-8004 reputation feedback | Shipped live | Worker outcome feedback tx `0x3745fa1efa69f725481f5798d3e2d76d856123510569f09f2a59c277f3e0fb0f`; checker accuracy feedback tx `0xa42eb5c0142e0fd26362c900357fd4def575691d91800040147bec7ee6078bbc`. |
| Google BigQuery | Conditional / not shipped | Only claim if sponsor approves Hedera testnet ERC-8004/settlement data as an eligible source. |
| Arc / Ledger | Prior or stretch | Do not pitch as the primary G2 product. |

C1/C2/C3/D1/D2 now have real Hedera testnet confirmations. Do not claim the C2
demo-fixture hashes are the exact `/verify` sha256 anchors unless the flow is
rerun with `HEDERA_VERIFY_SPEC_HASH` and `HEDERA_VERIFY_EVIDENCE_HASH`.

## Demo Commands

```sh
# Local G1 rehearsal readiness check (no Hedera secrets required; sends no txs)
npm run demo:check

# Web build
pnpm --filter web build

# Verification and checker meta-reputation selfcheck
node --experimental-strip-types web/lib/scoring/selfcheck.ts

# World gate selfcheck
node --experimental-strip-types web/lib/world/selfcheck.ts

# Hedera scripts: live tx paths
npm run hedera:evm-sanity
npm run hedera:verify-demo

# Hedera HCS receipt
pnpm hedera:sanity
npm run hedera:hcs -- \
  --task-id=1 \
  --contract=0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4 \
  --evidence-hash=0x547ddf8be39080f6c01b007835654637ce68ac113470b3a1d6dbd38c02330e02 \
  --score-bps=9200 \
  --recommendation=proceed \
  --walrus-uri=https://github.com/Adarsha-gg/ctrlz/blob/main/SUBMISSION.md
```

Expected current behavior: web/scoring/world checks should pass if dependencies
are installed; `npm run hedera:evm-sanity` and `npm run hedera:verify-demo`
return real Hedera testnet tx hashes with the current env. The ERC-8004
registration and feedback scripts have already produced live tx hashes. The HCS
script now works with portal-style ECDSA private keys and has produced a live
receipt on topic `0.0.9222881`.

`npm run demo:check` bundles the scoring selfcheck, World selfcheck, and `npm run
build` in `web/`, then reports Hedera environment readiness by variable presence
only. It does not print secrets, submit transactions, or mark G1 complete.

See [BLOCKERS.md](BLOCKERS.md) for the remaining G1 rehearsal/video checklist.

## Prize Box Language

- **Hedera:** live C1 sanity transfer, C2 verify escrow deploy/lock/resolve, and
  C3 HCS receipt are complete.
- **World:** implemented World-style human-backed agent gating and capped trust
  lift.
- **Walrus:** implemented content-addressed manifest/evidence storage and read
  path, with local fallback.
- **ERC-8004:** worker/checker identities and worker/checker feedback writes are
  live on Hedera testnet.
- **Google BigQuery:** not shipped unless sponsor approves the Hedera data
  source.

## G Status

- **G1:** leave undone until the demo runs clean start-to-finish five times.
- **G2:** complete for docs/submission framing. The shipped-vs-blocked boundary
  now includes live C1/C2/C3/D1/D2 Hedera confirmations.
