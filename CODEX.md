# CODEX.md — Codex's lane

> Handoff doc for the **Codex** agent. Pairs with [CLAUDE.md](CLAUDE.md).
> Part numbers (`P1.4`, etc.) are defined in [BUILD_PLAN.md](BUILD_PLAN.md) —
> that file stays the single source of truth; this one routes ownership.
> Ethos lives at the top of BUILD_PLAN — re-read it before each phase.

## Lane

**Contract core.** Branch prefix `codex/`.

**I own these paths** (edit freely):
- `contracts/**`, `scripts/**`, `test/**`, `foundry.toml`

**I do NOT touch** (Claude's lane — see [CLAUDE.md](CLAUDE.md)):
- `web/app/**`, `web/components/**`, `web/lib/risk/**`, `web/lib/ledger/**`

## My build-plan parts

**P1.1–P1.11** (escrow state machine, tests, deploy, seed) · P0.2 contract-side
chain reads (`scripts/balances`).

## Done

- ✅ Workstream split docs (PR #1, merged).
- ✅ Contract placeholder `contracts/src/CtrlZEscrow.sol` compiles (`forge build`).

## Next (in order)

Build the state machine in compiling slices — full spec per part in BUILD_PLAN:

1. **P1.1** storage + `send()` → PENDING (`refundTo` locked to sender here).
2. **P1.2** `recall(reason)` + `reject()` → REFUNDED.
3. **P1.3** `claim()` → SEALED with the two-timer `max()` shape (`hold()` stub = 0).
4. **P1.4** `claimFor(id, sig)` gasless + replay protection.
5. **P1.5** `expire()` auto-refund.
6. **P1.6** on-chain counters → real `hold(recipient)` (replaces P1.3 stub).
7. **P1.7** `flag()` + `attachProof()` (signals, never move money).
8. **P1.8** events for every transition.
9. **P1.9** Foundry tests + invariants → `forge test` green.
10. **P1.10** deploy to Arc → **write `web/lib/contract.ts`** (handoff).
11. **P1.11** seed script — alice's sealed history.

## Waiting on human

- Arc testnet USDC on payer + settler (faucet — see `notes/PREP.md`).
- `ARC_RPC_URL` + private keys in `.env` for deploy (P1.10) and seed (P1.11).

## What I owe Claude (handoff outputs)

| I provide | Via | Part | Why it matters |
|---|---|---|---|
| Deployed escrow **address + deploy block + ABI** | `web/lib/contract.ts` (handoff file — log before editing) | P1.10 | Unblocks Claude's P2.5 history reads, P6.2 send/recall, P4 indexer |
| **Event signatures** `Sealed(sender,recipient,amount)`, `Recalled(reason)`, `Expired`, `Flagged`, `ProofAttached` | contract source + ABI | P1.8 | Claude's indexer (P4) reconstructs the score from these — emit enough to do it |
| **Seeded alice** | `scripts/` seed | P1.11 | **Must match `web/lib/risk/fixtures.ts` `ALICE_ADDRESS`** (`0xA11cE0…a5e1`) — or tell Claude the real address. Drift here = demo beat 2 shows zeros |

## Ethos guards that live in MY code (don't regress)

- **No arbiters, no admin keys.** Only the sender can `recall()`, only before
  claim. Nobody can touch a SEALED payment.
- **The escrow IS the reputation system** — `hold()` derives the tier from the
  contract's OWN counters. Never accept a UI-supplied tier (spoofable).
- **Two timers via `max()`** — universal 5-min undo floor, unbuyable by any
  tier; risk hold stacks on top.
- **Unsolicited PENDING never updates counters** — only claimed payments do
  (no dust-poisoning our own reputation system).
- **`flag()` / `attachProof()` are signals** — they never move money.

## Rules

- One PR per lane checkpoint (e.g. PR: contract core + tests; separate PR: deploy
  handoff). PR body lists: parts, paths, tests run, next owner.
- Editing `web/lib/contract.ts` (handoff) requires a `log.md` entry first — it's
  Claude's read surface.
- Every finished part: flip its box in BUILD_PLAN.md and add a `log.md` entry.
