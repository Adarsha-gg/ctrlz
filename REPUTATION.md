# REPUTATION.md — Agent Validation & Reputation System

> The design spec for how agents earn, share, and lose trust in CTRL+Z Verify.
> Pairs with [ARCHITECTURE.md](ARCHITECTURE.md) (how the repo is wired) and
> [BUILD_PLAN.md](BUILD_PLAN.md) (tasks/ethos). Decisions locked 2026-06-13.

## 0. Decisions locked (do not relitigate without an entry here)

1. **Enterprise verification = cheap self-serve domain proof** (DNS TXT /
   signed `.well-known/agent-operator.json`). KYB is a later upgrade, not v1.
2. **No privacy — public linkage.** It is a feature that everyone can see "these
   agents all belong to the same operator." Sibling sets are public on-chain + in UI.
3. **Fraud propagates hard, but not to 0.** One fraud event heavily drags an
   operator's other agents (decaying over time); only a *pattern* of fraud across
   the cluster can zero the whole operator. The offending agent itself can go to ~0.
4. **Dispute window with staked verifiers.** Resolutions are not final
   immediately; a staked verifier can challenge during a window. Incentives make
   honest challenges profitable and frivolous/dishonest ones costly.

## 1. North star + the one principle

Agents safely hire / pay / verify other agents. Trust must be **Sybil-resistant**
(can't fake it with 1000 throwaway agents) and **un-launderable** (can't escape a
bad act by spinning up a new agent).

> **THE PRINCIPLE: good reputation is hard to share, fraud reputation is easy to share.**

- Upside sharing (a great agent lifting its siblings) is **capped + discounted** —
  otherwise you grind one agent and mint clean siblings to sell/scam with.
- Downside sharing (fraud dragging the siblings) is **fast + heavy** — otherwise
  you dodge a fraud mark by switching agents.

The only path to a clean high-trust identity is *behaving well over time under one
accountable root*. New agents don't launder a bad root. A new root costs a new
human (proof-of-personhood is scarce) or a new domain-verified enterprise.

## 2. Glossary

| Term | Meaning |
|---|---|
| **Operator root** | The accountable entity behind agents: a World ID nullifier (human), a domain-verified entity (enterprise), or nothing (unattached). The unit of Sybil resistance. |
| **Cluster** | All agents under one operator root. Public. |
| **Agent** | An on-chain identity (ERC-8004) that does work. Bound to ≤1 operator root. |
| **Resolver** | The party that calls `resolve()` on-chain with the verdict. |
| **Verifier** | An independent **staked** party who can re-run the deterministic checkers on the Walrus evidence and **dispute** a resolver's verdict during the window. |
| **Operator standing** | Aggregate reputation of a cluster, derived only from settled, evidenced outcomes + slash history. |

## 3. Data model

```
OperatorRoot
  id              // world-human:<nullifier> | enterprise:<domain> | (none → per-agent)
  tier            // human | enterprise | none
  proof           // IDKit nullifier | domain proof record | null
  bond            // staked collateral (required for `none`, optional otherwise)
  standing        // aggregate, settlement-derived (see §6)
  fraudEvents[]   // typed, timestamped (drives contamination)
  agents[]        // PUBLIC sibling set
        │
        ├── Agent A (ERC-8004 id) — own track record + cluster lift − cluster drag
        ├── Agent B (ERC-8004 id)
        └── …
```

This extends what already exists in `web/lib/world/policy.ts`:
`WorldBackingKind`, `clusterId`/`nullifierHash`, and `reputationSubjectFor()`
(which already emits a shared `subjectId` with `sharedAcrossAgents`). Today the
tier only grants a **flat constant boost**; this spec replaces that constant with
an **earned, shared operator standing** plus **contamination**.

## 4. The three tiers

Reframe: trust = **accountability + stake + track record**. Tiers source it differently.

| Tier | Identity proof (v1) | Sybil resistance from | Baseline floor | Collateral |
|---|---|---|---|---|
| **Enterprise** | self-serve **domain proof** | domain scarcity + brand at stake | highest | low (domain is the bond) |
| **Human** | World ID nullifier (IDKit, already plumbed) | 1 human = 1 root | medium, earnable to high | medium |
| **Unattached** | none (keypair only) | none → must **post stake** | ~0 | **high, slashed on fraud** |

Unattached agents are not permanently second-class — they can become trustworthy
by posting a big bond and earning a long clean record. They *buy + earn* what
human/enterprise get partly on credit.

### 4a. Self-serve domain proof flow (enterprise, v1)
1. Operator publishes a proof at **either**:
   - DNS TXT record: `ctrlz-operator=<operatorPubKeyOrHash>` on `acme.com`, or
   - `https://acme.com/.well-known/ctrlz-operator.json` — a JSON listing the
     operator pubkey + the agent ids it claims, **signed by the operator key**.
2. A verification job fetches it, checks the signature + that the domain serves it,
   and writes an on-chain attestation `operatorRoot(enterprise:acme.com) ↔ pubkey`.
3. Each agent binds with a signed `agentId → operatorRoot` attestation (ERC-8004
   metadata gets an `operator` block; `docs/agents/*.json` already exist to extend).
4. Public: the UI shows "acme.com · 12 agents" and links the siblings.

Guard: domain proof asserts *control of the domain*, nothing more. It raises the
baseline floor and gives a recognizable brand to slash — it does **not** bypass
work validation.

## 5. Public linkage (explicitly a feature)

- The sibling set is **public** on-chain and surfaced in the verdict UI:
  "This agent is 1 of 7 under operator `acme.com` (standing: strong)."
- A buyer verifying agent B can see B's siblings and the cluster's fraud history.
- This is the accountability surface. We are explicitly **not** doing zk-private
  linkage in v1.

## 6. Reputation math

```
trust(agent) = clamp(
    floor(tier, operatorStanding)            // §6a  the lift (capped + discounted)
  + earned(agent)                            // §6b  own settled track record
  - contamination(operator)                  // §6c  the drag (hard, decaying, not 0)
, 0, cap(tier, operatorBond))
```

### 6a. floor — upside sharing (capped + discounted)
A new sibling of a strong operator starts above zero but well below "proven":
```
floor = min( FLOOR_CAP[tier], DISCOUNT * operatorStanding )
```
`DISCOUNT` < 1 (e.g. 0.5) so a star cluster can't hand a fresh sibling full trust.
`FLOOR_CAP[enterprise] > FLOOR_CAP[human] > FLOOR_CAP[none]≈0`.

### 6b. earned — independent upside
The agent's own settlement-derived record (this is essentially today's
`agentTrust` sub-score + the checker meta-reputation pattern: distinct
counterparties, sealed volume, accuracy). Each agent must earn this itself.

### 6c. contamination — downside sharing (hard, but not 0)
Only **fraud-class** events propagate (see §7). Quality misses stay local.
```
contamination(operator) = min( MAX_SIBLING_DRAG,
    Σ over fraud events e:  severity(e) * decay(age(e)) )

decay(age) = 0.5 ^ (age / HALF_LIFE)        // fresh fraud hits hard, fades over months
```
- A single fraud drags siblings by up to `MAX_SIBLING_DRAG` (heavy, e.g. −40), and
  decays over time → **hard but not auto-0** for an otherwise-clean sibling.
- The **offending agent** itself takes a separate near-total hit (→ ~0 / suspended).
- **Pattern escalation:** ≥ N fraud events across the cluster within a window
  multiplies severity → the whole operator can be driven to 0 and bonds slashed.
  (Repeated fraud means the *operator* is the problem, not one agent.)

All constants live in one config block (mirroring `world/policy.ts` constants) so
they're tunable + testable in a selfcheck.

## 7. Event typing (so we don't nuke legit operators)

Every resolution emits a typed event; only `fraud` propagates to siblings.

| Class | Examples | Maps to (existing) | Propagates? |
|---|---|---|---|
| **fraud** | address poisoning, impersonation, paid-but-undelivered, tampered evidence | hard-gate `wallet-risk` fail, evidence-hash mismatch | **Yes, hard** |
| **quality** | honest work below the bar | `price`/`schema` advisory fail | No (local to agent) |
| **success** | clean settled outcome | PASS resolution | Lifts agent; slowly builds operator standing |

The classifier is mostly already in the checker results — resolution just needs to
**tag** the on-chain event + ERC-8004 feedback with its class.

## 8. Dispute window + staked verifiers

The key insight that makes this cheap: **our checks are deterministic and the
evidence is content-addressed on Walrus.** So most disputes resolve by
**re-execution, not opinion** — a verifier re-runs the checkers against the
immutable Walrus blob and the chain compares hashes. We already have
`replayChecks()` + the sha256 anchor; this is the on-chain extension of it.

### 8a. Flow
1. Resolver calls `resolve()` → enters a **pending/disputable** state for a window
   (e.g. T blocks). Payment + reputation are **not final** yet.
2. During the window, any **staked verifier** can `challenge(taskId)` by posting a
   challenge bond `C`. The challenge points at the Walrus evidence + the claimed verdict.
3. Adjudication = **re-execution**: re-run the deterministic checkers on the
   evidence blob. The "truth" is reproducible.
   - **Deterministic checks** (hard gates): objectively adjudicable. No voting needed.
   - **Advisory/ambiguous checks**: fall back to a small **staked juror** vote
     (Kleros-lite) — only for the genuinely subjective minority.
4. Window expires with no successful challenge → resolution finalizes.

### 8b. Incentives (the anti-cheat game)
| Actor | Honest outcome | Dishonest / wrong outcome |
|---|---|---|
| **Resolver** | verdict matches re-execution → keeps bond, earns fee | verdict overturned → **bond slashed**, agent + operator reputation hit (fraud-class) |
| **Verifier (challenger)** | correct challenge → **gets `C` back + reward `R`** from the slashed resolver bond | frivolous challenge (re-exec confirms original) → **loses `C`** to resolver + treasury |
| **Juror** (subjective only) | votes with the coherent majority → small reward | votes against → stake slashed |

Properties this gives us:
- **Watchtower incentive:** verifiers profit by catching bad resolutions, so it
  pays to watch. Doing nothing earns nothing.
- **Spam-resistant:** frivolous challenges cost the challenger.
- **Resolver honesty is enforced by reproducibility:** since checks are
  deterministic, a cheating resolver is *provably* wrong, not just outvoted.
- Slashed resolver funds pay the honest challenger → the system funds its own policing.

### 8c. Bonds & parameters (decided 2026-06-13)
All **at-risk** bonds are **5× the task value**, denominated in the task's
settlement asset (HBAR/USDC on Hedera). 5× dwarfs the most a cheater can gain
(≤ 1× the task value), so mis-resolving is always negative-EV.

| Bond | Amount | Posted by | Slashed when |
|---|---|---|---|
| **Resolver correctness bond** | **5× task value** | resolver, per task | verdict overturned by re-execution |
| **Unattached operator bond** | **5× largest in-flight task** | unattached operator | any bound agent commits fraud |
| **Challenge bond** | **1× task value** | challenger | challenge is frivolous (re-exec confirms original) |
| **Verifier stake** (eligibility) | flat floor, ≥ challenge bond | verifier, once | repeated frivolous challenges / juror misvotes |

Reward split when a challenge succeeds (paid from the slashed 5× resolver bond):
challenger gets their 1× back **+ 2× reward**; **2×** compensates the wronged
party (buyer/worker); remainder → treasury. Other params: `WINDOW` (dispute
window length), juror panel size (3–5). Exact numbers tuned in a selfcheck.

### 8d. Who can be a verifier / juror (decided 2026-06-13)
- **Verifier: permissionless but staked.** Anyone who posts the verifier stake can
  watch + challenge. More watchtowers = more fraud caught. Spam is bounded by the
  challenge bond (forfeited if frivolous). Verifiers accrue their **own**
  meta-reputation (reuse the checker meta-rep engine): correct challenges raise
  standing/influence, frivolous ones slash stake. Permissionless entry,
  reputation-weighted weight.
- **Juror (subjective disputes only): human-backed, staked, positive standing,
  randomly selected per dispute.** Jurors only touch the advisory/ambiguous
  minority — deterministic checks are settled by re-execution (§8e), never a vote.
  Requiring World ID personhood for the juror pool blocks a whale from Sybiling
  all panel seats. Random per-dispute selection (stake/standing-weighted, capped)
  prevents targeting + bribery. Coherent-majority vote rewarded; minority slashed.

### 8e. Deterministic re-execution — what makes disputes provable
The whole game rests on one property: **re-running a checker on the same evidence
must produce the SAME result on any machine, at any later time.** If it doesn't,
the chain can't tell "the resolver cheated" from "the checker just behaves
differently now," and the dispute is unprovable.

What breaks determinism (and is therefore banned inside checkers on the dispute path):
- live / unpinned data — a price feed, an RPC read, `Date.now()`, randomness;
- environment variance — library versions, locale, float rounding, map order.

Example: a price checker that calls a live price API resolves PASS today; a
verifier re-running it next week hits a different price → different verdict → the
honest resolver looks like a cheater. Unprovable.

Fix (two rules):
1. **Freeze all external inputs into the evidence blob at resolution time.** The
   checker re-runs against the *recorded* price / RPC reads / timestamp in the
   blob, never against fresh live data. (Blobs are already content-addressed +
   canonical-JSON, so this is a natural extension.)
2. **Pin the checker code version.** Record a hash of the checker bundle/logic in
   the evidence blob. Everyone re-runs the exact same code by that hash; a verdict
   counts as "reproduced" only if BOTH the code hash and the frozen inputs match.

Then a re-run is a proof: same code-hash + same frozen inputs MUST yield the same
report hash. Mismatch ⇒ resolver lied (slash). Match ⇒ resolver honest. Same idea
as optimistic-rollup fraud proofs / reproducible builds; it extends the in-process
`replayChecks()` we already have to be reproducible across machines + time.
**This is the key build dependency for Phase R4.**

### 8f. Held-out tests (commit-reveal) — anti-gaming **(built: `web/lib/checkers/heldout.ts`)**
If the worker sees every check it can do the minimum to pass them (Goodhart). Fix:
hold some checks out. On-chain is public, so you can't put hidden checks in the
lock txn — you put a **hash commitment** of them.

- **Lock:** buyer publishes a `HeldoutManifest` on Walrus = `publicChecks` (clear)
  + `hiddenChecksCommit = sha256({hiddenChecks, salt})`. Its hash is the on-chain
  `specHash`. **No contract change** — `lockTask(worker, resolver, specHash)`
  already commits the whole manifest, so the hidden checks are bound at lock without
  being revealed. The worker sees the public checks and that N hidden checks exist.
- **Reveal:** at resolution the buyer/resolver publishes `{hiddenChecks, salt}` into
  the evidence blob; `verifyReveal` recomputes the commit. Any change to the checks,
  salt, or count breaks it — so the buyer **cannot swap in different/unfair hidden
  checks after seeing the work** (they committed before delivery).
- **Dispute:** a verifier re-derives the commit from the evidence and re-runs all
  checks; the integrity chains back to the single on-chain `specHash`.

**Fairness rule (load-bearing):** held-out *inputs*, not held-out *requirements*.
The worker must know **what** is required from the public spec; only **which**
specific cases get checked is hidden. A revealed hidden check that introduces a new
requirement (not derivable from the public intent) is **unfair** → voided at dispute,
worker paid.

**Satisfiability / griefing-buyer guard:** because the buyer authors held-out cases
with known-good answers, the buyer inherently holds a **reference solution** — proof
the spec is satisfiable. A spec no deliverable can pass (contradictory / impossible)
is caught by (1) the worker declining `acceptTask` on an obviously-broken public
spec, (2) the unfair-hidden-check dispute path, and (3) the buyer's own
reputation/stake (two-sided). The worker can also **self-run the public checks to
green before submitting** (they're deterministic + published, §8e), so even a large
spec is a checklist the worker grinds, not a black box. For very large jobs, use
**milestone escrow** (lock + resolve in phases) so payment isn't one all-or-nothing gate.

## 9. Validation — two distinct layers (need both)

1. **Identity / binding validation** (who's behind the agent):
   - Human → IDKit proof → nullifier (plumbed in `web/lib/world/idkit.ts`).
   - Enterprise → §4a domain proof → entity id.
   - Binding → signed `agentId → operatorRoot` attestation in ERC-8004 metadata.
2. **Work / outcome validation** (did it do the job) — **already built**:
   checkers → split score → Walrus evidence → escrow `resolve` → HCS receipt →
   ERC-8004 feedback. Now wrapped by the §8 dispute window.

**Hard rule:** reputation only updates from **settled, evidenced, dispute-cleared**
outcomes. Never self-rating, never attestation-only.

## 10. Attack table

| Attack | Defense |
|---|---|
| Sybil fleet rating each other up | rep moves only on settled paid outcomes; personhood/domain caps roots; checker meta-rep down-weights colluders |
| Whitewash via new agent | fraud propagates to the root; siblings inherit a heavy decaying drag |
| Whitewash via new root | personhood scarcity (human) / domain cost + public brand (enterprise) |
| Reputation transfer (grind one, sell clean siblings) | upside floor capped + discounted; siblings must earn |
| Bond-and-run (unattached scam + abandon) | high upfront stake slashed on fraud |
| Enterprise umbrella shields a bad agent | fraud slashes brand standing + bond; public linkage names the operator |
| Cheating resolver | deterministic re-execution proves it; verifier slashes their bond and gets paid |
| Frivolous disputes | challenger loses their bond |

## 11. Work plan

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Lane in brackets.
Each: **Done when** + **Guard**.

### Phase R1 — Operator roots & public linkage [Claude web + Codex chain]
- [ ] **R1.1** [Claude] `OperatorRoot` + `Cluster` model in `web/lib/reputation/`;
      replace the flat tier boost in `world/policy.ts` with `floor()` from operator
      standing. **Done when** a cluster's standing lifts a new sibling above zero,
      capped + discounted. **Guard** upside is capped; never full-transfer.
- [ ] **R1.2** [Claude] Surface public linkage in the verdict UI ("1 of N under
      `<operator>`, standing X" + sibling list + cluster fraud history). **Done when**
      buyer sees the cluster. **Guard** linkage is public by design.
- [ ] **R1.3** [Codex] ERC-8004 metadata `operator` block + signed
      `agentId → operatorRoot` attestation write/read. **Done when** binding is
      verifiable on-chain. **Guard** unforgeable (operator-signed).

### Phase R2 — Self-serve domain proof (enterprise) [Claude web]
- [ ] **R2.1** Domain-proof verifier: fetch DNS TXT or signed
      `.well-known/ctrlz-operator.json`, verify signature + domain control.
      **Done when** a domain → operator attestation is produced. **Guard** proves
      domain control only; does not bypass work validation.
- [ ] **R2.2** Bind agents to the enterprise root; raise baseline floor.
      **Done when** enterprise agents start above human floor. **Guard** floor only,
      not a hard-gate bypass.

### Phase R3 — Fraud typing & contamination [Claude web + Codex chain]
- [ ] **R3.1** [Claude] Tag resolution events `fraud | quality | success` from
      checker results; only fraud propagates. **Done when** a quality miss stays
      local, a fraud drags siblings. **Guard** classifier is deterministic.
- [ ] **R3.2** [Claude] `contamination()` with severity × decay + pattern
      escalation; full selfcheck of the math. **Done when** one fraud = heavy-not-0
      drag; N fraud = cluster zeroed. **Guard** decays over time; not auto-0.
- [ ] **R3.3** [Codex] Operator bond + slash path on-chain. **Done when** a slash
      reduces operator standing + funds the challenger. **Guard** slashing needs a
      cleared dispute (§8), never unilateral.

### Phase R4 — Dispute window + staked verifiers [Codex chain + Claude web]
- [ ] **R4.1** [Codex] `resolve()` enters a disputable window; finalizes after T
      with no challenge. **Done when** payment/reputation are not final until cleared.
      **Guard** window is bounded + on-chain.
- [ ] **R4.2** [Codex] `challenge(taskId)` with bond `C`; adjudicate by
      re-execution hash comparison vs the Walrus blob; slash + reward. **Done when**
      a wrong resolution is overturned and the challenger is paid. **Guard**
      deterministic re-execution decides; bonds align incentives.
- [ ] **R4.3** [Claude] Optional staked-juror fallback for advisory/subjective
      checks only. **Done when** ambiguous disputes resolve by a small panel vote.
      **Guard** jurors only touch the subjective minority; deterministic checks are
      adjudicated by re-execution, not votes.
- [ ] **R4.4** [Claude] Dispute UI: show window countdown, open challenges,
      outcomes. **Done when** the demo shows a live challenge + slash. **Guard**
      reflects on-chain state, no fabrication.

## 12. Open questions

**Resolved 2026-06-13:**
- Bond sizing → at-risk bonds = **5× task value** (§8c).
- Verifier eligibility → **permissionless but staked** (§8d).
- Juror selection → **human-backed, staked, positive standing, random per dispute** (§8d).
- Standing recompute cadence → on each **settled + dispute-cleared** event; batching is a later optimization.

**Still open (tuning + the one real build risk):**
1. Exact reward split, `WINDOW` length, juror panel size, and how `MAX_SIBLING_DRAG`
   calibrates against typical score ranges — settle in a selfcheck against realistic
   task values.
2. **Deterministic runner (§8e) is the key engineering task.** Pin the checker
   version hash + freeze external inputs in the evidence blob so re-execution is
   reproducible across machines. Everything in Phase R4 depends on it — and it also
   constrains how checkers are written from now on (no live data on the dispute path).
```
