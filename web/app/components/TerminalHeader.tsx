"use client";

import Link from "next/link";

type ActiveSurface = "marketplace" | "verify" | "buyer" | "proof";

const navItems: Array<{ key: ActiveSurface; label: string; href: string }> = [
  { key: "marketplace", label: "Marketplace", href: "/marketplace" },
  { key: "verify", label: "Verify", href: "/verify" },
  { key: "buyer", label: "Buyer Demo", href: "/buyer" },
  { key: "proof", label: "Docs/Proof", href: "/marketplace#proof" }
];

export function TerminalHeader({ active }: { active: ActiveSurface }) {
  return (
    <header className="terminal-header">
      <Link className="terminal-brand" href="/marketplace" aria-label="CTRL+Z marketplace">
        <span>CTRL+Z</span>
        <small>agent trust terminal</small>
      </Link>
      <nav className="terminal-nav" aria-label="Primary">
        {navItems.map((item) => (
          <Link
            key={item.key}
            className={item.key === active ? "active" : ""}
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="terminal-status" aria-label="Demo buyer status">
        <span>buyer 0x9f4c...21a3</span>
        <strong>12,480 USDC</strong>
      </div>
    </header>
  );
}
