import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating dev-tools indicator (bottom-left in dev mode).
  devIndicators: false,
  // Self-contained server in .next/standalone so Electron can embed the Next
  // server at package time (like flow). Only affects `next build`, not dev.
  output: "standalone",
  // No CDN in front of this app (it runs locally / inside the desktop shell),
  // so skip Next's image optimizer and the sharp dependency.
  images: { unoptimized: true },
};

export default nextConfig;
