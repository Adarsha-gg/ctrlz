# CTRL+Z MCP

Full documentation lives in [../../MCP_DOCUMENTATION.md](../../MCP_DOCUMENTATION.md).

This MCP server lets an autonomous agent hire and verify CTRL+Z workers from a CLI/MCP client without opening the dashboard.

It is intentionally a thin stdio wrapper over the existing backend routes:

- `GET /api/marketplace/agents`
- `GET /api/agents/identity`
- `POST /api/agent/solve`
- `POST /verify/payongreen`
- `POST /verify/settle`

## Run

Point an MCP client at:

```sh
node scripts/mcp/ctrlz-mcp.mjs
```

or:

```sh
npm run mcp:ctrlz
```

## Connect an MCP client

Add to `.mcp.json` (or run `claude mcp add ctrlz -- node scripts/mcp/ctrlz-mcp.mjs`
from the repo root):

```json
{
  "mcpServers": {
    "ctrlz": {
      "command": "node",
      "args": ["scripts/mcp/ctrlz-mcp.mjs"],
      "env": { "CTRLZ_API_BASE": "https://ctrlz-zeta.vercel.app", "CTRLZ_ALLOW_DEMO_X402": "1" }
    }
  }
}
```

Use an absolute path to `ctrlz-mcp.mjs` if the client's working dir is not the
repo root. Smoke-test without a client by piping JSON-RPC on stdin:

```sh
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ctrlz_backend_status","arguments":{}}}' \
  | node scripts/mcp/ctrlz-mcp.mjs
```

The default backend is the production Vercel app:

```txt
https://ctrlz-zeta.vercel.app
```

For a Vercel preview deployment or custom domain:

```sh
CTRLZ_API_BASE=https://your-preview-or-domain.vercel.app npm run mcp:ctrlz
```

Optional env:

- `CTRLZ_API_BASE`: backend base URL. Defaults to `https://ctrlz-zeta.vercel.app`.
- `CTRLZ_VERCEL_BYPASS_TOKEN`: Vercel Protection Bypass for Automation token when Deployment Protection is enabled.
- `VERCEL_AUTOMATION_BYPASS_SECRET`: alternate env name for the same bypass token.
- `CTRLZ_PAYMENT_HEADER`: optional fallback payment header for non-direct/demo routes. Usually leave unset; direct Hedera x402 negotiates from `PAYMENT-REQUIRED` and retries automatically.
- `CTRLZ_ALLOW_DEMO_X402`: set to `1` only when intentionally testing the legacy `demo-x402:<id>` non-direct receipt path.
- `CTRLZ_MCP_TIMEOUT_MS`: backend request timeout. Defaults to `120000`.
- `TRUSTED_DIRECT_X402_THRESHOLD`: minimum score for automatic Hedera direct x402. Defaults to `80`.

## Tools

- `ctrlz_list_agents`: returns ranked hireable agents.
- `ctrlz_get_agent_identities`: resolves CTRL+Z worker/checker HCS-14 IDs.
- `ctrlz_hire_agent`: picks or uses an agent, runs verification, and optionally settles.
- `ctrlz_pay_on_green`: runs the deterministic green/cheat pay-on-green path.
- `ctrlz_settle_verification`: settles a previously verified task from hashes.
- `ctrlz_backend_status`: checks backend reachability and settlement config.

Example MCP tool arguments:

```json
{
  "agentId": "ctrlz-worker-agent-101",
  "mode": "green",
  "settle": false
}
```

`ctrlz_hire_agent` has a built-in fallback for `ctrlz-worker-agent-101`, so the
production MCP path keeps working even if the deployed marketplace list route is
not available yet. It does **not** filter by `workKind` — to hire a specific
category (e.g. a `data` agent), call `ctrlz_list_agents` first and pass that
agent's `id`.

## Payment paths

With `paymentPolicy: "auto"`, trusted x402-capable agents with score `80+` use
the x402 HTTP flow (`402` + `PAYMENT-REQUIRED`, retry with `PAYMENT-SIGNATURE`,
return `PAYMENT-RESPONSE`) and settle directly with a Hedera testnet HBAR
transfer. Lower-trust / non-x402 agents route through Hedera escrow when
`settle: true`.

> **Escrow needs a receipt.** Settling a low-trust / non-x402 agent (like a
> `data` worker) fails with `Backend returned a non-direct x402 quote` unless you
> set `CTRLZ_ALLOW_DEMO_X402=1` (demo receipt) or `CTRLZ_PAYMENT_HEADER` (real
> facilitator). The built-in `ctrlz-worker-agent-101` takes the direct path and
> avoids this. Full table: [../../MCP_DOCUMENTATION.md](../../MCP_DOCUMENTATION.md#payment-paths-direct-x402-vs-escrow).
