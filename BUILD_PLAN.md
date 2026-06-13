# CTRL+Z — Build Plan (tiny parts)

> The public design lives in [README.md](README.md) / [ARCHITECTURE.md](ARCHITECTURE.md).
> The full spec + logistics live in `notes/` (CTRLZ.md, PREP.md — **local only,
> gitignored, never committed**). **This file is the build decomposition** — the
> spec sliced into the smallest units that each (a) do one thing, (b) have a
> single "Done when" line you can verify, and (c) leave an obvious place to stop
> and resume. Work the log at [log.md](log.md) as you go.

> **Before building anything:** run the DO-NOW list in `notes/PREP.md` —
> faucets (Arc + Sepolia), register **ctrlz.eth** on Sepolia, Ledger loaner,
> Circle booth questions. None of that is code; all of it gates the code.

## How to read this

- Parts are numbered `P<phase>.<step>`. Do them in order inside a phase; phases
  mostly stack, but Phase 2/4 only need the contract's **events + ABI + deployed
  address**, not a finished UI.
- Every part has a **St** (status) box — `[ ]` not started, `[~]` in progress,
  `[x]` done — plus **Done when** (the checkpoint) and **Guard** (the ethos
  invariant it must not break — if a part violates its Guard it isn't done,
  it's a regression). When you flip a box, add an entry to [log.md](log.md)
  with who/what/where-to-continue.
- **Cut line** per phase = what happens if you run out of time. `NEVER` = the
  demo dies without it.

## Parallel work rule

When Codex and Claude are both active, split work by [WORKSTREAMS.md](WORKSTREAMS.md).
Codex owns the contract lane; Claude owns the web/risk/UI lane; docs/submission
work needs one named owner at a time. Shared handoff files (`web/lib/contract.ts`,
root package files, `.env.example`) require a `log.md` entry before editing.

## The ethos (do not drift — re-read before each phase)

1. **We protect the send, not the shopping.** After `claim()` a payment is
   forever final. No goods escrow, no vesting, no partial seal.
2. **No arbiters, no admin keys, ever.** The only undo right belongs to the
   **sender**, only **before claim**. Nobody can touch a SEALED payment.
3. **The escrow IS the reputation system.** Tiers/holds are derived on-chain
   from the contract's own counters. The off-chain indexer only enriches the
   *display* score — it never gates money.
4. **Two timers, never conflated.** Universal 5-min sender undo floor; tiered
   recipient-side risk hold stacks on top via `max()`.
5. **Raw `0x` on screen = a bug.** Every surface resolves ENS names.
6. **Delivery proof never gates money.** `flag()`/`attachProof()` are signals.
7. **Signals are opinions; patterns are evidence; money only moves on evidence.**

---

## Phase 0 — Scaffold & chain access · `NEVER` · ~1h

| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **P0.1** | Repo scaffold: monorepo layout (`contracts/` Foundry, `web/` Next.js + Chrome/WebHID target, `web/lib/` shared TS), root `package.json`, `.env.example` (keys named, values empty). `.gitignore` already covers `.env` — verified. | `forge build` and `pnpm --filter web dev` both run on an empty skeleton. | `.env` never committed — real keys live locally only. |
| `[ ]` | **P0.2** | Chain config + read sanity, **both chains**: Arc testnet (`https://rpc.testnet.arc.network`, chainId `5042002`, USDC-as-gas) for the escrow, **Ethereum Sepolia RPC for all ENS reads** (ENS lives there, not on Arc). Payer/settler wired from env; a `scripts/balances` read printing both wallets on both chains. | Script prints non-zero Arc balances for payer + settler and reaches Sepolia. | Decimals trap: Arc native gas = 18 decimals, ERC-20 USDC = 6. Don't mix. |

**Stop point:** repo builds, both chains reachable. Resume at P1.1.

---

## Phase 1 — Escrow contract on Arc · `NEVER` (Fri night) · the core

Build the state machine in slices; keep each compiling. Target ~165 lines total.

| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[x]` | **P1.1** | Storage + `send(to, amount, undoWin)` → PENDING. Struct stores sender, recipient, amount, `claimableAt`, `expiresAt`, `refundTo` (= sender, locked here), state. | A `send` tx creates a PENDING payment readable by id. | `refundTo` fixed to sender at `send()` — zero redirect surface. |
| `[x]` | **P1.2** | `recall(reason)` (sender-only, PENDING→REFUNDED) with reason enum `WRONG_ADDRESS / WRONG_AMOUNT / FRAUD_SUSPECTED / OTHER`; `reject()` (recipient-only, instant, PENDING→REFUNDED). | Sender can recall, recipient can reject; both refund to `refundTo`. | Only the **sender** may recall; gate on **state**, not timestamp. |
| `[x]` | **P1.3** | `claim()` (recipient, PENDING→SEALED after `claimableAt`), store `sealedAt`. Two-timer math: `claimableAt = now + max(undoWin, hold(recipient))`, `undoWin` clamped `[5min, 24h]`, `expiresAt = now + 72h`. **`hold()` is a stub returning 0 here** — the real counter-derived version lands in P1.6; the `max()` shape goes in now so it never gets bolted on. | A payment claims only after `claimableAt`; reverts before. | 5-min undo floor is universal — no tier buys it below 5 min. |
| `[ ]` | **P1.4** | `claimFor(id, recipientSig)` gasless via any relayer. Sig hash binds `paymentID + recipient`; mark hash used (no replay); checks-effects-interactions; funds only ever go to the recipient. | A relayer claims with the recipient's sig; replay reverts. | Funds can only land at the recipient — never the relayer. (Circle's own README disclosed a drain vuln in their analogous fn — this hardening is the lesson.) |
| `[ ]` | **P1.5** | `expire()` — anyone, after `expiresAt`, unclaimed → auto-refund to sender. | After 72h time-warp in tests, anyone can expire a dead-address payment. | Refund goes to `refundTo` only. |
| `[ ]` | **P1.6** | On-chain tier: per-address counters (`sealedCount`, distinct-sender approx, `flagCount`, `firstSeen`) updated on transitions; replace the P1.3 stub — `hold()` now reads them. Unsolicited PENDING **never** updates counters — only claimed payments do. | Two send+claims to the same recipient shorten its computed hold. | Tier is contract-derived only — never UI-supplied (spoofable). Dust-PENDING can't poison counters. |
| `[ ]` | **P1.7** | `flag(id)` (original sender of a SEALED payment, once, within 30 days of `sealedAt` → complaint event, no refund) + `attachProof(id, hash)` (seller, on SEALED, signal only). | Sender flags once inside window; second flag / non-payer / post-30d all revert. | Neither ever moves money. |
| `[ ]` | **P1.8** | Events for every transition: `Sent`, `Recalled(reason)`, `Rejected`, `Sealed(sender,recipient,amount)`, `Expired`, `Flagged`, `ProofAttached`. | All transitions emit; ABI exported to `web/lib`. | Events are the indexer's only feed — emit enough to reconstruct the score. |
| `[ ]` | **P1.9** | Foundry tests: one per transition + invariants (no double-claim, recall-after-claim reverts, same-block recall/claim resolves by state, refund always to sender, claimFor replay protection, undo floor unbuyable). | `forge test` green. | The same-block recall/claim race resolves with no special case — whichever executes first wins. |
| `[ ]` | **P1.10** | Deploy to Arc testnet; record address + deploy block in `web/lib/contract.ts` **and in [log.md](log.md)**. | Contract readable on Arc; address committed. | — |
| `[ ]` | **P1.11** | **Seed script** — give `alice` real on-chain history: loop of small send+claims so the tier and the "1,402 sealed claims" verdict aren't zeros. Also plant the demo's **poisoned lookalike** in the sender's history fixture (a near-miss of alice's address). | Reading alice's counters shows non-trivial sealed history; the lookalike fixture exists. | Everyone forgets this — without it the demo verdict shows zeros and beat 1 has nothing to catch. |

**Stop points:** after P1.9 the contract is trustworthy; after P1.11 the demo
data exists. Resume at P2.0 (Phase 2 needs only ABI + address + seed).

---

## Phase 2 — Risk engine (deterministic signals) · `NEVER` (Sat AM)

Pure TS in `web/lib/risk/`. Signals **decide**; the LLM only explains (Phase 3).

| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **P2.0** | **Manual ENS setup — hands, not code** (~30 min in the Sepolia ENS app): issue `alice.ctrlz.eth` subname → alice's address, set her primary name (reverse record) so fwd+rev match, set the `ctrlz.score` text record by hand. | `alice.ctrlz.eth` resolves both directions on Sepolia and carries a score record. | Setup is allowed; **code only READS ENS this weekend** — writes stay manual. |
| `[x]` | **P2.1** | Address-book + known-names data model: the sender's saved contacts (incl. alice and the **planted poisoned lookalike from P1.11**) and a small set of well-known names to diff against. | The fixture address book loads and is queryable. | — |
| `[x]` | **P2.2** | Lookalike **address** edit-distance vs address book → "1 char off your known address, 0 history". | The planted lookalike scores 🔴; alice's exact address scores clean. | This is the poisoning core — demo beat 1 lives or dies here. |
| `[x]` | **P2.3** | Lookalike **name** check: homoglyph map (`aIice`, Cyrillic а) + ENSIP-15 normalization + edit-distance vs known names. | `aIice.eth` flags against `alice.eth`. | Names get the *same* scrutiny as addresses — closes the "you just moved poisoning to ENS" objection. |
| `[ ]` | **P2.4** | ENS resolution (Sepolia): forward + reverse must match (primary name set); surface name age; mismatch → 🟡 "claims to be alice.eth, isn't". | A mismatched primary name downgrades the verdict; alice (P2.0) passes. | No raw hex returned — always resolve to a name for display. |
| `[ ]` | **P2.5** | History signals from Arc: read on-chain tier/counters + recall-rate split by reason (`FRAUD_SUSPECTED` = early-warning; `WRONG_*` = neutral noise). | Verdict reflects alice's seeded sealed history. | Only **claimed** payments count; unsolicited PENDING is ignored. |
| `[x]` | **P2.6** | Verdict aggregator → 🔴/🟡/🟢 from the signals above (deterministic, explainable, ordered rules). | `score(recipient)` returns `{tier, reasons[]}` for the three demo cases: lookalike → 🔴, mismatch → 🟡, alice → 🟢. | The verdict object is the single source of truth the LLM, Ledger screen, and UI all read. |

**Stop point:** `score(recipient)` is deterministic and demo-correct. Resume at
P3.1 to wrap it in language.

---

## Phase 3 — AI explainer · Sat PM · `Fallback: render reasons[] as bullets`

| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **P3.1** | One LLM call (Claude — check the `claude-api` skill for the current model id when wiring it) that turns the verdict's `reasons[]` into a plain-English explanation. | Given a verdict, returns a 1–2 sentence human explanation. | The LLM **explains**, it never decides — it cannot override the deterministic tier. |
| `[ ]` | **P3.2** | Wire the explanation into the verdict-card shape the UI renders. | Verdict card carries `{tier, explanation, reasons[]}`. | Degrade to `reasons[]` bullets if the call fails — never block a send on the LLM. |

---

## Phase 4 — Reputation indexer / rich score · Sat PM · `Cut: on-chain tier only, skip rich strings`

| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **P4.1** | Event reader: pull `Sealed/Recalled/Expired/Flagged` from the deploy block, aggregate per address (client-side is fine). | A function returns per-address event rollups. | Off-chain — display only, never gates money. |
| `[ ]` | **P4.2** | Rich score: sealed claims weighted by **distinct senders**; flags weighted by amount + distinct payers; recall-rate by reason; produces the demo string "1,402 sealed claims, 890 buyers, 0.3% recall rate". | The rich tier string renders for alice from seeded events. | Wash-trading guard: 500 self-loops count as 1 sender (distinct-sender weighting). |

> Reviewer-credibility weighting (score-the-scorers) and ENS/ERC-8004 **writes**
> are **say-don't-build** — see the tail of this file.

---

## Phase 5 — Ledger clear-sign · Sat eve · `Timebox 4h → fallback: wallet-sig approval`

Chrome/WebHID only, localhost or HTTPS. Packages: `@ledgerhq/device-management-kit`,
`@ledgerhq/device-signer-kit-ethereum`, `@ledgerhq/device-transport-kit-web-hid`.

| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **P5.1** | DMK + WebHID connect flow in Chrome. | App detects + connects the Ledger. | No device by Fri eve → skip the whole phase to the wallet-sig fallback; don't fight hardware at hour 20. |
| `[ ]` | **P5.2** | EIP-712 typed data carrying the human verdict string. | Typed data renders "Pay alice.eth $2,000 — risk LOW". | The device shows the *verdict and the name*, never blind hex. |
| `[ ]` | **P5.3** | Clear-sign → physical tap → submit `send()`; below-threshold amounts take the wallet-sig path. | Above-threshold pay routes through Ledger; below-threshold through wallet sig. | Keep `ledger-feedback.md` running — SDK feedback is free bonus consideration. |

---

## Phase 6 — Buyer + Seller dApps · Sun AM · `Audience-facing polish > features`

| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **P6.1** | Buyer: marketplace listing frame ("buying a used GPU from a stranger", **Pay with CTRL+Z** button) + recipient field + verdict card from P2/P3. | Pasting a recipient shows the live 🔴/🟡/🟢 verdict + explanation. | Frame as a marketplace buy, never an abstract "send money" screen. |
| `[ ]` | **P6.2** | Buyer: `send()` → PENDING view → **UNDO** button → `recall()` → refund rendered **from RPC state** (explorer is corroboration only). | The full poison→fix→pay→undo→refund loop runs in-UI. | The recall climax reads RPC — testnet explorer indexing lag must not own the demo. |
| `[ ]` | **P6.3** | Seller: "⏳ PENDING — do not deliver" / "✅ SEALED — irreversibly yours" view + `claim()` and gasless `claimFor()` (relayer = the **settler** wallet) + `attachProof()` + a mocked "Delivered ✓ (FedEx)" chip. | Seller claims with an empty wallet via relayer; seals; attaches proof; buyer view flips the chip. | The chip is display only — it **never** gates money. The empty-wallet claim is the Arc-necessity beat: rehearse saying it. |
| `[ ]` | **P6.4** | ENS-everywhere pass across both apps: recipient field, verdict card, Ledger screen, seller dashboard, event feed, flag records, ⚠️ badges. | Grep the rendered UI — no bare `0x…` anywhere. | Raw `0x` on screen = a bug. |
| `[ ]` | **P6.5** | Tier badges + two-sided buyer ⚠️ (serial-recaller) badge from the P4 score. | Tiers/badges render from indexed events. | — |

---

## Phase 7 — Demo + submission · Sun PM · `NEVER`

| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **P7.1** | Rehearse the demo ×5 against real seeded state; verify the recall climax reads RPC live. | Runs cleanly start-to-finish 5× without a hitch. | Protect rehearsal time above ANY remaining feature — solo means nobody else rehearses. |
| `[ ]` | **P7.2** | Video + diagrams + README **Status** section updated to list **only what actually shipped** (move the rest to Roadmap) + ENS submission checklist: ① tick the ENS prize boxes on the ETHGlobal form, ② one explicit ENS sentence in the video, ③ ENS section in the README. | Submission complete; all three ENS boxes done. | Arc requires diagram + video + repo; the ENS split pool evaporates if any box is missed. |

### Demo beats → parts (what each beat needs; if a part slips, its beat dies)

| Beat | Moment | Needs |
|---|---|---|
| 1 | Paste poisoned lookalike → 🔴 + AI explains the attack | P1.11 (planted fixture), P2.2, P3.1, P6.1 |
| 2 | Fix to alice.eth → 🟢 "1,402 sealed claims, 890 buyers, 0.3% recall" | P2.0, P2.4–P2.6, P4.2, P1.11 |
| 3 | $2,000 → Ledger: "Pay alice.eth $2,000 — risk LOW" → tap | P5.1–P5.3 (or wallet-sig fallback) |
| 4 | "…wait. Wrong invoice." → **UNDO** → refund live | P1.2, P6.2 |
| 5 | Seller: empty wallet claims → SEALED → proof → "Delivered ✓" chip | P1.4, P6.3 |
| 5b | *(conditional)* watcher auto-recalls mid-window, zero human touch | C1 only |

---

## Conditional tier — only if running ahead of the table

| St | Part | Goal | Trigger |
|---|---|---|---|
| `[ ]` | **C1** | **Auto-recall watcher**: one rule re-scores PENDING after send; a flag mid-window → autonomous `recall()`. "The undo button works while you sleep." | Core (P1–P7) locked + rehearsed. |
| `[ ]` | **C2** | **Circle Agent Wallets** agent-sender demo with the verdict as the policy input. | **Only if** the Circle booth confirmed the Arc-testnet quickstart works today. |
| `[ ]` | **C3** | **Circle Wallets** gasless seller claim (else the `claimFor` relayer already covers it). | Spare time + Circle console set up. |

## Say-don't-build (pitch as design, do not write this weekend)

`depositBond` + slash rules · World ID nullifier binding · ERC-8004 Identity/
Reputation **writes** · ENS **writes in code** (P2.0 does them by hand; code only
**reads**) · reviewer-credibility weighting in the indexer · subname-issuance
code · Compliance Engine call · nanopayments / risk-verdict-as-a-service ·
reputation decay curves · partial-seal/vesting (rejected on purpose — it breaks
"we protect the send, not the shopping").
