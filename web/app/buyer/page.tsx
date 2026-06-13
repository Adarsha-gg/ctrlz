import { VerdictCard } from "./VerdictCard";

/**
 * P6.1 — the buyer dApp's first screen. Framed as buying a used GPU from a
 * stranger on a marketplace: a static listing + a "Pay with CTRL+Z" affordance
 * that scores the seller's recipient before any money moves.
 */

export const metadata = {
  title: "CTRL+Z — Checkout"
};

export default function BuyerPage() {
  return (
    <main className="shell shell-wide">
      <section className="listing">
        <p className="eyebrow">Marketplace · used hardware</p>
        <div className="listing-body">
          <div className="listing-art" aria-hidden>
            🎮
          </div>
          <div>
            <h1 className="listing-title">NVIDIA RTX 4090 — Founders Edition</h1>
            <p className="listing-meta">Lightly used · original box · ships today</p>
            <p className="listing-price">600 USDC</p>
            <p className="listing-seller">
              Sold by an unverified marketplace seller. CTRL+Z checks the recipient
              before you pay — and lets you undo the send if something looks wrong.
            </p>
          </div>
        </div>
      </section>

      <section className="panel checkout">
        <p className="eyebrow">Checkout</p>
        <VerdictCard />
      </section>
    </main>
  );
}
