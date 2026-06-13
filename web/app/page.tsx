import { ctrlzEscrowAddress } from "@/lib/contract";
import { supportsWebHid } from "@/lib/ledger/environment";

export default function Home() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">CTRL+Z</p>
        <h1>Protected payments on Arc</h1>
        <dl>
          <div>
            <dt>Escrow</dt>
            <dd>{ctrlzEscrowAddress ?? "not deployed"}</dd>
          </div>
          <div>
            <dt>Ledger path</dt>
            <dd>{supportsWebHid() ? "available" : "browser unsupported"}</dd>
          </div>
        </dl>
        <p style={{ marginTop: 24 }}>
          <a href="/buyer">Open the buyer checkout demo →</a>
        </p>
      </section>
    </main>
  );
}
