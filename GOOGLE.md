# GOOGLE.md — ERC-8004 BigQuery + Validation Registry lane

> The plan for the Google Cloud / ERC-8004 prize ($5,000 cash, ETHGlobal NY 2026).
> Pairs with [REPUTATION.md](REPUTATION.md) (our reputation/validation engine) and
> [ARCHITECTURE.md](ARCHITECTURE.md). Strategy locked 2026-06-13 after watching the
> sponsor workshop ([docs/transcripts](docs/transcripts)) and confirming on-chain
> feasibility.

## 0. The strategy in one line

**Don't ship "another reputation leaderboard." Ship the missing third pillar.**
ERC-8004 has three pillars — **identity, reputation, validation** — and the
authors (MetaMask + EF + Coinbase + **Google**) openly say **validation of work
actually done is unsolved**. CTRL+Z already implements it. So:

- **Floor (guaranteed eligible):** a BigQuery explorer over the *mainnet/Base*
  ERC-8004 identity + reputation data Google provides — and visibly show its
  Sybil/spam weakness (their own admitted gap: *"anybody can leave feedback"*).
- **Headline (the differentiator):** CTRL+Z is a **live ERC-8004 validator** — on
  resolve, it writes our verdict to the canonical **Validation Registry on Hedera
  testnet**, turning raw reputation into a work-validated signal. The "before/after."

## 1. Confirmed facts (verified 2026-06-13)

| Fact | Value / proof |
|---|---|
| Prize | **$5,000 cash** (not credits); judged Sunday AM; judge = co-author of ERC-8004 |
| What wins | *"a cool analytics explorer"* over identity+reputation data; bonus: X402 filtering, categorize-by-description, spam filtering |
| BigQuery data | All Ethereum **mainnet** (Genesis→tip) + **Base**; 1TB/mo free + $1,000 coupon |
| Mainnet registries (query these in BigQuery) | Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` · Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` · Validation `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |
| **Validation Registry LIVE on Hedera testnet** | **`0x8004Cb1BF31DAf7788923b405b754f57acEB4272`** — confirmed deployed (EIP-1967 proxy; `getValidationStatus` reverts `"unknown"` per source; `getAgentValidations(101)` → `[]`). **No deploy needed.** |
| Our agents (Hedera testnet) | worker `101`, checker `102` on Identity `0x8004A818…` |
| ERC-8004 Hedera status | Hedera Testnet is an **official** ERC-8004 deployment (canonical testnet addresses) — our work is on the standard, not a fork |

**Key distinction we will NOT blur:** "ERC-8004 is on Hedera" (true, official) is
**not** "Hedera is in Google's BigQuery" (unconfirmed). The plan therefore does
**not** depend on Google indexing Hedera — the BigQuery half runs on mainnet/Base.

## 2. The Validation Registry interface (already live, just call it)

From `ValidationRegistryUpgradeable.sol` (the canonical contract on Hedera testnet):

```
validationRequest(address validator, uint256 agentId, string requestURI, bytes32 requestHash)
   // must be called by the agentId owner / approved operator

validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)
   // must be called by the requested validator; response is 0..100

getValidationStatus(requestHash) · getAgentValidations(agentId) · getValidatorRequests(validator) · getSummary(...)
```

### CTRL+Z → validationResponse mapping
| param | CTRL+Z value |
|---|---|
| `response` (uint8 0–100) | our score (9200 bps → `92`) |
| `responseURI` | real **Walrus evidence URI** |
| `responseHash` | **evidence hash** (bytes32) |
| `tag` | recommendation (`proceed`) / `ctrlz.verify` |
| validator (`msg.sender`) | CTRL+Z validator wallet |
| `agentId` | worker agent being validated (`101`) |

This is literally our resolve path, mirrored on-chain into the ERC-8004 standard.

## 3. Standards alignment we get for free
- **Domain verification:** the ERC-8004 spec already defines "prove domain control
  via a well-known file." That's exactly our enterprise self-serve domain proof
  (REPUTATION.md §4a) — **adopt their well-known format**, don't invent one.
- **Reputation/evidence format:** their feedback is `value`(int128)+`valueDecimals`
  + tags + off-chain `feedbackURI`+hash, with *"transcript/artifacts/proof in the
  off-chain JSON."* Our Walrus evidence blob **is** that off-chain payload — slots
  in with zero redesign.

## 4. Work plan

Status: `[ ]` todo · `[~]` wip · `[x]` done. Lane in brackets.

### Phase GQ — BigQuery explorer (the floor) [Claude web + data]
- [ ] **GQ.1** Google Cloud account + billing + coupon; access the BigQuery
      Ethereum dataset. **Done when** a sample query runs. **Guard** mainnet data;
      no secrets in repo. *(needs the human — billing ID required.)*
- [ ] **GQ.2** Adapt the sponsor's gist queries to the **mainnet** registries:
      registrations over time, decoded agent metadata, reputation leaderboard
      (feedback count / unique clients / avg score), X402 join. **Done when** each
      returns rows. **Guard** query the mainnet addresses in §1, not the testnet ones.
- [ ] **GQ.3** Explorer surface — a new route (e.g. `web/app/explorer`) with
      analytics-over-time + per-agent drill-down. **Done when** it renders live
      BigQuery results. **Guard** read-only; don't touch `web/app/page.tsx`.
- [ ] **GQ.4** **Sybil/spam lens** — surface the weakness Google admitted: rank
      agents whose feedback comes from few unique clients / circular raters
      ("repeating actor" filter). **Done when** the explorer flags gameable rep.
      **Guard** descriptive, not accusatory; it sets up the validator contrast.

### Phase VAL — CTRL+Z as a live ERC-8004 validator (the headline) [Codex chain]
- [ ] **VAL.1** Copy `ValidationRegistry.json` ABI into `scripts/hedera/abis/`
      (available in the erc-8004-contracts repo). **Done when** ABI is in repo.
- [ ] **VAL.2** `scripts/hedera/erc8004-validation-request.mjs` — agent owner calls
      `validationRequest(ctrlzValidator, agentId, requestURI, requestHash)` on
      `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`. **Done when** a live request tx
      confirms. **Guard** mirror the existing `erc8004-feedback.mjs` env/signing.
- [ ] **VAL.3** `scripts/hedera/erc8004-validation-respond.mjs` — CTRL+Z validator
      calls `validationResponse(requestHash, score0to100, walrusUri, evidenceHash,
      "ctrlz.verify")`. **Done when** a live response tx confirms and
      `getValidationStatus(requestHash)` returns our verdict. **Guard** validator
      ≠ agent owner (use a dedicated CTRL+Z validator wallet for credibility).
- [ ] **VAL.4** Wire it into the resolve flow so a `/verify` resolution emits a real
      validationResponse (score = bps/100, URI/hash = the Walrus anchor). **Done
      when** resolving a demo task writes an on-chain ERC-8004 validation signal.
      **Guard** settlement-derived; validate real evidence only.

### Phase TELL — the narrative [Claude web]
- [ ] **TELL.1** In the explorer, show the contrast: mainnet agent's *naive* rep
      (BigQuery) vs a CTRL+Z-validated agent's *work-validated* signal (Hedera
      ValidationRegistry, via mirror node). **Done when** the before/after is one screen.

## 5. Booth questions (Sunday AM — now bonuses, not blockers)
1. Is there (or will there be) a **Hedera BigQuery dataset**? If yes → query our
   own validated data in BigQuery alongside mainnet (the strongest version).
2. Does our **Hedera-side validation** count, or do they want it strictly over the
   BigQuery dataset? (Either way the floor in Phase GQ already satisfies the bounty.)
3. They asked for collaborators on the validation pillar — show them VAL.* and the
   deterministic re-execution design (REPUTATION.md §8e). This is the pitch.

## 6. Honesty boundary
- We can show the validation pillar working on **our** Hedera tasks; we cannot
  retroactively validate mainnet agents' real work. The demo contrasts our
  validated Hedera signal against the mainnet baseline — a fair "here's the fix,"
  not a claim that we validated the whole ecosystem.
- BigQuery ranking over raw feedback is a *descriptive, Sybil-gameable* baseline by
  design — that's the point we're making, not a trust claim.
