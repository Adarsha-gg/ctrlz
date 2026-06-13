import { TerminalHeader } from "@/app/components/TerminalHeader";
import { PaymentDemo } from "./PaymentDemo";

export const metadata = {
  title: "CTRL+Z - Buyer Payment Demo"
};

export type BuyerQuery = {
  agent?: string;
  agentId?: string;
  policy?: string;
  kind?: string;
  score?: string;
  domain?: string;
  owner?: string;
  workLabel?: string;
};

export default async function BuyerPage({
  searchParams
}: {
  searchParams?: Promise<BuyerQuery>;
}) {
  const query = (await searchParams) ?? {};

  return (
    <main className="terminal-app">
      <TerminalHeader active="buyer" />
      <PaymentDemo query={query} />
    </main>
  );
}
