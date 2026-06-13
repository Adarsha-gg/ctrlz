# CTRL+Z — Work Log

What's been worked on, by whom, and where to pick up. Newest entry on top.
Each entry: date · who (human / agent) · part(s) from [BUILD_PLAN.md](BUILD_PLAN.md)
· what changed · **next** (the resume point).

> Convention: when you finish a part, flip its box in BUILD_PLAN.md (`[ ]`→`[x]`)
> and add an entry here. Keep entries short — one block per work session.

---

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
