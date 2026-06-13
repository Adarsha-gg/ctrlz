# CTRL+Z — Architecture

See [README.md](README.md) for the full design rationale.

## 1. Big picture

```mermaid
flowchart LR
    subgraph CLIENT["Sender dApp — Chrome (WebHID)"]
        UI["Payment UI"]
        RISK["Risk Engine<br/>(deterministic signals:<br/>lookalike edit-distance,<br/>homoglyphs, ENS age,<br/>reputation tier)"]
        LLM["LLM Explainer<br/>plain-English verdict<br/>(signals decide, LLM explains)"]
        WATCH["Watcher<br/>re-scores PENDING after send<br/>auto-recall inside undo window<br/>— agent mode: verdict = policy gate"]
    end

    subgraph HW["Hardware confirmation"]
        LEDGER["Ledger clear-sign<br/>EIP-712 typed data:<br/>'Pay alice.eth $2,000 — risk LOW'"]
    end

    subgraph ARC["Escrow on Arc · gas = USDC"]
        ESC["CTRL+Z Escrow<br/>send(undoWin) / recall(reason)<br/>claim + claimFor(sig) / reject<br/>expire / flag / attachProof<br/>on-chain tier from own counters"]
    end

    subgraph TRUST["Trust data layer"]
        ENS["ENS — identity layer<br/>ctrlz.eth subnames: businesses + users<br/>every surface name-resolved (no raw hex)<br/>fwd+rev match check · name age<br/>ctrlz.score text record"]
        WORLD["World ID<br/>person-level nullifier<br/>reputation follows the human<br/>across wallets"]
        IDX["Reputation indexer<br/>rich score from escrow events"]
        E8004["ERC-8004<br/>Identity Registry: agent/domain binding<br/>Reputation Registry: settlement feedback<br/>Validation Registry: roadmap"]
    end

    SELLER["Seller dApp<br/>gasless claim (Circle Wallets native,<br/>claimFor() for every other wallet)<br/>⏳ PENDING — do not deliver<br/>✅ SEALED — claim → ship → attachProof"]

    UI --> RISK --> LLM --> UI
    RISK -.reads.-> ENS
    RISK -.reads.-> WORLD
    RISK -.reads.-> E8004
    RISK -.reads.-> IDX
    UI -->|"amount ≥ threshold"| LEDGER --> ESC
    UI -->|"small amount — wallet sig"| ESC
    ESC -- "events: Sealed / Recalled / Expired / Flagged" --> IDX
    ESC -. "PENDING events" .-> WATCH
    WATCH -. "recall() — autonomous" .-> ESC
    IDX -."writes".-> ENS
    IDX -."links nullifier".-> WORLD
    IDX -."writes".-> E8004
    ESC --- SELLER
```

## 2. Escrow state machine

```mermaid
stateDiagram-v2
    [*] --> PENDING : send(to, amount, undoWin)

    note right of PENDING
        claimableAt = now + max(undo window, riskHold(tier))
        expiresAt = now + 72h
        Two timers, never conflated:
        - undo window: sender-side, universal 5-min floor,
          no reputation tier buys it down
        - risk hold: recipient-side, tiered
          (trusted: none extra / unknown: 15-60 min)
    end note

    PENDING --> REFUNDED : recall(reason) — sender only, any time before claim
    PENDING --> REFUNDED : reject() — recipient, instant, no stigma
    PENDING --> SEALED : claim() or claimFor(sig) — gasless via relayer, after claimableAt
    PENDING --> REFUNDED : expire() — anyone, after 72h (typo/dead address refunds itself)

    note right of SEALED
        Forever final. No judges, no admin keys.
        flag() — original sender only, once, within 30 days:
        on-chain non-delivery complaint. Pure signal, no refund.
        attachProof(id, hash) — seller's delivery evidence:
        flag is the complaint, proof is the defense, both visible.
        Never gates money — no delivery oracle, by design.
    end note

    SEALED --> [*]
    REFUNDED --> [*]
```

## 3. Payment lifecycle — the three gates end to end

```mermaid
sequenceDiagram
    actor S as Sender
    participant UI as CTRL+Z dApp
    participant RE as Risk Engine + LLM
    participant L as Ledger (WebHID)
    participant C as Escrow on Arc
    actor R as Recipient (seller UI)

    S->>UI: paste recipient + amount
    UI->>RE: score(recipient)
    RE->>RE: edit-distance vs address book,<br/>ENS age, sealed history, recall rate
    RE-->>UI: 🔴/🟡/🟢 verdict + plain-English explanation

    alt poisoned lookalike
        UI-->>S: RED — "1 char off your known address, 0 history"
        S->>UI: fix to alice.eth → 🟢
    end

    alt amount ≥ threshold
        UI->>L: EIP-712 typed data
        L-->>S: device shows "Pay alice.eth $2,000 — risk LOW"
        S->>L: physical tap
    else small amount
        S->>UI: wallet signature
    end

    UI->>C: send() → PENDING
    Note over C: claimableAt = max(undo window, hold(tier)) · expiresAt = 72h

    alt "wait. wrong invoice." (before claim)
        S->>C: recall(reason)
        C-->>S: full refund
    else normal path
        R->>C: claim() after claimableAt
        C-->>R: funds SEALED — as final as crypto gets
        Note over S,C: flag() available to S only,<br/>once, 30 days — complaint, not refund
    else recipient never claims (typo / dead address)
        S->>C: expire() after 72h
        C-->>S: auto-refund
    end

    C--)UI: events → reputation score in next verdict
```

## 4. The two timers

```mermaid
flowchart LR
    T0(["t = 0<br/>send()"])
    T5(["t = 5 min<br/>universal undo floor ends<br/>(trusted recipient: claimable now)"])
    TH(["t = hold(tier)<br/>unknown recipient: 15–60 min<br/>risk hold ends, claim allowed"])
    T72(["t = 72 h<br/>expire() — anyone,<br/>auto-refund if unclaimed"])

    T0 --"recall() works this ENTIRE stretch, until claim happens"--> T5 --> TH --> T72

    style T0 fill:#1a7f37,color:#fff
    style T5 fill:#9a6700,color:#fff
    style TH fill:#9a6700,color:#fff
    style T72 fill:#cf222e,color:#fff
```

> The 5-min floor is the *guaranteed minimum* undo window; in practice recall
> works for the whole PENDING period — the floor just ensures a recipient's
> auto-claimer can never shrink it to zero.
