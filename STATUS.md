# STATUS — CTRL+Z Verify

> Snapshot of what's built, what's been verified, and what's left.
> Last updated: 2026-06-13 (after a full stress test of all 30 merged PRs).
> Box source of truth is [BUILD_PLAN.md](BUILD_PLAN.md); this is the human summary.

## TL;DR

Everything in the plan is **shipped and verified except G1** (5 clean demo
rehearsals + the demo video). All 30 merged PRs were inspected and stress-tested;
all automated checks pass and every live on-chain claim was independently
confirmed via read-only RPC + the Hedera mirror node.

## Done & verified

| Area | Part | State | How it was verified |
|---|---|---|---|
| Checker framework + demo checkers | A1, B1, B2 | ✅ | `scoring/selfcheck.ts` 14/14; `tsc` clean |
| Split-scoring engine | A2 | ✅ | selfcheck asserts 3 scores never collapse; deterministic replay |
| Verification UI (`/verify`, buyer card) | A3 | ✅ | `next build` passes; routes prerender |
| Checker meta-reputation | B3 | ✅ | selfcheck: re-execution proof + weight-down on wrong checker |
| Risk engine (wallet-risk checker) | reuse | ✅ | `risk/selfcheck.ts` 11/11 (homoglyph, poisoning, fwd/rev) |
| Walrus evidence (hash anchor + store/read) | E1, E2 | ✅ | `walrus/selfcheck.ts` 9/9 + **live blob stored & read back** |
| World gating + human-backing boost | F1 | ✅ | `world/selfcheck.ts` 6/6 (fail-closed paths covered) |
| Verify escrow contract | C2 | ✅ | `forge test` 47/47; exact `/verify` sha256 anchors pinned on-chain; task 1 reads `state=PAID`, `score=9200` |
| Hedera sanity op | C1 | ✅ | tx `0x9236…b09e97`, `status=0x1` |
| HCS audit receipt | C3 | ✅ | topic `0.0.9222881`, receipt `0.0.9222066@1781356716.807172813` with exact evidence hash + real Walrus URI |
| ERC-8004 identity | D1 | ✅ | worker `101`, checker `102` registration txs `status=0x1` |
| ERC-8004 reputation feedback | D2 | ✅ | worker + checker feedback txs `status=0x1` |
| Docs / submission framing | G2 | ✅ | README + SUBMISSION + this file + ARCHITECTURE.md |

### Stress-test results (2026-06-13)
- **Contracts:** `forge test` → **47/47 pass** (41 `CtrlZEscrow` + 6 `CtrlZVerifyEscrow`), 0 failures.
- **Web:** `tsc --noEmit` → **clean**; `next build` → all 8 routes compile/prerender.
- **Selfchecks:** risk 11/11, scoring 14/14, walrus 9/9, world 6/6 — all pass.
- **On-chain (read-only):** all 7 live txs (C1, C2 deploy + resolve, D1 ×2, D2 ×2)
  return `status=0x1`. Verify escrow + ERC-8004 registries have live bytecode.
  Verify-escrow task 1 reads back `specHash` / `evidenceHash` / `scoreBps=9200` /
  `recommendationHash` identical to `web/lib/contract.ts`; `state=PAID`.
- **HCS:** topic `0.0.9222881` has the receipt with matching exact evidence
  hash, score, recommendation, and Walrus URI.

## Fixed in this pass
- **`walrusUri` terminology.** The HCS receipt had been pointing `walrusUri` at a
  **GitHub link**, not a Walrus blob. Added `scripts/hedera/store-evidence.mjs`
  (reuses the web Walrus store), hardened `hcs-receipt.mjs` to reject non-Walrus
  URIs, stored a real evidence blob, and re-emitted a receipt with the genuine
  Walrus URI. The latest exact `/verify` receipt is sequence 4:
  `0.0.9222066@1781356716.807172813`. Updated SUBMISSION / README / scripts docs.

## What's left

| Priority | Item | Notes |
|---|---|---|
| **P0** | **G1 — demo rehearsal ×5 + video** | The only open BUILD_PLAN box. Run `npm run demo:check`, rehearse the §13 demo end-to-end 5×, record the video, line up fallbacks for flaky integrations. Nothing in code blocks this. |
| P2 | Wire the buyer-decision path live | Contract supports `buyerAcceptPaused` / `buyerRefundPaused` for the UNCERTAIN→pause branch; only the PASS path has a live demo tx so far. |
| P3 | Google BigQuery lane | Conditional — only pursue if the sponsor approves Hedera ERC-8004/settlement data as an eligible source. |

## Known external dependencies / blockers
See [BLOCKERS.md](BLOCKERS.md). Human-supplied items: Hedera testnet creds (in
`.env`, working), World AgentKit / IDKit app id (F1 runs with deterministic
fallback without it), Google qualification answer (conditional lane).

## Quick health check
```sh
npm run demo:check        # full next build + scoring/world selfchecks, no txs
cd contracts && forge test
```
