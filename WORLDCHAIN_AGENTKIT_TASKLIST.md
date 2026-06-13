# World Chain AgentKit End-to-End Tasklist

Goal: qualify the World Track A story with a real Human Backed Agent flow, not only a policy mock.

Official requirements we are implementing against:

- Use AgentKit meaningfully.
- Gate a clear trial / initial-usage mechanic with verifiable humans through World ID / AgentBook.
- Build a product where Human Backed Agents operate, not just register.

## Current Status

| St | Task | Owner | Evidence |
|---|---|---|---|
| `[x]` | Install official `@worldcoin/agentkit` SDK in the web app. | Codex | `web/package.json` dependency. |
| `[x]` | Add protected resource endpoint. | Codex | `GET/POST /api/world/agentkit` returns AgentKit-aware `402`, verifies AgentKit headers, looks up AgentBook, and applies the three-use trial. |
| `[x]` | Add agent-side client. | Codex | `pnpm --dir web world:agentkit-client` uses `createAgentkitClient` to sign and retry the protected endpoint. |
| `[x]` | Add local selfcheck. | Codex | `node --experimental-strip-types web/lib/world/agentkit-selfcheck.ts` proves missing header blocks, first three human-backed uses pass, fourth requires payment. |
| `[ ]` | Register demo agent wallet in AgentBook on World Chain. | Human/Codex at terminal | `npx @worldcoin/agentkit-cli register <agent-address>` then `status` shows registered. Requires World App verification. |
| `[ ]` | Run live AgentKit rehearsal. | Codex | Start `web` dev server, set `WORLD_AGENTKIT_AGENT_PRIVATE_KEY`, then run `pnpm --dir web world:agentkit-client` four times. First three should grant access; fourth should return payment-required. |
| `[ ]` | Record demo proof. | Human/Codex | Show AgentBook status, protected endpoint challenge, signed AgentKit retry, and trial exhaustion. |
| `[ ]` | Production persistence hardening. | Codex/stretch | Replace the in-memory usage/nonce maps with a durable atomic store before any hosted production claim. |

## Reputation Backing Model

CTRL+Z should not treat every agent wallet as a totally separate identity. The reputation subject is:

| Backing | How It Is Proven | Reputation Subject | Trial Policy | Trust Policy |
|---|---|---|---|---|
| Human-backed agent | AgentBook resolves the agent wallet to an anonymous World human ID. | `world-human:<humanId/nullifier>` shared across that person's agents. | First 3 verifications free. | Small capped baseline lift; output checks still decide. |
| Enterprise-backed agent | Verified enterprise wallet/domain/registry entry. | `enterprise:<companyCluster>` shared across that company's agents. | No World free trial unless the agent is also human-backed. | Larger capped baseline lift because the company wallet is accountable. |
| Unbacked agent | No human or enterprise binding. | `agent:<agentId>` isolated to that agent only. | Payment required. | No baseline lift; must earn reputation through outcomes. |

This lets a new agent from the same human or company inherit the backing cluster's reputation context without letting that backing override objective verification. A bad output still fails, and a risky payment wallet still blocks or pauses.

## Commands

Register the agent wallet:

```sh
npx @worldcoin/agentkit-cli register <agent-address>
npx @worldcoin/agentkit-cli status <agent-address>
```

Run the local server:

```sh
pnpm --filter web dev
```

Call the protected endpoint as an agent:

```sh
WORLD_AGENTKIT_AGENT_PRIVATE_KEY=<registered-agent-private-key> \
WORLD_AGENTKIT_TARGET_URL=http://localhost:3000/api/world/agentkit \
pnpm --dir web world:agentkit-client
```

## Environment

```sh
WORLD_CHAIN_RPC_URL=
WORLD_AGENTBOOK_ADDRESS=0xA23aB2712eA7BBa896930544C7d6636a96b944dA
WORLD_AGENTKIT_RPC_URL=
WORLD_AGENTKIT_PAY_TO= # required non-zero EVM address before x402 payment challenges are advertised
WORLD_AGENTKIT_AGENT_PRIVATE_KEY=
WORLD_AGENTKIT_SIGNER_CHAIN_ID=eip155:480
WORLD_AGENTKIT_TARGET_URL=http://localhost:3000/api/world/agentkit
```

## Guardrails

- Do not claim F4/F5 complete until AgentBook registration and a live signed client call succeed.
- The current trial counter/nonce store is in-memory and acceptable only for local demo rehearsal. Production needs a durable atomic store.
- `WORLD_AGENTKIT_PAY_TO` must be a real non-zero EVM address. The endpoint refuses to advertise payment to `0x0000000000000000000000000000000000000000`.
- AgentBook lookup is the human-backed source of truth. IDKit alone cannot upgrade an unknown agent.
- World backing gates access and raises the baseline trust signal; it never overrides output verification.
