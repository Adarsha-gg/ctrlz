import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CTRL+Z",
  description: "Sender-controlled payment recall for Arc USDC payments"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
