import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CTRL+Z",
  description: "Hedera-native verification, settlement, and reputation for agent work"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
