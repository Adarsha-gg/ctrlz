# CTRL+Z Verify Blockers

This is the current runbook for work that cannot be completed from code alone.
Do not mark these build-plan items complete until the commands below produce
real confirmation output.

## Hedera Live Writes

Status: partially shipped.

C1, C2, C3, D1, and D2 are no longer blocked. Confirmed live Hedera testnet
evidence:

```txt
EVM sanity transfer: 0x9236c06cbd4021ce15c531a4d184d325b88c8ab852585bcf69c2a63733b09e97
Verify escrow:       0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4
Deploy tx:           0xd4b09a50ae6ef7c733ccdcdcbba3399838d950836dc95712310eed9cd39db792
Lock tx:             0x02f66f01c68c6db88d4250b4f128d5a0f71c4e7eaca8588e4717b7448d9d093c
Accept tx:           0xa02682601b9fcbb530f88ff329d5d3000cb8e8f7af5e3a31ed1c85caab8a32c6
Submit tx:           0x162cef8266683f44fe54af946e63c0bd68e4cdb1eb77e539f9b899e71cd8c184
Resolve tx:          0x78c20ab96742a69f1d599109142f51d702cab12edaa4f1310a0bc0081239519f
Hash source:         demo-fixture bytes32 values
HCS topic:           0.0.9222881
HCS receipt tx:      0.0.9222066@1781349565.367938628
Worker agent:        101
Worker register tx:  0xd4912aef78fb8f76a0e77e583516bcf0f84ac3e14de5d46d5c78c39dd0863c94
Checker agent:       102
Checker register tx: 0xff802ef5cd713ab8075e3b195329ac3664633dfa648f61fff156e84582d8f80f
Worker feedback tx:  0x3745fa1efa69f725481f5798d3e2d76d856123510569f09f2a59c277f3e0fb0f
Checker feedback tx: 0xa42eb5c0142e0fd26362c900357fd4def575691d91800040147bec7ee6078bbc
```

Current env aliases supported by scripts:

```txt
SDK account/key:     HEDERA_OPERATOR_ID+HEDERA_OPERATOR_KEY or HEDERA_RESOLVER_ID+HEDERA_RESOLVER_PRIVATE_KEY or HEDERA_PAYER_ID+HEDERA_PAYER_PRIVATE_KEY
EVM private key:     HEDERA_EVM_PRIVATE_KEY or HEDERA_PAYER_PRIVATE_KEY or HEDERA_RESOLVER_PRIVATE_KEY
Feedback signer:     HEDERA_FEEDBACK_PRIVATE_KEY or HEDERA_RESOLVER_PRIVATE_KEY (must not be the agent owner)
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
  --task-id=1 \
  --contract=0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4 \
  --evidence-hash=0x547ddf8be39080f6c01b007835654637ce68ac113470b3a1d6dbd38c02330e02 \
  --score-bps=9200 \
  --recommendation=proceed \
  --walrus-uri=https://github.com/Adarsha-gg/ctrlz/blob/main/SUBMISSION.md
```

Status: done. Confirmed topic `0.0.9222881`; receipt tx
`0.0.9222066@1781349565.367938628`.

The successful payload references the C2 evidence hash, score `9200`,
recommendation `proceed`, and deployed verify escrow address. The native SDK
path requires ECDSA parsing for portal-style 32-byte hex keys.

### D1 ERC-8004 agent registration

```sh
npm run hedera:agent -- \
  --agent-uri=<service-agent-registration-json>

npm run hedera:agent -- \
  --agent-uri=<checker-agent-registration-json>
```

Status: done.

Worker agent `101` registered with tx
`0xd4912aef78fb8f76a0e77e583516bcf0f84ac3e14de5d46d5c78c39dd0863c94`.
Checker agent `102` registered with tx
`0xff802ef5cd713ab8075e3b195329ac3664633dfa648f61fff156e84582d8f80f`.

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

Use a non-owner feedback signer. The ERC-8004 ReputationRegistry rejects
self-feedback, which is correct; the live D2 feedback txs were signed by the
resolver/client wallet.

Status: done.

Worker outcome feedback for agent `101` confirmed with tx
`0x3745fa1efa69f725481f5798d3e2d76d856123510569f09f2a59c277f3e0fb0f`.
Checker accuracy feedback for agent `102` confirmed with tx
`0xa42eb5c0142e0fd26362c900357fd4def575691d91800040147bec7ee6078bbc`.

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
- The presenter uses the C3 topic/transaction id above when claiming the live
  HCS receipt.
