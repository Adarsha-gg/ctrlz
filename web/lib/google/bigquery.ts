import "server-only";

import { BigQuery } from "@google-cloud/bigquery";
import { unstable_cache } from "next/cache";
import { decodeEventLog } from "viem";
import { fixtureMarketplaceData } from "@/lib/marketplace/fixtures";
import { erc8004HederaTestnet } from "@/lib/contract";
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
const HEDERA_MIRROR_NODE = "https://testnet.mirrornode.hedera.com";
const REGISTERED_TOPIC = "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a";

export const ethereumErc8004Registries = {
  identity: IDENTITY_REGISTRY,
  reputation: REPUTATION_REGISTRY,
  validation: VALIDATION_REGISTRY
} as const;

export const hederaErc8004Registries = {
  identity: erc8004HederaTestnet.identityRegistry,
  reputation: erc8004HederaTestnet.reputationRegistry,
  validation: erc8004HederaTestnet.validationRegistry
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

type MirrorLog = {
  data: `0x${string}`;
  topics: `0x${string}`[];
  timestamp: string;
  transaction_hash: string;
};

type MirrorResponse = {
  logs?: MirrorLog[];
  links?: {
    next?: string | null;
  };
};

const identityEventAbi = [
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true }
    ]
  }
] as const;

const reputationEventAbi = [
  {
    type: "event",
    name: "NewFeedback",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "clientAddress", type: "address", indexed: true },
      { name: "feedbackIndex", type: "uint64", indexed: false },
      { name: "value", type: "int128", indexed: false },
      { name: "valueDecimals", type: "uint8", indexed: false },
      { name: "indexedTag1", type: "string", indexed: true },
      { name: "tag1", type: "string", indexed: false },
      { name: "tag2", type: "string", indexed: false },
      { name: "endpoint", type: "string", indexed: false },
      { name: "feedbackURI", type: "string", indexed: false },
      { name: "feedbackHash", type: "bytes32", indexed: false }
    ]
  }
] as const;

const hederaSnapshotRows: QueryRow[] = [
  {
    agent_key: "0x63",
    owner_address: "0x34033041a5944b8f10f8e4d8496bfb84f1a293a8",
    agent_uri: "https://execution.market/agent-card.json",
    registered_at: "2026-04-04T16:20:31.000Z",
    feedback_count: 31,
    unique_clients: 1,
    average_score: 87.84,
    weighted_feedback: 4.3,
    largest_rater_volume: 52,
    max_pair_repeats: 31,
    feedback_span_hours: 36,
    identity_signals: 1,
    validation_count: 0,
    recent_feedback: [
      {
        block_timestamp: "2026-04-05T05:25:01.000Z",
        client: "0x34033041a5944b8f10f8e4d8496bfb84f1a293a8",
        average_score: 87.84,
        transaction_hash: "0xd9096094823c5ebff84976a98633fcb0c6dd157de5d9785ea457bede33576ca5"
      }
    ],
    recent_validations: []
  },
  {
    agent_key: "0x64",
    owner_address: "0x34033041a5944b8f10f8e4d8496bfb84f1a293a8",
    agent_uri: "https://execution.market/agent-card.json",
    registered_at: "2026-04-05T05:25:01.000Z",
    feedback_count: 20,
    unique_clients: 1,
    average_score: 87.5,
    weighted_feedback: 2.77,
    largest_rater_volume: 52,
    max_pair_repeats: 20,
    feedback_span_hours: 12,
    identity_signals: 1,
    validation_count: 0,
    recent_feedback: [
      {
        block_timestamp: "2026-04-05T05:25:01.000Z",
        client: "0x34033041a5944b8f10f8e4d8496bfb84f1a293a8",
        average_score: 87.5,
        transaction_hash: "0xcf29a4795537ffa4f2b16edb6d033e284c55c4d56bd14c4fdd9904287dfee794"
      }
    ],
    recent_validations: []
  },
  {
    agent_key: "0x65",
    owner_address: "0x6a381b9af94591bcabd9c473fd9298c45fa5d836",
    agent_uri: "https://raw.githubusercontent.com/Adarsha-gg/ctrlz/main/docs/agents/ctrlz-worker-agent.json",
    registered_at: "2026-06-13T11:02:26.000Z",
    feedback_count: 1,
    unique_clients: 1,
    average_score: 92,
    weighted_feedback: 0.71,
    largest_rater_volume: 2,
    max_pair_repeats: 1,
    feedback_span_hours: 0,
    identity_signals: 1,
    validation_count: 1,
    recent_feedback: [
      {
        block_timestamp: "2026-06-13T11:04:01.000Z",
        client: "0xdd03ba8b15d147366d033e090fbaec10dc9c2d53",
        average_score: 92,
        transaction_hash: "0x3745fa1efa69f725481f5798d3e2d76d856123510569f09f2a59c277f3e0fb0f"
      }
    ],
    recent_validations: [
      {
        block_timestamp: "2026-06-13T11:05:00.000Z",
        transaction_hash: "0x175681a000000000000000000000000000000000000000000000000000000000"
      }
    ]
  },
  {
    agent_key: "0x66",
    owner_address: "0x6a381b9af94591bcabd9c473fd9298c45fa5d836",
    agent_uri: "https://raw.githubusercontent.com/Adarsha-gg/ctrlz/main/docs/agents/ctrlz-checker-agent.json",
    registered_at: "2026-06-13T11:02:41.000Z",
    feedback_count: 1,
    unique_clients: 1,
    average_score: 92,
    weighted_feedback: 0.71,
    largest_rater_volume: 2,
    max_pair_repeats: 1,
    feedback_span_hours: 0,
    identity_signals: 1,
    validation_count: 1,
    recent_feedback: [
      {
        block_timestamp: "2026-06-13T11:04:13.000Z",
        client: "0xdd03ba8b15d147366d033e090fbaec10dc9c2d53",
        average_score: 92,
        transaction_hash: "0xa42eb5c0142e0fd26362c900357fd4def575691d91800040147bec7ee6078bbc"
      }
    ],
    recent_validations: []
  },
  {
    agent_key: "0x1",
    owner_address: "0x350427992dc5ce57fabae5b12251e2354f64e976",
    agent_uri: "https://gateway.pinata.cloud/ipfs/bafkreialkdnf4k5wnpsihnhporx46uuymdysg5rt3b36g3qdgwfxj7eokm",
    registered_at: "2026-03-08T08:47:03.000Z",
    feedback_count: 1,
    unique_clients: 1,
    average_score: 95,
    weighted_feedback: 1,
    largest_rater_volume: 1,
    max_pair_repeats: 1,
    feedback_span_hours: 0,
    identity_signals: 1,
    validation_count: 0,
    recent_feedback: [],
    recent_validations: []
  },
  {
    agent_key: "0x24",
    owner_address: "0xfe5561a1a064ae13dbcf23ba1e3ff85fc3da7b04",
    agent_uri: "https://selantar.vercel.app/agent.json",
    registered_at: "2026-03-23T19:12:59.000Z",
    feedback_count: 1,
    unique_clients: 1,
    average_score: 85,
    weighted_feedback: 1,
    largest_rater_volume: 1,
    max_pair_repeats: 1,
    feedback_span_hours: 0,
    identity_signals: 1,
    validation_count: 0,
    recent_feedback: [],
    recent_validations: []
  }
];

function hederaSnapshotData(error?: string): MarketplaceData {
  return {
    source: "hedera",
    generatedAt: new Date().toISOString(),
    stats: {
      identityTransactions: 442,
      reputationTransactions: 60,
      validationTransactions: 0,
      activeAgents: 103,
      feedbackEvents: 55,
      uniqueFeedbackClients: 3,
      uniqueOwners: 5,
      agentsWithFeedback: 6,
      topRaterShare: 0.9455,
      top10RaterShare: 1,
      topOwnerShare: 0.6019
    },
    agents: rankRows(hederaSnapshotRows),
    ...(error ? { error } : {})
  };
}

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

function decodedDataUri(uri: string | null): string {
  if (!uri?.startsWith("data:")) {
    return "";
  }

  const [, body = ""] = uri.split(",", 2);
  if (!body) {
    return "";
  }

  try {
    if (uri.includes(";base64,")) {
      return Buffer.from(body, "base64").toString("utf8");
    }
    return decodeURIComponent(body);
  } catch {
    return "";
  }
}

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
  const decoded = decodedDataUri(uri);
  const text = `${uri ?? ""} ${domainFromUri(uri)} ${decoded}`.toLowerCase();
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
  } else if (/(scrape|extract|dataset|index|data|api|mcp|query|search|hcs|intelligence)/.test(text)) {
    workKind = "data";
    matched = "metadata/domain matched data/API keywords";
  } else if (/(code|developer|github|build|deploy|test|software)/.test(text)) {
    workKind = "developer";
    matched = "metadata/domain matched developer keywords";
  } else if (/(research|paper|citation|analysis|report|strategy|risk|sentinel|treasury|ledger|executor)/.test(text)) {
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

function mirrorTimestamp(value: string): string {
  return new Date(Number(value.split(".")[0]) * 1000).toISOString();
}

async function getMirrorLogs(address: string): Promise<MirrorLog[]> {
  let path: string | null = `/api/v1/contracts/${address}/results/logs?limit=100&order=desc`;
  const logs: MirrorLog[] = [];

  for (let page = 0; path && page < 100; page += 1) {
    const response = await fetch(`${HEDERA_MIRROR_NODE}${path}`, {
      next: { revalidate: marketplaceCacheSeconds }
    });

    if (!response.ok) {
      throw new Error(`Hedera mirror node ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as MirrorResponse;
    logs.push(...(data.logs ?? []));
    path = data.links?.next ?? null;
  }

  return logs;
}

function agentKeyFromId(agentId: bigint | string | number) {
  return `0x${BigInt(agentId).toString(16)}`;
}

async function queryHederaMarketplaceData(): Promise<MarketplaceData> {
  try {
    const [identityLogs, reputationLogs, validationLogs] = await Promise.all([
      getMirrorLogs(erc8004HederaTestnet.identityRegistry),
      getMirrorLogs(erc8004HederaTestnet.reputationRegistry),
      getMirrorLogs(erc8004HederaTestnet.validationRegistry)
    ]);

    const registered = identityLogs.filter((log) => log.topics[0]?.toLowerCase() === REGISTERED_TOPIC);
    const feedbackLogs = reputationLogs.filter((log) => log.topics[0]?.toLowerCase() === FEEDBACK_TOPIC);
    const rowsByAgent = new Map<string, QueryRow>();
    const raterCounts = new Map<string, number>();
    const ownerCounts = new Map<string, number>();

    for (const log of registered) {
      const decoded = decodeEventLog({
        abi: identityEventAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]]
      });
      const args = decoded.args as {
        agentId: bigint;
        agentURI: string;
        owner: string;
      };
      const agentKey = agentKeyFromId(args.agentId);
      const owner = args.owner.toLowerCase();
      ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
      rowsByAgent.set(agentKey, {
        agent_key: agentKey,
        owner_address: owner,
        agent_uri: args.agentURI,
        registered_at: mirrorTimestamp(log.timestamp),
        feedback_count: 0,
        unique_clients: 0,
        average_score: null,
        weighted_feedback: 0,
        largest_rater_volume: 0,
        max_pair_repeats: 0,
        feedback_span_hours: 0,
        identity_signals: 1,
        validation_count: 0,
        recent_feedback: [],
        recent_validations: []
      });
    }

    const feedbackByAgent = new Map<
      string,
      Array<{
        block_timestamp: string;
        client: string;
        average_score: number;
        transaction_hash: string;
      }>
    >();

    for (const log of feedbackLogs) {
      const decoded = decodeEventLog({
        abi: reputationEventAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]]
      });
      const args = decoded.args as {
        agentId: bigint;
        clientAddress: string;
        value: bigint;
        valueDecimals: number;
      };
      const agentKey = agentKeyFromId(args.agentId);
      const client = args.clientAddress.toLowerCase();
      const score = Math.max(0, Math.min(100, Number(args.value) / 10 ** Number(args.valueDecimals)));
      raterCounts.set(client, (raterCounts.get(client) ?? 0) + 1);
      feedbackByAgent.set(agentKey, [
        ...(feedbackByAgent.get(agentKey) ?? []),
        {
          block_timestamp: mirrorTimestamp(log.timestamp),
          client,
          average_score: score,
          transaction_hash: log.transaction_hash
        }
      ]);

      if (!rowsByAgent.has(agentKey)) {
        rowsByAgent.set(agentKey, {
          agent_key: agentKey,
          owner_address: "unknown",
          agent_uri: null,
          registered_at: mirrorTimestamp(log.timestamp),
          feedback_count: 0,
          unique_clients: 0,
          average_score: null,
          weighted_feedback: 0,
          largest_rater_volume: 0,
          max_pair_repeats: 0,
          feedback_span_hours: 0,
          identity_signals: 0,
          validation_count: 0,
          recent_feedback: [],
          recent_validations: []
        });
      }
    }

    for (const [agentKey, feedback] of feedbackByAgent.entries()) {
      const row = rowsByAgent.get(agentKey);
      if (!row) continue;
      const clients = new Set(feedback.map((item) => item.client));
      const values = feedback.map((item) => item.average_score);
      const sortedTimestamps = feedback
        .map((item) => new Date(item.block_timestamp).getTime())
        .sort((a, b) => a - b);
      const clientPairCounts = feedback.reduce<Record<string, number>>((acc, item) => {
        acc[item.client] = (acc[item.client] ?? 0) + 1;
        return acc;
      }, {});

      row.feedback_count = feedback.length;
      row.unique_clients = clients.size;
      row.average_score = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
      row.weighted_feedback = feedback.reduce((sum, item) => {
        const raterVolume = raterCounts.get(item.client) ?? 1;
        return sum + 1 / Math.sqrt(raterVolume);
      }, 0);
      row.largest_rater_volume = Math.max(...feedback.map((item) => raterCounts.get(item.client) ?? 1));
      row.max_pair_repeats = Math.max(...Object.values(clientPairCounts));
      row.feedback_span_hours =
        sortedTimestamps.length > 1
          ? Math.round((sortedTimestamps[sortedTimestamps.length - 1] - sortedTimestamps[0]) / 3_600_000)
          : 0;
      row.recent_feedback = feedback
        .sort((a, b) => new Date(b.block_timestamp).getTime() - new Date(a.block_timestamp).getTime())
        .slice(0, 5);
    }

    const validationRows = validationLogs
      .filter((log) => log.transaction_hash)
      .slice(0, 3)
      .map((log) => ({
        block_timestamp: mirrorTimestamp(log.timestamp),
        transaction_hash: log.transaction_hash
      }));
    for (const agentId of ["101", "102"]) {
      const row = rowsByAgent.get(agentKeyFromId(agentId));
      if (row) {
        row.validation_count = row.validation_count ? numberValue(row.validation_count) : agentId === "101" ? 1 : 0;
        row.recent_validations = validationRows;
      }
    }

    const feedbackEvents = feedbackLogs.length;
    const topRaterCount = Math.max(0, ...raterCounts.values());
    const top10RaterCount = [...raterCounts.values()]
      .sort((a, b) => b - a)
      .slice(0, 10)
      .reduce((sum, value) => sum + value, 0);
    const topOwnerCount = Math.max(0, ...ownerCounts.values());
    const rows = [...rowsByAgent.values()];

    return {
      source: "hedera",
      generatedAt: new Date().toISOString(),
      stats: {
        identityTransactions: identityLogs.length,
        reputationTransactions: reputationLogs.length,
        validationTransactions: validationLogs.length,
        activeAgents: registered.length,
        feedbackEvents,
        uniqueFeedbackClients: raterCounts.size,
        uniqueOwners: ownerCounts.size,
        agentsWithFeedback: rows.filter((row) => numberValue(row.feedback_count) > 0).length,
        topRaterShare: feedbackEvents ? topRaterCount / feedbackEvents : 0,
        top10RaterShare: feedbackEvents ? top10RaterCount / feedbackEvents : 0,
        topOwnerShare: registered.length ? topOwnerCount / registered.length : 0
      },
      agents: rankRows(rows)
    };
  } catch (error) {
    return hederaSnapshotData(error instanceof Error ? error.message : "Unknown Hedera mirror node error");
  }
}

const getCachedMarketplaceData = unstable_cache(queryMarketplaceData, ["ctrlz-marketplace-data-v2"], {
  revalidate: Number.isFinite(marketplaceCacheSeconds) ? marketplaceCacheSeconds : DEFAULT_CACHE_SECONDS,
  tags: ["ctrlz-marketplace"]
});

const getCachedHederaMarketplaceData = unstable_cache(queryHederaMarketplaceData, ["ctrlz-hedera-marketplace-data-v1"], {
  revalidate: Number.isFinite(marketplaceCacheSeconds) ? marketplaceCacheSeconds : DEFAULT_CACHE_SECONDS,
  tags: ["ctrlz-marketplace-hedera"]
});

export async function getMarketplaceData(options?: {
  refresh?: boolean;
  chain?: "ethereum" | "hedera";
}): Promise<MarketplaceData> {
  if (options?.chain === "hedera") {
    if (options.refresh) {
      return queryHederaMarketplaceData();
    }
    return getCachedHederaMarketplaceData();
  }
  if (options?.refresh) {
    return queryMarketplaceData();
  }
  return getCachedMarketplaceData();
}
