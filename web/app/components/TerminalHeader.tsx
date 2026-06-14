"use client";

import Link from "next/link";

type ActiveSurface = "marketplace" | "verify" | "buyer" | "cli" | "proof";

const navItems: Array<{ key: ActiveSurface; label: string; href: string }> = [
  { key: "marketplace", label: "Marketplace", href: "/marketplace" },
  { key: "verify", label: "Verify", href: "/verify" },
  { key: "buyer", label: "Buyer Demo", href: "/buyer" },
  { key: "cli", label: "Agent CLI", href: "/cli" },
  { key: "proof", label: "Proof", href: "/proof" }
];

export function TerminalHeader({ active }: { active: ActiveSurface }) {
  return (
    <header className="terminal-header">
      <Link className="terminal-brand" href="/marketplace" aria-label="CTRL+Z marketplace">
        <span>
          CTRL<span>+Z</span>
        </span>
        <small>agent trust marketplace</small>
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
