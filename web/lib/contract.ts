import type { Address } from "viem";

export const hederaTestnet = {
  id: Number(process.env.NEXT_PUBLIC_HEDERA_CHAIN_ID ?? 296),
  name: "Hedera Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"
} as const;

export const erc8004HederaTestnet = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
  validationRegistry: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as Address
} as const;

export const sepoliaEns = {
  id: 11155111,
  name: "Ethereum Sepolia",
  rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL
} as const;

export const ctrlzEscrowDeployment = {
  address: "0x2f2B5C26de74aA7307A5b946B025ce1A13255f45" as Address,
  deployBlock: 46822450,
  transactionHash:
    "0x91b8414d6203934b5f2541e39934d7fc4a6e5aac68b544e63a9618efc07a1280"
} as const;

export const ctrlzEscrowAddress =
  (process.env.NEXT_PUBLIC_CTRLZ_ESCROW_ADDRESS as Address | undefined) ??
  ctrlzEscrowDeployment.address;

export const ctrlzEscrowDeployBlock = ctrlzEscrowDeployment.deployBlock;

export const ctrlzVerifyEscrowDeployment = {
  address: "0xa2ac71dd9e7835af08e6be33ec047c47a35b2462" as Address,
  transactionHash:
    "0xcd4b8b44fb3292a932a2e40b7f4c08a49847dc9c56f8419b825ccd28d23843f0",
  demo: {
    taskId: 1,
    lockHash: "0x999d96c91d0863d52708197d332c824745facb5b2503290503557a9c962bdcd6",
    acceptHash: "0x319750b9d724d737cd9529cab8177176d5ae68ad7b2b1261d08902b486cf0488",
    submitHash: "0x7fc38c32ce7b4d908e3d5d4e356f0bfc461fc3ee5e821ed852726954b738b0db",
    resolveHash: "0xdbdb8f5236d1a1473bebb7f95c0e12683bebfbdf9f857628e62e69e9fbbeeb10",
    specHash: "0xc558bf1d075e6d7c622aaba021c8409b1cbbdf17c8cc527aa59c7326e9279d84",
    evidenceHash: "0xe1d2e5496eb486230d9febb251aa36fa4dba36748522a4681539b09f48fee4d7",
    recommendationHash:
      "0x51c1f255c050c58e5c543aa089d63ba99581e984e1b9ecc80f4a4e576ab77996",
    hashSource: "verify-ui-sha256",
    validationRequestHash: "0x58127f902d18df683efb23f50674fb549ebf111b3fae462cf5a798b683366bf4",
    validationResponseHash: "0x3ee62f1cc9c848a809ffb5bc46a3f2e2b55f8a1038afc93a9ab7b67c78a6fd51",
    validationRequestBlock: 36660758,
    validationResponseBlock: 36660775
  }
} as const;

export const ctrlzVerifyEscrowAddress =
  (process.env.NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS as Address | undefined) ??
  ctrlzVerifyEscrowDeployment.address;

export const ctrlzWalrusEvidence = {
  uri: "https://aggregator.walrus-testnet.walrus.space/v1/blobs/eDxE69ZD3dua2R7xO8Z1KlYa9RvKgpNZHzXIkO63frk",
  blobId: "eDxE69ZD3dua2R7xO8Z1KlYa9RvKgpNZHzXIkO63frk",
  hash: ctrlzVerifyEscrowDeployment.demo.evidenceHash
} as const;

export const ctrlzVerifyEscrowAbi = [
  {
    type: "function",
    name: "NAME",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "acceptTask",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "buyerAcceptPaused",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "recommendationHash", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "buyerRefundPaused",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "recommendationHash", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "lockTask",
    inputs: [
      { name: "worker", type: "address", internalType: "address" },
      { name: "resolver", type: "address", internalType: "address" },
      { name: "specHash", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "resolve",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      {
        name: "result",
        type: "uint8",
        internalType: "enum CtrlZVerifyEscrow.VerificationResult"
      },
      { name: "evidenceHash", type: "bytes32", internalType: "bytes32" },
      { name: "scoreBps", type: "uint16", internalType: "uint16" },
      { name: "recommendationHash", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "submitOutput",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "evidenceHash", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "tasks",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "buyer", type: "address", internalType: "address" },
      { name: "worker", type: "address", internalType: "address" },
      { name: "resolver", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "specHash", type: "bytes32", internalType: "bytes32" },
      { name: "evidenceHash", type: "bytes32", internalType: "bytes32" },
      { name: "state", type: "uint8", internalType: "enum CtrlZVerifyEscrow.State" },
      { name: "scoreBps", type: "uint16", internalType: "uint16" },
      { name: "recommendationHash", type: "bytes32", internalType: "bytes32" }
    ],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "TaskLocked",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "buyer", type: "address", indexed: true, internalType: "address" },
      { name: "worker", type: "address", indexed: true, internalType: "address" },
      { name: "resolver", type: "address", indexed: false, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "specHash", type: "bytes32", indexed: false, internalType: "bytes32" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TaskResolved",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "result",
        type: "uint8",
        indexed: false,
        internalType: "enum CtrlZVerifyEscrow.VerificationResult"
      },
      { name: "evidenceHash", type: "bytes32", indexed: false, internalType: "bytes32" },
      { name: "scoreBps", type: "uint16", indexed: false, internalType: "uint16" },
      { name: "recommendationHash", type: "bytes32", indexed: false, internalType: "bytes32" }
    ],
    anonymous: false
  }
] as const;

export const ctrlzEscrowAbi = [
  {
    type: "function",
    name: "NAME",
    inputs: [],
    outputs: [{ name: "", type: "string", internalType: "string" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "attachProof",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "hash", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "claim",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "claimFor",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "recipientSig", type: "bytes", internalType: "bytes" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "claimForDigest",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "distinctSenderCount",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "expire",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "firstSeen",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "flag",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "flagCount",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "hasSealedFrom",
    inputs: [
      { name: "", type: "address", internalType: "address" },
      { name: "", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "hold",
    inputs: [{ name: "recipient", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "nextPaymentId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "payments",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "sender", type: "address", internalType: "address" },
      { name: "recipient", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "claimableAt", type: "uint64", internalType: "uint64" },
      { name: "expiresAt", type: "uint64", internalType: "uint64" },
      { name: "refundTo", type: "address", internalType: "address" },
      {
        name: "state",
        type: "uint8",
        internalType: "enum CtrlZEscrow.State"
      },
      { name: "sealedAt", type: "uint64", internalType: "uint64" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "proofHash",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "recall",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      {
        name: "reason",
        type: "uint8",
        internalType: "enum CtrlZEscrow.RecallReason"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "reject",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "sealedCount",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "send",
    inputs: [
      { name: "recipient", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "undoWin", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable"
  },
  {
    type: "event",
    name: "Expired",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Flagged",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProofAttached",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "proofHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Recalled",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "reason",
        type: "uint8",
        indexed: false,
        internalType: "enum CtrlZEscrow.RecallReason"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Rejected",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Sealed",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Sent",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      {
        name: "sender",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "claimableAt",
        type: "uint64",
        indexed: false,
        internalType: "uint64"
      },
      {
        name: "expiresAt",
        type: "uint64",
        indexed: false,
        internalType: "uint64"
      }
    ],
    anonymous: false
  }
] as const;
