# Hedera Scripts

These scripts support the Codex-owned Hedera lane in `BUILD_PLAN.md`.

Required native Hedera operator env for HCS and sanity transfer:

```txt
HEDERA_OPERATOR_ID=0.0.x
HEDERA_OPERATOR_KEY=...
HEDERA_OPERATOR_KEY_TYPE=ecdsa
```

Set `HEDERA_OPERATOR_KEY_TYPE=ecdsa` for portal-generated 32-byte ECDSA private
keys. Use `ed25519` for raw ED25519 keys, or `auto`/unset for SDK-formatted
keys.

Required Hedera EVM env for ERC-8004 writes:

```txt
HEDERA_RPC_URL=https://testnet.hashio.io/api
HEDERA_CHAIN_ID=296
HEDERA_EVM_PRIVATE_KEY=0x...
```

For ERC-8004 feedback, prefer a non-owner client signer:

```txt
HEDERA_FEEDBACK_PRIVATE_KEY=0x...
```

If `HEDERA_FEEDBACK_PRIVATE_KEY` is unset, `erc8004-feedback.mjs` tries
`HEDERA_RESOLVER_PRIVATE_KEY` before falling back to the generic EVM key. This
matters because the ReputationRegistry correctly rejects self-feedback from an
agent owner.

Optional:

```txt
HEDERA_NETWORK=testnet
HEDERA_HCS_TOPIC_ID=0.0.9222881
HEDERA_SANITY_TO_ACCOUNT_ID=0.0.y
HEDERA_SANITY_TINYBARS=100000
ERC8004_IDENTITY_REGISTRY=0x8004A818BFB912233c491871b3d84c89A494BD9e
ERC8004_REPUTATION_REGISTRY=0x8004B663056A597Dffe9eCcC1965A193B7388713
```

## C1 sanity transfer

Runs one real Hedera testnet financial operation.

```sh
node scripts/hedera/sanity-transfer.mjs
```

## C3 HCS receipt

Uses the default CTRL+Z receipt topic unless `HEDERA_HCS_TOPIC_ID` is set.
Set `HEDERA_HCS_TOPIC_ID=new` to create a new topic, then submit the receipt
message.

Live C3 topic: `0.0.9222881`. Canonical receipt tx:
`0.0.9222066@1781356716.807172813` — references the exact clean `/verify`
evidence hash and real Walrus evidence blob.

`--walrus-uri` must be a genuine Walrus reference: a `walrus://` ref or a Walrus
aggregator `/v1/blobs/<id>` URL. A GitHub or other non-Walrus link is rejected.
Mint a real one first with `store-evidence.mjs`, which stores the evidence record
on Walrus via the same code path as the `/verify` page:

```sh
# 1. Store the evidence on Walrus → prints walrusUri + sha256 anchor
node --experimental-strip-types scripts/hedera/store-evidence.mjs \
  --task-id=1 \
  --contract=0xa2ac71dd9e7835af08e6be33ec047c47a35b2462 \
  --spec-hash=0xc558bf1d075e6d7c622aaba021c8409b1cbbdf17c8cc527aa59c7326e9279d84 \
  --evidence-hash=0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7 \
  --score-bps=9200 --recommendation=proceed

# 2. Submit the HCS receipt with the real Walrus URI from step 1
node scripts/hedera/hcs-receipt.mjs \
  --task-id=1 \
  --contract=0xa2ac71dd9e7835af08e6be33ec047c47a35b2462 \
  --evidence-hash=0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7 \
  --score-bps=9200 \
  --recommendation=proceed \
  --walrus-uri=https://aggregator.walrus-testnet.walrus.space/v1/blobs/eDxE69ZD3dua2R7xO8Z1KlYa9RvKgpNZHzXIkO63frk
```

## D1 ERC-8004 agent registration

Registers an agent identity against the ERC-8004 Identity Registry deployed on
Hedera testnet. `--agent-uri` should point at the agent registration JSON.

```sh
node scripts/hedera/erc8004-register-agent.mjs \
  --agent-uri=https://example.com/ctrlz-service-agent.json
```

The script prints the transaction hash and, when the ERC-721 transfer log is
available in the receipt, the minted `agentId`. It also prints the agent's
deterministic **HCS-14 UAID** (`uaid:aid:...`) derived from that ERC-8004
identity — ERC-8004 stays the source of truth, HCS-14 is a portable pointer on
top. Pass `--name="..."` to label the agent in the UAID canonical data. The same
helper (`hcs14.mjs`, using `@hashgraphonline/standards-sdk`) also annotates the
feedback and validation-request outputs with the subject agent's UAID. UAID
generation is a pure offline hash (no creds) and additive — if it fails, the
on-chain ERC-8004 write is unaffected.

## D2 ERC-8004 reputation feedback

Writes a reputation signal against an agent. Use `tag1`/`tag2` to separate
worker outcome feedback from checker accuracy feedback. The signer must not own
the agent identity being reviewed.

```sh
node scripts/hedera/erc8004-feedback.mjs \
  --agent-id=1 \
  --value=9200 \
  --decimals=2 \
  --tag1=ctrlz.verify \
  --tag2=worker.outcome \
  --feedback-uri=walrus://blob-id \
  --feedback-hash=0x0000000000000000000000000000000000000000000000000000000000000000
```
