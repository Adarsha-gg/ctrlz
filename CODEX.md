# CODEX.md — Codex's lane (CTRL+Z Verify)

> Pairs with [CLAUDE.md](CLAUDE.md). Tasks + ethos live in [BUILD_PLAN.md](BUILD_PLAN.md)
> (source of truth; this routes ownership).
>
> ⚠️ **PIVOT — read this.** We moved off **Arc**. The settlement lane now targets
> **Hedera Testnet EVM**. Your escrow Solidity is **reusable — relocate it, don't
> rewrite** (Hedera is EVM-compatible via JSON-RPC relay). And **stay out of
> `web/`** — that's Claude's lane. (Recent `web/app/api/seller/**` edits were the
> old escrow seller flow; that product is deprecated — do not continue it.)

## WHO DOES WHAT (shared separator — identical table in CLAUDE.md)

| Lane | Owner | BUILD_PLAN | Owns these paths |
|---|---|---|---|
| **Verify / web** — checkers, split scoring, verification UI | **Claude** | A, B | `web/lib/checkers/**`, `web/lib/scoring/**`, `web/app/verify/**` |
| **Evidence** — Walrus blobs + hash anchor | **Claude** | E | `web/lib/walrus/**` (+ wiring) |
| **Auth** — World AgentKit gating | **Claude** | F | `web/lib/world/**` |
| **Hedera / settlement** — escrow on Hedera EVM, HCS, ERC-8004 | **Codex** | C, D | `contracts/**`, `scripts/**`, Hedera SDK / HCS / ERC-8004-write code |

**One shared handoff file:** `web/lib/contract.ts` (you write the deployed Hedera
address + ABI; Claude reads). Editing it requires a `log.md` entry first — it's
the ONLY `web/` file you touch.

## I own (edit freely)
`contracts/**` (escrow → Hedera EVM) · `scripts/**` (Hedera deploy/seed) ·
Hedera SDK code (HCS receipts) · ERC-8004 read/write glue.

## I do NOT touch (Claude's lane)
`web/lib/checkers/**`, `web/lib/scoring/**`, `web/app/**`, `web/lib/walrus/**`,
`web/lib/world/**`, `web/lib/risk/**`, `web/lib/llm/**`. (Only `web/lib/contract.ts`,
as the logged handoff.)

## My parts
C1 (Hedera setup + one real testnet financial op) · C2 (redeploy escrow to Hedera
EVM; add `resolve()` driven by the verification result) · C3 (HCS audit receipts)
· D1 (register service + checker agents in ERC-8004 Identity) · D2 (write
settlement-derived reputation feedback to ERC-8004).

## Done (on Arc — now relocate to Hedera)
Escrow Solidity: send / recall / reject / claim / claimFor / expire / on-chain
tier / flag / events / tests / Arc deploy. Reuse the contract; redeploy to Hedera.

## Next
**C1** (prove one real Hedera op) → **C2** (redeploy + `resolve()`) → **C3** (HCS)
→ **D** (ERC-8004).

## Waiting on human
- Hedera testnet account + JSON-RPC relay creds in `.env`.

## What I owe Claude (handoff outputs)
| Provide | Via | Part |
|---|---|---|
| Deployed **Hedera** escrow address + ABI | `web/lib/contract.ts` (handoff — log first) | C2 |
| `resolve(taskId, pass/fail)` entrypoint driven by the verification recommendation | contract ABI | C2 |
| **HCS topic id** | `web/lib/contract.ts` or env | C3 |
| ERC-8004 registry addresses (Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`) + write hooks | contract glue / env | D |

## Ethos guards in my code (BUILD_PLAN §3)
- **No arbiters, no admin keys** — settlement resolves on the *verification result*, never a human override.
- **Constraint-typed resolution** — `resolve(pass)` → release, `resolve(fail)` → refund; UNCERTAIN pauses for buyer-accept (don't auto-refund possibly-valid work).
- **Hash pointers only on-chain** — spec hash + evidence hash; bulky data lives on Walrus (Claude's lane).
- **ERC-8004 feedback is settlement-derived**, not attestation-only.

## Rules
One PR per checkpoint; branch `codex/`; reviewer-gated merges; editing the
`web/lib/contract.ts` handoff needs a `log.md` entry first. Flip BUILD_PLAN boxes
+ add a `log.md` entry per part.
