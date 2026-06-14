export type MarketplaceSource = "bigquery" | "hedera" | "fixture";

export type WorkKind =
  | "finance"
  | "sports"
  | "payments"
  | "commerce"
  | "data"
  | "developer"
  | "research"
  | "media"
  | "general";

export type SettlementAction = "auto-hire" | "escrow" | "strict-validation" | "reject";

export type AgentHistoryEvent = {
  kind: "feedback" | "validation" | "identity" | "metadata";
  title: string;
  detail: string;
  timestamp: string;
  score?: number | null;
  client?: string;
  txHash?: string;
};

export type AgentMarketplaceRow = {
  rank: number;
  agentId: string;
  agentKey: string;
  ownerAddress: string;
  agentUri: string;
  domain: string;
  x402Support: boolean;
  x402Evidence: string[];
  workKind: WorkKind;
  workLabel: string;
  categoryEvidence: string[];
  registeredAt: string;
  history: AgentHistoryEvent[];
  feedbackCount: number;
  uniqueClients: number;
  averageScore: number | null;
  weightedFeedback: number;
  largestRaterVolume: number;
  maxPairRepeats: number;
  feedbackSpanHours: number;
  identitySignals: number;
  validationCount: number;
  trustScore: number;
  risk: "validated" | "trusted" | "active" | "thin" | "needs-validation" | "unknown";
  action: SettlementAction;
};

export type MarketplaceStats = {
  identityTransactions: number;
  reputationTransactions: number;
  validationTransactions: number;
  activeAgents: number;
  feedbackEvents: number;
  uniqueFeedbackClients: number;
  x402Agents?: number;
  uniqueOwners?: number;
  agentsWithFeedback?: number;
  topRaterShare?: number;
  top10RaterShare?: number;
  topOwnerShare?: number;
};

export type MarketplaceData = {
  source: MarketplaceSource;
  generatedAt: string;
  stats: MarketplaceStats;
  agents: AgentMarketplaceRow[];
  error?: string;
};
