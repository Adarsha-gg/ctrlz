# TODO — CTRL+Z Verify (what's left)

> Single source of open work. Newest priorities on top. Box source of truth for
> shipped work is [BUILD_PLAN.md](BUILD_PLAN.md); forward design lives in
> [REPUTATION.md](REPUTATION.md) and [GOOGLE.md](GOOGLE.md). Last updated 2026-06-14.

**State of the build (submission ~7h out):** verification core + pay-on-green are
shipped and **production-build clean** — `next build` green, all 16 routes 200 on
`next start`, demo green→PASS/release and cheat→reject both correct, marketplace
and settle degrade gracefully without creds. The remaining work is **deploy +
rehearse**, not code.

---

## P0 — SHIP (the only things that block submission)

- [ ] **Deploy to Vercel.** Project root = `web`. Connect the repo, deploy `main`.
      See [VERCEL.md](VERCEL.md). Build is verified green locally.
- [ ] **Pick the env mode** (VERCEL.md has the exact `vercel env add` list):
  - *Keyless demo* — works out of the box: in-process pay-on-green (real
    verdicts), marketplace on fixture data, settle button shows "not configured".
  - *Live* — add Hedera (`HEDERA_*_PRIVATE_KEY`) for the on-chain settle moment,
    ERC-8004, BigQuery (`GOOGLE_*`), and/or x402. **Keep `PAYONGREEN_ALLOW_RUN=0`**
    on Vercel; use `PAYONGREEN_SANDBOX=1` only if demoing untrusted `run`.
- [ ] **Smoke-test the live URL:** `/api/deploy/status` (config, no secrets) ·
      `/verify/payongreen-demo` (run green + cheat + click settle) · `/marketplace`
      · `/verify` · `/proof`.
- [ ] **G1 — rehearse the demo ×5 + record the video.** The only open BUILD_PLAN box.
      Show: pay-on-green green→release **and** cheat caught by held-out tests →
      refund; the anchored replay bundle; (if live) the on-chain settle + ERC-8004
      write; the marketplace explorer. Pre-flight `npm run demo:check`.
- [ ] **SUBMISSION.md pass** — confirm every claim/link/proof is current (pay-on-green
      added; World lane removed; live Hedera/ERC-8004 hashes correct).

### Honest-claims guardrails (say these, don't overclaim)
- Trust model is **"CTRL+Z is the v1 verifier"** — the anchored replay bundle makes
  a lying verifier *catchable*; there is **no automatic dispute/multi-verifier yet**.
- Marketplace is **fixture data** unless `GOOGLE_*` creds are set — label it as such.
- The untrusted `run` path is **gated** (`403` by default); the demo uses the safe
  in-process path. Real untrusted execution = Vercel Sandbox (`PAYONGREEN_SANDBOX=1`).

### Known minor (non-blocking)
- [ ] `/verify/settle` reports `configured:true` while `/api/deploy/status` shows
      Hedera `false` — confirm both read the same env group (cosmetic; on a keyless
      Vercel deploy both read false, so the demo stays safe).

---

## ✅ Done this cycle (pay-on-green wedge)
- [x] `tests_pass` checker + commit-reveal patch + held-out tests (catches the cheat).
- [x] **In-process runner** (pure JS, no git/subprocess) — Vercel-safe demo.
- [x] **Vercel Sandbox** executor for untrusted `run` patches (isolated microVM).
- [x] **Settle wiring** — green/red verdict → `POST /verify/settle` (release/refund on Hedera).
- [x] **Anchored re-execution** — replay bundle (workspace + patch + results) in the evidence blob.
- [x] x402 receivable gate + ERC-8004 validation write on the pay-on-green verdict.
- [x] **A2A demo** `/agents` — two-sided autonomous loop: buyer posts → worker agent
      picks up + submits → verify → settle on Hedera (real `resolve()`) → reputation.
- [x] **Reputation demo** `/reputation` — interactive operator-cluster fraud propagation.
- [x] **Live on Vercel** (https://ctrlz-zeta.vercel.app) with real BigQuery + Hedera + Walrus.

---

## P1 — Reputation engine (post-submission) → [REPUTATION.md](REPUTATION.md)

- [x] **R1.1** `web/lib/reputation/` — operator-root + cluster model
      (`clamp(floor + earned − contamination, 0, cap)`) + fraud classifier +
      tunable config + deterministic selfcheck (7/7 invariants). *(Claude/web)*
- [x] **R1.2** Interactive `/reputation` demo — runs the engine in-browser, inject
      fraud and watch siblings drag / offender→0 / pattern→operator-zeroed. (Sibling
      linkage in the marketplace verdict UI still pending.)
- [ ] **R3.1/R3.2** Event typing (`fraud | quality | success`) + contamination math + selfcheck.
- [ ] **R2.x** Self-serve **domain proof** (reuse ERC-8004's well-known domain format).
- [ ] **R3.3 / R4.x** *(Codex/chain)* operator bond + slash; dispute window + staked
      verifiers, adjudicated by deterministic re-execution (§8e).

## P2 — Google / ERC-8004 validator lane → [GOOGLE.md](GOOGLE.md)

Validation Registry live on Hedera testnet (`0x8004Cb1BF31DAf7788923b405b754f57acEB4272`).

- [x] GQ.1–GQ.5 BigQuery backend, registry queries, explorer routes, Sybil lens, x402 badges.
- [x] VAL.1–VAL.4 ValidationRegistry ABI + request/respond scripts + `/verify` → on-chain write.
- [x] TELL.1 Explorer contrast: naive mainnet rep vs CTRL+Z-validated signal.
- [ ] **Booth:** ask if Hedera is in BigQuery and whether our validation counts; show VAL.* + §8e.

## P3 — Optional / stretch
- [ ] Fail→refund replay of the verify escrow for the demo (pass path already live).
- [ ] Wire the buyer UNCERTAIN→pause path live (`buyerAcceptPaused` / `buyerRefundPaused`).
- [ ] Pay-on-green: pre-bake a Vercel Sandbox **snapshot** (git preinstalled) for fast cold starts.
- [ ] **Two front-ends:** CLI (for agents) + human view ("this view is for *you*"). (`app/cli` exists.)
