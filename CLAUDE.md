# CLAUDE.md — Claude's lane (CTRL+Z Verify)

> Pairs with [CODEX.md](CODEX.md). Tasks + ethos live in [BUILD_PLAN.md](BUILD_PLAN.md)
> (that's the source of truth; this routes ownership). **Product pivoted** to
> CTRL+Z Verify — agents safely hire/pay/verify other agents. We reuse the merged
> escrow-build core (risk engine, explainer, verdict UI) and build the
> verification spine on Hedera + Walrus + ERC-8004.

## WHO DOES WHAT (shared separator — identical table in CODEX.md)

| Lane | Owner | BUILD_PLAN | Owns these paths |
|---|---|---|---|
| **Verify / web** — checkers, split scoring, verification UI | **Claude** | A, B | `web/lib/checkers/**`, `web/lib/scoring/**`, `web/app/verify/**` |
| **Evidence** — Walrus blobs + hash anchor | **Claude** | E | `web/lib/walrus/**` (+ wiring) |
| **Auth** — World AgentKit gating | **Claude** | F | `web/lib/world/**` |
| **Hedera / settlement** — escrow on Hedera EVM, HCS, ERC-8004 | **Codex** | C, D | `contracts/**`, `scripts/**`, Hedera SDK / HCS / ERC-8004-write code |

**One shared handoff file:** `web/lib/contract.ts` (Codex writes the deployed
Hedera address + ABI; Claude reads). Editing it requires a `log.md` entry first.

## I own (edit freely)
`web/lib/checkers/**` · `web/lib/scoring/**` · `web/app/verify/**` ·
`web/lib/walrus/**` · `web/lib/world/**` · verify-page UI + additive CSS.

**Reuse, don't rewrite (consume as-is):** `web/lib/risk/**` (→ wallet-risk
checker), `web/lib/llm/**` + `web/app/api/explain/**` (explains the
recommendation), `web/lib/chain/**` (history reads; re-point to Hedera RPC).

## I do NOT touch (Codex's lane)
`contracts/**`, `scripts/**`, and any Hedera SDK / HCS / ERC-8004-write code.

## My parts
A1/A2/A3 (checker interface + split scoring + `/verify` page) · B1/B2 (checker
framework + demo checkers) · B3 (meta-reputation UI side — needs Codex's ERC-8004)
· E1/E2 (Walrus evidence) · F1 (World gating).

## Done (merged; reframed per BUILD_PLAN §10)
Risk engine → wallet-risk checker · LLM explainer → recommendation explainer ·
verdict UI → split-score card · on-chain history reads.

## Next
**Phase A + B1/B2** — the verification core on a NEW `web/app/verify` route
(don't touch `web/app/page.tsx`) → then E (Walrus) → F (World).

## Waiting on Codex
- Deployed **Hedera** escrow address + ABI in `web/lib/contract.ts` — to wire `resolve()` and re-point history reads to Hedera RPC.
- **HCS topic id** + **ERC-8004 write hooks** — to anchor the evidence hash and write worker/checker feedback.

## Waiting on human
- Hedera testnet creds (for Codex's deploy) · World AgentKit / IDKit app id (F) · Google qualification answer (conditional analytics lane).

## What I owe Codex (handoff outputs)
- **The resolution decision** — the split-score `recommendation` + pass/fail that the contract's `resolve(taskId, …)` consumes (`web/lib/scoring`).
- **The evidence + spec hash format** — what gets anchored on-chain / in HCS / in ERC-8004 (from the Walrus blob, `web/lib/walrus`).
- **The `CheckerReport` schema** — so checker accuracy can be written to ERC-8004 (`web/lib/checkers/types.ts`).

## Rules
One PR per checkpoint; branch `claude/`; isolated worktrees; verify with `tsc`;
reviewer-gated merges. Flip BUILD_PLAN boxes + add a `log.md` entry per part.
