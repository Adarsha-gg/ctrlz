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
  - World gate panel for a human-backed agent **and** an unknown agent
  - checker meta-reputation visible in the report list
  - the evidence hash / Walrus panel
  - presenter cites the **live** Hedera proof: HCS topic `0.0.9222881`, receipt tx
    `0.0.9222066@1781356716.807172813`, verify escrow `0xa2ac71dd…`
- [ ] Only mark **G1 `[x]`** in BUILD_PLAN once the five rehearsals + video are done.

## P1 — World AgentKit live proof (BUILD_PLAN F4/F5)

Policy + endpoint + selfcheck are **shipped** (Codex). Open items:

- [ ] **Register the demo agent wallet in AgentBook** (World Chain). Wallet:
      `0x1FB40496ca6e4Ab3A1d8c5ce1D603Df52a38f669`.
      ```sh
      npx @worldcoin/agentkit-cli register 0x1FB40496ca6e4Ab3A1d8c5ce1D603Df52a38f669
      npx @worldcoin/agentkit-cli status   0x1FB40496ca6e4Ab3A1d8c5ce1D603Df52a38f669
      ```
      **Blocked:** needs an Orb-verified World ID account to complete World App
      verification. Resume from the same wallet in `.env.world-agent`.
- [ ] **Live AgentKit rehearsal:** start `web` dev, set
      `WORLD_AGENTKIT_AGENT_PRIVATE_KEY`, run `pnpm --dir web world:agentkit-client`
      **four times** → first 3 grant access, 4th returns payment-required.
- [ ] Record the AgentKit demo proof (AgentBook status, 402 challenge, signed
      retry, trial exhaustion).
- [ ] *(stretch)* Replace in-memory trial/nonce maps with a durable atomic store
      before any hosted/production claim.

## P2 — Reputation engine (make it real) → spec in [REPUTATION.md](REPUTATION.md)

The design + the §8e determinism pinning are done. Build order:

- [ ] **R1.1** `web/lib/reputation/` — operator-root + cluster model; replace the
      flat tier boost in `world/policy.ts` with earned + shared operator standing
      (`floor(tier, standing) + earned − contamination`). *(Claude/web)*
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

## P3 — Google / ERC-8004 validator lane → spec in [GOOGLE.md](GOOGLE.md)

Strategy: implement ERC-8004's **unsolved validation (3rd) pillar**, not "another
leaderboard." Validation Registry confirmed **live on Hedera testnet** at
`0x8004Cb1BF31DAf7788923b405b754f57acEB4272` (no deploy needed).

- [ ] **GQ.1** *(human)* GCP account + billing + **$1,000 coupon**; access the
      BigQuery Ethereum dataset. Only the human can do the billing step.
- [ ] **GQ.2** Adapt the sponsor gist queries to the **mainnet** registries
      (Identity `0x8004A169…` / Reputation `0x8004BAa1…`): registrations over time,
      decoded metadata, reputation leaderboard, X402 join. *(Claude/web)*
- [ ] **GQ.3** Explorer route (e.g. `web/app/explorer`) over the BigQuery results.
- [ ] **GQ.4** Sybil/spam lens — flag agents whose feedback comes from few unique
      raters (sets up the validator contrast).
- [ ] **VAL.1** *(Codex)* copy `ValidationRegistry.json` ABI → `scripts/hedera/abis/`.
- [ ] **VAL.2/VAL.3** *(Codex)* `erc8004-validation-request.mjs` +
      `erc8004-validation-respond.mjs` (mirror `erc8004-feedback.mjs`); call
      `validationResponse(requestHash, score/100, walrusUri, evidenceHash, "ctrlz.verify")`.
- [ ] **VAL.4** *(Codex)* wire `/verify` resolve → on-chain validationResponse.
- [ ] **TELL.1** Explorer screen contrasting naive mainnet rep vs CTRL+Z-validated signal.
- [ ] **Booth (Sun AM):** ask if Hedera is in BigQuery (bonus) and whether our
      Hedera validation counts; show them VAL.* + the §8e re-execution design.

## P4 — Optional / stretch

- [ ] Fail→refund replay of the verify escrow for the demo (pass path already live).
- [ ] Wire the buyer UNCERTAIN→pause path live (`buyerAcceptPaused` / `buyerRefundPaused`).
