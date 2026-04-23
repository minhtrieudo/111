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
      <head>
        <script src="https://sdk.minepi.com/pi-sdk.js" async></script>
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}