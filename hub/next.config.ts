import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Packaged build: the whole hub is a client-side SPA, so we static-export it
  // (`next build` → `out/`). The Electron shell serves `out/` from a tiny
  // embedded HTTP server in production; in dev it still loads `next dev`.
  output: 'export',
  images: { unoptimized: true },
}

export default nextConfig
