import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // `tsc --noEmit` runs first in the build script. This avoids a Node 26 child-process
  // incompatibility with Next's duplicate TypeScript configuration probe.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
