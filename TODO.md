# TODO — CTRL+Z Verify (what's left)

> Single source of open work. Newest priorities on top. Box source of truth for
> shipped work is [BUILD_PLAN.md](BUILD_PLAN.md); forward design lives in
> [REPUTATION.md](REPUTATION.md) (reputation/validation) and [GOOGLE.md](GOOGLE.md)
> (ERC-8004 validator + BigQuery). Last updated 2026-06-13.

**State of the build:** everything in BUILD_PLAN is shipped + verified **except
G1** (demo rehearsal/video). Hedera C1–C3, ERC-8004 D1/D2 are live; verify escrow
is redeployed with exact sha256 anchors (`0xa2ac71dd9e7835af08e6be33ec047c47a35b2462`).
The items below are the demo gap + the two forward lanes (reputation, Google).

---

## P0 — Submission demo (the only open BUILD_PLAN box: G1)

- [ ] **Rehearse the `/verify` demo end-to-end ×5 and record the video.** Nothing
      in code blocks this. Pre-flight: `npm run demo:check` must pass.
- [ ] The demo must show, in one run:
  - clean invoice path (pass) **and** poisoned over-budget invoice path (reject)
  - the split scores (`outputValidity` / `agentTrust` / `paymentRisk`) kept separate
  - the agentTrust contrast: a known agent (settlement history) **vs** a new agent (thin history)
  - checker meta-reputation visible in the report list
  - the evidence hash / Walrus (Sui) panel **including the round-trip retrievability proof**
  - presenter cites the **live** Hedera proof: HCS topic `0.0.9222881`, receipt tx
    `0.0.9222066@1781356716.807172813`, verify escrow `0xa2ac71dd…`
- [ ] Only mark **G1 `[x]`** in BUILD_PLAN once the five rehearsals + video are done.

> **World / AgentKit (old P1) was dropped 2026-06-13.** The identity/Sybil link is
> now covered by earned-only reputation + ERC-8004 operator identity (see PITCH.md
> necessity chain). No World AgentKit live-proof work remains.

## P1 — Reputation engine (make it real) → spec in [REPUTATION.md](REPUTATION.md)

The design + the §8e determinism pinning are done. Build order:

- [ ] **R1.1** `web/lib/reputation/` — operator-root + cluster model: earned +
      shared operator standing (`floor(tier, standing) + earned − contamination`).
      Replaces the removed World tier boost. *(Claude/web)*
- [ ] **R1.2** Public sibling linkage in the verdict UI ("1 of N under `<operator>`").
- [ ] **R3.1/R3.2** Event typing (`fraud | quality | success`) + the contamination
      math (hard-but-not-0 decay) + a reputation selfcheck. *(Claude/web)*
- [ ] **R2.x** Self-serve **domain proof** for enterprise tier — reuse the ERC-8004
      spec's own well-known domain-verification format (not a custom one).
- [ ] **R3.3 / R4.x** *(Codex/chain — heavier)* operator bond + slash; dispute
      window + staked verifiers + challenge, adjudicated by deterministic
      re-execution (§8e). 5× at-risk bonds; permissionless verifiers; human-backed jurors.

Data-source decision for v1: seed from fixtures + on-chain escrow counters
(`web/lib/chain/history.ts`); swap to a full indexer later without changing the math.

## P2 — Google / ERC-8004 validator lane → spec in [GOOGLE.md](GOOGLE.md)

Strategy: implement ERC-8004's **unsolved validation (3rd) pillar**, not "another
leaderboard." Validation Registry confirmed **live on Hedera testnet** at
`0x8004Cb1BF31DAf7788923b405b754f57acEB4272` (no deploy needed).

- [x] **GQ.1** BigQuery backend path over the public Ethereum mainnet dataset;
      deploy still needs `GOOGLE_CLOUD_PROJECT` / credentials to avoid fixture fallback.
- [x] **GQ.2** Mainnet registry queries
      (Identity `0x8004A169…` / Reputation `0x8004BAa1…` / Validation
      `0x8004Cc84…`): registrations, metadata URIs, reputation leaderboard,
      validation counts, and x402 metadata flags.
- [x] **GQ.3** Explorer route: `/marketplace` plus `/marketplace/[agentKey]`.
- [x] **GQ.4** Sybil/spam lens — rater concentration, repeated pairs, same-day
      burst penalty, mega-rater penalty, and top-rater/top-10 share.
- [x] **GQ.5** x402 filter and badges from decoded/fetched agent metadata.
- [x] **VAL.1** *(Codex)* copy `ValidationRegistry.json` ABI → `scripts/hedera/abis/`.
- [x] **VAL.2/VAL.3** *(Codex)* `erc8004-validation-request.mjs` +
      `erc8004-validation-respond.mjs` (mirror `erc8004-feedback.mjs`); call
      `validationResponse(requestHash, score/100, walrusUri, evidenceHash, "ctrlz.verify")`.
- [x] **VAL.4** *(Codex)* wire `/verify` resolve → on-chain validationResponse.
      `/verify` now calls `/api/erc8004/validation` after evidence anchoring; with
      Hedera requester/validator keys configured it writes request+response,
      otherwise it returns the exact replayable payload. Live proof: request
      `0x58127f902d18df683efb23f50674fb549ebf111b3fae462cf5a798b683366bf4`,
      response `0x3ee62f1cc9c848a809ffb5bc46a3f2e2b55f8a1038afc93a9ab7b67c78a6fd51`;
      `getAgentValidations(101)` returns request hash
      `0xc558bf1d075e6d7c622aaba021c8409b1cbbdf17c8cc527aa59c7326e9279d84`.
- [x] **TELL.1** Explorer screen contrasting naive mainnet rep vs CTRL+Z-validated signal.
- [ ] **Booth (Sun AM):** ask if Hedera is in BigQuery (bonus) and whether our
      Hedera validation counts; show them VAL.* + the §8e re-execution design.

## P3 — Optional / stretch

- [ ] Fail→refund replay of the verify escrow for the demo (pass path already live).
- [ ] Wire the buyer UNCERTAIN→pause path live (`buyerAcceptPaused` / `buyerRefundPaused`).
- [ ] **Pay-on-green runner:** swap injected `results` for a real sandbox (pytest/jest
      against the applied patch); then x402 receivable in front of escrow; settle notification UI.
- [ ] **Two front-ends:** a CLI version (for agents) and a human-readable version —
      framing: "this view is for *you*, since you're not an agent." (`app/cli` exists.)
