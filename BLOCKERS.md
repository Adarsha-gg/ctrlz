# CTRL+Z Verify Blockers

This is the current runbook for work that cannot be completed from code alone.
Do not mark these build-plan items complete until the commands below produce
real confirmation output.

## Hedera Live Writes

Status: partially shipped.

C1 and C2 are no longer blocked. Confirmed live Hedera testnet evidence:

```txt
EVM sanity transfer: 0x9236c06cbd4021ce15c531a4d184d325b88c8ab852585bcf69c2a63733b09e97
Verify escrow:       0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4
Deploy tx:           0xd4b09a50ae6ef7c733ccdcdcbba3399838d950836dc95712310eed9cd39db792
Lock tx:             0x02f66f01c68c6db88d4250b4f128d5a0f71c4e7eaca8588e4717b7448d9d093c
Accept tx:           0xa02682601b9fcbb530f88ff329d5d3000cb8e8f7af5e3a31ed1c85caab8a32c6
Submit tx:           0x162cef8266683f44fe54af946e63c0bd68e4cdb1eb77e539f9b899e71cd8c184
Resolve tx:          0x78c20ab96742a69f1d599109142f51d702cab12edaa4f1310a0bc0081239519f
Hash source:         demo-fixture bytes32 values
```

Current env aliases supported by scripts:

```txt
SDK account/key:     HEDERA_OPERATOR_ID+HEDERA_OPERATOR_KEY or HEDERA_RESOLVER_ID+HEDERA_RESOLVER_PRIVATE_KEY or HEDERA_PAYER_ID+HEDERA_PAYER_PRIVATE_KEY
EVM private key:     HEDERA_EVM_PRIVATE_KEY or HEDERA_PAYER_PRIVATE_KEY or HEDERA_RESOLVER_PRIVATE_KEY
RPC URL:             HEDERA_RPC_URL=https://testnet.hashio.io/api
Verify escrow env:   NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS=0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4
```

The scripts already default to Hedera testnet / Hashio and the known ERC-8004
Hedera registry addresses when those registry env vars are absent.

### C1 sanity transfer

```sh
npm run hedera:evm-sanity
```

Status: done. Confirmed tx:
`0x9236c06cbd4021ce15c531a4d184d325b88c8ab852585bcf69c2a63733b09e97`.

### C2 verify escrow deploy + live lock/resolve

```sh
npm run hedera:verify-demo
```

Status: done for pass→release. Confirmed escrow:
`0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4`.

The C2 pass path confirmed deploy, `lockTask`, worker `acceptTask`, worker
`submitOutput`, and resolver `resolve(PASS)` txs. A separate fail→refund replay
is useful for the demo if time allows, but C2's live lock/resolve requirement is
met.

The confirmed C2 run used deterministic demo-fixture bytes32 hashes. To pin the
exact `/verify` UI anchors, rerun `npm run hedera:verify-demo` with
`HEDERA_VERIFY_SPEC_HASH=0x<manifest-sha256>` and
`HEDERA_VERIFY_EVIDENCE_HASH=0x<evidence-sha256>`.

### C3 HCS receipt

```sh
npm run hedera:hcs -- \
  --task-id=demo \
  --evidence-hash=<actual-evidence-sha256-or-bytes32> \
  --score-bps=9200 \
  --recommendation=proceed
```

Status: still incomplete. Native Hedera SDK writes currently get past env
loading but time out from this environment with `DEADLINE_EXCEEDED`.

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

Status: still incomplete.

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

Status: still incomplete.

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
