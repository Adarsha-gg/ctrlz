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

export default async function ProofPage() {
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
