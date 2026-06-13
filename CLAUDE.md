# CLAUDE.md — Claude's lane

> Handoff doc for the **Claude** agent. Pairs with [CODEX.md](CODEX.md).
> Part numbers (`P2.6`, etc.) are defined in [BUILD_PLAN.md](BUILD_PLAN.md) —
> that file stays the single source of truth; this one routes ownership.
> Ethos lives at the top of BUILD_PLAN — re-read it before each phase.

## Lane

**Web / risk / UI.** Branch prefix `claude/`.

**I own these paths** (edit freely):
- `web/app/**`, `web/components/**`
- `web/lib/risk/**`, `web/lib/ledger/**`
- `web/package.json`, `web/tsconfig.json`, web-only config

**I do NOT touch** (Codex's lane — see [CODEX.md](CODEX.md)):
- `contracts/**`, `scripts/**`, `test/**`, `foundry.toml`

## My build-plan parts

P0.1 (web shell) · **P2.1–P2.6** (risk engine) · P3.x (LLM explainer) ·
P4.x (reputation indexer / rich score) · P5.x (Ledger clear-sign) ·
P6.x (buyer + seller dApps).

## Done

- ✅ **P0.1** scaffold (web side) — Next 15 + viem.
- ✅ **P2.1 / P2.2 / P2.3 / P2.6** — deterministic risk engine in
  `web/lib/risk/` (address + name poisoning + verdict aggregator). 11/11
  self-checks pass via `node --experimental-strip-types web/lib/risk/selfcheck.ts`.
  Shipped in PR #2 (merged to main).

## Next (in order)

1. **P3.1** LLM explainer — one Claude call turning `verdict.signals` into a
   plain-English explanation. Check the `claude-api` skill for the current
   model id. Must degrade to `reasons[]` bullets if the call fails — never
   block a send on the LLM.
2. **P6.1** buyer UI verdict card rendering the 🔴/🟡/🟢 verdict.
3. **P6.2** send → PENDING → UNDO → refund (needs contract address — see Waiting).

## Waiting on Codex (blocked until these land)

| I need | For | Where it arrives |
|---|---|---|
| Deployed escrow **address + ABI** | P2.5 history reads, P6.2 send/recall, P4 indexer | `web/lib/contract.ts` (handoff file) — Codex writes on P1.10 |
| **Event signatures** (`Sealed/Recalled/Expired/Flagged`…) | P4 indexer | contract source / ABI, set in P1.8 |

## Waiting on human

- **P2.0** manual ENS setup (issue `alice.ctrlz.eth`, set reverse record +
  `ctrlz.score`) — needed before P2.4 ENS reads mean anything.
- `SEPOLIA_RPC_URL` in `.env` — needed for P2.4 ENS resolution.

## What I owe Codex

- **The ALICE fixture is the sync point.** `web/lib/risk/fixtures.ts` pins
  `ALICE_ADDRESS = 0xA11cE0…a5e1` (placeholder). Codex's seed script (**P1.11**)
  must seed THAT address with sealed history, **or** tell me the real demo
  address and I'll update the fixture. If these drift, demo beat 2 shows zeros.
- **The verdict shape** `{ tier, reasons[], signals[] }` (`web/lib/risk/types.ts`)
  is the contract the Ledger EIP-712 string (P5.2) and the UI both read. If
  Codex needs a field for the clear-sign screen, ask here.

## Rules

- One PR per lane checkpoint; never batch risk + UI in one PR. PR body lists:
  parts, paths, tests run, next owner.
- Crossing into a handoff file (`web/lib/contract.ts`, root `package.json`,
  `.env.example`) requires a `log.md` entry first.
- Every finished part: flip its box in BUILD_PLAN.md and add a `log.md` entry.
