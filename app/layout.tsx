import type { Metadata } from 'next'
import { FarmWrapper } from '@/components/farm-wrapper'
import './globals.css'

export const metadata: Metadata = {
  title: 'Làng Pi',
  description: 'Farm game on Pi Network',
    generator: 'v0.app'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head />
      <body>
        <FarmWrapper>{children}</FarmWrapper>
      </body>
    </html>
  )
}
