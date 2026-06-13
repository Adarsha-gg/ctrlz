# CTRL+Z Verify — Master Plan (how it works + build)

> **Canonical plan.** Replaces the escrow-first `BUILD_PLAN.md` (being deleted).
> Product per [NEW_DIRECTION.md](NEW_DIRECTION.md), sharpened by the design
> decisions below. **Deadline: Sunday 09:00** (~18–20 effective build hours after
> sleep + the Sunday video/diagram/rehearsal tax). Strategy: **port settlement to
> Hedera, REUSE the working core, build the verification spine on top.**

---

## 1. What it is

**CTRL+Z Verify lets agents safely hire and pay other agents.** A buyer agent
posts an intent with explicit acceptance criteria and locks payment; a worker
agent accepts the terms and submits output + evidence; **checker agents** run
bounded constraint checks; payment resolves on the result — and **we score the
checker agents too**, not just the workers.

**The honest claim (say this, not "fault-proof"):**
> We don't promise the work is perfect. We promise the decision is
> **constraint-based, reputation-weighted, and accountable.**

No verifier is an oracle god. The reason checkers earn their own reputation is
*precisely because* no single check is perfect — a wrong checker loses influence,
and every decision is backed by auditable evidence.

---

## 2. Actors

| Actor | Role |
|---|---|
| **Buyer agent** | Posts an intent + acceptance spec, locks payment, accepts/rejects on uncertain outcomes. |
| **Worker / service agent** | Accepts the spec, performs the task, submits output + evidence. Earns settlement-derived reputation. |
| **Checker agents** | Bounded, mostly-deterministic verifiers (schema, price, wallet-risk, source, code-tests…). Emit machine-readable reports. **Earn their own meta-reputation.** |
| **Settlement contract** | Hedera EVM escrow: locks funds, releases/refunds on the verification result. |
| **Human (World-backed)** | Optional human backing that raises an agent's *baseline* trust and unlocks a free-trial quota — never replaces output checks. |

---

## 3. The verification model (core IP)

**Verification is a spectrum, and the *constraint type* dictates the resolution
path.** This is the single most important design decision — it's what keeps the
system honest and prevents the oracle trap.

| Constraint type | Examples | How it resolves |
|---|---|---|
| **Deterministic / machine-checkable** | code test cases, JSON schema, `price ≤ 700 USDC`, wallet-risk tier, valid signature | Objective → **auto-resolve** (pass → release, hard-fail → refund). |
| **Oracle-attested** | shipping label via carrier API, receipt signed by a known issuer | The attestation is a **signal that adjusts the score**, weighted by the *attestor's* reputation — **never a hard money-gate by itself** (don't make a carrier API a key to the vault). |
| **Subjective** | "is this design good", "did the genuine physical item arrive" | **No checker settles this** → goes **UNCERTAIN → PAUSED → buyer-accept**. Never auto-brand fraud on a subjective call. |

The acceptance spec declares which bucket each check is in. "If it's good, it's
good → pay" holds *literally only* for the deterministic bucket. Everything else
is reputation-weighted or paused — which is what makes the system fair.

---

## 4. The acceptance spec (the verifiable manifest)

The buyer's intent carries a machine-readable **acceptance spec**. The **hash is
committed on-chain at intent**; the **full spec is stored on Walrus** (the
verifiable manifest). This makes the criteria immutable and tamper-evident: the
worker can't dispute what was asked, and the buyer can't move the goalposts after
delivery.

```jsonc
// acceptance spec (manifest) — full body on Walrus, hash committed on Hedera
{
  "intent": "Buy an RTX 4090 under 700 USDC from a seller with a valid wallet + shipping proof.",
  "checks": [
    { "type": "schema",       "hardGate": true,  "spec": { /* required invoice fields */ } },
    { "type": "price_max",    "hardGate": true,  "value": 700, "currency": "USDC" },
    { "type": "wallet_risk",  "hardGate": true,  "maxTier": "yellow" },
    { "type": "source_listing","hardGate": false, "advisory": true },
    { "type": "shipping_proof","hardGate": false, "attested": true, "carrier": "any" }
  ],
  "resolutionPolicy": "auto_on_hardgates",  // pass all hard-gates → release
  "createdAt": "..."
}
```

- **`hardGate: true`** checks gate money; **advisory/attested** checks only move the score.
- Each `check.type` maps to a **checker agent** (§6).

---

## 5. Lifecycle / state machine

```
CREATED ──lock──▶ LOCKED ──worker accepts──▶ ACCEPTED ──submit──▶ SUBMITTED
                                                                     │
                                                              checkers run
                                                                     ▼
                                   ┌──────────── VERIFYING ────────────┐
                                   ▼                  ▼                 ▼
                            VERIFIED_PASS       UNCERTAIN          VERIFIED_FAIL
                                   │             (pause)            (hard-gate
                              auto release         │                 objective
                                   ▼          buyer accept/           fail)
                                 PAID         reject │                  ▼
                                              ┌──────┴──────┐        REFUNDED
                                              ▼             ▼       (+ worker rep
                                            PAID         REFUNDED    ding, capped,
                                                       (/DISPUTED*)  evidence-linked)
```

| Transition | Who | What happens |
|---|---|---|
| CREATED → **LOCKED** | buyer | Funds escrowed on Hedera; spec hash committed; full spec → Walrus. |
| LOCKED → **ACCEPTED** | worker | Worker reviews the spec and **explicitly accepts on-chain** — consent to be judged by spec X. (Gasless: fee can be sponsored — §8.) Decline = renegotiate (MVP: accept-or-decline). |
| ACCEPTED → **SUBMITTED** | worker | Posts output + evidence blob → Walrus; hash referenced on-chain. |
| SUBMITTED → **VERIFYING** | system | Checker runner executes the spec's checks. |
| → **VERIFIED_PASS** | system | All hard-gates pass → auto **PAID** (release). |
| → **VERIFIED_FAIL** | system | An *objective* hard-gate fails → **REFUNDED** + worker rep ding (capped, evidence-linked). |
| → **UNCERTAIN → PAUSED** | system→buyer | Attested/subjective uncertainty or advisory-only fail → buyer **accepts** (PAID) or **rejects** (REFUNDED / DISPUTED*). |

\* DISPUTED + full appeal flow are **design-only** for the MVP.

**Guard — no unfair hard failures:** never instantly refund-and-brand work that
may be valid; objective hard-gate fails resolve automatically, everything else
pauses for a human/buyer decision.

---

## 6. Checker agents

Every checker is a bounded function that returns a **machine-readable report**:

```jsonc
{
  "checker": "wallet-risk-checker",
  "result": "pass",            // pass | fail | uncertain
  "confidence": 0.97,
  "detail": "Recipient is a known contact with 14 sealed settlements, 0 flags.",
  "evidenceHash": "0x…"        // points into the Walrus evidence blob
}
```

**Interface:** `runChecker(check, taskContext) → CheckerReport`. A **registry**
maps `check.type → checker`. The **runner** executes all of a spec's checks and
collects reports.

**Demo checker set (GPU invoice):**

| Checker | Type | Reuses |
|---|---|---|
| `schema-checker` | deterministic | — (validate required invoice fields) |
| `price-checker` | deterministic | — (`amount ≤ 700 USDC`) |
| `wallet-risk-checker` | deterministic | **the existing risk engine** (`web/lib/risk`) — address poisoning, history, tier |
| `source-listing-checker` | advisory | — (listing/source plausibility; LLM may *summarize*, never decide) |

**Guard:** checks decide; the LLM only *explains* the final recommendation
(reuse `/api/explain`), never gates.

---

## 7. Split scoring

Never collapse into one number — a correct invoice is not a trustworthy
counterparty.

```jsonc
{
  "outputValidity": { "score": 98, "status": "pass" },   // from the checker reports
  "agentTrust":     { "score": 31, "status": "weak" },   // from worker reputation (§8) + World backing
  "paymentRisk":    { "score": 72, "status": "warn" },   // from the wallet-risk checker
  "recommendation": "proceed_with_protection"            // proceed | proceed_with_protection | pause | reject
}
```

- **outputValidity** ← hard-gate checker results (all pass = high).
- **agentTrust** ← worker reputation (§8) + World human-backing baseline (§9, F).
- **paymentRisk** ← wallet-risk checker (reused risk engine).
- **recommendation** ← a deterministic policy over the three + the spec's `resolutionPolicy`.

---

## 8. Reputation model

**Worker reputation — NOT naive "X of Y successful" (that's wash-trade/sybil
gameable).** Compute it like the existing risk engine already does:

- weight by **distinct counterparties** (500 self-loops = 1),
- **discount** counterparties the worker funded (funding-graph check),
- **money-weight** (a $500 settled job ≫ a $0.01 dust job),
- count **resolved tasks only** (LOCKED/PENDING never count — no dust-poisoning),
- **recency-decay**, and ideally **domain-scope** (good at code ≠ good at sourcing).

**Auto-dinging a fraudster** is allowed **only** when the failure is *objective*
(a hard-gate machine check failed), the ding is **evidence-linked** (points to the
Walrus blob + failing reports), and **capped** so one angry buyer can't nuke a
worker.

Worker reputation lives on-chain in the **ERC-8004 ReputationRegistry** —
*settlement-derived* feedback, not self-attestations. That's the differentiator.

### 8a. Checker meta-reputation — how it's computed (the wedge)

**No LLM grades the reviewers.** Grading reviews with a model would be the exact
subjective-oracle anti-pattern we reject — non-deterministic, gameable, and it
would make the *meta*-reputation itself unaccountable. The principle instead:
**you don't grade the checker's opinion — you check whether reality agreed with
it.** Reputation is computed mechanically from outcomes. Signals, strongest first:

1. **Re-execution (deterministic checkers).** schema / price / wallet-risk /
   code-tests are *replayable* — anyone re-runs them against the Walrus evidence
   and gets the same verdict. For these you barely need reputation: *don't trust
   the checker, re-run it.* **Meta-reputation matters most for the checkers you
   CAN'T replay** (LLM-ish source / attestation checkers).
2. **Outcome match.** On a settled task (PAID & undisputed in-window / REFUNDED /
   buyer-accepted), compare each past report to what actually happened →
   true-pass / true-fail / **false-pass (missed bad work)** / **false-fail (cried
   wolf)** → a precision/recall accuracy. Time + money are the oracle.
3. **Confidence calibration.** Each report carries `confidence`; wrong-at-0.99 is
   penalized harder than wrong-at-0.6 (Brier-style). Punishes overconfidence.
4. **Inter-checker consensus / early detection.** Lone-wrong → weighted down;
   early detector later confirmed by others → weighted up.
5. **Dispute outcomes** (stretch): a verdict overturned on appeal → strong negative.

The score is stored in the **ERC-8004 ReputationRegistry**, money-weighted,
distinct-counterparty-weighted, recency-decayed (same anti-gaming as worker rep).
**Accuracy earns influence, never money** — no false-flag profit. An LLM may live
*inside* a single non-deterministic checker (producing that checker's report and
explaining its reasoning) — its correctness is then judged by outcomes like
everyone else's, **never by another model**.

**MVP cut:** (a) deterministic checkers → demo **replayability** (re-run against
the Walrus blob → identical verdict; that IS the accountability story); (b) one
**outcome-match accuracy counter** per checker, recency-weighted, written to
ERC-8004, **seeded** with a couple of historical tasks so the demo shows a wrong
checker get down-weighted on the next decision (demo beat 5). Calibration +
dispute-overturns = roadmap.

---

## 9. Data architecture — where everything lives

The load-bearing link is the **content hash**: bulky data lives off-chain on
Walrus; the chain stores only the hash/URI + receipts + reputation.

| Data | Lives on | Why |
|---|---|---|
| Locked funds, task state, **spec hash**, evidence hash | **Hedera EVM** (escrow contract) | settlement + tamper-evident pointers; cheap, USD-priced, deterministic. |
| Audit receipt `{evidenceHash, score, recommendation}` | **Hedera HCS** topic | immutable, ordered audit trail; ≥1 real Hedera op. |
| Agent identity; worker + checker reputation feedback (metadata URI → Walrus) | **ERC-8004 registries on Hedera Testnet** | standard agent identity + settlement-derived reputation. |
| **Acceptance spec (manifest)** + **evidence blob** (taskSpec, worker output, checker reports, score) | **Walrus** | bulky, structured, content-addressed; the thing money resolves against. |
| Reputation analytics / agent + checker leaderboard | **Google BigQuery** *(conditional — §11)* | query/rank over ERC-8004 + settlement data; the "score the scorers" surface. |

**Flow (the spine):**
```
intent+spec ─hash→ Hedera   spec+evidence ─blob→ Walrus ─URI/hash→ Hedera/HCS/ERC-8004
            checkers ─reports→ evidence blob → split scores → resolve → HCS receipt + ERC-8004 feedback
```

**Hedera gasless:** Hedera natively separates the **fee payer** from the tx
initiator, so a sponsor account can pay an agent's fees (gasless from the agent's
side); fees are sub-cent and USD-denominated regardless. → a fresh worker agent
with **zero HBAR can still accept + submit** (cold-start win). *(Confirm exact SDK
call at Hedera docs — capability is there.)*

---

## 10. Reuse map (already merged on `main`)

| Built | Becomes |
|---|---|
| Risk/verdict engine (`web/lib/risk`) | the **wallet-risk-checker** + `paymentRisk`/`agentTrust` inputs |
| LLM explainer (`web/lib/llm` + `/api/explain`) — explains, never decides | explains the **recommendation** (same guard) |
| Verdict UI (🔴🟡🟢 + reasons, `web/app/buyer`) | the **split-score verification card** |
| On-chain history reads (`web/lib/chain/history.ts`) | worker reputation input (re-point Arc → Hedera RPC) |
| Escrow Solidity (`contracts/`, on Arc) | **redeploys to Hedera EVM** as lock/resolve |

---

## 11. Build phases & tiny tasks

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Each has **Done when** + **Guard**.

### Phase A — Reframe core to verification · `NEVER` · web lane (reuse)
| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[x]` | **A1** | Checker interface + report schema (§6); wrap risk engine as `wallet-risk-checker`. | A checker returns the report shape; risk engine plugs in unchanged. | Checks decide; LLM not in this path. |
| `[x]` | **A2** | Split-scoring engine (§7) → `{outputValidity, agentTrust, paymentRisk, recommendation}`. | Returns the 4-part object from reports + reputation. | Never collapse the three scores. |
| `[x]` | **A3** | Reframe `web/app/buyer` → task/verification page; render split scores + reasons; reuse `/api/explain`. | Page shows a task, runs checkers, renders split scores + explanation. | No raw 0x; LLM explains, doesn't decide. |

### Phase B — Checkers + meta-reputation · `NEVER` · web lane
| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[x]` | **B1** | Checker registry + runner (`check.type → checker`, run all, collect reports). | Runner executes registered checkers → reports[]. | Each check bounded + deterministic. |
| `[x]` | **B2** | Demo checkers: `schema`, `price` (≤700 USDC), `wallet-risk` (reuse), `source-listing`. | All 4 run on the demo invoice → pass/fail/uncertain. | Constraint-based, explainable. |
| `[ ]` | **B3** | **Checker meta-reputation (wedge, §8a):** outcome-match accuracy counter per checker (true/false pass-fail vs the settled outcome), money + recency weighted, written to ERC-8004; deterministic checkers expose **re-execution** (re-run vs the Walrus blob → identical verdict). Seed with a couple of historical tasks; surface in UI. | Re-running a deterministic checker reproduces its verdict; a wrong checker shows reduced weight on the next decision. | No LLM grades reviewers; accuracy = influence, never money. |

### Phase C — Hedera settlement + audit · `NEVER` · Hedera lane (Codex)
| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[~]` | **C1** | Hedera Testnet setup + one real testnet financial op (sanity). | A real Hedera tx confirms from our code. | Demo MUST show ≥1 real Hedera op. |
| `[~]` | **C2** | Redeploy escrow Solidity to **Hedera EVM**; lock + resolve(pass→release/fail→refund); spec-hash + evidence-hash on-chain. | Lock+resolve work; address+ABI in `web/lib/contract.ts`. | Resolution driven by the verification result. |
| `[ ]` | **C3** | HCS audit receipt `{evidenceHash, score, recommendation}` on resolution. | Resolving writes an HCS message; readable back. | Pointer only — no bulky data on-chain. |

### Phase D — ERC-8004 identity + reputation · `Cut: reads + 1 write` · Hedera lane
| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **D1** | Register service + checker agents in IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e`. | Agent identities resolve. | Standard ERC-8004; don't reinvent identity. |
| `[ ]` | **D2** | Write reputation feedback (worker outcome + checker accuracy) to ReputationRegistry `0x8004B663056A597Dffe9eCcC1965A193B7388713`, metadata URI → Walrus. | A resolution writes feedback pointing at the evidence. | Settlement-derived, not attestation-only. |

### Phase E — Walrus evidence · `NEVER (hash-anchor); blob store = Walrus` · evidence lane
| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **E1** | Walrus client: store the **manifest** (spec) and the **evidence blob** → URI + hash; read back. | Both blobs round-trip to/from Walrus. | Content-addressed; chain holds only the pointer. |
| `[ ]` | **E2** | Wire URI/hash into the spec commit, HCS receipt (C3), ERC-8004 feedback (D2). | All on-chain records carry the live Walrus pointer. | One evidence object, referenced everywhere. |

### Phase F — World AgentKit gating · `Cut: policy + IDKit call` · auth lane
| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **F1** | Human-backed agent → first 3 verifications free; unknown → pay; backing raises baseline `agentTrust`. | Human-backed gets the trial; unknown is gated. | Backing raises baseline trust, NEVER replaces output checks. |

### Phase G — Demo + submission · `NEVER` · Sun
| St | Part | Goal | Done when | Guard |
|---|---|---|---|---|
| `[ ]` | **G1** | The one demo (§13), rehearse ×5, fallback where integrations are flaky. | Runs clean start-to-finish 5×. | Protect rehearsal above any feature. |
| `[ ]` | **G2** | Video + diagram + README reframe + tick prize boxes (Hedera, World, Walrus[, Google]). | Submission complete. | List only what shipped. |

---

## 12. Cut lines (hard — obey under deadline)
- **NEVER cut:** reframed verification page + split scores (A) · ≥2 checkers (B2) · ONE real Hedera op + lock/resolve (C1, C2) · evidence **hash anchor** (E) · the demo (G1).
- **Walrus blob store:** committed as the evidence layer. If the SDK fights at hour 20, fall back to a local store **behind the same hash anchor** — the anchor is what's load-bearing; the store is swappable. (Walrus = the prize + the on-narrative store.)
- **ERC-8004 (D):** reads + ONE write; if writes fight back, show reads + the registry, pitch the write as wired.
- **World (F):** gating as policy/UI with the real IDKit verification call; degrade to "design" if the SDK fights.
- **HCS (C3):** if the SDK stalls, receipt = a logged hash; the one real Hedera op (C1/C2) is non-negotiable.
- **DISPUTED + appeal:** design-only. MVP states: LOCKED → ACCEPTED → SUBMITTED → VERIFIED_PASS/FAIL → PAID/REFUNDED (+ UNCERTAIN→PAUSED).

---

## 13. The one demo (don't demo every check)

Buyer agent intent: **"Buy an RTX 4090 under 700 USDC from a seller with a valid
wallet + shipping proof."**

1. Buyer posts intent → **spec hash on Hedera, manifest on Walrus** → **locks payment** (real Hedera op).
2. Worker agent **accepts the spec** (gasless — zero-HBAR worker).
3. Worker submits the invoice/listing → **evidence blob → Walrus**.
4. **Checkers run** — schema, price (≤700), wallet-risk (poisoning), source.
5. **Split scores** render + LLM explains the recommendation.
6. Resolve: pass → **release on Hedera**; the poisoned/over-price case → caught, **paused/refunded**.
7. **HCS receipt** + **ERC-8004 feedback** update worker + **checker** reputation.
8. Punchline: *"we score the checker too"* — show a checker's accuracy moving the next decision.

| Beat | Needs |
|---|---|
| 1 lock + spec | C1, C2, E1 |
| 2 worker accept (gasless) | C2, §8 |
| 3 submit + checkers + split scores | A1–A3, B1, B2, E1 |
| 4 poisoned/over-price caught | B2 (reuse risk engine) |
| 5 evidence + receipt + feedback | E2, C3, D1, D2 |
| 6 meta-reputation punchline | B3 |

---

## 14. Lanes & ownership
- **Hedera/settlement lane** (C, D) — redeploy escrow to Hedera EVM + HCS + ERC-8004. *Codex, re-pointed off Arc.*
- **Verify/web lane** (A, B) — checkers, split scoring, reframed UI. *Claude.*
- **Evidence lane** (E) — Walrus client + wiring. *Claude or a worker.*
- **Auth lane** (F) — World AgentKit. *Claude or a worker.*

> **Codex re-point (user action):** move the contract lane from **Arc → Hedera
> Testnet EVM** (same Solidity, new RPC/deploy) and add **HCS** + **ERC-8004
> writes**. The Arc work is reusable — this is a relocation, not a rewrite.

---

## 15. Open decisions
- **Google/BigQuery (§9, §11):** CONDITIONAL on the Sunday-morning sponsor answer — *does our Hedera-testnet ERC-8004 + settlement data qualify, or must BigQuery run over mainnet EF registry data?* If our data qualifies → build the reputation-analytics lane on it (complements Walrus, doesn't replace it). If mainnet-EF-only → it's a bolt-on; skip.
- **Sui Move registry (stretch):** a tiny Move object as the canonical evidence/manifest registry would harden the Walrus/Sui story (Sui doing logic, not just storage) — stretch-only; don't take it unless ahead.
- **Walrus Sites frontend (cheap bonus):** host the UI on Walrus Sites for extra Walrus surface — only if time.

## Say-don't-build
Full appeal/arbitration · multi-task marketplace · every checker category (GPU-invoice set only) · LI.FI/Chainlink/Arc/Circle as primary (Arc = prior-work reference; LI.FI/Chainlink = stretch) · Uniswap · Ledger.
