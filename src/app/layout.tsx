import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";

export const metadata: Metadata = {
  title: "BitcoinWalk",
  description: "Find or start a weekly BitcoinWalk.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<footer className="site-footer"><small>Weather data: <a href="https://open-meteo.com/" rel="noreferrer">Open-Meteo</a>, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" rel="noreferrer">CC BY 4.0</a>. Values are selected and rounded by BitcoinWalk.</small></footer></body>
    </html>
  );
}
