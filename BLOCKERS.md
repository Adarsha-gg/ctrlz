# CTRL+Z Verify Blockers

This is the current runbook for work that cannot be completed from code alone.
Do not mark these build-plan items complete until the commands below produce
real confirmation output.

## Hedera Live Writes

Status: blocked.

Needed env:

```txt
HEDERA_OPERATOR_ID=
HEDERA_OPERATOR_KEY=
HEDERA_SANITY_TO_ACCOUNT_ID=
HEDERA_RPC_URL=https://testnet.hashio.io/api
HEDERA_EVM_PRIVATE_KEY=
```

Optional but useful:

```txt
HEDERA_HCS_TOPIC_ID=
NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS=
```

The scripts already default to Hedera testnet / Hashio and the known ERC-8004
Hedera registry addresses when those registry env vars are absent.

### C1 sanity transfer

```sh
npm run hedera:sanity
```

Done when the command prints a successful Hedera transaction id.

### C2 verify escrow deploy + live lock/resolve

```sh
forge script contracts/script/DeployCtrlZVerifyEscrow.s.sol \
  --root contracts \
  --rpc-url "$HEDERA_RPC_URL" \
  --broadcast \
  --private-key "$HEDERA_EVM_PRIVATE_KEY"
```

After deploy, run a live demo lock and resolution against the deployed
`CtrlZVerifyEscrow` using the actual acceptance-spec hash and evidence hash from
the `/verify` demo. C2 is not complete after deploy alone.

Done when:

- the deploy tx confirms,
- `NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS` is set to the deployed contract
  address,
- a live `lockTask` tx confirms with the real spec hash,
- a worker accept/submit path confirms with the real evidence hash,
- a resolver tx confirms either pass→release or fail→refund, and
- the tx hashes are recorded in the submission notes.

### C3 HCS receipt

```sh
npm run hedera:hcs -- \
  --task-id=demo \
  --evidence-hash=<actual-evidence-sha256-or-bytes32> \
  --score-bps=9200 \
  --recommendation=proceed
```

Do not use `0x0` or a placeholder evidence hash for submission.

Done when the command prints a successful HCS topic/message transaction id whose
payload references the actual evidence hash, score, recommendation, and deployed
verify escrow address from the demo resolution.

### D1 ERC-8004 agent registration

```sh
npm run hedera:agent -- \
  --agent-uri=<service-agent-registration-json>

npm run hedera:agent -- \
  --agent-uri=<checker-agent-registration-json>
```

Done when both the service/worker agent and at least one checker agent are
registered, each command prints a successful transaction hash + agent id, and the
agent URIs resolve to registration JSON that names the service/checker role.

### D2 ERC-8004 reputation feedback

```sh
npm run hedera:feedback -- \
  --agent-id=<worker-agent-id> \
  --tag1=ctrlz.verify \
  --tag2=worker.outcome \
  --feedback-uri=<actual-walrus-evidence-uri> \
  --feedback-hash=<actual-evidence-bytes32-hash>

npm run hedera:feedback -- \
  --agent-id=<checker-agent-id> \
  --tag1=ctrlz.verify \
  --tag2=checker.accuracy \
  --feedback-uri=<actual-walrus-evidence-uri> \
  --feedback-hash=<actual-evidence-bytes32-hash>
```

Do not use `agent-id=1`, `walrus://demo`, or all-zero hashes unless those are the
actual deployed demo values.

Done when both worker outcome feedback and checker accuracy feedback are written
to the ReputationRegistry, both point at the actual Walrus evidence URI/hash, and
the transaction hashes are recorded in the submission notes.

## Google BigQuery

Status: conditional / not shipped.

Only build or claim this if the sponsor explicitly accepts Hedera testnet
ERC-8004 + settlement data. If they require raw Ethereum mainnet ERC-8004 data
at the EF addresses, skip it for this submission.

## G1 Demo Rehearsal

Status: not complete.

Run:

```sh
npm run demo:check
```

Then rehearse the `/verify` demo manually five times and record the submission
video. G1 is complete only when:

- `npm run demo:check` passes.
- The `/verify` clean invoice path can be shown.
- The poisoned over-budget invoice path can be shown.
- The World gate panel can be shown for human-backed and unknown agents.
- Checker meta-reputation is visible in the report list.
- The evidence hash/Walrus panel is visible.
- The presenter does not claim live Hedera txs unless C1/C2/C3/D1/D2 have real
  transaction hashes.
