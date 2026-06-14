import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The Electron shell loads the dev server (http://localhost:3000) in dev.
  // Packaging to a static export comes in a later phase.
  reactStrictMode: true,
}

export default nextConfig
