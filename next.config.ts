import type { NextConfig } from "next";
import {execFileSync} from "node:child_process";

const nextConfig: NextConfig = {
  output: "standalone",
  generateBuildId: async () => execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
  // Keep the native Sharp package name intact in the standalone server. Without
  // this, Turbopack can emit a hashed external name that Node cannot resolve.
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
  async headers(){return [{source:"/sw.js",headers:[{key:"Cache-Control",value:"no-cache, no-store, must-revalidate"},{key:"Service-Worker-Allowed",value:"/"},{key:"X-Content-Type-Options",value:"nosniff"}]}];},
  async redirects() {
    const dashboard = ["/sponsor/logo", "/admin/sponsors/payments", "/admin/sponsors/upload", "/admin/sponsors/logos"].map(source => ({
      source, destination: "/admin/sponsor", permanent: false,
    }));
    const community = ["/join", "/join-chat"].map(source => ({
      source,
      destination: "https://armada.buzz/s/chat.bitcoinwalk.org/13bc3a423b4f2954",
      permanent: true,
    }));
    return [...dashboard, ...community];
  },
  // Type checking runs before `next build`. This avoids a Node 26 child-process
  // incompatibility with Next's duplicate TypeScript configuration probe.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
