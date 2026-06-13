# CTRL+Z — Work Log

What's been worked on, by whom, and where to pick up. Newest entry on top.
Each entry: date · who (human / agent) · part(s) from [BUILD_PLAN.md](BUILD_PLAN.md)
· what changed · **next** (the resume point).

> Convention: when you finish a part, flip its box in BUILD_PLAN.md (`[ ]`→`[x]`)
> and add an entry here. Keep entries short — one block per work session.

---

## 2026-06-13 · agent (Codex) · ERC-8004 Hedera scripts (D1/D2 prep)

- **Did:** Added Hedera EVM helpers plus official ERC-8004 ABIs under
  `scripts/hedera/abis/`. Added `erc8004-register-agent.mjs` for Identity
  Registry registration and `erc8004-feedback.mjs` for Reputation Registry
  feedback.
- **Config:** Added `HEDERA_EVM_PRIVATE_KEY`,
  `ERC8004_IDENTITY_REGISTRY`, and `ERC8004_REPUTATION_REGISTRY` usage docs;
  defaults target Hedera testnet's ERC-8004 addresses.
- **State:** D1/D2 `[~]`; they become `[x]` only after funded Hedera EVM
  credentials submit real registry transactions.
- **Next:** Set `HEDERA_EVM_PRIVATE_KEY`, run `pnpm hedera:agent -- --agent-uri=...`,
  then `pnpm hedera:feedback -- --agent-id=... --feedback-uri=...`.

## 2026-06-13 · agent (Codex) · Hedera HCS receipt scripts (C3 prep)

- **Did:** Added root Hedera SDK dependency plus `scripts/hedera/**`:
  shared `.env`/client loader, `sanity-transfer.mjs` for C1's real HBAR
  transfer, and `hcs-receipt.mjs` for C3 receipt topic create/submit.
- **Config:** Added `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`,
  `HEDERA_HCS_TOPIC_ID`, and sanity-transfer env names to `.env.example`.
- **Verify:** HCS script dry-run fails clearly on missing
  `HEDERA_OPERATOR_ID`; `forge test --root contracts` passes 47 tests;
  `npm run build` in `web/` passes.
- **State:** C3 `[~]`; it becomes `[x]` only after a real HCS topic/message is
  submitted and readable with funded Hedera operator credentials.
- **Next:** Add funded Hedera operator env, run `pnpm hedera:sanity`, then
  `pnpm hedera:hcs -- --task-id=... --evidence-hash=...`.

## 2026-06-13 · agent (Codex) · Hedera verify escrow skeleton (C1/C2 prep)

- **Did:** Started the Codex-owned Hedera lane from the new build plan. Added
  `contracts/src/CtrlZVerifyEscrow.sol` and
  `contracts/script/DeployCtrlZVerifyEscrow.s.sol`.
- **Contract:** The new verify escrow models the MVP lifecycle: buyer locks
  funds with a `specHash`, worker accepts, worker submits an `evidenceHash`,
  resolver/checker runner posts `PASS`/`FAIL`/`UNCERTAIN`, pass pays worker,
  objective fail refunds buyer, uncertain pauses for buyer accept/refund.
- **Handoff:** Added Hedera testnet config, ERC-8004 Hedera registry addresses,
  and the verify escrow ABI/address placeholder to `web/lib/contract.ts`.
- **Verified:** `forge test --root contracts` passes 47 tests, including 6 for
  the new verify escrow. `npm run build` in `web/` passes.
- **Blocked:** C1 real Hedera financial op and C2 deployment need a funded
  Hedera EVM account/private key.
- **Next:** Fund `HEDERA_EVM_PRIVATE_KEY`/`HEDERA_PAYER_ADDRESS`, deploy
  `CtrlZVerifyEscrow`, then record the deployed address in `web/lib/contract.ts`.

---

## 2026-06-13 · agent (Claude) · E1/E2 Walrus evidence layer

- **Did:** Built the content-addressed evidence layer + wired it into `/verify`.
  - **E1** `web/lib/walrus/evidence.ts` — `AcceptanceManifest` (extends the demo
    spec: intent + checks + `resolutionPolicy` + `createdAt`) and `EvidenceBlob`
    (`{taskSpec, workerOutput, checkerReports, splitScore, recommendation,
    createdAt}`), plus `buildManifest` / `buildEvidenceBlob`.
  - **E1** `web/lib/walrus/store.ts` — `hashBlob` (canonical-JSON → **sha256
    hex**, the load-bearing anchor, ALWAYS computed; key-order-independent via a
    recursive canonicalizer; uses Web Crypto so it runs in browser/Node/strip-
    types). `storeEvidence` PUTs to the Walrus **publisher**, parses the blobId
    (probes `newlyCreated`/`alreadyCertified`/flat shapes), builds the aggregator
    read URI; **on ANY failure → `{store:"local", hash}`, never throws.**
    `readEvidence` GETs from the aggregator (best-effort). Endpoints **and** the
    store/read path templates are env-configurable
    (`NEXT_PUBLIC_WALRUS_PUBLISHER`/`_AGGREGATOR`/`_STORE_PATH`/`_READ_PATH`/
    `_TIMEOUT_MS`) with testnet v1 defaults.
  - **E2** `web/app/verify/run.ts` — after `runChecks` + `scoreSplit`, assembles
    the manifest + evidence blob; new `anchorEvidence()` stores the blob (Walrus
    → local) and hashes the manifest. `page.tsx` renders an evidence card: the
    **evidence sha256**, the **acceptance-spec hash**, the storage badge, and —
    when `store==="walrus"` — the **blobId** + a **"View evidence on Walrus"**
    link to the aggregator URI. Additive CSS (`.evidence-*`) in `globals.css`.
- **Verify:** `node_modules/.bin/tsc --noEmit` → exit 0 (reverted the stray
  `pnpm-workspace.yaml` `allowBuilds` line pnpm added). `selfcheck.ts`
  (`node --experimental-strip-types web/lib/walrus/selfcheck.ts`) → all pass:
  hashBlob deterministic + key-order-independent + differs on mutation; bogus
  publisher → local fallback with a valid hash, no throw. **Live store WORKED**
  against the default testnet publisher (real blobId minted; round-tripped the
  canonical blob back from the aggregator).
- **Ethos:** sha256 anchor is load-bearing + always shown; Walrus down → degrade
  to local hash (never throws into UI); content-addressed, chain holds only the
  pointer; one evidence object referenced everywhere.
- **Lane:** added `web/lib/walrus/**`; edited only `web/app/verify/**` +
  additive `globals.css`. Did NOT touch checkers/scoring/risk/llm/api/contracts.
- **Next:** Codex consumes `manifestHash` (on-chain spec commit) + the evidence
  `hash`/`blobId` (HCS receipt C3, ERC-8004 feedback D2) via `web/lib/walrus`.

---

## 2026-06-13 · agent (Claude) · A1/A2/A3 + B1/B2 verification core

- **Did:** Built the web-side verification core on a NEW `/verify` route
  (did not touch `web/app/page.tsx`).
  - **A1** checker framework: `web/lib/checkers/types.ts`
    (`CheckerReport`, `CheckSpec`, `Checker`, `TaskContext`, `WorkerSubmission`).
  - **B1** registry + runner: `web/lib/checkers/registry.ts`
    (`check.type → checker`, `runChecks`); unknown types degrade to `uncertain`.
  - **B2** demo checkers: `schema.ts`, `price.ts` (≤700 USDC),
    `walletRisk.ts` (REUSES `scoreRecipient` from `@/lib/risk`, tier→result),
    `sourceListing.ts` (advisory heuristic, no LLM decision).
  - **A2** split-scoring engine: `web/lib/scoring/score.ts` →
    `{outputValidity, agentTrust, paymentRisk, recommendation}`; deterministic
    policy (hard-gate fail → reject; uncertain/advisory-flag → pause; else
    proceed/proceed_with_protection). Three scores never collapsed.
  - **A3** UI: `web/app/verify/page.tsx` (client) + `run.ts` + `fixtures.ts`
    (CLEAN + BAD one-click submissions); renders split scores + each checker
    report; calls existing `/api/explain` to explain the recommendation.
    Additive CSS only in `web/app/globals.css`.
- **Verify:** `node_modules/.bin/tsc --noEmit` → exit 0. `selfcheck.ts`
  (`node --experimental-strip-types web/lib/scoring/selfcheck.ts`) → all checks
  pass: CLEAN → proceed/proceed_with_protection (all checks pass); BAD
  (POISONED_LOOKALIKE wallet + price 879 > 700) → reject.
- **Ethos:** checks decide; LLM only explains; three scores never collapsed;
  checkers pure/replayable; recipients shown by name in card copy.
- **Lane:** only added `web/lib/checkers/**`, `web/lib/scoring/**`,
  `web/app/verify/**` + additive `globals.css`. Reused risk/llm as-is.
- **Next:** B3 (meta-reputation UI — needs Codex's ERC-8004) → E (Walrus).

## 2026-06-13 · agent (Codex) · P1.11 on-chain alice seed complete

- **Did:** Recorded orchestrator-completed P1.11 seed for alice
  `0x3695f9A1A29b66ddbA90cD9069c65921C17b480C` on escrow
  `0x2f2B5C26de74aA7307A5b946B025ce1A13255f45`.
- **Txs:** sends created payment IDs 1 and 2:
  `0x7d7fc86e854ca416eb3044a46e2fa31d0b5f70f875e2d92c8d618e93e52a15ba`,
  `0xe319c5d0933c24b03630137a9eb6819a4906392685dc757fe8e3d77880832a8c`;
  claims sealed them:
  `0xa247070e6fabf9a9fad275ddb6737070a51cf2dcef4264a94396ea32cfa6eb9b`,
  `0xb6d6312252e57a3320d204f4ab6a67780dab09e9048e39e68e5a6d8ef39d7a73`.
- **Verified:** counters read back as `sealedCount=2`,
  `distinctSenderCount=1`, `firstSeen=1781323380`. Payments 1 and 2 are
  state `3` / SEALED with `sealedAt=1781323380`.
- **Fixture note:** The poisoned lookalike fixture already exists and was
  updated in PR #14.
- **Next:** Resume at P2.0/P2 validation with alice's non-zero on-chain
  history available.

## 2026-06-13 · agent (Codex) · Alice fixture uses owned settler wallet

- **Did:** Replaced the fake vanity alice placeholder with the owned settler
  wallet for the demo sync point. `web/lib/risk/fixtures.ts` now sets
  `ALICE_ADDRESS` to `0x3695f9A1A29b66ddbA90cD9069c65921C17b480C`, and
  `contracts/script/SeedAlice.s.sol` seeds that same address.
- **Why:** P1.11 was blocked because the previous fixture alice
  `0xA11cE0000000000000000000000000000000a5e1` was not controlled. Making alice
  equal to `SETTLER_ADDRESS` lets the seed/demo use an owned wallet and avoids
  the fake vanity placeholder.
- **Seed key behavior:** The seed script still accepts `ALICE_PRIVATE_KEY` when
  present, but safely falls back to `SETTLER_PRIVATE_KEY`; it derives the
  address and refuses to run unless the key matches alice. No secrets are logged
  or committed.
- **Fixture note:** The poisoned lookalike now matches the new alice visible
  prefix/suffix but uses a different middle:
  `0x3695f9000000000000000000000000000007480C`.
- **Next:** Run P1.11 create/claim phases with the settler key after this PR
  lands.

## 2026-06-13 · agent (Claude) · On-chain history reads (P2.5)

- **Did:** Added `web/lib/chain/history.ts` — a viem public client against Arc
  (`arcTestnet.rpcUrl` / `NEXT_PUBLIC_ARC_RPC_URL`) that reads the deployed
  escrow's reputation counters (`firstSeen`, `sealedCount`,
  `distinctSenderCount`, `flagCount`) via `ctrlzEscrowAbi`/`ctrlzEscrowAddress`,
  and derives `fraudRecallCount` from `Recalled` events with
  `reason == FRAUD_SUSPECTED` (enum value 2; `WRONG_ADDRESS`/`WRONG_AMOUNT`
  are neutral). Maps these into `RecipientHistory` and computes
  `firstSeenDaysAgo`. Returns `undefined` when `firstSeen == 0` (no on-chain
  presence) or on any RPC failure — never throws into the UI.
- Wired into `web/app/buyer/VerdictCard.tsx`: an effect fetches history for the
  resolved address and feeds it into `scoreRecipient({ ..., history })`; the LLM
  explanation now re-fetches off the history-enriched verdict.
- **Guards:** only **claimed** payments count (contract counters update on seal;
  we only READ). Resilient: unreachable RPC / no presence → `undefined` →
  engine degrades to "no history". Lane: only added `web/lib/chain/**` and
  edited the buyer card; no `contracts/**`, `web/lib/risk/**`, or
  `web/app/api/explain/**` touched.
- **Verify:** `pnpm install` + `tsc --noEmit` exit 0. Live read of
  `fetchRecipientHistory(ALICE_ADDRESS)` against Arc returned `undefined`
  WITHOUT throwing — RPC reachable (block ~46.82M), but `firstSeen(alice)`/
  `sealedCount(alice)` are `0` (seed script not yet executed on-chain).
- **Next:** once Codex runs the Alice seed (P1.11), the same reader will surface
  her sealed history and flip demo beat 2 to a green ESTABLISHED verdict.

## 2026-06-13 · agent (Codex) · Alice seed script (P1.11 blocked)

- **Did:** Added `contracts/script/SeedAlice.s.sol`, a guarded Arc seed script
  for the deployed escrow `0x2f2B5C26de74aA7307A5b946B025ce1A13255f45` and
  fixture alice `0xA11cE0000000000000000000000000000000a5e1`. It creates small
  payments and can later claim an id range with `claimFor` after the contract's
  hold expires. The script refuses to broadcast unless `ALICE_PRIVATE_KEY`
  derives exactly to the fixture address, so it cannot fake alice history or
  seed the wrong recipient.
- **Blocked:** Local `.env` does not contain `ALICE_PRIVATE_KEY`; dry-run failed
  before broadcast with `environment variable "ALICE_PRIVATE_KEY" not found`.
  Alice's current Arc counters are still `sealedCount=0` and
  `distinctSenderCount=0`, verified with `cast call` against the P1.10 deploy.
  No seed txs were sent, and P1.11 remains `[ ]`.
- **Fixture note:** The poisoned lookalike is already planted in
  `web/lib/risk/fixtures.ts` as `POISONED_LOOKALIKE`; no `web/**` edits were
  needed.
- **Verified:** `forge fmt --root contracts`; `forge test --root contracts`
  passes 41 tests.
- **Next:** Add a real `ALICE_PRIVATE_KEY` for
  `0xA11cE0000000000000000000000000000000a5e1` or change the fixture in the web
  lane, then run the seed in timed phases: create payments first, wait for the
  unknown-recipient hold, claim the created ids, then repeat after the shorter
  holds until `sealedCount` and `distinctSenderCount` are non-zero.

## 2026-06-13 · agent (Codex) · Arc deploy handoff (P1.10)

- **Did:** Deployed `CtrlZEscrow` to Arc testnet from the configured payer.
  Address: `0x2f2B5C26de74aA7307A5b946B025ce1A13255f45`; deploy block:
  `46822450`; tx:
  `0x91b8414d6203934b5f2541e39934d7fc4a6e5aac68b544e63a9618efc07a1280`.
- **Verified:** `cast call ... 'NAME()(string)'` returned `"CTRL+Z Escrow"`.
  `forge fmt --root contracts`; `forge test --root contracts` passes 41 tests;
  `web/node_modules/.bin/tsc --noEmit` passes. `pnpm --filter web typecheck`
  was blocked by pnpm's non-TTY modules purge prompt, so no package files were
  changed.
- **Handoff:** Logging this entry before editing `web/lib/contract.ts`; that file
  will carry address, deploy block, and ABI for Claude's web/indexer work.
- **State:** P1.10 `[x]`.
- **Next:** P1.11 seed script.

## 2026-06-13 · agent (Codex) · contract invariants (P1.9)

- **Did:** Expanded `contracts/test/CtrlZEscrow.t.sol` for P1.9 transition and
  invariant coverage: no double-claim, same-block recall/claim ordering by
  state, claim-after-refund state rejection, stronger refund-to-sender balance
  checks, and `claimFor` replay/state protection. No production contract code
  changed.
- **Verified:** `forge fmt --root contracts`; `forge test --root contracts`
  passes 41 tests.
- **State:** P1.9 `[x]`.
- **Next:** Codex → P1.10 deploy to Arc and record `web/lib/contract.ts`
  handoff details after logging.

## 2026-06-13 · agent (Codex) · contract transition events (P1.8)

- **Did:** Added indexer-ready event payloads across the escrow state machine:
  `Recalled`, `Rejected`, and `Expired` now include indexed sender/recipient
  plus amount, `Expired` is emitted on expiry refunds, and existing `Sent`,
  `Sealed`, `Flagged`, and `ProofAttached` events are covered with
  `expectEmit` tests.
- **ABI note:** Foundry regenerates the ABI under `contracts/out` during
  build/test, but committing it to `web/lib/contract.ts` is the P1.10 handoff
  surface. This worker did not edit `web/**`.
- **State:** P1.8 `[x]`. Next Codex contract part is P1.9 invariants.

## 2026-06-13 · agent (Codex) · flag and proof signals (P1.7)

- **Did:** Added `flag(id)` for the original sender of a SEALED payment,
  once within 30 days of `sealedAt`, incrementing recipient flag counters and
  emitting `Flagged` without moving money. Added recipient-only
  `attachProof(id, bytes32 hash)` on SEALED payments with `ProofAttached`,
  also signal-only. Added focused Foundry tests for gates, timing, duplicate
  flags, proof attachment, and balance invariants.
- **State:** P1.7 `[x]`; signals are contract-owned and never affect payment
  settlement.
- **Next:** Codex → P1.8 event completeness, including `Expired`.

## 2026-06-13 · agent (Codex) · on-chain tier counters (P1.6)

- **Did:** Added contract-owned recipient counters (`sealedCount`,
  `distinctSenderCount`, `flagCount`, `firstSeen`) plus recipient/sender
  dedupe for distinct sender approximation. Successful `claim`/`claimFor`
  seals now update reputation; PENDING, recall, reject, and expire do not.
  Replaced the P1.3 `hold()` stub with deterministic counter-derived tiers
  that still preserve the universal 5-minute undo floor through `send()`'s
  `max(clamped undoWin, hold(recipient))`.
- **State:** P1.6 `[x]`; contract tests cover sealed-only counter updates,
  distinct sender dedupe, hold shortening, and the unbuyable undo floor.
- **Next:** Codex → P1.7 `flag()` + `attachProof()`.

## 2026-06-12 · agent (Claude) · buyer verdict card (P6.1 + P3.2)

- **Did:** Built the buyer dApp's first screen at `web/app/buyer/`. Framed as
  buying a used RTX 4090 from a stranger: static listing + a "Pay with CTRL+Z"
  checkout. `VerdictCard.tsx` (client) takes a typed/pasted recipient, resolves
  it (`resolve.ts` — name↔address against the demo fixtures, ENS P2.4 not wired
  yet), scores it with the deterministic `scoreRecipient` (client-side), and
  renders the 🔴/🟡/🟢 tier + LLM explanation + `reasons[]`. POSTs the verdict
  to `/api/explain`; if that fails the reasons render as bullets and the tier
  still shows (guard #1). Resolved known recipients show their NAME in the card
  + headline, never raw hex (guard #5). One-click demo buttons fill the field
  with the poisoned lookalike (🔴) and alice by name/address (🟢). Added card
  styles to `globals.css` and a link from the home page. Did not touch
  `web/lib/risk/**`, `web/app/api/explain/**`, or `contracts/**`.
- **Verified:** `pnpm install` + `node_modules/.bin/tsc --noEmit` → exit 0.
  Demo-path sanity (ran engine directly): POISONED_LOOKALIKE → `red`; alice by
  address → `green`; alice by name → `green`. PASS.
- **Next:** P6.2 send → PENDING → UNDO → refund (blocked on the deployed escrow
  address/ABI in `web/lib/contract.ts` from Codex P1.10). Reviewer owns merging
  this PR.

## 2026-06-13 · agent (Codex) · expire refund (P1.5)

- **Did:** Added `expire(id)` to refund unclaimed PENDING payments after
  `expiresAt`; anyone can call it, but funds are sent only to the stored
  `refundTo` address after state is set to `REFUNDED`. Added Foundry coverage
  for 72h expiry, too-early expiry, state reverts after claim/reject/recall, and
  refund destination.
- **Verified:** `forge fmt --root contracts`; `forge test --root contracts`
  (15/15).
- **Next:** P1.6 on-chain counters and real `hold(recipient)`.

## 2026-06-13 · agent (Codex) · gasless claimFor (P1.4)

- **Did:** Added `claimFor(id, recipientSig)` to `contracts/src/CtrlZEscrow.sol`
  so any relayer can seal a claim after `claimableAt` using the recipient's
  signature. The signed digest binds payment id, stored recipient, chain id, and
  verifying contract; used digests are recorded to reject replay; funds are sent
  only to the stored recipient. Added focused Foundry coverage for relayer
  success, replay, wrong signer, too early, and recipient-only payout.
- **Verified:** `forge fmt --root contracts`; `forge test --root contracts`
  (11/11).
- **Next:** P1.5 `expire()`.

## 2026-06-13 · agent (Codex) · contract core P1.1-P1.3

- **Did:** Implemented the first escrow state-machine slice in
  `contracts/src/CtrlZEscrow.sol`: native-value `send()` creates PENDING
  payments with `refundTo` locked to sender, `recall(reason)` and `reject()`
  refund only to `refundTo`, and `claim()` seals after
  `claimableAt = now + max(clamped undoWin, hold(recipient))` with `hold()` as
  the planned P1.6 stub. Added self-contained Foundry tests for readable
  storage, undo-floor clamp, sender-only recall, recipient-only reject/claim,
  early-claim rejection, sealing, and recall-after-claim state rejection.
- **State:** P1.1/P1.2/P1.3 `[x]`. `forge test --root contracts` passes
  6 tests.
- **Next:** Codex → P1.4 `claimFor(id, recipientSig)` with replay protection
  and recipient-only payout.

## 2026-06-13 · agent (Claude) · LLM explainer (P3.1)

- **Did:** Built the AI explainer (P3.1). `web/lib/llm/explain.ts` — one
  server-side Claude call (`claude-opus-4-8`, effort low, per the `claude-api`
  skill) that turns the deterministic verdict's signals into a 1–2 sentence
  plain-English explanation. `web/app/api/explain/route.ts` — POST route so the
  call + API key stay server-side (browser computes the verdict, posts it here).
  Added `@anthropic-ai/sdk` + `server-only` to web deps; gitignored
  `*.tsbuildinfo`.
- **Ethos guard:** the LLM only explains — it reads `verdict.tier` but cannot
  change it. Every failure path (no `ANTHROPIC_API_KEY`, API error, `refusal`
  stop reason, empty output) degrades to the deterministic `reasons[]` join —
  a send is never blocked on the model.
- **Verified:** `tsc --noEmit` clean against the installed SDK types; risk
  selfcheck still 11/11. The live call is human-blocked on `ANTHROPIC_API_KEY`
  (route degrades without it).
- **Note:** branched off origin/main, so this PR does NOT include Codex's
  P1.1–P1.3 contract work (still on `codex/contract-core`, unmerged) — my lane
  doesn't depend on it. Doc edits (BUILD_PLAN P3.1 box, this entry) may conflict
  with Codex's branch at merge; trivial add/add.
- **Next (Claude lane):** P3.2 + P6.1 — render `{tier, explanation, reasons}`
  in the buyer verdict card.

## 2026-06-12 ~21:50 · agent (Claude) · per-agent handoff docs

- **Did:** Added [CLAUDE.md](CLAUDE.md) (web/risk/UI lane) and [CODEX.md](CODEX.md)
  (contract lane) — mirror-structured: Owns / Done / Next / Waiting-on /
  What-I-owe-the-other / Rules. BUILD_PLAN.md stays the part-list source of
  truth; these route ownership + the handoff contract. Added a pointer from
  WORKSTREAMS.md.
- **Handoff contract captured (the interface points):** (1) `web/lib/contract.ts`
  = Codex writes deployed address+ABI on P1.10, Claude reads; (2) `fixtures.ts`
  `ALICE_ADDRESS` = Claude defines, Codex's P1.11 seed must match; (3) event
  signatures = Codex emits P1.8, Claude's P4 indexer consumes; (4) verdict
  shape = Claude defines, Ledger/UI read.
- **State:** docs-lane change only; code unchanged. main still green.
- **Next:** Claude → P3.1 LLM explainer. Codex → P1.1 `send()`.

## 2026-06-12 ~21:30 · agent (Claude) · scaffold + risk engine (P0.1, P2.1–P2.3, P2.6)

- **Did:** Brought up my lane (web/risk per WORKSTREAMS) — scaffold (P0.1) plus
  the deterministic risk engine in `web/lib/risk/`: `types.ts`, `lookalike.ts`
  (address poisoning: visible prefix+suffix match + Levenshtein), `names.ts`
  (Cyrillic/Greek/capital-I homoglyph fold + name edit distance), `verdict.ts`
  (ordered-rules aggregator — signals decide, LLM only explains), `fixtures.ts`
  (demo address book + **planted poisoned lookalike**), `selfcheck.ts`
  (11 checks under plain `node --experimental-strip-types`, **all passing**).
  Added `allowImportingTsExtensions` to `web/tsconfig.json`.
- **Shipped:** PR #2 (`claude/risk-engine` → main). Rebased clean onto main
  after Codex's PR #1 squash-merged (the squash and my branch carried the same
  plan/workstream content under different hashes → add/add conflicts; resolved
  by reapplying only the additive code files on top of main + redoing the doc
  edits here).
- **Handoff → Codex:** `web/lib/risk/fixtures.ts` pins a placeholder
  `ALICE_ADDRESS` (`0xA11cE0…a5e1`). The P1.11 seed script must seed THAT alice,
  or update the fixture and ping here.
- **State:** P2.1/P2.2/P2.3/P2.6 `[x]`. P2.0 (manual ENS) human-blocked;
  P2.4 needs `SEPOLIA_RPC_URL`; P2.5 needs the deployed contract (Codex lane).
- **Next (Claude lane):** P3.1 LLM explainer → P6.1 buyer UI verdict card.

## 2026-06-12 · agent (Codex) · workstream split

- **Did:** Added [WORKSTREAMS.md](WORKSTREAMS.md) to separate Codex vs Claude
  lanes by path ownership, branch prefix, PR order, and handoff files. Added the
  pointer to [BUILD_PLAN.md](BUILD_PLAN.md). Ignored `.pnpm-store/` so local
  pnpm cache state does not enter PRs.
- **State:** Coordination-only change. P0.1 scaffold remains local and
  incomplete: `forge build --root contracts` passed, but
  `pnpm --filter web dev` is still unverified because npm downloads timed out.
- **Next:** Pick one owner for the scaffold PR, then keep Codex on
  `contracts/**` and Claude on `web/**` unless a handoff is logged.

## 2026-06-12 (later) · agent (Claude) · plan review pass

- **Did:** Re-reviewed BUILD_PLAN.md against the design docs and fixed real
  gaps: ① added the missing `St` status checkboxes the intro promised but the
  tables didn't have; ② marked `notes/` links as local-only (it's gitignored —
  links would 404 in the public repo); ③ P0.2 now includes the **Sepolia RPC**
  (all ENS reads happen there, not on Arc — it was missing entirely);
  ④ P1.3's `claimableAt` math referenced `hold(tier)` before it existed —
  now an explicit stub-then-replace-in-P1.6; ⑤ added **P2.0 manual ENS setup**
  (issue alice.ctrlz.eth + reverse record + ctrlz.score by hand — required by
  P2.4/P2.5 and demo beat 2, previously unscheduled); ⑥ P1.11 now also plants
  the poisoned-lookalike fixture demo beat 1 depends on; ⑦ added a
  **demo-beats → parts traceability table** in Phase 7; ⑧ P6.3 names the
  relayer (settler wallet) and the empty-wallet Arc-necessity beat; ⑨ pre-build
  logistics pointer to notes/PREP.md at the top.
- **State:** Still design-only, no code. Plan is now self-consistent.
- **Next:** Start **P0.1** (repo scaffold).

## 2026-06-12 · agent (Claude) · planning

- **Did:** Read all design docs (README, ARCHITECTURE, notes/CTRLZ, notes/PREP,
  notes/ARCHITECTURE). Sliced the spec into tiny checkpointable parts in
  [BUILD_PLAN.md](BUILD_PLAN.md) — Phases 0–7 + a conditional tier + a
  say-don't-build list, each part carrying a "Done when" checkpoint and an
  ethos "Guard".
- **Did:** Created this log.
- **State:** Design-only. **No code written yet** — repo is docs + LICENSE +
  .gitignore.
- **Next:** Start **P0.1** (repo scaffold: `contracts/` Foundry + `web/` Next.js
  + root `package.json` + `.env.example`). Then **P0.2** chain sanity read.
  Critical-path order from here: P0 → P1 (escrow, NEVER cut) → P1.11 seed script
  → P2 (risk engine) → P3 (LLM) / P4 (indexer) → P5 (Ledger, timeboxed) →
  P6 (UIs) → P7 (demo + submission).

<!-- Template for the next entry:

## YYYY-MM-DD · who · short title
- **Did:** …
- **State:** …
- **Next:** resume at P_._
-->
