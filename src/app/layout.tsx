import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./styles.css";
import ThemeProvider from "../design-system/theme-provider";
import {themeInitScript} from "../design-system/theme-preference";
import PwaLifecycle from "../components/pwa-lifecycle";

export const metadata: Metadata = {
  metadataBase: new URL("https://bitcoinwalk.org"),
  title: "BitcoinWalk",
  description: "Find or start a weekly BitcoinWalk.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{url: "/brand/bitcoinwalk-favicon.png", type: "image/png", sizes: "192x192"}],
    shortcut: "/brand/bitcoinwalk-favicon.png",
    apple: [{url: "/brand/bitcoinwalk-favicon.png", type: "image/png", sizes: "192x192"}],
  },
};

export const viewport:Viewport={themeColor:"#f7931a",colorScheme:"light dark",width:"device-width",initialScale:1,viewportFit:"cover"};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-bw-theme="system" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:themeInitScript}}/></head>
      <body><ThemeProvider><PwaLifecycle/>{children}</ThemeProvider></body>
    </html>
  );
}
