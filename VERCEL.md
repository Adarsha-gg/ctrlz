# Vercel Deployment

CTRL+Z can deploy safely to Vercel in two modes:

- **Read-only/keyless:** marketplace, proof pages, baked pay-on-green demo, and
  deterministic verdicts render. Money-moving Hedera actions and ERC-8004 writes
  are disabled in the UI/API.
- **Live demo:** BigQuery, Hedera settlement, ERC-8004 validation writes, and x402
  payment checks are enabled by server-side environment variables.

## Project Settings

Set the Vercel project root directory to `web`. That lets Vercel detect the Next
app and run the correct build from `web/package.json`.

If you deploy from the repository root instead, use:

```sh
pnpm install
pnpm --filter web build
```

## Required For Google / ERC-8004 Marketplace

Set these in Vercel Project Settings → Environment Variables:

```sh
vercel env add GOOGLE_CLOUD_PROJECT production
vercel env add GOOGLE_APPLICATION_CREDENTIALS_JSON production
```

`GOOGLE_APPLICATION_CREDENTIALS_JSON` should be the full service-account JSON
value. Do not prefix it with a path; Vercel does not have your local credential
file. The app also accepts `GCLOUD_PROJECT` for the project id and
`GOOGLE_CLOUD_CREDENTIALS` for the service-account JSON.

Without these values, `/marketplace` falls back to fixture data and displays that
fallback state.

## Optional Live Hedera Settlement

Set these only on deployments where clicking settlement should move testnet HBAR:

```sh
vercel env add HEDERA_RPC_URL production
vercel env add HEDERA_CHAIN_ID production
vercel env add HEDERA_PAYER_PRIVATE_KEY production
vercel env add HEDERA_RESOLVER_PRIVATE_KEY production
vercel env add HEDERA_WORKER_PRIVATE_KEY production
```

If these are absent, `GET /verify/settle` returns `{ "configured": false }` and
the UI disables the settle button.

## Optional ERC-8004 Validation Writes

Pay-on-green can prepare or write ERC-8004 validation responses after a verdict:

```sh
vercel env add PAYONGREEN_ERC8004_AGENT_ID production
vercel env add PAYONGREEN_WRITE_ERC8004 production
vercel env add ERC8004_VALIDATION_REGISTRY production
vercel env add HEDERA_FEEDBACK_PRIVATE_KEY production
```

Use `PAYONGREEN_WRITE_ERC8004=1` only when the deployment should write to the
ValidationRegistry. Otherwise the route reports why validation was skipped.

## Optional x402 Pay-On-Green Gate

To make `/verify/payongreen` require x402 payment before running:

```sh
vercel env add X402_PAYONGREEN_REQUIRED production
vercel env add X402_RECEIVER_ADDRESS production
vercel env add X402_NETWORK production
vercel env add X402_ASSET production
vercel env add X402_AMOUNT production
vercel env add X402_FACILITATOR_URL production
```

Set `X402_PAYONGREEN_REQUIRED=1`. If `X402_FACILITATOR_URL` is present, CTRL+Z
posts the payment header to `<facilitator>/verify`. For a no-funds demo deploy,
set `X402_DEMO_MODE=1` and send `X-PAYMENT: demo-x402:<id>`.

## Runner Safety

The baked `demo=green|cheat` path runs **in-process** (pure JS — applies the diff
and evaluates the trusted module; no `git`, no child process, no filesystem), so
it works on Vercel's serverless runtime and is deterministically replayable. It
needs no flags.

Caller-supplied workspaces (`run`) execute **arbitrary code**. There are two
executors; pick one with an env var (without either, `run` returns `403`):

| Env | Executor | Use |
|---|---|---|
| `PAYONGREEN_SANDBOX=1` | **Vercel Sandbox** (isolated Firecracker microVM) | the safe path — use this on Vercel |
| `PAYONGREEN_ALLOW_RUN=1` | local subprocess (`git apply` + `node --test`) | trusted dev box ONLY; does not work on Vercel |

**Never set `PAYONGREEN_ALLOW_RUN=1` on Vercel** (no `git`/subprocess there, and
it would run untrusted code on the host). Use the sandbox instead:

```sh
# isolated execution of untrusted worker patches
vercel env add PAYONGREEN_SANDBOX production   # = 1
```

The Sandbox SDK (`@vercel/sandbox`) authenticates automatically via **OIDC on
Vercel deployments** — no token needed. For local testing of the sandbox path,
set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`. If
`PAYONGREEN_SANDBOX=1` but auth is missing, `run` returns `503` (never executes
on the host).

Each `run` spins up a fresh microVM (writes the workspace → `git apply` → runs
the suite → parses JUnit → tears down). For faster cold starts, pre-bake a
sandbox snapshot with `git` installed and pass its id (see Vercel Sandbox docs).

## Verify The Deploy

Local check:

```sh
npm run vercel:check-env
```

Runtime check:

```sh
curl https://<deployment>/api/deploy/status
curl https://<deployment>/verify/settle
open https://<deployment>/verify/payongreen-demo
```

The status endpoint reports which credential groups are configured without
returning secret values.
