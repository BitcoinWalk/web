import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bitcoinwalk.org"),
  title: "BitcoinWalk",
  description: "Find or start a weekly BitcoinWalk.",
  icons: {
    icon: [{url: "/brand/bitcoinwalk-favicon.png", type: "image/png", sizes: "192x192"}],
    shortcut: "/brand/bitcoinwalk-favicon.png",
    apple: [{url: "/brand/bitcoinwalk-favicon.png", type: "image/png", sizes: "192x192"}],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
