import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Làng Pi',
  description: 'Farm game on Pi Network',
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
