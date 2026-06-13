import "server-only";

import { BigQuery } from "@google-cloud/bigquery";
import { unstable_cache } from "next/cache";
import { fixtureMarketplaceData } from "@/lib/marketplace/fixtures";
import type {
  AgentHistoryEvent,
  AgentMarketplaceRow,
  MarketplaceData,
  MarketplaceStats,
  WorkKind
} from "@/lib/marketplace/types";

const ETHEREUM_DATASET = "bigquery-public-data.goog_blockchain_ethereum_mainnet_us";
const IDENTITY_REGISTRY = "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432";
const REPUTATION_REGISTRY = "0x8004baa17c55a88189ae136b182e5fda19de9b63";
const VALIDATION_REGISTRY = "0x8004cc8439f36fd5f9f049d9ff86523df6daab58";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FEEDBACK_TOPIC = "0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc";
const ZERO_TOPIC = "0x0000000000000000000000000000000000000000000000000000000000000000";
const DEFAULT_START_TIMESTAMP = "2026-02-01";
const DEFAULT_MAX_BYTES_BILLED = "500000000000";
const DEFAULT_CACHE_SECONDS = 15 * 60;

export const ethereumErc8004Registries = {
  identity: IDENTITY_REGISTRY,
  reputation: REPUTATION_REGISTRY,
  validation: VALIDATION_REGISTRY
} as const;

type QueryRow = {
  agent_key: string;
  owner_address: string;
  agent_uri: string | null;
  registered_at: { value?: string } | string;
  recent_feedback?: FeedbackHistoryRow[] | null;
  recent_validations?: ValidationHistoryRow[] | null;
  feedback_count: number | string | null;
  unique_clients: number | string | null;
  average_score: number | string | null;
  weighted_feedback: number | string | null;
  largest_rater_volume: number | string | null;
  max_pair_repeats: number | string | null;
  feedback_span_hours: number | string | null;
  identity_signals: number | string | null;
  validation_count: number | string | null;
};

type FeedbackHistoryRow = {
  block_timestamp: { value?: string } | string;
  client: string;
  average_score: number | string | null;
  transaction_hash?: string | null;
};

type ValidationHistoryRow = {
  block_timestamp: { value?: string } | string;
  transaction_hash?: string | null;
};

type StatsRow = {
  identity_transactions: number | string;
  reputation_transactions: number | string;
  validation_transactions: number | string;
  active_agents: number | string;
  feedback_events: number | string;
  unique_feedback_clients: number | string;
};

function bigQueryClient() {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GOOGLE_CLOUD_CREDENTIALS;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined;

  if (!credentialsJson) {
    return new BigQuery({ projectId });
  }

  const credentials = JSON.parse(credentialsJson) as {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };

  return new BigQuery({
    projectId: projectId || credentials.project_id,
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key?.replace(/\\n/g, "\n")
    }
  });
}

const numberValue = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
};

const timestampValue = (value: { value?: string } | string): string => {
  if (typeof value === "string") {
    return value;
  }
  return value.value ?? new Date().toISOString();
};

const agentIdFromKey = (agentKey: string): string => {
  try {
    return BigInt(agentKey).toString(10);
  } catch {
    return agentKey;
  }
};

const WORK_LABELS: Record<WorkKind, string> = {
  finance: "Finance",
  sports: "Sports",
  payments: "Payments",
  commerce: "Commerce",
  data: "Data",
  developer: "Developer",
  research: "Research",
  media: "Media",
  general: "General"
};

function domainFromUri(uri: string | null): string {
  if (!uri || uri.startsWith("data:")) {
    return uri?.startsWith("data:") ? "embedded metadata" : "unknown";
  }
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function classifyWork(uri: string | null): { workKind: WorkKind; workLabel: string; categoryEvidence: string[] } {
  const text = `${uri ?? ""} ${domainFromUri(uri)}`.toLowerCase();
  let workKind: WorkKind = "general";
  let matched = "no strong metadata keyword";

  if (/(football|sport|bet|prediction|odds|game)/.test(text)) {
    workKind = "sports";
    matched = "metadata/domain matched sports keywords";
  } else if (/(redstone|price|crypto|token|defi|finance|trading|market|oracle)/.test(text)) {
    workKind = "finance";
    matched = "metadata/domain matched finance keywords";
  } else if (/(x402|payment|remittance|wallet|invoice|checkout|pay)/.test(text)) {
    workKind = "payments";
    matched = "metadata/domain matched payment keywords";
  } else if (/(shop|commerce|ecommerce|retail|procure|product|surfliquid|listing)/.test(text)) {
    workKind = "commerce";
    matched = "metadata/domain matched commerce keywords";
  } else if (/(scrape|extract|dataset|index|data|api|mcp|query|search)/.test(text)) {
    workKind = "data";
    matched = "metadata/domain matched data/API keywords";
  } else if (/(code|developer|github|build|deploy|test|software)/.test(text)) {
    workKind = "developer";
    matched = "metadata/domain matched developer keywords";
  } else if (/(research|paper|citation|analysis|report)/.test(text)) {
    workKind = "research";
    matched = "metadata/domain matched research keywords";
  } else if (/(image|video|audio|media|content|social)/.test(text)) {
    workKind = "media";
    matched = "metadata/domain matched media keywords";
  }

  return {
    workKind,
    workLabel: WORK_LABELS[workKind],
    categoryEvidence: [
      matched,
      uri ? `agent metadata URI: ${uri}` : "no agent metadata URI published"
    ]
  };
}

function shortAddress(address: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function txDetail(txHash?: string | null) {
  return txHash ? `tx ${txHash.slice(0, 10)}...${txHash.slice(-8)}` : "transaction hash unavailable";
}

function buildHistory(row: QueryRow, work: ReturnType<typeof classifyWork>, domain: string): AgentHistoryEvent[] {
  const registeredAt = timestampValue(row.registered_at);
  const events: AgentHistoryEvent[] = [
    {
      kind: "identity",
      title: "Agent registered",
      detail: `${domain} · category currently inferred as ${work.workLabel}`,
      timestamp: registeredAt
    },
    {
      kind: "metadata",
      title: "Category inference",
      detail: work.categoryEvidence.join("; "),
      timestamp: registeredAt
    }
  ];

  for (const feedback of row.recent_feedback ?? []) {
    const score = numberValue(feedback.average_score);
    events.push({
      kind: "feedback",
      title: `Feedback score ${Math.round(score)}/100`,
      detail: `Rater ${shortAddress(feedback.client)} · ${txDetail(feedback.transaction_hash)}`,
      timestamp: timestampValue(feedback.block_timestamp),
      score,
      client: feedback.client,
      txHash: feedback.transaction_hash ?? undefined
    });
  }

  for (const validation of row.recent_validations ?? []) {
    events.push({
      kind: "validation",
      title: "Validation registry event",
      detail: `Validation evidence observed · ${txDetail(validation.transaction_hash)}`,
      timestamp: timestampValue(validation.block_timestamp),
      txHash: validation.transaction_hash ?? undefined
    });
  }

  return events
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);
}

function scoreAgent(input: {
  feedbackCount: number;
  uniqueClients: number;
  averageScore: number | null;
  weightedFeedback: number;
  largestRaterVolume: number;
  maxPairRepeats: number;
  feedbackSpanHours: number;
  identitySignals: number;
  validationCount: number;
}): Pick<AgentMarketplaceRow, "trustScore" | "risk" | "action"> {
  if (input.validationCount === 0 && input.feedbackCount === 0) {
    return {
      trustScore: input.identitySignals > 0 ? Math.min(12, input.identitySignals * 2) : 0,
      risk: "needs-validation",
      action: "strict-validation"
    };
  }

  const weightedFeedbackLift = Math.min(input.weightedFeedback * 2.6, 42);
  const clientLift = Math.min(input.uniqueClients * 1.8, 22);
  const scoreLift = input.averageScore === null ? 0 : Math.max(0, Math.min(input.averageScore, 100)) * 0.12;
  const identityLift = Math.min(input.identitySignals * 1.2, 10);
  const validationLift = Math.min(input.validationCount * 22, 36);
  const burstPenalty = input.feedbackCount >= 10 && input.feedbackSpanHours < 24 ? 0.45 : 1;
  const repeatPenalty =
    input.feedbackCount > 0 && input.maxPairRepeats / input.feedbackCount > 0.5 ? 0.65 : 1;
  const megaRaterPenalty = input.largestRaterVolume >= 500 ? 0.8 : 1;
  const rawScore =
    8 + weightedFeedbackLift + clientLift + scoreLift + identityLift + validationLift;
  const trustScore = Math.round(Math.min(100, rawScore * burstPenalty * repeatPenalty * megaRaterPenalty));
  const hasDurableFeedback =
    input.feedbackCount >= 20 &&
    input.uniqueClients >= 10 &&
    input.weightedFeedback >= 15 &&
    input.feedbackSpanHours >= 24 * 7 &&
    input.largestRaterVolume < 500;

  if (input.validationCount > 0 && trustScore >= 80) {
    return { trustScore, risk: "validated", action: "auto-hire" };
  }
  if (trustScore >= 85 && hasDurableFeedback) {
    return { trustScore, risk: "trusted", action: "auto-hire" };
  }
  if (input.feedbackCount >= 10 && input.uniqueClients >= 3) {
    return { trustScore, risk: "active", action: "escrow" };
  }
  if (input.identitySignals > 0 || input.feedbackCount > 0) {
    return { trustScore, risk: "thin", action: "strict-validation" };
  }
  return { trustScore, risk: "unknown", action: "reject" };
}

function rankRows(rows: QueryRow[]): AgentMarketplaceRow[] {
  return rows
    .map((row) => {
      const feedbackCount = numberValue(row.feedback_count);
      const uniqueClients = numberValue(row.unique_clients);
      const identitySignals = numberValue(row.identity_signals);
      const validationCount = numberValue(row.validation_count);
      const rawAverageScore = row.average_score === null ? null : numberValue(row.average_score);
      const averageScore = rawAverageScore === null || Number.isNaN(rawAverageScore) ? null : rawAverageScore;
      const agentUri = row.agent_uri ?? "";
      const domain = domainFromUri(agentUri);
      const work = classifyWork(agentUri);
      const history = buildHistory(row, work, domain);
      const weightedFeedback = numberValue(row.weighted_feedback);
      const largestRaterVolume = numberValue(row.largest_rater_volume);
      const maxPairRepeats = numberValue(row.max_pair_repeats);
      const feedbackSpanHours = numberValue(row.feedback_span_hours);
      const scored = scoreAgent({
        feedbackCount,
        uniqueClients,
        averageScore,
        weightedFeedback,
        largestRaterVolume,
        maxPairRepeats,
        feedbackSpanHours,
        identitySignals,
        validationCount
      });

      return {
        rank: 0,
        agentId: agentIdFromKey(row.agent_key),
        agentKey: row.agent_key,
        ownerAddress: row.owner_address,
        agentUri,
        domain,
        ...work,
        registeredAt: timestampValue(row.registered_at),
        history,
        feedbackCount,
        uniqueClients,
        averageScore,
        weightedFeedback,
        largestRaterVolume,
        maxPairRepeats,
        feedbackSpanHours,
        identitySignals,
        validationCount,
        ...scored
      };
    })
    .sort((a, b) => b.trustScore - a.trustScore || b.uniqueClients - a.uniqueClients || b.feedbackCount - a.feedbackCount)
    .map((agent, index) => ({ ...agent, rank: index + 1 }));
}

const startTimestamp = process.env.BIGQUERY_START_TIMESTAMP || DEFAULT_START_TIMESTAMP;
const marketplaceCacheSeconds = Number(process.env.MARKETPLACE_CACHE_SECONDS ?? DEFAULT_CACHE_SECONDS);

const statsQuery = `
SELECT
  COUNTIF(to_address = '${IDENTITY_REGISTRY}') AS identity_transactions,
  COUNTIF(to_address = '${REPUTATION_REGISTRY}') AS reputation_transactions,
  COUNTIF(to_address = '${VALIDATION_REGISTRY}') AS validation_transactions,
  (
    SELECT COUNT(*)
    FROM \`${ETHEREUM_DATASET}.logs\`
    WHERE block_timestamp >= TIMESTAMP('${startTimestamp}')
      AND address = '${IDENTITY_REGISTRY}'
      AND topics[SAFE_OFFSET(0)] = '${TRANSFER_TOPIC}'
      AND topics[SAFE_OFFSET(1)] = '${ZERO_TOPIC}'
      AND NOT removed
  ) AS active_agents,
  (
    SELECT COUNT(*)
    FROM \`${ETHEREUM_DATASET}.logs\`
    WHERE block_timestamp >= TIMESTAMP('${startTimestamp}')
      AND address = '${REPUTATION_REGISTRY}'
      AND topics[SAFE_OFFSET(0)] = '${FEEDBACK_TOPIC}'
      AND NOT removed
  ) AS feedback_events,
  (
    SELECT COUNT(DISTINCT CONCAT('0x', SUBSTR(topics[SAFE_OFFSET(2)], 27)))
    FROM \`${ETHEREUM_DATASET}.logs\`
    WHERE block_timestamp >= TIMESTAMP('${startTimestamp}')
      AND address = '${REPUTATION_REGISTRY}'
      AND topics[SAFE_OFFSET(0)] = '${FEEDBACK_TOPIC}'
      AND NOT removed
  ) AS unique_feedback_clients
FROM \`${ETHEREUM_DATASET}.transactions\`
WHERE block_timestamp >= TIMESTAMP('${startTimestamp}')
  AND to_address IN ('${IDENTITY_REGISTRY}', '${REPUTATION_REGISTRY}', '${VALIDATION_REGISTRY}')
`;

const marketplaceQuery = `
WITH registered AS (
  SELECT
    topics[SAFE_OFFSET(1)] AS agent_key,
    CONCAT('0x', SUBSTR(topics[SAFE_OFFSET(2)], 27)) AS owner_address,
    MIN(block_timestamp) AS registered_at,
    ARRAY_AGG(
      SAFE_CONVERT_BYTES_TO_STRING(
        FROM_HEX(
          SUBSTR(
            data,
            131,
            SAFE_CAST(CONCAT('0x', SUBSTR(data, 67, 64)) AS INT64) * 2
          )
        )
      )
      ORDER BY block_timestamp DESC
      LIMIT 1
    )[SAFE_OFFSET(0)] AS agent_uri
  FROM \`${ETHEREUM_DATASET}.logs\`
  WHERE block_timestamp >= TIMESTAMP('2026-01-01')
    AND address = '${IDENTITY_REGISTRY}'
    AND topics[SAFE_OFFSET(0)] = '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a'
    AND topics[SAFE_OFFSET(1)] IS NOT NULL
    AND NOT removed
  GROUP BY agent_key, owner_address
),
identity_signals AS (
  SELECT
    topics[SAFE_OFFSET(1)] AS agent_key,
    COUNT(*) AS identity_signals
  FROM \`${ETHEREUM_DATASET}.logs\`
  WHERE block_timestamp >= TIMESTAMP('${startTimestamp}')
    AND address = '${IDENTITY_REGISTRY}'
    AND topics[SAFE_OFFSET(0)] != '${TRANSFER_TOPIC}'
    AND topics[SAFE_OFFSET(1)] IS NOT NULL
    AND NOT removed
  GROUP BY agent_key
),
feedback_raw AS (
  SELECT
    topics[SAFE_OFFSET(1)] AS agent_key,
    CONCAT('0x', SUBSTR(topics[SAFE_OFFSET(2)], 27)) AS client,
    LEAST(
      100,
      GREATEST(
        0,
        SAFE_DIVIDE(
          SAFE_CAST(CONCAT('0x', SUBSTR(data, 67, 64)) AS INT64),
          POW(10, SAFE_CAST(CONCAT('0x', SUBSTR(data, 131, 64)) AS INT64))
        )
      )
    ) AS average_score,
    block_timestamp,
    transaction_hash
  FROM \`${ETHEREUM_DATASET}.logs\`
  WHERE block_timestamp >= TIMESTAMP('${startTimestamp}')
    AND address = '${REPUTATION_REGISTRY}'
    AND topics[SAFE_OFFSET(0)] = '${FEEDBACK_TOPIC}'
    AND topics[SAFE_OFFSET(1)] IS NOT NULL
    AND NOT removed
),
client_weight AS (
  SELECT client, COUNT(*) AS client_feedback_count
  FROM feedback_raw
  GROUP BY client
),
pair_counts AS (
  SELECT agent_key, client, COUNT(*) AS pair_feedback_count
  FROM feedback_raw
  GROUP BY agent_key, client
),
reputation AS (
  SELECT
    feedback_raw.agent_key,
    COUNT(*) AS feedback_count,
    COUNT(DISTINCT feedback_raw.client) AS unique_clients,
    AVG(feedback_raw.average_score) AS average_score,
    SUM(1 / SQRT(client_weight.client_feedback_count)) AS weighted_feedback,
    MAX(client_weight.client_feedback_count) AS largest_rater_volume,
    MAX(pair_counts.pair_feedback_count) AS max_pair_repeats,
    TIMESTAMP_DIFF(MAX(feedback_raw.block_timestamp), MIN(feedback_raw.block_timestamp), HOUR) AS feedback_span_hours,
    ARRAY_AGG(
      STRUCT(
        feedback_raw.block_timestamp AS block_timestamp,
        feedback_raw.client AS client,
        feedback_raw.average_score AS average_score,
        feedback_raw.transaction_hash AS transaction_hash
      )
      ORDER BY feedback_raw.block_timestamp DESC
      LIMIT 5
    ) AS recent_feedback
  FROM feedback_raw
  JOIN client_weight USING (client)
  JOIN pair_counts USING (agent_key, client)
  GROUP BY feedback_raw.agent_key
),
validation AS (
  SELECT
    topics[SAFE_OFFSET(1)] AS agent_key,
    COUNT(*) AS validation_count,
    ARRAY_AGG(
      STRUCT(
        block_timestamp AS block_timestamp,
        transaction_hash AS transaction_hash
      )
      ORDER BY block_timestamp DESC
      LIMIT 3
    ) AS recent_validations
  FROM \`${ETHEREUM_DATASET}.logs\`
  WHERE block_timestamp >= TIMESTAMP('${startTimestamp}')
    AND address = '${VALIDATION_REGISTRY}'
    AND topics[SAFE_OFFSET(1)] IS NOT NULL
    AND NOT removed
  GROUP BY agent_key
)
SELECT
  registered.agent_key,
  registered.owner_address,
  registered.agent_uri,
  registered.registered_at,
  COALESCE(reputation.feedback_count, 0) AS feedback_count,
  COALESCE(reputation.unique_clients, 0) AS unique_clients,
  reputation.average_score,
  COALESCE(reputation.weighted_feedback, 0) AS weighted_feedback,
  COALESCE(reputation.largest_rater_volume, 0) AS largest_rater_volume,
  COALESCE(reputation.max_pair_repeats, 0) AS max_pair_repeats,
  COALESCE(reputation.feedback_span_hours, 0) AS feedback_span_hours,
  reputation.recent_feedback,
  COALESCE(identity_signals.identity_signals, 0) AS identity_signals,
  COALESCE(validation.validation_count, 0) AS validation_count,
  validation.recent_validations
FROM registered
LEFT JOIN reputation USING (agent_key)
LEFT JOIN identity_signals USING (agent_key)
LEFT JOIN validation USING (agent_key)
ORDER BY feedback_count DESC, unique_clients DESC, identity_signals DESC, registered_at DESC
LIMIT 40
`;

async function queryMarketplaceData(): Promise<MarketplaceData> {
  try {
    const bigquery = bigQueryClient();
    const options = {
      location: process.env.BIGQUERY_LOCATION || "US",
      maximumBytesBilled: process.env.BIGQUERY_MAX_BYTES_BILLED || DEFAULT_MAX_BYTES_BILLED
    };

    const [statsResponse, agentsResponse] = await Promise.all([
      bigquery.query({ query: statsQuery, ...options }),
      bigquery.query({ query: marketplaceQuery, ...options })
    ]);
    const statsRows = statsResponse[0] as StatsRow[];
    const rows = agentsResponse[0] as QueryRow[];
    const stats = statsRows[0];

    const liveStats: MarketplaceStats = {
      identityTransactions: numberValue(stats?.identity_transactions),
      reputationTransactions: numberValue(stats?.reputation_transactions),
      validationTransactions: numberValue(stats?.validation_transactions),
      activeAgents: numberValue(stats?.active_agents),
      feedbackEvents: numberValue(stats?.feedback_events),
      uniqueFeedbackClients: numberValue(stats?.unique_feedback_clients)
    };

    return {
      source: "bigquery",
      generatedAt: new Date().toISOString(),
      stats: liveStats,
      agents: rankRows(rows)
    };
  } catch (error) {
    return {
      ...fixtureMarketplaceData,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown BigQuery error"
    };
  }
}

const getCachedMarketplaceData = unstable_cache(queryMarketplaceData, ["ctrlz-marketplace-data-v2"], {
  revalidate: Number.isFinite(marketplaceCacheSeconds) ? marketplaceCacheSeconds : DEFAULT_CACHE_SECONDS,
  tags: ["ctrlz-marketplace"]
});

export async function getMarketplaceData(options?: { refresh?: boolean }): Promise<MarketplaceData> {
  if (options?.refresh) {
    return queryMarketplaceData();
  }
  return getCachedMarketplaceData();
}
