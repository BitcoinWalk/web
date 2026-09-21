import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Type checking runs before `next build`. This avoids a Node 26 child-process
  // incompatibility with Next's duplicate TypeScript configuration probe.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
