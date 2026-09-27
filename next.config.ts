import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the native Sharp package name intact in the standalone server. Without
  // this, Turbopack can emit a hashed external name that Node cannot resolve.
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
  // Type checking runs before `next build`. This avoids a Node 26 child-process
  // incompatibility with Next's duplicate TypeScript configuration probe.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
