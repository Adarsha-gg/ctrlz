# CTRL+Z — Parallel Workstreams

Use this when Codex and Claude are both working. The goal is path ownership:
one agent owns a lane, one branch, and one PR at a time. Do not share files
unless they are listed as handoff files below.

## Active Lanes

| Lane | Owner | Branch prefix | Build-plan parts | Primary paths |
|---|---|---|---|---|
| Contract core | Codex | `codex/` | P1.1-P1.11, P0.2 contract reads | `contracts/**`, `scripts/**`, `test/**`, `foundry.toml` |
| Web/risk/UI | Claude | `claude/` | P2-P6, P0.1 web shell | `web/app/**`, `web/components/**`, `web/lib/risk/**`, `web/lib/ledger/**`, `web/package.json` |
| Docs/submission | Human or one named agent | `docs/` | P7, sponsor notes | `README.md`, `ARCHITECTURE.md`, `BUILD_PLAN.md`, `log.md`, `WORKSTREAMS.md` |

## Handoff Files

These files can cross lanes, but only with a log entry that says why:

- `web/lib/contract.ts` — contract address, deploy block, ABI export.
- `.env.example` — new public config names only; never real values.
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` — root tooling changes.

## PR Rules

1. One PR per lane checkpoint. Do not batch contract, risk engine, and UI in one PR.
2. Rebase before opening a PR, then do not keep pushing unrelated cleanup.
3. Every PR body must include: build-plan parts, paths touched, tests run, and next owner.
4. Merge order for the critical path:
   - PR 1: scaffold/tooling.
   - PR 2: contract core + tests.
   - PR 3: deploy handoff (`web/lib/contract.ts` address/ABI).
   - PR 4: risk engine.
   - PR 5: buyer/seller UI.
   - PR 6: demo/submission docs.
5. If a lane needs another lane's file, stop and write the handoff in `log.md`
   before editing.

## Current Repo State

- Codex started P0.1 scaffold locally.
- `forge build --root contracts` passed.
- Web dependency install hit npm registry timeouts before `pnpm --filter web dev`
  could be verified.
- P0.1 is not done until the web dev command starts cleanly.
