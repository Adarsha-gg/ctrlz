import type { Address } from "viem";

export const arcTestnet = {
  id: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? 5042002),
  name: "Arc Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network"
} as const;

export const hederaTestnet = {
  id: Number(process.env.NEXT_PUBLIC_HEDERA_CHAIN_ID ?? 296),
  name: "Hedera Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"
} as const;

export const erc8004HederaTestnet = {
  identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address
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
  address: "0x4659ddc8ec3f43bfa16498bc095da8ff973df1e4" as Address,
  transactionHash:
    "0xd4b09a50ae6ef7c733ccdcdcbba3399838d950836dc95712310eed9cd39db792",
  demo: {
    taskId: 1,
    lockHash: "0x02f66f01c68c6db88d4250b4f128d5a0f71c4e7eaca8588e4717b7448d9d093c",
    acceptHash: "0xa02682601b9fcbb530f88ff329d5d3000cb8e8f7af5e3a31ed1c85caab8a32c6",
    submitHash: "0x162cef8266683f44fe54af946e63c0bd68e4cdb1eb77e539f9b899e71cd8c184",
    resolveHash: "0x78c20ab96742a69f1d599109142f51d702cab12edaa4f1310a0bc0081239519f",
    specHash: "0xc4dab248f10ba4e5028308d2768503432834e4015f0fdd86c12cbdb2261335b9",
    evidenceHash: "0x547ddf8be39080f6c01b007835654637ce68ac113470b3a1d6dbd38c02330e02",
    recommendationHash:
      "0x51c1f255c050c58e5c543aa089d63ba99581e984e1b9ecc80f4a4e576ab77996",
    hashSource: "demo-fixture"
  }
} as const;

export const ctrlzVerifyEscrowAddress =
  (process.env.NEXT_PUBLIC_CTRLZ_VERIFY_ESCROW_ADDRESS as Address | undefined) ??
  ctrlzVerifyEscrowDeployment.address;

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
