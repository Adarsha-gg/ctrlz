import type { Address } from "viem";

export const arcTestnet = {
  id: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? 5042002),
  name: "Arc Testnet",
  rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network"
} as const;

export const sepoliaEns = {
  id: 11155111,
  name: "Ethereum Sepolia",
  rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL
} as const;

export const ctrlzEscrowAddress = process.env.NEXT_PUBLIC_CTRLZ_ESCROW_ADDRESS as
  | Address
  | undefined;

export const ctrlzEscrowAbi = [] as const;
