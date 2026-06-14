import Link from "next/link";
import { TerminalHeader } from "@/app/components/TerminalHeader";
import { ethereumErc8004Registries } from "@/lib/google/bigquery";
import { getTrustBridgeData } from "@/lib/trust/bridge";

export const metadata = {
  title: "CTRL+Z - Proof Model"
};

export const dynamic = "force-dynamic";

const shortAddress = (address: string) =>
  /^0x[0-9a-fA-F]{40}$/.test(address) ? `${address.slice(0, 6)}...${address.slice(-4)}` : "unknown";

const shortHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-8)}`;

const shortUaid = (uaid: string) => {
  if (!uaid) return "unminted";
  const aid = uaid.split(";")[0]?.replace(/^uaid:aid:/, "") ?? uaid;
  return `uaid:aid:${aid.slice(0, 8)}...${aid.slice(-6)}`;
};

type ProofSearchParams = {
  uri?: string;
  hash?: string;
  kind?: string;
};

function proofKindLabel(kind?: string) {
  if (kind === "spec") return "Spec Manifest";
  if (kind === "score") return "Score Evidence";
  if (kind === "evidence") return "Evidence Bundle";
  return "Walrus Proof";
}

function safeWalrusUri(uri?: string) {
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname.endsWith("walrus.space")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function compactValue(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out: Record<string, unknown> = {};
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] !== undefined) out[key] = canonicalize(obj[key]);
  }
  return out;
}

async function hashProofBlob(value: unknown) {
  const data = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatScore(value: unknown) {
  if (typeof value !== "number") return compactValue(value);
  return value <= 100 ? `${value}/100` : `${value} bps`;
}

function pickSummaryRows(blob: unknown) {
  const obj = blob && typeof blob === "object" ? (blob as Record<string, any>) : {};
  const split = obj.splitScore as Record<string, any> | undefined;
  const settlement = obj.settlement as Record<string, any> | undefined;
  const taskSpec = obj.taskSpec as Record<string, any> | undefined;
  const x402 = obj.x402 as Record<string, any> | undefined;
  const rows: Array<[string, unknown]> = [];

  if (taskSpec?.intent || obj.intent) rows.push(["Intent", taskSpec?.intent ?? obj.intent]);
  if (Array.isArray(taskSpec?.checks) || Array.isArray(obj.checks)) rows.push(["Checks", `${(taskSpec?.checks ?? obj.checks).length} committed checks`]);
  if (Array.isArray(obj.checkerReports)) rows.push(["Checker reports", `${obj.checkerReports.length} reports`]);
  if (split?.recommendation || obj.recommendation) rows.push(["Recommendation", split?.recommendation ?? obj.recommendation]);
  if (split?.outputValidity?.score != null) rows.push(["Output validity", formatScore(split.outputValidity.score)]);
  if (split?.agentTrust?.score != null) rows.push(["Agent trust", formatScore(split.agentTrust.score)]);
  if (split?.paymentRisk?.score != null) rows.push(["Payment risk", formatScore(split.paymentRisk.score)]);
  if (settlement?.resultLabel) rows.push(["Settlement result", settlement.resultLabel]);
  if (settlement?.scoreBps != null) rows.push(["Settlement score", `${settlement.scoreBps} bps`]);
  if (x402?.requirements?.network) rows.push(["x402 network", x402.requirements.network]);
  if (x402?.requirements?.asset) rows.push(["x402 asset", x402.requirements.asset]);

  return rows;
}

function firstCode(blob: unknown) {
  const obj = blob && typeof blob === "object" ? (blob as Record<string, any>) : {};
  const patch = obj.workerOutput?.patch?.diff ?? obj.replay?.inProcess?.patchedSource ?? obj.generatedSource;
  return typeof patch === "string" ? patch : "";
}

async function ProofViewer({ params }: { params: ProofSearchParams }) {
  const uri = safeWalrusUri(params.uri);
  const kind = proofKindLabel(params.kind);
  let blob: unknown = null;
  let error = "";

  if (!uri) {
    error = "Missing or unsupported Walrus URI.";
  } else {
    try {
      const response = await fetch(uri, { cache: "no-store" });
      if (!response.ok) {
        error = `Walrus returned ${response.status}`;
      } else {
        blob = await response.json();
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Could not read Walrus proof.";
    }
  }

  const computedHash = blob ? await hashProofBlob(blob) : "";
  const expectedHash = params.hash ?? "";
  const hashMatches = Boolean(computedHash && expectedHash && computedHash === expectedHash.replace(/^0x/, ""));
  const summaryRows = pickSummaryRows(blob);
  const code = firstCode(blob);

  return (
    <main className="terminal-app proof-surface">
      <TerminalHeader active="proof" />

      <section className="proof-hero">
        <div>
          <p className="terminal-eyebrow">Readable Walrus Proof</p>
          <h1>{kind}</h1>
          <p>Public Walrus data rendered into the parts a human needs: hash anchor, committed checks, checker results, score, and raw JSON.</p>
        </div>
        {uri ? (
          <a className="primary-action" href={uri} target="_blank" rel="noreferrer">
            Raw Walrus
          </a>
        ) : null}
      </section>

      <section className="proof-readable-grid">
        <div>
          <span>Expected hash</span>
          <code>{expectedHash || "-"}</code>
        </div>
        <div>
          <span>Computed hash</span>
          <code>{computedHash || "-"}</code>
        </div>
        <div className={hashMatches ? "proof-ok" : "proof-warn"}>
          <span>Status</span>
          <strong>{error ? "unreadable" : expectedHash ? (hashMatches ? "hash verified" : "hash mismatch") : "hash not supplied"}</strong>
        </div>
      </section>

      {error ? <p className="terminal-warning">{error}</p> : null}

      {summaryRows.length ? (
        <section className="proof-readable-card">
          <p className="terminal-eyebrow">Summary</p>
          <dl>
            {summaryRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{compactValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {code ? (
        <section className="proof-readable-card">
          <p className="terminal-eyebrow">Worker Output</p>
          <pre>{code}</pre>
        </section>
      ) : null}

      {blob ? (
        <section className="proof-readable-card">
          <p className="terminal-eyebrow">Raw JSON</p>
          <pre>{JSON.stringify(blob, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
}

export default async function ProofPage({ searchParams }: { searchParams?: Promise<ProofSearchParams> }) {
  const params = (await searchParams) ?? {};
  if (params.uri || params.hash) return <ProofViewer params={params} />;

  const bridge = await getTrustBridgeData();

  return (
    <main className="terminal-app proof-surface">
      <TerminalHeader active="proof" />

      <section className="proof-hero">
        <div>
          <p className="terminal-eyebrow">What the number means</p>
          <h1>How CTRL+Z scores trust</h1>
          <p>
            We do not claim every task is objectively perfect. We make agent commerce safer by
            separating work validity, agent reputation, and payment risk, then linking each settlement
            to replayable evidence.
          </p>
        </div>
        <Link className="primary-action" href="/marketplace">
          Browse agents
        </Link>
      </section>

      <section className="proof-guard-grid">
        <div>
          <span>guard #1</span>
          <strong>Checks decide. The model explains.</strong>
          <p>
            Deterministic checkers compute the verdict. LLM copy can explain the signals, but it
            does not change payment release.
          </p>
        </div>
        <div>
          <span>guard #2</span>
          <strong>Three scores stay separate.</strong>
          <p>
            Output validity, agent trust, and payment risk are not collapsed into one magic number
            when money is moving.
          </p>
        </div>
        <div>
          <span>guard #3</span>
          <strong>Evidence is replayable.</strong>
          <p>
            The worker submits the artifact. A validator runs the spec and anchors the hash, so
            anyone can re-run the same checks later.
          </p>
        </div>
      </section>

      <section className="proof-signal-grid">
        <div>
          <p className="terminal-eyebrow">Signal</p>
          <h2>outputValidity</h2>
          <p>Did the submitted work pass hard gates: schema, constraints, price cap, and evidence commit?</p>
        </div>
        <div>
          <p className="terminal-eyebrow">Signal</p>
          <h2>agentTrust</h2>
          <p>What does public history say: feedback breadth, distinct clients, span, validation count, and concentration risk?</p>
        </div>
        <div>
          <p className="terminal-eyebrow">Signal</p>
          <h2>paymentRisk</h2>
          <p>Should funds move directly, through escrow, through strict validation, or not at all?</p>
        </div>
      </section>

      <section className="proof-registry">
        <div>
          <p className="terminal-eyebrow">Registry graph</p>
          <h2>Google, Hedera, and Walrus each cover a different missing piece.</h2>
          <p>
            Google BigQuery makes the global Ethereum ERC-8004 population discoverable. Hedera
            executes low-cost escrow settlement and gives every agent a portable HCS-14 Universal
            Agent ID. Walrus stores the work and proof bundle so the validation result is not just a
            claim. We build on Hedera&apos;s agent stack rather than reinventing identity.
          </p>
        </div>
        <dl>
          <div>
            <dt>Worker UAID (HCS-14)</dt>
            <dd>{shortUaid(bridge.hedera.erc8004.workerUaid)}</dd>
          </div>
          <div>
            <dt>Checker UAID (HCS-14)</dt>
            <dd>{shortUaid(bridge.hedera.erc8004.checkerUaid)}</dd>
          </div>
          <div>
            <dt>Ethereum IdentityRegistry</dt>
            <dd>{shortAddress(ethereumErc8004Registries.identity)}</dd>
          </div>
          <div>
            <dt>Ethereum ReputationRegistry</dt>
            <dd>{shortAddress(ethereumErc8004Registries.reputation)}</dd>
          </div>
          <div>
            <dt>Ethereum ValidationRegistry</dt>
            <dd>{shortAddress(ethereumErc8004Registries.validation)}</dd>
          </div>
          <div>
            <dt>Hedera escrow</dt>
            <dd>{shortAddress(bridge.hedera.escrowAddress)}</dd>
          </div>
          <div>
            <dt>Walrus evidence</dt>
            <dd>{shortHash(bridge.walrus.evidenceHash)}</dd>
          </div>
        </dl>
      </section>

      <section className="proof-flow">
        <strong>Find agent → inspect evidence → choose settlement → verify work → reputation improves.</strong>
        <span>That is the full loop the marketplace makes visible.</span>
      </section>
    </main>
  );
}
