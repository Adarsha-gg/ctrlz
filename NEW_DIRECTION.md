# CTRL+Z Verify — New Direction

## Decision

Pivot the main product from escrow-first payments to:

> **CTRL+Z Verify: escrow with reputation-weighted, machine-verifiable checks for agent work.**

The product helps agents safely hire and pay other agents. A buyer agent posts an
intent, locks payment, a worker agent performs the task, checker agents evaluate
the output against explicit constraints, and payment resolves based on the
verification result.

Escrow is still useful, but it is no longer the whole product. It becomes the
settlement primitive behind verified agent work.

## Chosen Prize Stack

1. **Hedera**
   - Agentic payment flow on Hedera Testnet.
   - Buyer agent locks/pays value.
   - Worker agent gets paid when checks pass.
   - HCS stores verification/audit receipts.
   - ERC-8004 registries are available on Hedera Testnet, so agent identity and
     reputation can use the standard directly.

2. **World AgentKit**
   - Human-backed agents get limited free verification/trial usage.
   - Non-human-backed or exhausted agents must pay.
   - Human backing can increase baseline trust but never replaces output checks.

3. **Walrus / Sui stack**
   - Store bulky verification evidence blobs off-chain.
   - Store task specs, worker outputs, checker reports, transcripts, and proof
     artifacts.
   - Hedera HCS and ERC-8004 feedback records point to Walrus evidence URIs and
     hashes.

Lower priority:

- **Google** only if sponsors confirm Hedera ERC-8004 data qualifies. The stated
  requirement says BigQuery over raw Ethereum mainnet ERC-8004 data at EF
  addresses, so assume Google is out unless explicitly approved.
- **LI.FI Composer** only as a later EVM execution layer after verification.
- **Chainlink CRE** only as a stretch orchestration workflow for verification.
- **Arc/Circle** becomes supporting prior work or optional settlement rail, not
  the new main story.
- **Uniswap** skipped.

## Product Thesis

Agents need trust infrastructure before they can safely transact.

The important question is:

> Is this agent output safe enough to act on, and should money settle?

CTRL+Z verifies agent work against constraints and builds reputation for both:

- **service/worker agents** that perform work
- **checker agents** that evaluate the work

The wedge:

> We do not just score agents. We score the proof/checker agents too.

## Core Flow

```txt
1. Buyer agent creates intent
   Example: "Find an RTX 4090 under 700 USDC from a seller with valid shipping."

2. Buyer locks payment
   Payment is escrowed/held so the worker knows funds are available.

3. Worker agent accepts and performs the task
   Worker submits output plus evidence.

4. Evidence is stored on Walrus
   Task spec, submitted output, source URLs, proof artifacts, and checker reports
   live in a content-addressed blob.

5. Checker agents run constraint checks
   They are automated proof/checker agents, not manual reviewers.

6. Resolution
   - clear pass: worker gets paid
   - clear fail: objective hard-gate refund path
   - uncertain: payment pauses for more checks or buyer accept/refund

7. Reputation update
   Worker reputation changes based on outcome.
   Checker-agent reputation changes based on whether its checks held up.

8. Audit trail
   HCS records the receipt/hash.
   ERC-8004 feedback/validation records point to the evidence URI/hash.
```

## Split Scoring

Do not collapse everything into one "valid / invalid" answer. A correct output
can still be risky if the counterparty is untrusted.

```json
{
  "outputValidity": { "score": 98, "status": "pass" },
  "agentTrust": { "score": 31, "status": "weak" },
  "paymentRisk": { "score": 72, "status": "warn" },
  "recommendation": "proceed_with_protection"
}
```

## ERC-8004 Usage

Use ERC-8004 for agent identity and reputation.

Hedera Testnet addresses from `erc-8004-contracts`:

```txt
IdentityRegistry:   0x8004A818BFB912233c491871b3d84c89A494BD9e
ReputationRegistry: 0x8004B663056A597Dffe9eCcC1965A193B7388713
```

Use cases:

- Register service agents.
- Register checker agents.
- Store feedback signals about worker outputs.
- Store feedback signals about checker accuracy.
- Attach metadata URI/hash pointing to Walrus evidence.

## One-Liner

> CTRL+Z Verify lets agents safely hire and pay other agents by locking payment,
> verifying outputs against explicit constraints, and scoring both the worker
> agents and the checker agents whose proofs decide settlement.
