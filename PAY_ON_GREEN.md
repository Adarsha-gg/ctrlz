# Pay-on-Green — verified settlement for agent-to-agent code work

> The wedge for CTRL+Z Verify. One sentence: **an agent posts a failing test, another
> agent submits a patch, and the payment releases the moment the test goes green —
> no human in the loop.**

## The problem (why now)

Agents already pay each other. **x402** (Coinbase's agent payment standard) is moving
**$600M+** across **69,000+ agents** — and every transaction is *final and
non-refundable*. From the protocol's own framing: *"If a service provider returns
invalid data or fails after receiving payment, the agent has no mechanism for recovery
or dispute."*

The agent economy solved **payment** and skipped **verification**. An agent pays a
stranger agent for a result, gets garbage, and eats it. The escrow attempts that exist
(e.g. PayCrow) only check *2xx status + JSON schema* — **shape, not substance**. They
cannot tell whether the work is actually correct.

## The wedge

Pick the one job where "correct" is **binary, cheap, and deterministic** to check:
a code patch graded by a test suite.

- **Expensive to produce** — fixing the bug takes real engineering.
- **Not atomically enforceable** — the chain can't run code, so a swap-style
  `minOut` guarantee is impossible; you *must* verify after the fact.
- **Cheap to verify** — run the suite once. Green or not green. No sampling gap, no
  "95% confident," no completeness hole.

This is the **SWE-bench** format (the 2026 industry standard for grading coding
agents) — but wired to **escrow + reputation** instead of a leaderboard.

### Where it sits in the landscape (honest)

| Incumbent | What they do | Why they're not this |
|---|---|---|
| Algora / Gitcoin / Opire | OSS coding bounties | pay on **human PR merge** — the verifier is a person |
| Immunefi / Code4rena / Sherlock | bug bounties ($100M+ paid) | **find-the-bug**, judged by humans + PoC |
| SWE-bench | automated test-gated grading | a **benchmark** — no payment, no escrow, no market |
| x402 / PayCrow | agent payment rail + escrow | verify **shape** (200 + schema), not **correctness** |

The two halves — *automated test-gating* and *payment rails* — **both exist; nobody
has joined them for agent-to-agent work.** That join is the product. Not a novel
primitive: a proven verifier (SWE-bench) + proven rails (escrow), joined for a context
(agents paying agents) the incumbents were never built for. Moat = speed + the
portable reputation graph (ERC-8004).

## How it works (commit-reveal, both sides pinned)

```
LOCK   worker commits patch:   patchCommit = sha256({diff})
       buyer commits tests:    hiddenChecksCommit = sha256({hiddenTests, salt})
       → neither side has revealed; both are bound on-chain via specHash

SUBMIT worker reveals diff  → verify it hashes to patchCommit (anti-swap)
       buyer reveals tests  → verify against hiddenChecksCommit (anti-goalpost-move)
       verifier RUNS the suite against the patch → TestResult[] (ground truth)

CHECK  tests_pass checker compares results vs the required acceptance set
       → pass / fail / uncertain   (pure, deterministic, replayable)

SETTLE split-score → planResolution → resolve(PASS|FAIL|UNCERTAIN, ...)
       green → release to worker (+reputation);  red → refund buyer
```

**Why hidden tests?** The worker gets the *spec* (what to fix) and maybe a sample test,
but not the full grading suite — so it can't hardcode the visible answer (write
`return 5` to pass `add(2,3)==5`). The hidden set is the *answer key*, not the
*question*. Commit-reveal makes it fair both ways: the worker can't see the grader, and
the buyer can't swap in a harder grader after seeing the patch.

## What's built

Pay-on-green reuses the entire existing verification spine; only the checker is new.

- `web/lib/checkers/types.ts` — `TestResult` / `TestStatus` (run outcome = ground
  truth), `PatchArtifact` (`diff` + `patchCommit`).
- `web/lib/checkers/testsPass.ts` — the pure `tests_pass` checker (mirror of
  `dataReconcile`): compares injected `results` vs `requiredTests` → pass/fail/uncertain,
  with anti-swap and no-false-gating.
- `web/lib/checkers/patchwork.ts` — patch commit-reveal (mirror of `reconcile.ts`).
- `web/app/verify/payongreen/route.ts` — the workflow route (near-twin of
  `/verify/submit`): verify patch reveal → reveal + run held-out tests → score →
  anchor Walrus evidence → return the `resolve()` args.
- Registry + barrel wiring (`registry.ts`, `index.ts`).
- `web/lib/runner/{run,junit,demo}.ts` — the **real runner**: materializes a
  workspace, applies the patch (`git apply`), runs the suite, parses JUnit XML →
  `TestResult[]`. Framework-agnostic (pytest/jest/`node --test` all emit JUnit).
- `web/app/verify/payongreen/route.ts` — wired to run for real via `demo` (baked
  fixture) or `run` (caller workspace), falling back to injected `results`.
- Replay evidence is now included inside the anchored evidence blob: runner source,
  fixed command/report path, workspace files for demo/caller-run, patch, public +
  held-out tests, raw run output, checker runtime manifest, and settlement plan.
- x402 gating can sit in front of `/verify/payongreen` with
  `X402_PAYONGREEN_REQUIRED=1`; paid requests return `x-payment-response`, unpaid
  requests return HTTP 402 plus the payment requirements.
- Pay-on-green can write or prepare an ERC-8004 ValidationRegistry response via
  `writeValidation=true` or `PAYONGREEN_WRITE_ERC8004=1`.
- `/verify/payongreen-demo` is the lightweight demo screen for the notification
  moment: paid/refunded result, replay evidence, x402 status, and ERC-8004 status.

**Proven live** (`node --test`, in-process): `POST /verify/payongreen {"demo":"green"}`
→ all tests pass → **PASS, releases**. `{"demo":"cheat"}` (hardcode `=> 5`) → passes
the *visible* test but the **held-out** tests catch it (`-1+-1 ≠ 5`) → **FAIL, refund**.
The commit-reveal genuinely caught a cheat the public test missed.

Everything downstream — `scoreSplit`, `planResolution`, the Hedera escrow `resolve()`,
ERC-8004 reputation, Walrus evidence — is consumed unchanged, because the checker emits
the same `CheckerReport`.

## What's next

1. **Sandbox the runner** — the runner exists and runs locally in a temp dir with a
   timeout (fine for trusted/demo inputs). Before running UNTRUSTED worker patches,
   move the spawn into a container / microVM. Interface (`RunSpec → RunOutcome`) is
   unchanged, so it's a drop-in swap.
2. **Actual x402 facilitator settlement** — the route verifies a facilitator receipt
   when configured, but the project still needs the chosen production facilitator and
   asset configuration in Vercel.
3. **Multi-verifier dispute path** — replay evidence is anchored, but v1 is still a
   trusted CTRL+Z verifier unless independent verifiers or an optimistic challenge
   window are added.

## Scope & boundary (stay honest)

Passing tests ≠ correct code. For high-stakes code people *want* a human auditor, and
there pay-on-green is the weaker tool. Scope it to where automation beats humans:
**well-specified, test-complete tasks** (a failing test, a clear fix) and **agent
micro-tasks** where speed/volume makes manual review impossible. Pitch: *"an agent
fixed a failing test and got paid in seconds, with no human in the loop"* — not "audit
my protocol."
