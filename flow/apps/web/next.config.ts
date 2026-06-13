import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Hide the floating "N" dev tools indicator (bottom-left in dev mode)
  devIndicators: false,
  // Produce a self-contained server in .next/standalone for Electron packaging.
  output: 'standalone',
  // pnpm hoists deps to the repo root, so without this Next's file tracing
  // would miss transitive deps (@swc/helpers, @next/env). Pointing the trace
  // root at the workspace root makes the standalone include everything.
  // (The post-build script then replaces the symlinked tree with a flat one.)
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // The standalone build is consumed by Electron, not deployed behind a CDN,
  // so we don't need Next's image optimizer (and disabling it skips sharp).
  images: { unoptimized: true },
};

export default nextConfig;
