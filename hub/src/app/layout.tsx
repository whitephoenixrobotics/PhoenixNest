import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PhoenixNest',
  description: 'Phoenix Nest — AI ecosystem hub',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
