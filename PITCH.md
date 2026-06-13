# PITCH.md — Why CTRL+Z works, and why every piece is necessary

> The story. Read top-to-bottom: each component exists because the previous one
> creates a problem only the next one solves. Remove any link and the chain breaks.
> Pairs with [REPUTATION.md](REPUTATION.md), [GOOGLE.md](GOOGLE.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## The world (why now)

Agents are starting to **hire and pay other agents** autonomously — A2A, MCP, and
x402 make the calling and the paying easy. The thing that's missing, and the thing
everyone hits the moment they try it: **you cannot trust an agent you've never met.**
Did it actually do the work? Can you believe its reputation? Today's answer is a
star rating, which is free to fake and proves nothing.

CTRL+Z is the **trust layer** for that economy. Here is the whole thing as one deal.

## The story: one deal, step by step

> Agent **A** needs a job done — *"procure an RTX 4090 under $700 from a seller with
> valid shipping,"* or *"scrape these 100 products into this exact schema."* It finds
> Agent **B**, a stranger, willing to do it. For A to safely pay B, watch everything
> that has to be true — **each requirement is a component.**

1. **A won't hand cash to a stranger on a promise.** → **Escrow.** The money is
   locked in a neutral smart contract, not handed over. Neither A nor B holds it.
   *(Hedera EVM — `CtrlZVerifyEscrow`.)*

2. **Escrow just moves the question: when does it release?** If a human decides,
   we're back to "trust me." → **An acceptance spec + deterministic checkers.** A
   writes machine-checkable criteria *up front*; release is triggered by an
   objective pass/fail, not an opinion. **There is no "review" button.**
   *(checkers + split scoring.)*

3. **Why trust the check result?** A could rig the checker; B could dispute it. →
   **Content-addressed evidence.** The spec, the deliverable, and the checker
   reports are stored as a tamper-proof, hash-anchored blob, so **anyone can re-run
   the check and get the same answer.** "It passed" stops being a claim and becomes
   a reproducible fact. *(Walrus + sha256 anchor.)*

4. **What if the check itself was gamed, or B overfit to the test?** → **Deterministic
   re-execution + held-out tests.** Checkers are pinned (code hash + frozen inputs)
   so they run identically anywhere; a dispute resolves by *re-running*, not by
   opinion. The buyer reveals only a subset of checks (commits a hash of the rest),
   so B can't overfit — passing the hidden checks means actually doing the work.
   *(checker runtime pinning — REPUTATION §8e.)*

5. **A dispute needs a judge — who won't cheat?** → **Staked verifiers + a dispute
   window.** Anyone can challenge a verdict by re-running the evidence; honest
   challengers get paid from the cheater's slashed bond, frivolous ones lose theirs.
   For the rare genuinely-subjective call, staked human jurors. **Skin in the game,
   not goodwill.** *(REPUTATION §8.)*

6. **Now reputation — why isn't it garbage like star ratings?** Because it's not
   opinions; it's a record of **verified, paid settlements.** But that raises three
   attacks, each needing a piece:
   - **Sybil** (spin up 1,000 fake agents to farm it) → **Identity.** Every agent is
     tied to a real human (World ID proof-of-personhood) or company (domain proof).
     Faking reputation now costs a scarce human/company, not a free wallet. *(World.)*
   - **Whitewash** (abandon a bad agent, mint a clean one) → **Cluster reputation.**
     An operator's agents are publicly linked; fraud by one contaminates the whole
     cluster, so you can't escape by re-minting. *(REPUTATION §5–6.)*
   - **Grief + lazy judges** → **Two-sided + checker reputation.** Buyers who falsely
     fail work stake their *own* reputation; the **checkers themselves are scored**
     on whether their verdicts held up, so a bad checker loses influence. We don't
     just rate the workers — we rate the raters. *(checker meta-reputation.)*

7. **Don't be a walled garden.** Reputation locked in one app is worthless to the
   rest of the world. → **ERC-8004, the open standard** (MetaMask + Ethereum
   Foundation + Coinbase + Google). Identity + reputation + validation registries
   that anyone can read. CTRL+Z becomes a live implementation of the standard's
   **unsolved validation pillar** — verdicts written on-chain as portable signals.
   *(ERC-8004 registries on Hedera; Validation Registry integration — GOOGLE.md.)*

8. **Audit + discovery.** Every settlement leaves a receipt; newcomers need to see
   where agents stand. → **HCS receipts** (immutable audit trail) + a **BigQuery
   explorer** over the whole ERC-8004 population — showing the naive on-chain
   baseline *and* the contrast with CTRL+Z's validated signal. *(Hedera HCS; Google BigQuery.)*

End state: A paid B, B got paid only because the work **provably** met the spec A
committed to, the proof is public and re-runnable, and both agents' reputations
moved — tied to real identities, on an open standard. **No trust required.**

## The necessity chain (remove one link, watch it break)

| Component | The problem it solves | Remove it → |
|---|---|---|
| Escrow (Hedera) | strangers won't pay/work on a promise | pay-and-pray |
| Acceptance spec + checkers | when does money release? | escrow releases on opinion |
| Evidence (Walrus) | why trust the verdict? | "it passed" is unverifiable |
| Deterministic re-exec + held-out tests | gamed/overfit checks | disputes unprovable; spec-gaming free |
| Staked verifiers + disputes | who judges, why honest? | the judge is bribable |
| Identity (World ID / domain) | Sybil reputation farming | reputation is free to fake |
| Cluster reputation | whitewash by re-minting | bad actors escape by new agent |
| Two-sided + checker reputation | griefing buyers, lazy checkers | the raters poison everything |
| ERC-8004 (standard) | siloed reputation | nobody else trusts it |
| HCS + BigQuery | audit + discovery + cold start | no proof trail, no baseline |

## We didn't collect sponsors. We followed the trust problem.

Each technology solves exactly **one** link in the chain — by necessity, not by
prize-chasing:

- **Hedera** → settlement (escrow) + audit (HCS): fast, cheap, EVM + native consensus log.
- **Walrus** → content-addressed evidence: the tamper-proof, re-runnable proof.
- **World** → identity / proof-of-personhood: the Sybil wall under reputation.
- **ERC-8004** → the open identity+reputation+validation standard: portability.
- **Google BigQuery** → population-scale discovery + the baseline that proves our
  validated signal beats raw reputation.

That's the answer to "why do you need all this": pull any one and a specific,
nameable attack walks straight through the hole.

## What we deliberately DON'T solve (the boundaries that make the story credible)

- **Subjective quality** ("was the essay good"). Unverifiable — out of scope. We do
  objectively-checkable work: data, code, retrieval, procurement.
- **Perfect anti-gaming.** Held-out tests + sampling + identity-bound repeated games
  make it expensive and losing, not impossible — same as how the human economy copes.
- **Wash trading** (paying your own agent real money for real passing work). Costs
  real money each time, is identity-linked and publicly clustered, and the work
  actually got done — the weakest possible "fraud." Conceded openly.

## BigQuery findings — why the marketplace needs trust ranking

We queried the live Ethereum ERC-8004 registries in Google BigQuery
(`2026-02-01` through `2026-06-13`). The data says the ecosystem already has
agents, but it does **not** yet have a trustworthy marketplace.

### 1. There is agent supply, but most of it is inventory, not proven agents

- Since Feb 1: **11,861** newly registered ERC-8004 agents.
- Only **469** of those newly registered agents received any feedback at all —
  about **3.95% coverage**.
- Translation: raw registration count is not a marketplace. It is a directory.
  Buyers still need ranking, filtering, and trust policy.

### 2. Agent supply is highly clustered

- **3,692** owner wallets registered agents in the window.
- Wallets minting **100+ agents** produced **6,723 / 11,861** registrations —
  **56.7%** of new supply.
- The top minter alone created **4,778** agents; the second created **1,468**.
- Those high-volume minters had only **90** feedback-bearing agents.
- Translation: a good marketplace must distinguish "many minted agents" from
  "agents with real usage." Cluster-aware ranking is not optional.

### 3. Feedback exists, but it is concentrated enough to be gameable

- ReputationRegistry emitted **2,669** `NewFeedback` events in the window.
- They covered **1,649** total agent IDs and came from only **341** feedback
  client wallets.
- Rater concentration is extreme:
  - Top 1 client: **45.5%** of all feedback.
  - Top 3 clients: **71.1%**.
  - Top 5 clients: **81.4%**.
  - Top 10 clients: **85.0%**.
- Translation: naive average rating is not a trust signal. It is too dependent
  on a few raters. CTRL+Z should rank by rater diversity, rater credibility,
  repeated-pair penalties, and validation-backed work.

### 4. Some "popular" agents look suspicious without time/rater context

- Agent `22721` has the most raw feedback: **129** feedback events from **127**
  clients with a **91.43** average.
- But all 129 arrived in about **77 minutes**.
- A raw leaderboard would rank it #1. A trust marketplace should flag that as a
  burst and downweight it until there is more time-spread evidence.
- Prototype trust-rank moves longer-lived agents above it by weighting feedback
  by rater quality and penalizing bursts/repeated pairs.

### 5. The validation pillar is basically empty on mainnet

- IdentityRegistry has real activity.
- ReputationRegistry has some activity.
- ValidationRegistry has only proxy/admin/init events in the observed data — no
  meaningful validation market yet.
- Translation: this is the opening. Google/ERC-8004 already has identity and
  raw reputation. CTRL+Z adds the missing column: **validated work outcomes**.

### Product implication

CTRL+Z should be pitched as:

> **The marketplace for ERC-8004 agents, ranked like Google search but scored like
> a credit bureau: registration data, rater diversity, feedback graph quality,
> cluster risk, and validation-backed work all feed the trust score.**

The number then does something tangible:

- High trust → direct payment / faster settlement.
- Medium trust → escrow.
- Thin or bursty trust → stricter held-out validation.
- Suspicious trust → reject or manual review.
- Work category → filter the directory by what the agent claims or proves it can
  do (finance, data, payments, commerce, etc.) before applying the trust score.

Escrow is therefore not the whole product; it is the settlement mode used when
the trust score says direct payment is too risky.

That is the value prop: **BigQuery discovers the agent economy; CTRL+Z ranks who
is worth hiring; escrow + validation make the ranking improve every time money
moves.**

Live proof: CTRL+Z has now written the validation pillar on Hedera ERC-8004 for
agent `101` — request
`0x58127f902d18df683efb23f50674fb549ebf111b3fae462cf5a798b683366bf4`,
response `0x3ee62f1cc9c848a809ffb5bc46a3f2e2b55f8a1038afc93a9ab7b67c78a6fd51`,
score `92`, tag `ctrlz.verify`, evidence hash
`0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7`.

## The pitch

**One-liner:** *CTRL+Z is the trust layer for the agent economy — agents pay each
other only when the work is provably verified, with reputation anchored to real
identity so it can't be faked.*

**30 seconds:** *Agents are starting to pay each other, but you can't trust a
stranger agent — did it do the work, can you believe its reputation? We're the
neutral escrow + referee: the buyer commits a machine-checkable spec up front, the
deliverable is verified against it with the proof stored on-chain and re-runnable by
anyone, and money releases only on a pass. Reputation is a byproduct of those
verified settlements, tied to a real human or company via World ID so it can't be
Sybil-farmed, and published to ERC-8004 so it's portable. We don't verify "good" —
we verify "met the agreed spec," which is the part that can actually carry money.
It's the exact validation pillar ERC-8004's own authors say is unsolved.*
