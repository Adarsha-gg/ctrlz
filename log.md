# CTRL+Z — Work Log

What's been worked on, by whom, and where to pick up. Newest entry on top.
Each entry: date · who (human / agent) · part(s) from [BUILD_PLAN.md](BUILD_PLAN.md)
· what changed · **next** (the resume point).

> Convention: when you finish a part, flip its box in BUILD_PLAN.md (`[ ]`→`[x]`)
> and add an entry here. Keep entries short — one block per work session.

---

## 2026-06-13 · agent (Claude) · Held-out tests (commit-reveal) + PITCH.md

- **Did:** Built the held-out-test anti-gaming primitive
  `web/lib/checkers/heldout.ts` (commit-reveal): buyer commits
  `sha256({hiddenChecks, salt})` inside the Walrus manifest whose hash is the
  on-chain `specHash` — so hidden checks are bound at lock with **no contract
  change**, revealed at resolution, verified by `verifyReveal`. Selfcheck
  `heldout-selfcheck.ts` proves no-leakage, hiding, tamper-detection, and that a
  gamed deliverable passes public-only but fails once held-out checks reveal
  (14/14; tsc clean). Documented in REPUTATION.md §8f (incl. the fairness rule —
  held-out *inputs* not *requirements* — and the satisfiability/griefing-buyer
  guards). Added [PITCH.md](PITCH.md) — the necessity-chain story (why each
  component is required; remove one → a named attack walks through).
- **Next:** wire held-out manifest into the `/verify` flow + evidence blob (reveal
  at resolve); milestone escrow for large specs. See TODO.md P2/P4.

- **Did:** Pruned stale docs and synced the rest to current reality. **Deleted**
  `NEW_DIRECTION.md` (frozen pivot snapshot, superseded), `WORKSTREAMS.md`
  (pre-pivot escrow lanes → now in CLAUDE/CODEX), `STATUS.md` (→ TODO.md),
  `WORLDCHAIN_AGENTKIT_TASKLIST.md` + `BLOCKERS.md` (live items folded into TODO;
  tx record preserved in SUBMISSION + contract.ts). **Added** [TODO.md](TODO.md) —
  the single open-work list (G1 demo, F4/F5 AgentKit, reputation R-phases, Google
  GQ/VAL). **Updated** ARCHITECTURE (fixed stale escrow addr → `0xa2ac71dd…`,
  corrected the keccak→sha256 note now that PR #35 pins exact anchors, added
  ValidationRegistry row), README (Google reframed to the validation-pillar
  angle), BUILD_PLAN + SUBMISSION (fixed links to deleted files). Committed
  GOOGLE.md.
- **Next:** see [TODO.md](TODO.md). Top: G1 rehearsal/video; then R1.1 reputation
  engine and the Google VAL/GQ lanes.

---

## 2026-06-13 · agent (Claude) · Google/ERC-8004 validator lane (GOOGLE.md)

- **Did:** Wrote [GOOGLE.md](GOOGLE.md) — the Google Cloud / ERC-8004 prize plan.
  Strategy: don't build "another leaderboard"; implement ERC-8004's **unsolved
  third pillar (validation)**. **Verified on-chain** that the canonical ERC-8004
  **Validation Registry is already live on Hedera testnet** at
  `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` (EIP-1967 proxy; `getValidationStatus`
  reverts `"unknown"` per source; `getAgentValidations(101)` → `[]`). So **no deploy
  needed** — CTRL+Z just calls `validationRequest`/`validationResponse`. Mapping:
  `response`=score/100, `responseURI`=Walrus URI, `responseHash`=evidence hash.
  Floor = BigQuery explorer over **mainnet/Base** ERC-8004 (Identity
  `0x8004A169…`/Reputation `0x8004BAa1…`/Validation `0x8004Cc84…`); plan does NOT
  depend on Google indexing Hedera. Also: the ERC-8004 spec's own well-known domain
  verification == our enterprise domain proof (REPUTATION.md §4a) — adopt theirs.
- **Next:** Phase VAL (Codex) — copy `ValidationRegistry.json` ABI to
  `scripts/hedera/abis/`, add `erc8004-validation-request.mjs` +
  `erc8004-validation-respond.mjs`, wire resolve → on-chain validationResponse.
  Phase GQ (Claude/human) — GCP coupon + BigQuery explorer over mainnet registries.
  Booth Sunday: ask if Hedera is in BigQuery (bonus, not a blocker).

---

## 2026-06-13 · agent (Claude) · Reputation system design (REPUTATION.md)

- **Did:** Wrote [REPUTATION.md](REPUTATION.md) — the agent validation + reputation
  spec. Locked 4 decisions: (1) enterprise = cheap self-serve **domain proof**
  (DNS/`.well-known`), (2) **public** sibling linkage (no privacy — an operator's
  agents are visible), (3) fraud propagates **hard but not 0** (decaying drag;
  only a pattern zeroes a cluster), (4) **dispute window with staked verifiers**
  adjudicated by deterministic **re-execution** of checkers against the Walrus
  blob (reuses `replayChecks` + sha256 anchor). Core principle: *good rep is hard
  to share, fraud rep is easy to share*. Builds on existing `world/policy.ts`
  tiers/`clusterId`/`reputationSubjectFor` (and Codex's new backing-cluster lane).
- **Decided since:** at-risk bonds = **5× task value**; verifiers
  **permissionless but staked**; jurors **human-backed + random per dispute**
  (REPUTATION.md §8c/§8d). Added §8e explaining the deterministic re-execution
  requirement (freeze inputs + pin checker version hash in the evidence blob).
- **Next:** Phase R1.1 — `web/lib/reputation/` operator-root model; replace the
  flat tier boost with earned+shared operator standing (`floor()`). See §11 plan.
  Key remaining build risk = the §8e deterministic runner (R4 depends on it; also
  constrains checkers to use no live data on the dispute path).

---

## 2026-06-13 · agent (Codex) · Exact `/verify` hashes pinned on Hedera

- **Did:** Added `scripts/demo/verify-hashes.mjs` to compute the clean `/verify`
  manifest/evidence sha256 anchors through the same deterministic checkers,
  split scoring, World backing boost, checker meta-reputation, and Walrus
  evidence shapes used by the UI.
- **C2 exact run:** redeployed `CtrlZVerifyEscrow` at
  `0xa2ac71dd9e7835af08e6be33ec047c47a35b2462`; deploy tx
  `0xcd4b8b44fb3292a932a2e40b7f4c08a49847dc9c56f8419b825ccd28d23843f0`;
  resolve tx `0xdbdb8f5236d1a1473bebb7f95c0e12683bebfbdf9f857628e62e69e9fbbeeb10`.
  The on-chain `specHash` is
  `0xc558bf1d075e6d7c622aaba021c8409b1cbbdf17c8cc527aa59c7326e9279d84`;
  `evidenceHash` is
  `0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7`.
- **Walrus + HCS:** stored the exact-run evidence record on Walrus:
  `https://aggregator.walrus-testnet.walrus.space/v1/blobs/eDxE69ZD3dua2R7xO8Z1KlYa9RvKgpNZHzXIkO63frk`;
  emitted HCS receipt `0.0.9222066@1781356716.807172813` on topic
  `0.0.9222881`.
- **State:** the previous deterministic demo-fixture C2/C3 records remain valid
  historical receipts but are superseded for submission by the exact `/verify`
  C2/C3 run.

---

## 2026-06-13 · agent (Codex) · Real World AgentKit lane + backing clusters

- **Did:** Split the old World-style F1 gate from a real AgentKit lane. Added
  `@worldcoin/agentkit`, a protected `/api/world/agentkit` endpoint, and an
  agent-side client script that signs/retries with `createAgentkitClient`.
- **Reputation model:** added backing-aware reputation subjects: `world-human:*`
  for agents tied to the same World human, `enterprise:*` for verified company
  agents, and `agent:*` for unbacked agents. UI now shows whether reputation is
  shared across a backing cluster or local to the agent.
- **Verify:** `npm run demo:check` passes, including the new AgentKit selfcheck
  and Next build.
- **Blocked/live step:** F4/F5 remain open until the demo wallet is registered
  in AgentBook through World App verification and the live client is run four
  times to show 3 free uses then payment-required.

---

## 2026-06-13 · agent (Claude) · Stress test + walrusUri terminology fix

- **Did:** Inspected/stress-tested all 30 merged PRs. `forge test` 47/47 pass;
  web `tsc --noEmit` clean; risk/scoring/walrus/world selfchecks all pass; full
  `next build` passes. Verified every live claim on-chain via read-only RPC +
  mirror node (C1/C2/C3/D1/D2 all `status=0x1`; verify-escrow task 1 reads back
  `state=PAID`, `scoreBps=9200`, matching specHash/evidenceHash/recommendationHash).
- **Fixed terminology:** the HCS receipt's `walrusUri` had been a hand-typed
  **GitHub link**, not a Walrus URI. Added `scripts/hedera/store-evidence.mjs`
  (reuses `web/lib/walrus/store.ts`) to store the evidence record on Walrus and
  print a real aggregator URI + sha256 anchor; hardened `hcs-receipt.mjs` to
  **reject** any non-Walrus `--walrus-uri`. Stored a real blob
  (`OnRmhrt8o-olmw4DJj5K6_WUFYjFR9Qir_A7ehyctds`) and re-emitted the canonical
  receipt on topic `0.0.9222881` — tx `0.0.9222066@1781350379.095328969`
  (seq 3, `taskId:1`, real Walrus URI). Seq 1 (GitHub link) + seq 2 (placeholder
  taskId) remain on the append-only topic, superseded. Updated SUBMISSION/README/
  scripts docs. Added `ARCHITECTURE.md` and `STATUS.md`.
- **Note:** on-chain demo hashes are deterministic keccak256 demo-fixtures
  (`keccak256("ctrlz-demo-evidence-v1")`), distinct from the sha256 Walrus anchor.
  Both are now stored + cross-referenced in the receipt.
- **Next:** if exact `/verify` sha256 anchors are wanted on-chain, rerun
  `hedera:verify-demo` with `HEDERA_VERIFY_SPEC_HASH`/`HEDERA_VERIFY_EVIDENCE_HASH`.

---

## 2026-06-13 · agent (Codex) · Hedera HCS live C3

- **Did:** Fixed native Hedera SDK private-key parsing for portal-style ECDSA
  hex keys, then submitted the CTRL+Z Verify HCS receipt. Topic:
  `0.0.9222881`; tx: `0.0.9222066@1781349565.367938628`; payload references
  verify escrow `0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4`, evidence hash
  `0x547ddf8be39080f6c01b007835654637ce68ac113470b3a1d6dbd38c02330e02`,
  score `9200`, and recommendation `proceed`.
- **State:** C3 `[x]`. Remaining build-plan work is G1 manual rehearsal/video.
- **Next:** Run the `/verify` demo five times and record the submission video.

## 2026-06-13 · agent (Codex) · ERC-8004 live D1/D2

- **Did:** Registered the CTRL+Z worker and checker agent metadata in the
  Hedera ERC-8004 IdentityRegistry. Worker agent `101` tx:
  `0xd4912aef78fb8f76a0e77e583516bcf0f84ac3e14de5d46d5c78c39dd0863c94`;
  checker agent `102` tx:
  `0xff802ef5cd713ab8075e3b195329ac3664633dfa648f61fff156e84582d8f80f`.
  Wrote ReputationRegistry feedback from the resolver/client wallet: worker
  outcome tx `0x3745fa1efa69f725481f5798d3e2d76d856123510569f09f2a59c277f3e0fb0f`;
  checker accuracy tx
  `0xa42eb5c0142e0fd26362c900357fd4def575691d91800040147bec7ee6078bbc`.
- **Fix:** `erc8004-feedback.mjs` now prefers a non-owner feedback signer
  (`HEDERA_FEEDBACK_PRIVATE_KEY` or resolver key) because the registry correctly
  rejects self-feedback from the agent owner.
- **State:** D1 `[x]`; D2 `[x]`. C3 HCS remains incomplete due native SDK
  `DEADLINE_EXCEEDED`; G1 still needs five rehearsals/video.
- **Next:** Try HCS from another network path or record the G1 demo with C3
  called out as the only remaining live-write gap.

## 2026-06-13 · agent (Codex) · Hedera live C1/C2

- **Did:** Updated Hedera env handling for the renamed payer/resolver variables,
  added `npm run hedera:evm-sanity`, and added `npm run hedera:verify-demo`.
  Confirmed a live Hedera testnet EVM sanity transfer:
  `0x9236c06cbd4021ce15c531a4d184d325b88c8ab852585bcf69c2a63733b09e97`.
  Deployed `CtrlZVerifyEscrow` at
  `0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4` and ran lock/accept/submit/
  resolve(PASS) with tx hashes recorded in [SUBMISSION.md](SUBMISSION.md) and
  [BLOCKERS.md](BLOCKERS.md). The confirmed run used deterministic demo-fixture
  bytes32 hashes; rerun with `HEDERA_VERIFY_SPEC_HASH` and
  `HEDERA_VERIFY_EVIDENCE_HASH` to anchor exact `/verify` sha256 values.
- **State:** C1 `[x]`; C2 `[x]` for pass→release. C3 remains incomplete because
  native Hedera SDK writes time out from this environment. D1/D2 remain
  incomplete until live ERC-8004 registry writes are run with real agent/evidence
  URIs.
- **Next:** Run D1 ERC-8004 registrations, then D2 feedback writes, or record
  the G1 demo if time is tighter.

## 2026-06-13 · agent (Codex) · blocker runbook

- **Did:** Added [BLOCKERS.md](BLOCKERS.md) with exact missing env vars and
  commands for C1/C2/C3/D1/D2, plus the G1 demo rehearsal completion checklist.
- **State:** No code path changed. Remaining incomplete work is external-state
  blocked (funded Hedera credentials) or manual submission work (five rehearsals
  + video).
- **Next:** Provide/fund Hedera credentials and run the commands in
  [BLOCKERS.md](BLOCKERS.md), or run G1 rehearsals/video.

## 2026-06-13 · agent (Codex) · G1 rehearsal readiness helper

- **Did:** Added `npm run demo:check`, a local readiness script that runs the
  scoring selfcheck, World selfcheck, and `npm run build` in `web/`, then reports
  Hedera env readiness by variable presence only.
- **Safety:** The helper does not require secrets, print secret values, import tx
  scripts, or submit Hedera transactions. G1 remains `[ ]`; five manual
  rehearsals and video capture are still not done.
- **Verify:** `npm run demo:check` passes locally. Hedera readiness is reported as
  informational and currently missing funded tx credentials.
- **Next:** Run manual G1 rehearsals end-to-end five times, record the video, and
  only then mark G1 complete.

---

## 2026-06-13 · agent (Codex) · G2 docs/submission reframe

- **Did:** Reframed [README.md](README.md) from the old Arc undo-payment story
  to the current CTRL+Z Verify submission: Hedera settlement hooks, World
  AgentKit-style gating, Walrus evidence, and ERC-8004 worker/checker
  reputation. Added [SUBMISSION.md](SUBMISSION.md) with explicit prize-box
  language, demo commands, and a shipped-vs-blocked table.
- **Honesty boundary:** C1/C2/C3/D1/D2 remain blocked on funded Hedera
  credentials; Google BigQuery is conditional/not shipped unless the sponsor
  approves the Hedera data source; Arc/Ledger are prior/stretch, not primary.
  No live Hedera transactions are claimed.
- **State:** G2 `[x]` for docs/submission framing only. G1 remains `[ ]` until
  the demo runs clean start-to-finish five times.
- **Next:** Rehearse G1; if funded Hedera credentials arrive, run C1/C2/C3/D1/D2
  and replace blocked language with real tx hashes only after confirmation.

## 2026-06-13 · agent (Codex) · World AgentKit gating (F1)

- **Did:** Added deterministic World-style gating under `web/lib/world/**`: human-backed
  agents get 3 free verification uses, unknown agents and exhausted trials require
  payment. Added IDKit portal verification plumbing with `rp_id` preferred over
  `app_id`, plus deterministic demo fallback when World credentials are absent.
- **UI/API:** `/verify` now surfaces the World gate and capped `agentTrust` baseline
  boost without changing output checks. Added `/api/world/verify` for AgentBook/IDKit
  lookup and policy decisions.
- **Verify:** `node --experimental-strip-types web/lib/world/selfcheck.ts` passes:
  first 3 human-backed uses free, 4th pay-gated, unknown pay-gated, trust boost
  capped, and hard-gate rejection remains reject.
- **State:** F1 `[x]`.
- **Next:** Wire real AgentBook lookup calldata once the deployed World Chain registry
  ABI/address is finalized; demo fallback is deterministic meanwhile.

## 2026-06-13 · agent (Codex) · checker meta-reputation (B3)

- **Did:** Added checker replay comparison, seeded checker outcome history, and
  money/recency-weighted outcome-match accuracy. Threaded checker influence into
  split scoring so low-weight advisory signals get reduced decision impact while
  deterministic hard-gate failures still win.
- **UI:** `/verify` now shows each checker's accuracy, influence weight, replay
  status, and wrong-outcome count beside the report. The Walrus evidence blob now
  carries the checker meta snapshot.
- **Verify:** `node --experimental-strip-types web/lib/scoring/selfcheck.ts`
  passes, including replay, advisory down-weighting, and hard-gate guard cases.
  `npm run build` in `web/` passes.
- **State:** B3 `[x]`.
- **Next:** Wire live ERC-8004 feedback writes into the settlement/HCS flow once
  Hedera credentials are funded.

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
