# CTRL+Z Verify — Submission

**Live demo:** https://ctrlz-zeta.vercel.app

## One-liner

CTRL+Z Verify is the **verification + settlement layer for agents paying agents**:
a buyer agent posts a task with a machine-checkable acceptance standard, a worker
agent delivers, deterministic checkers decide pass/fail against the evidence, and
the verdict moves money on Hedera and updates ERC-8004 reputation — with the
evidence anchored on Walrus so any third party can re-run the check.

## The wedge — pay-on-green

The flagship is the narrowest verifiable job, where "correct" is binary and cheap
to check: **a worker submits a patch; payment releases the moment the test suite
goes green.** Held-out tests (commit-reveal) stop the worker hardcoding the
answer. It's the SWE-bench format wired to escrow + reputation instead of a
leaderboard. Why this and not "verify chain data" or "delegate a swap": those are
already solved (ZK coprocessors; intents/solvers like CoW). The unsolved gap is
verified settlement for agent work that **isn't** ZK-provable — which is most of
it. See [PAY_ON_GREEN.md](PAY_ON_GREEN.md).

## Verified live this run (real transactions, not claims)

| Flow | Result | Proof |
|---|---|---|
| Pay-on-green PASS (honest fix) | escrow **PAID** (released to worker) | escrow `0xa2ac71dd9e7835af08e6be33ec047c47a35b2462`, taskId 4, resolve `0x65884ceece33dad2c0f0fd7f6c2b2de449191a7ca9472d8c82ed03f00ecc1601` |
| Pay-on-green FAIL (cheat caught by **held-out** tests) | escrow **REFUNDED** (buyer made whole) | taskId 5, resolve `0xa06f6b8e142bbe8b84c37730d85393658512ebeca82328e62913f3d5a9241a31` |
| ERC-8004 validation write | **written** on-chain | request `0x1051f471185ea178009165dfdbdaee437c3c3c5f2858a1e372bb1619cd610d83`, response tx `0xbd1c0ea603d7016ecd570db69fddaf10ef28cb19870e3dd6d526902dd18d0708` |
| Marketplace — Ethereum | **82 live agents** via Google BigQuery | dataset `bigquery-public-data.goog_blockchain_ethereum_mainnet_us` |
| Marketplace — Hedera | **208 live agents** via Hedera Mirror Node (no BigQuery needed) | `testnet.mirrornode.hedera.com` |
| Reputation engine | **7/7 invariants pass** | `web/lib/reputation` selfcheck |

The cheat→refund case is the thesis in one shot: the worker hardcoded the answer
to pass the *visible* test, the **held-out** tests caught it, and the chain
refunded the buyer — no human in the loop.

## What's live in the deployed app

- **`/verify/payongreen-demo`** — pay-on-green end to end: run green / cheat, see
  the verdict, the anchored replay bundle, and the on-chain settle button
  (release/refund on Hedera).
- **`/reputation`** — interactive operator-cluster reputation: inject fraud and
  watch siblings drag, the offender drop to ~0, and a fraud *pattern* collapse the
  whole operator. Runs the real `web/lib/reputation` engine in-browser.
- **`/marketplace`** (+ `/marketplace/[agentKey]`) — live ERC-8004 agent explorer,
  Ethereum (BigQuery) ↔ Hedera (mirror node) toggle, Sybil/rater-concentration
  lens, x402 badges.
- **`/verify`** — the original constraint-based verification surface (checker
  registry, split scoring, Walrus evidence, LLM used only to *explain*, never to
  decide).
- **`/api/deploy/status`** — reports which credential groups are configured
  (no secrets).

## How it works

1. **Acceptance standard, committed.** Buyer commits a spec + held-out tests
   (`sha256` commitment); worker commits its patch. Neither side can move after
   the fact.
2. **Deterministic check.** The runner applies the patch and runs the suite; the
   pure `tests_pass` checker compares the run to the acceptance set → pass/fail.
   The baked demo runs **in-process** (pure JS, Vercel-safe); untrusted caller
   workspaces run in an isolated **Vercel Sandbox** microVM (gated, off by default).
3. **Evidence anchored.** Spec + patch + run results go into a content-addressed
   Walrus blob; its `sha256` is the on-chain anchor — so anyone can re-run the
   check and catch a lying verifier.
4. **Settle + reputation.** The verdict maps to `resolve(PASS|FAIL|UNCERTAIN, …)`
   on the Hedera escrow (release/refund) and an ERC-8004 validation/feedback write.

## Prize-track alignment

### 🌱 Walrus & Sui stack ($3,000) — best new build
Walrus does **load-bearing** work, not decoration: every verdict's evidence blob
*and* the held-out-test reveal are stored on Walrus, content-addressed by
`sha256`. The verdict is auditable **only because** those inputs are retrievable
from Walrus — that's what makes a lying verifier catchable (re-run the blob,
compare the hash). New this hackathon: the pay-on-green checker, the
held-out-reveal Walrus blob, the anchored replay bundle, the reputation engine.
- **Verified live:** `evidenceStore: walrus`, evidence blob
  `https://aggregator.walrus-testnet.walrus.space/v1/blobs/apqZ4qpbZUp2eIguhWxYSvLYnsez4o_jbxPL4e8BmUY`
  (aggregator read `200`); held-out reveal also stored on Walrus; `sha256` anchor
  always computed with local fallback.

### 🤖 AI & Agentic Payments on Hedera ($6,000)
A buyer agent posts a task + bounty, discovers a worker via the marketplace, and
**pays only on verified green** — settled on Hedera.
- **≥1 payment on Hedera testnet:** pay-on-green `lock → resolve` — **PAID**
  (taskId 4) and **REFUNDED** (taskId 5) verified this run (txs above).
- **Tooling used:** Hedera EVM/SDK escrow; **x402** (pay-per-request gate on
  `/verify/payongreen`); **ERC-8004** validation write (live tx above);
  **HCS-14** universal agent IDs (`web/lib/hcs14`); **HCS** receipt audit trail
  (topic `0.0.9222881`).
- ⚠️ **Required and not done:** the ≤5-minute demo video of the autonomous
  payment flow.

### 🤖 On-Chain Agent Economy / BigQuery ($5,000)
`/marketplace` is a direct hit on every requirement.
- **BigQuery as the core:** queries `bigquery-public-data.goog_blockchain_ethereum_mainnet_us`
  for ERC-8004 Identity/Reputation/Validation events (**82 live agents** this run).
- **Specific EF mainnet registries:** Identity
  `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation
  `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`, Validation
  `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58`.
- **Ranking + x402 + frontend:** ranks by feedback breadth/concentration +
  validation signals; flags x402-payable agents from metadata; Next.js UI with
  search/filters + a Sybil/rater-concentration lens. Hedera tab adds 208 more
  agents via the mirror node.

## Honest scope (don't overclaim)

- **Trust model is "CTRL+Z is the v1 verifier."** The anchored, deterministic
  replay makes a lying verifier *catchable* (re-run the blob), but automatic
  dispute / multi-verifier slashing (REPUTATION.md §8) is designed, not built.
- **Untrusted code execution is gated off** by default (`403`); the demo only runs
  the safe in-process baked fixture. Real untrusted patches need the Vercel
  Sandbox (`PAYONGREEN_SANDBOX=1`).
- **Marketplace shows fixture data** when GCP creds aren't set; on the live deploy
  they are set, so it's real.
- **Reputation engine is the math + an interactive demo**; it is not yet fed by a
  production operator-identity data layer, and bonds/disputes are the chain lane.

## Run locally

```sh
# web app (in web/)
pnpm install && pnpm --filter web build && pnpm --filter web dev

# deterministic selfchecks (no secrets, no txs)
node --experimental-strip-types web/lib/reputation/selfcheck.ts
node --experimental-strip-types web/lib/scoring/selfcheck.ts

# pay-on-green, no server needed (baked, in-process)
#   POST /verify/payongreen {"demo":"green"}  → PASS / release
#   POST /verify/payongreen {"demo":"cheat"}  → FAIL / refund (held-out catches it)
```

Deploy config (Hedera settle, ERC-8004 writes, BigQuery, x402) is in
[VERCEL.md](VERCEL.md). Open work (demo video G1, marketplace sibling-linkage,
chain-lane bonds/disputes) is in [TODO.md](TODO.md).
