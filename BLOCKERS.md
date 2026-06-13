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
Verify escrow:       0xa2ac71dd9e7835af08e6be33ec047c47a35b2462
Deploy tx:           0xcd4b8b44fb3292a932a2e40b7f4c08a49847dc9c56f8419b825ccd28d23843f0
Lock tx:             0x999d96c91d0863d52708197d332c824745facb5b2503290503557a9c962bdcd6
Accept tx:           0x319750b9d724d737cd9529cab8177176d5ae68ad7b2b1261d08902b486cf0488
Submit tx:           0x7fc38c32ce7b4d908e3d5d4e356f0bfc461fc3ee5e821ed852726954b738b0db
Resolve tx:          0xdbdb8f5236d1a1473bebb7f95c0e12683bebfbdf9f857628e62e69e9fbbeeb10
Spec hash:           0xc558bf1d075e6d7c622aaba021c8409b1cbbdf17c8cc527aa59c7326e9279d84
Evidence hash:       0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7
HCS topic:           0.0.9222881
HCS receipt tx:      0.0.9222066@1781356716.807172813
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
Verify escrow env:   NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS=0xa2ac71dd9e7835af08e6be33ec047c47a35b2462
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

Status: done for pass→release. Confirmed exact-hash escrow:
`0xa2ac71dd9e7835af08e6be33ec047c47a35b2462`.

The C2 pass path confirmed deploy, `lockTask`, worker `acceptTask`, worker
`submitOutput`, and resolver `resolve(PASS)` txs. A separate fail→refund replay
is useful for the demo if time allows, but C2's live lock/resolve requirement is
met.

The latest confirmed C2 run uses exact clean `/verify` sha256 anchors:
`specHash=0xc558bf1d075e6d7c622aaba021c8409b1cbbdf17c8cc527aa59c7326e9279d84`
and `evidenceHash=0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7`.

### C3 HCS receipt

```sh
npm run hedera:hcs -- \
  --task-id=1 \
  --contract=0xa2ac71dd9e7835af08e6be33ec047c47a35b2462 \
  --evidence-hash=0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7 \
  --score-bps=9200 \
  --recommendation=proceed \
  --walrus-uri=https://aggregator.walrus-testnet.walrus.space/v1/blobs/eDxE69ZD3dua2R7xO8Z1KlYa9RvKgpNZHzXIkO63frk
```

Status: done. Confirmed topic `0.0.9222881`; receipt tx
`0.0.9222066@1781356716.807172813`.

The successful payload references the exact `/verify` evidence hash, score
`9200`, recommendation `proceed`, deployed verify escrow address, and real
Walrus URI. The native SDK path requires ECDSA parsing for portal-style 32-byte
hex keys.

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
