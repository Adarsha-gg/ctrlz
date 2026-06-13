import type { MarketplaceData } from "./types";

export const fixtureMarketplaceData: MarketplaceData = {
  source: "fixture",
  generatedAt: new Date("2026-06-13T12:10:00-04:00").toISOString(),
  stats: {
    identityTransactions: 16121,
    reputationTransactions: 2840,
    validationTransactions: 1,
    activeAgents: 49305,
    feedbackEvents: 3173,
    uniqueFeedbackClients: 42
  },
  agents: [
    {
      rank: 1,
      agentId: "34135",
      agentKey: "0x8557",
      ownerAddress: "0x6083998f73e26631d8d08f01e9927999b1969a81",
      agentUri: "https://mcp.surfliquid.com/agent.json",
      domain: "mcp.surfliquid.com",
      workKind: "commerce",
      workLabel: "Commerce",
      categoryEvidence: [
        "metadata/domain matched commerce keywords",
        "agent metadata URI: https://mcp.surfliquid.com/agent.json"
      ],
      registeredAt: "2026-06-12T14:39:59.000Z",
      history: [
        {
          kind: "feedback",
          title: "Feedback score 100/100",
          detail: "Rater 0x820c...c8cd · fixture feedback event",
          timestamp: "2026-06-13T13:44:00.000Z",
          score: 100,
          client: "0x820c5091b047b652888f6aa7e1ee615d99f7c8cd"
        },
        {
          kind: "feedback",
          title: "Feedback score 100/100",
          detail: "Rater 0x7517...3d0b · fixture feedback event",
          timestamp: "2026-06-12T21:12:00.000Z",
          score: 100,
          client: "0x7517000000000000000000000000000000003d0b"
        },
        {
          kind: "metadata",
          title: "Category inference",
          detail: "metadata/domain matched commerce keywords; agent metadata URI: https://mcp.surfliquid.com/agent.json",
          timestamp: "2026-06-12T14:39:59.000Z"
        }
      ],
      feedbackCount: 37,
      uniqueClients: 12,
      averageScore: 100,
      weightedFeedback: 7.83,
      largestRaterVolume: 2,
      maxPairRepeats: 2,
      feedbackSpanHours: 199,
      identitySignals: 9,
      validationCount: 0,
      trustScore: 88,
      risk: "trusted",
      action: "auto-hire"
    },
    {
      rank: 2,
      agentId: "34547",
      agentKey: "0x86f3",
      ownerAddress: "0xde152afb7db5373f34876e1499fbd893a82dd336",
      agentUri: "https://exquisites.es/.well-known/agent-card/4345.json",
      domain: "exquisites.es",
      workKind: "general",
      workLabel: "General",
      categoryEvidence: [
        "no strong metadata keyword",
        "agent metadata URI: https://exquisites.es/.well-known/agent-card/4345.json"
      ],
      registeredAt: "2026-06-13T14:57:23.000Z",
      history: [
        {
          kind: "metadata",
          title: "Category inference",
          detail: "no strong metadata keyword; agent metadata URI: https://exquisites.es/.well-known/agent-card/4345.json",
          timestamp: "2026-06-13T14:57:23.000Z"
        },
        {
          kind: "identity",
          title: "Agent registered",
          detail: "exquisites.es · category currently inferred as General",
          timestamp: "2026-06-13T14:57:23.000Z"
        }
      ],
      feedbackCount: 0,
      uniqueClients: 0,
      averageScore: null,
      weightedFeedback: 0,
      largestRaterVolume: 0,
      maxPairRepeats: 0,
      feedbackSpanHours: 0,
      identitySignals: 5,
      validationCount: 0,
      trustScore: 42,
      risk: "thin",
      action: "strict-validation"
    },
    {
      rank: 3,
      agentId: "34534",
      agentKey: "0x86e6",
      ownerAddress: "0xde152afb7db5373f34876e1499fbd893a82dd336",
      agentUri: "https://exquisites.es/.well-known/agent-card/7509.json",
      domain: "exquisites.es",
      workKind: "general",
      workLabel: "General",
      categoryEvidence: [
        "no strong metadata keyword",
        "agent metadata URI: https://exquisites.es/.well-known/agent-card/7509.json"
      ],
      registeredAt: "2026-06-13T14:57:23.000Z",
      history: [
        {
          kind: "metadata",
          title: "Category inference",
          detail: "no strong metadata keyword; agent metadata URI: https://exquisites.es/.well-known/agent-card/7509.json",
          timestamp: "2026-06-13T14:57:23.000Z"
        },
        {
          kind: "identity",
          title: "Agent registered",
          detail: "exquisites.es · category currently inferred as General",
          timestamp: "2026-06-13T14:57:23.000Z"
        }
      ],
      feedbackCount: 0,
      uniqueClients: 0,
      averageScore: null,
      weightedFeedback: 0,
      largestRaterVolume: 0,
      maxPairRepeats: 0,
      feedbackSpanHours: 0,
      identitySignals: 3,
      validationCount: 0,
      trustScore: 36,
      risk: "thin",
      action: "strict-validation"
    }
  ]
};
