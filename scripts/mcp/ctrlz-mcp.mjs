#!/usr/bin/env node

import { randomUUID } from "node:crypto";

const DEFAULT_BASE_URL = "https://ctrlz-zeta.vercel.app";
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "ctrlz-mcp";
const SERVER_VERSION = "0.1.0";
const REQUEST_TIMEOUT_MS = Number(process.env.CTRLZ_MCP_TIMEOUT_MS ?? 120000);
const VERCEL_BYPASS_TOKEN = process.env.CTRLZ_VERCEL_BYPASS_TOKEN ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
const TRUSTED_DIRECT_X402_THRESHOLD = Number(process.env.TRUSTED_DIRECT_X402_THRESHOLD ?? 80);

let useContentLengthFraming = false;
let inputBuffer = Buffer.alloc(0);

const baseUrl = normalizeBaseUrl(
  process.env.CTRLZ_API_BASE ??
    vercelUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    vercelUrl(process.env.VERCEL_URL) ??
    DEFAULT_BASE_URL
);

const tools = [
  {
    name: "ctrlz_list_agents",
    description:
      "Return CTRL+Z ranked agents from the backend marketplace API. Use this before hiring when an autonomous buyer agent needs candidates.",
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          enum: ["ethereum", "hedera"],
          description: "Marketplace index to query.",
          default: "ethereum"
        },
        workKind: {
          type: "string",
          description: "Optional work kind filter, for example developer, data, finance, payments, commerce, research."
        },
        minTrust: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Minimum trust score."
        },
        status: {
          type: "string",
          enum: ["available", "busy", "all"],
          default: "available"
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 10
        },
        refresh: {
          type: "boolean",
          default: false,
          description: "Force the backend to refresh the marketplace index when supported."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "ctrlz_get_agent_identities",
    description: "Resolve CTRL+Z worker and checker HCS-14 universal agent IDs from the backend.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "ctrlz_hire_agent",
    description:
      "Hire a selected agent and run the pay-on-green verification flow without opening the dashboard. Can run the live LLM worker or deterministic green/cheat demos.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent id from ctrlz_list_agents. If omitted, the highest-ranked available agent is used."
        },
        mode: {
          type: "string",
          enum: ["llm", "green", "cheat"],
          default: "llm",
          description:
            "llm calls /api/agent/solve. green and cheat call /verify/payongreen demo modes for deterministic verification."
        },
        chain: {
          type: "string",
          enum: ["ethereum", "hedera"],
          default: "ethereum"
        },
        settle: {
          type: "boolean",
          default: false,
          description: "When true, call /verify/settle for escrow-routed agents after a settle-ready verification result."
        },
        paymentPolicy: {
          type: "string",
          enum: ["auto", "direct-x402", "escrow"],
          default: "auto",
          description:
            "auto uses Hedera direct x402 for trusted x402-capable agents and Hedera escrow for the rest."
        },
        trustedDirectThreshold: {
          type: "number",
          minimum: 0,
          maximum: 100,
          default: 80,
          description: "Minimum trust score for auto direct x402."
        },
        writeValidation: {
          type: "boolean",
          default: true,
          description: "Request an ERC-8004 validation write/prepared payload for pay-on-green demo modes."
        },
        paymentHeader: {
          type: "string",
          description:
            "Optional base64 x402 PAYMENT-SIGNATURE override. If omitted, the MCP server negotiates from PAYMENT-REQUIRED and retries."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "ctrlz_pay_on_green",
    description:
      "Run the deterministic pay-on-green demo path directly. Use green to model valid work and cheat to model a worker that fails held-out tests.",
    inputSchema: {
      type: "object",
      properties: {
        demo: {
          type: "string",
          enum: ["green", "cheat"],
          default: "green"
        },
        agentId: {
          type: "string",
          default: "101"
        },
        recipientName: {
          type: "string",
          default: "mcp-worker"
        },
        settle: {
          type: "boolean",
          default: false
        },
        writeValidation: {
          type: "boolean",
          default: true
        },
        paymentHeader: {
          type: "string"
        }
      },
      required: ["demo"],
      additionalProperties: false
    }
  },
  {
    name: "ctrlz_settle_verification",
    description:
      "Settle an already verified CTRL+Z task on Hedera using hashes returned by ctrlz_hire_agent or ctrlz_pay_on_green.",
    inputSchema: {
      type: "object",
      properties: {
        specHash: {
          type: "string",
          description: "32-byte hex hash with or without 0x."
        },
        evidenceHash: {
          type: "string",
          description: "32-byte hex hash with or without 0x."
        },
        recommendationHash: {
          type: "string",
          description: "32-byte hex hash with or without 0x."
        },
        result: {
          type: "string",
          enum: ["PASS", "FAIL", "UNCERTAIN"]
        },
        scoreBps: {
          type: "integer",
          minimum: 0,
          maximum: 10000
        }
      },
      required: ["specHash", "evidenceHash", "recommendationHash", "result", "scoreBps"],
      additionalProperties: false
    }
  },
  {
    name: "ctrlz_backend_status",
    description: "Check whether the CTRL+Z backend is reachable and whether Hedera settlement is configured.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  for (const message of readMessages()) {
    void handleMessage(message);
  }
});

process.stdin.resume();

function readMessages() {
  const messages = [];

  while (inputBuffer.length > 0) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const header = inputBuffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) break;
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (inputBuffer.length < bodyEnd) break;
      useContentLengthFraming = true;
      messages.push(parseMessage(inputBuffer.slice(bodyStart, bodyEnd).toString("utf8")));
      inputBuffer = inputBuffer.slice(bodyEnd);
      continue;
    }

    const newline = inputBuffer.indexOf("\n");
    if (newline === -1) break;
    const line = inputBuffer.slice(0, newline).toString("utf8").trim();
    inputBuffer = inputBuffer.slice(newline + 1);
    if (line) messages.push(parseMessage(line));
  }

  return messages.filter(Boolean);
}

function parseMessage(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: error instanceof Error ? error.message : "Parse error"
      }
    });
    return null;
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") return;

  const { id, method, params } = message;
  if (!method || id === undefined) {
    if (method === "notifications/initialized" || method?.startsWith("notifications/")) return;
    return;
  }

  try {
    if (method === "initialize") {
      sendResult(id, {
        protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      });
      return;
    }

    if (method === "ping") {
      sendResult(id, {});
      return;
    }

    if (method === "tools/list") {
      sendResult(id, { tools });
      return;
    }

    if (method === "resources/list") {
      sendResult(id, { resources: [] });
      return;
    }

    if (method === "prompts/list") {
      sendResult(id, { prompts: [] });
      return;
    }

    if (method === "tools/call") {
      const result = await callTool(params?.name, params?.arguments ?? {});
      sendResult(id, toolResponse(result));
      return;
    }

    sendError(id, -32601, `Method not found: ${method}`);
  } catch (error) {
    sendError(id, -32000, error instanceof Error ? error.message : "Tool execution failed");
  }
}

async function callTool(name, args) {
  switch (name) {
    case "ctrlz_list_agents":
      return listAgents(args);
    case "ctrlz_get_agent_identities":
      return apiGet("/api/agents/identity");
    case "ctrlz_hire_agent":
      return hireAgent(args);
    case "ctrlz_pay_on_green":
      return payOnGreen(args);
    case "ctrlz_settle_verification":
      return settleVerification(args);
    case "ctrlz_backend_status":
      return backendStatus();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function listAgents(args = {}) {
  const chain = args.chain === "hedera" ? "hedera" : "ethereum";
  const limit = clampInteger(args.limit, 10, 1, 50);
  const params = new URLSearchParams({ chain });
  if (args.refresh === true) params.set("refresh", "1");

  const data = await apiGet(`/api/marketplace/agents?${params}`);
  const minTrust = typeof args.minTrust === "number" ? args.minTrust : 0;
  const status = args.status ?? "available";
  const workKind = typeof args.workKind === "string" ? args.workKind : "";

  const agents = (data.agents ?? [])
    .filter((agent) => !workKind || agent.workKind === workKind)
    .filter((agent) => agent.trustScore >= minTrust)
    .filter((agent) => status === "all" || agent.status === status)
    .slice(0, limit)
    .map(summarizeAgent);

  return {
    baseUrl,
    source: data.source,
    generatedAt: data.generatedAt,
    error: data.error,
    returned: agents.length,
    agents
  };
}

async function hireAgent(args = {}) {
  const chain = args.chain === "hedera" ? "hedera" : "ethereum";
  const mode = ["llm", "green", "cheat"].includes(args.mode) ? args.mode : "llm";
  const marketplace = await tryListAgents({ chain, status: "available", limit: 50 });
  const agent = args.agentId
    ? marketplace.agents.find((candidate) => candidate.id === args.agentId) ?? builtInAgent(args.agentId)
    : marketplace.agents[0] ?? builtInAgent("ctrlz-worker-agent-101");

  if (!agent) {
    throw new Error(args.agentId ? `No available agent found with id ${args.agentId}` : "No available agent found");
  }

  const threshold =
    typeof args.trustedDirectThreshold === "number" ? args.trustedDirectThreshold : TRUSTED_DIRECT_X402_THRESHOLD;
  const paymentPolicy = choosePaymentPolicy(agent, args.paymentPolicy ?? "auto", threshold);
  const run =
    mode === "llm"
      ? await runLlmWorker(args.paymentHeader)
      : await runPayOnGreenDemo({
          demo: mode,
          agentId: agent.id,
          agent,
          paymentPolicy,
          recipientName: agent.name,
          writeValidation: args.writeValidation !== false,
          paymentHeader: args.paymentHeader
        });

  const settlement =
    args.settle === true && paymentPolicy !== "direct-x402"
      ? await settleFromRun(run)
      : directSettlementReceipt(run, paymentPolicy);
  return {
    baseUrl,
    hired: agent,
    mode,
    paymentPolicy,
    verification: summarizeVerification(run),
    settlement
  };
}

function choosePaymentPolicy(agent, requested, threshold) {
  if (requested === "direct-x402") return "direct-x402";
  if (requested === "escrow") return "escrow";
  return agent.trustScore >= threshold && agent.x402Support ? "direct-x402" : "escrow";
}

function directSettlementReceipt(run, paymentPolicy) {
  if (paymentPolicy !== "direct-x402") return null;
  return {
    mode: "direct-x402",
    chain: run.paymentPolicy?.network ?? "eip155:296",
    asset: run.paymentPolicy?.asset ?? "HBAR",
    payTo: run.paymentPolicy?.payTo,
    receipt: run.x402?.receipt ?? null,
    note: "Trusted agent paid through x402 V2 with Hedera testnet settlement; escrow settlement skipped."
  };
}

async function tryListAgents(args) {
  try {
    return await listAgents(args);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "could not list agents",
      agents: []
    };
  }
}

function builtInAgent(agentId) {
  if (agentId !== "ctrlz-worker-agent-101" && agentId !== "101") return null;
  return {
    id: "ctrlz-worker-agent-101",
    rank: 0,
    name: "CTRL+Z Worker Agent",
    handle: "@ctrlz.worker",
    workKind: "developer",
    workLabel: "Developer",
    trustScore: 99,
    feedbackCount: 1,
    uniqueClients: 1,
    validationCount: 1,
    action: "auto-hire",
    risk: "validated",
    status: "available",
    x402Support: true,
    address: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    detailHref: "/marketplace?chain=hedera&q=CTRL%2BZ",
    tags: ["Developer", "validated", "x402"],
    note: "Built-in CTRL+Z worker fallback used when the deployed marketplace agent API is unavailable."
  };
}

async function payOnGreen(args = {}) {
  const demo = args.demo === "cheat" ? "cheat" : "green";
  const run = await runPayOnGreenDemo({
    demo,
    agentId: args.agentId ?? "101",
    recipientName: args.recipientName ?? "mcp-worker",
    writeValidation: args.writeValidation !== false,
    paymentHeader: args.paymentHeader
  });
  const settlement = args.settle === true ? await settleFromRun(run) : null;
  return {
    baseUrl,
    mode: demo,
    verification: summarizeVerification(run),
    settlement
  };
}

async function runLlmWorker(paymentHeader) {
  return apiPost(
    "/api/agent/solve",
    {},
    paymentHeaders(paymentHeader)
  );
}

async function runPayOnGreenDemo({ demo, agentId, agent, paymentPolicy, recipientName, writeValidation, paymentHeader }) {
  return apiPost(
    "/verify/payongreen",
    {
      demo,
      agentId,
      recipientAddress: agent?.address,
      recipientTrustScore: agent?.trustScore,
      recipientX402Support: agent?.x402Support,
      paymentPolicy,
      recipientName,
      writeValidation
    },
    paymentHeaders(paymentHeader)
  );
}

async function settleFromRun(run) {
  const settlement = run?.settlement;
  if (!settlement || !run.specHash || !run.evidenceHash || !settlement.recommendationHash) {
    return {
      skipped: true,
      reason: "verification result was not settle-ready"
    };
  }

  return settleVerification({
    specHash: run.specHash,
    evidenceHash: run.evidenceHash,
    recommendationHash: settlement.recommendationHash,
    result: settlement.resultLabel,
    scoreBps: settlement.scoreBps
  });
}

async function settleVerification(args = {}) {
  for (const key of ["specHash", "evidenceHash", "recommendationHash", "result", "scoreBps"]) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      throw new Error(`${key} is required`);
    }
  }

  return apiPost("/verify/settle", {
    specHash: args.specHash,
    evidenceHash: args.evidenceHash,
    recommendationHash: args.recommendationHash,
    result: args.result,
    scoreBps: args.scoreBps
  });
}

async function backendStatus() {
  const [identity, settle] = await Promise.allSettled([apiGet("/api/agents/identity"), apiGet("/verify/settle")]);
  return {
    baseUrl,
    reachable: identity.status === "fulfilled" || settle.status === "fulfilled",
    identities: settledValue(identity),
    settlement: settledValue(settle)
  };
}

async function apiGet(path) {
  return apiRequest(path, { method: "GET" });
}

async function apiPost(path, body, headers = {}) {
  return apiRequest(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function apiRequest(path, init, retryPayment = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = new URL(path, `${baseUrl}/`);
  if (VERCEL_BYPASS_TOKEN) {
    url.searchParams.set("x-vercel-protection-bypass", VERCEL_BYPASS_TOKEN);
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...vercelBypassHeaders(),
        ...(init.headers ?? {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    const data = text ? parseJsonResponse(text, url) : {};
    if (response.status === 402 && retryPayment && !hasPaymentSignature(init.headers) && canAutoPay(data, response)) {
      const paymentSignature = createPaymentSignature(data, response);
      return apiRequest(
        path,
        {
          ...init,
          headers: {
            ...(init.headers ?? {}),
            "PAYMENT-SIGNATURE": paymentSignature
          }
        },
        false
      );
    }
    if (!response.ok) {
      const reason = typeof data.error === "string" ? data.error : response.statusText;
      throw new Error(`${response.status} ${reason}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonResponse(text, url) {
  try {
    return JSON.parse(text);
  } catch {
    if (/Authentication Required|Vercel Authentication|x-vercel-protection-bypass/i.test(text)) {
      throw new Error(
        `Vercel deployment protection blocked ${url.pathname}. Set CTRLZ_VERCEL_BYPASS_TOKEN to the project's Protection Bypass for Automation token, or disable protection for this deployment.`
      );
    }
    throw new Error(`Backend returned non-JSON from ${url.pathname}`);
  }
}

function summarizeAgent(agent) {
  return {
    id: agent.id,
    rank: agent.rank,
    name: agent.name,
    handle: agent.handle,
    workKind: agent.workKind,
    workLabel: agent.workLabel,
    trustScore: agent.trustScore,
    feedbackCount: agent.feedbackCount,
    uniqueClients: agent.uniqueClients,
    validationCount: agent.validationCount,
    action: agent.action,
    risk: agent.risk,
    status: agent.status,
    x402Support: agent.x402Support,
    address: agent.address,
    detailHref: agent.detailHref,
    tags: agent.tags,
    note: agent.note
  };
}

function summarizeVerification(run) {
  return {
    error: run.error,
    task: run.task,
    verdict: run.settlement?.resultLabel,
    releases: run.settlement?.releases,
    scoreBps: run.settlement?.scoreBps,
    recommendationHash: run.settlement?.recommendationHash,
    paymentPolicy: run.paymentPolicy,
    specHash: run.specHash,
    evidenceHash: run.evidenceHash,
    evidenceStore: run.evidenceStore,
    evidenceUri: run.evidenceUri,
    x402: run.x402,
    publicTests: run.publicTests ?? run.replay?.publicTests,
    heldoutTests: run.heldoutTests ?? run.replay?.heldout?.hiddenTests,
    results: run.results ?? run.replay?.results,
    generatedSource: trimSource(run.generatedSource ?? run.replay?.inProcess?.patchedSource ?? run.replay?.inProcess?.patch),
    validation: run.validation
  };
}

function trimSource(source) {
  if (typeof source !== "string") return undefined;
  if (source.length <= 4000) return source;
  return `${source.slice(0, 4000)}\n...<truncated>`;
}

function paymentHeaders(value) {
  const signature = value ?? process.env.CTRLZ_PAYMENT_HEADER;
  return signature ? { "PAYMENT-SIGNATURE": signature, "x-payment": signature } : {};
}

function hasPaymentSignature(headers = {}) {
  return Object.keys(headers).some((key) => key.toLowerCase() === "payment-signature" || key.toLowerCase() === "x-payment");
}

function canAutoPay(data, response) {
  return Boolean(response.headers.get("payment-required") || data?.accepts?.[0] || data?.x402?.requirements);
}

function createPaymentSignature(data, response) {
  const requiredHeader = response.headers.get("payment-required");
  const decoded = requiredHeader ? decodeBase64Json(requiredHeader) : null;
  const requirement = decoded?.accepts?.[0] ?? data?.accepts?.[0] ?? data?.x402?.requirements;
  if (!requirement) {
    throw new Error("Backend returned 402 without x402 payment requirements");
  }
  const paymentIdentifier = `ctrlz-mcp:${Date.now()}:${randomUUID()}`;
  return encodeBase64Json({
    x402Version: 2,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: {
      asset: requirement.asset,
      amount: requirement.maxAmountRequired,
      payTo: requirement.payTo,
      resource: requirement.resource,
      paymentIdentifier,
      payer: process.env.CTRLZ_PAYER_ADDRESS ?? "ctrlz-mcp-agent",
      product: requirement.extra?.product ?? "ctrlz.payongreen"
    }
  });
}

function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeBase64Json(value) {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

function vercelBypassHeaders() {
  return VERCEL_BYPASS_TOKEN ? { "x-vercel-protection-bypass": VERCEL_BYPASS_TOKEN } : {};
}

function settledValue(result) {
  if (result.status === "fulfilled") return result.value;
  return { error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function vercelUrl(value) {
  if (!value) return null;
  const trimmed = String(value).trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function toolResponse(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}

function send(message) {
  const json = JSON.stringify(message);
  if (useContentLengthFraming) {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}
