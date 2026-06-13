# ARCHITECTURE — CTRL+Z Verify

> How this repo is wired, where each thing lives, and where to add new code.
> Pairs with [BUILD_PLAN.md](BUILD_PLAN.md) (the task/ethos source of truth) and
> the lane docs [CLAUDE.md](CLAUDE.md) / [CODEX.md](CODEX.md).

## 1. What it is

CTRL+Z Verify lets one agent safely **hire / pay / verify** another agent. A buyer
commits an **acceptance spec**, a worker submits output, deterministic **checkers**
judge it, a **split score** turns those reports into a recommendation, the
**evidence** is stored on Walrus (content-addressed), and an **escrow on Hedera**
releases or refunds based on the result — with an **HCS receipt** and **ERC-8004**
reputation feedback as the audit trail.

The load-bearing rule throughout: **checks decide, the LLM only explains; the three
scores are never collapsed; every on-chain record is a hash pointer, never bulk data.**

## 2. Two lanes (who owns what)

| Lane | Owner | Paths |
|---|---|---|
| Verify / web / evidence / auth | **Claude** | `web/lib/checkers/**`, `web/lib/scoring/**`, `web/lib/walrus/**`, `web/lib/world/**`, `web/lib/risk/**`, `web/app/verify/**` |
| Hedera / contracts / scripts | **Codex** | `contracts/**`, `scripts/**`, Hedera SDK / HCS / ERC-8004 writes |
| **Shared handoff** | both | `web/lib/contract.ts` — Codex writes deployed addresses/ABI, Claude reads. Editing it requires a `log.md` entry first. |

## 3. Repo map

```
contracts/                 Foundry project (Solidity, solc 0.8.24)
  src/CtrlZVerifyEscrow.sol   the verify escrow: lock→accept→submit→resolve
  src/CtrlZEscrow.sol         the earlier send/recall/claim escrow (reused core)
  test/*.t.sol                self-contained tests (custom cheat iface, no forge-std)
  script/*.s.sol              deploy + seed scripts
out/                          forge build artifacts (ABI + bytecode; gitignored)

web/                       Next.js 15 / React 19 app (App Router, TS, ESM)
  app/verify/              the /verify demo surface (Claude's route)
    fixtures.ts              demo submission + acceptance spec + seeded histories
    run.ts                   glue: runChecks → score → buildEvidence → anchor
    page.tsx                 the verification UI
  app/buyer/               buyer verdict card (reused escrow-checkout UI)
  app/api/explain/         server-side LLM explanation of the recommendation
  app/api/world/verify/    World IDKit proof verification endpoint
  lib/
    checkers/              checker framework + the demo checkers (see §5)
    scoring/score.ts       split-scoring engine → 3 scores + recommendation
    risk/                  deterministic wallet-risk engine (wrapped as a checker)
    walrus/                content-addressed evidence: hash anchor + store/read
    world/                 World AgentKit-style gating + human-backing trust boost
    chain/history.ts       on-chain reputation/history reads (Hedera RPC)
    contract.ts            *** shared handoff: addresses, ABIs, deploy metadata ***
    ledger/environment.ts  chain/env wiring

scripts/hedera/            live Hedera ops (node ESM, @hashgraph/sdk + viem)
  env.mjs                    dotenv loader + client/credential helpers
  evm-sanity-transfer.mjs    C1 sanity financial op
  verify-escrow-demo.mjs     C2 deploy + lock/accept/submit/resolve
  hcs-receipt.mjs            C3 HCS audit receipt (validates --walrus-uri)
  store-evidence.mjs         stores the evidence on Walrus → real URI + sha256
  erc8004-register-agent.mjs D1 identity registration
  erc8004-feedback.mjs       D2 reputation feedback
  abis/                      ERC-8004 registry ABIs
scripts/demo/check.mjs     read-only rehearsal-readiness check (sends no txs)

docs/agents/*.json         ERC-8004 agent registration metadata (worker 101, checker 102)
```

## 4. The verification spine (end-to-end data flow)

```
acceptance spec (fixtures.ts)
        │
        ▼
runChecks(checks, ctx)  ── checkers/registry.ts ──►  CheckerReport[]
        │                                            (pass | fail | uncertain, confidence, reasons)
        ▼
replayChecks(...)  ──► re-execution proof for deterministic checkers
        │
        ▼
computeCheckerMetas(...)  ──► per-checker accuracy weight (B3 meta-reputation)
        │
        ▼
buildCheckerRuntimeManifest(...) ──► pinned checker code hash + frozen inputs (§8e)
        │
        ▼
scoreSplit({checks, workerHistory})  ── scoring/score.ts
        │     ├── outputValidity  ← hard-gate checker results
        │     ├── agentTrust      ← worker settlement history
        │     ├── paymentRisk     ← wallet-risk checker
        │     └── recommendation  ← deterministic policy over the three
        ▼
applyWorldTrustBoost(...)  ── world/  (human-backing raises baseline agentTrust only)
        │
        ▼
buildManifest() + buildEvidenceBlob()  ── walrus/evidence.ts
        │
        ▼
storeEvidence(blob)  ── walrus/store.ts
        │     ├── hashBlob: canonical-JSON → sha256  (ALWAYS computed; load-bearing)
        │     └── PUT to Walrus publisher → {store:"walrus", blobId, uri, hash}
        │        (any failure → {store:"local", hash}; NEVER throws into the UI)
        ▼
on-chain (Codex lane, scripts/hedera/):
   CtrlZVerifyEscrow.resolve(taskId, result, evidenceHash, scoreBps, recHash)
        ├── PASS → pay worker · FAIL → refund buyer · UNCERTAIN → pause for buyer
   HCS receipt  → {evidenceHash, scoreBps, recommendation, walrusUri}  (hcs-receipt.mjs)
   ERC-8004     → worker-outcome + checker-accuracy feedback           (erc8004-feedback.mjs)
```

### Two hashes, on purpose (don't conflate them)
- **sha256 Walrus anchor** — `hashBlob()` over the canonical evidence JSON. This is
  what content-addresses the blob on Walrus and what `/verify` renders.
- **on-chain `evidenceHash` (bytes32)** — in the *current live demo* this is a
  deterministic **keccak256 demo-fixture** (`keccak256("ctrlz-demo-evidence-v1")`),
  not the sha256 anchor. To pin the exact sha256 anchors on-chain, rerun
  `hedera:verify-demo` with `HEDERA_VERIFY_SPEC_HASH` / `HEDERA_VERIFY_EVIDENCE_HASH`.

The HCS receipt now carries **both**: the on-chain `evidenceHash` and a real
`walrusUri` pointing at the sha256-anchored blob.

## 5. How to add things

### A new checker
1. Create `web/lib/checkers/<name>.ts` implementing the `Checker` interface from
   `checkers/types.ts`. Return a `CheckerReport` (`result`, `confidence`, `reasons`).
   Keep it **bounded + deterministic** — same input → same report.
2. Register it in `web/lib/checkers/registry.ts` (`check.type → checker`) and
   re-export from `web/lib/checkers/index.ts`.
3. Add it to `web/lib/checkers/runtime.ts`: assign a checker version, pin the
   checker source hash, and list any frozen external inputs. If it reads data
   that was once external (price feed/RPC/history/etc.), that value must be in
   the evidence path, not fetched live during replay.
4. Decide `hardGate` on the `CheckSpec`: hard-gate failures drive `reject`/`outputValidity`;
   advisory failures only `pause` when the checker's meta-weight is high enough.
5. Add a case to the demo acceptance spec in `web/app/verify/fixtures.ts`.
6. Add assertions to `web/lib/scoring/selfcheck.ts` and run it (see §6).

### A new sub-score or recommendation rule
Edit `web/lib/scoring/score.ts`. **Never collapse the three scores.** The
recommendation policy is the deterministic ladder at the bottom of that file:
hard-gate fail → reject; hard-gate uncertain / trusted advisory flag → pause;
advisory flag → proceed_with_protection; else trust/payment shading. Update
`scoring/selfcheck.ts` to lock the new behavior.

### A new field on the evidence/manifest blob
Edit `web/lib/walrus/evidence.ts` (`AcceptanceManifest` / `EvidenceBlob` +
`buildManifest` / `buildEvidenceBlob`). Keep the shapes plain/serializable so the
sha256 hash stays stable. Optional fields should be omitted (not `null`) when
absent so deterministic blobs stay byte-identical.

### A new live Hedera script
Add `scripts/hedera/<name>.mjs` (node ESM). Use `env.mjs` helpers
(`loadDotenv`, `getHederaClient`, `requireEnvAny`, `optionalEnv`, `printJson`) —
**never print secrets**. Add an `npm` script in root `package.json`. If it writes
new addresses/IDs that the web app consumes, update `web/lib/contract.ts` **and**
add a `log.md` entry. Validate any external reference you embed (see how
`hcs-receipt.mjs` rejects a non-Walrus `--walrus-uri`).

### A change to the deployed contract
Edit `contracts/src/*.sol`, run `forge test` (must stay green), redeploy via
`scripts/hedera/verify-escrow-demo.mjs` (or a `script/*.s.sol`), then write the
new address + tx hashes into `web/lib/contract.ts` and `log.md`.

## 6. Build / test / verify

```sh
pnpm install                                   # root + web workspace
                                               # (pnpm-workspace.yaml allowBuilds: protobufjs/sharp = false)

# Contracts
cd contracts && forge build && forge test      # 47 tests, self-contained (no forge-std)

# Web typecheck (run from web/)
cd web && ./node_modules/.bin/tsc --noEmit

# Deterministic selfchecks (offline, no creds)
node --experimental-strip-types web/lib/risk/selfcheck.ts
node --experimental-strip-types web/lib/scoring/selfcheck.ts
node --experimental-strip-types web/lib/walrus/selfcheck.ts     # also does a best-effort live Walrus store
node --experimental-strip-types web/lib/world/selfcheck.ts

# Rehearsal readiness (runs a full next build + selfchecks; sends no txs)
npm run demo:check

# Live Hedera ops (spend testnet gas — need .env creds)
npm run hedera:evm-sanity
npm run hedera:verify-demo
npm run hedera:store-evidence -- --contract=0x.. --evidence-hash=0x.. --score-bps=9200 --recommendation=proceed
npm run hedera:hcs -- --task-id=1 --contract=0x.. --evidence-hash=0x.. --score-bps=9200 --recommendation=proceed --walrus-uri=<from store-evidence>
```

## 7. Live deployment reference (Hedera testnet, chainId 296)

| Thing | Value |
|---|---|
| Verify escrow | `0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4` |
| Earlier escrow (Arc) | `0x2f2B5C26de74aA7307A5b946B025ce1A13255f45` |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` (worker agent `101`, checker agent `102`) |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| HCS receipt topic | `0.0.9222881` (canonical receipt: seq 3, tx `0.0.9222066@1781350379.095328969`) |
| Walrus evidence blob | `https://aggregator.walrus-testnet.walrus.space/v1/blobs/OnRmhrt8o-olmw4DJj5K6_WUFYjFR9Qir_A7ehyctds` |

All of these are read-verifiable: `cast code <addr> --rpc-url https://testnet.hashio.io/api`,
`cast receipt <tx> ...`, and the Hedera mirror node for the HCS topic.

## 8. Conventions & gotchas

- **Bash cwd persists** between tool calls in this repo's tooling — always use
  absolute paths or `cd` deliberately, or `forge --root contracts` resolves wrong.
- **`pnpm-workspace.yaml` `allowBuilds`** gates native postinstall scripts
  (`protobufjs`, `sharp`). They're set `false` (not needed for typecheck/build).
- **HCS is append-only** — a wrong receipt can't be deleted, only superseded by a
  newer message. The canonical receipt is the latest correct one; docs name it.
- **Walrus never throws into the UI** — it degrades to `{store:"local", hash}`. The
  sha256 anchor is always available even when the network is down.
- **Selfchecks are the contract** for the deterministic lanes — add to them when you
  change scoring/checkers/walrus/world; they run with plain Node + `--experimental-strip-types`.
- **Checker hashes are intentional pins** — changing checker logic or risk-engine
  dependencies should fail `web/lib/scoring/selfcheck.ts` until
  `web/lib/checkers/runtime.ts` is updated with the new source/bundle hashes.
- **`.env` holds live testnet keys.** Scripts load it via `env.mjs`; never echo
  secrets. `demo:check` and the selfchecks need no secrets.
```
