# CTRL+Z — Work Log

What's been worked on, by whom, and where to pick up. Newest entry on top.
Each entry: date · who (human / agent) · part(s) from [BUILD_PLAN.md](BUILD_PLAN.md)
· what changed · **next** (the resume point).

> Convention: when you finish a part, flip its box in BUILD_PLAN.md (`[ ]`→`[x]`)
> and add an entry here. Keep entries short — one block per work session.

---

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
