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

Live C3 topic: `0.0.9222881`. Confirmed receipt tx:
`0.0.9222066@1781349565.367938628`.

```sh
node scripts/hedera/hcs-receipt.mjs \
  --task-id=1 \
  --contract=0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4 \
  --evidence-hash=0x547ddf8be39080f6c01b007835654637ce68ac113470b3a1d6dbd38c02330e02 \
  --score-bps=9200 \
  --recommendation=proceed \
  --walrus-uri=https://github.com/Adarsha-gg/ctrlz/blob/main/SUBMISSION.md
```

## D1 ERC-8004 agent registration

Registers an agent identity against the ERC-8004 Identity Registry deployed on
Hedera testnet. `--agent-uri` should point at the agent registration JSON.

```sh
node scripts/hedera/erc8004-register-agent.mjs \
  --agent-uri=https://example.com/ctrlz-service-agent.json
```

The script prints the transaction hash and, when the ERC-721 transfer log is
available in the receipt, the minted `agentId`.

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
