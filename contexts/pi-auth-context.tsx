'use client'

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface PiUser {
  uid: string
  username: string
}

interface PiAuthContextType {
  isAuthenticated: boolean
  user: PiUser | null
  authMessage: string
  hasError: boolean
  reinitialize: () => Promise<void>
}

const PiAuthContext = createContext<PiAuthContextType | undefined>(undefined)

declare global {
  interface Window {
    Pi: {
      init: (opts: { version: string; sandbox?: boolean }) => void
      authenticate: (scopes: string[], onIncompletePayment: (p: any) => void) => Promise<{ user: { uid: string; username: string }; accessToken: string }>
    }
  }
}

const loadPiSDK = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof window.Pi !== 'undefined') { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://sdk.minepi.com/pi-sdk.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Không tải được Pi SDK'))
    document.head.appendChild(script)
  })

export function PiAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<PiUser | null>(null)
  const [authMessage, setAuthMessage] = useState('Đang kết nối Pi Network...')
  const [hasError, setHasError] = useState(false)

  const initialize = async () => {
    setHasError(false)
    setIsAuthenticated(false)
    setUser(null)

    try {
      setAuthMessage('Đang tải Pi SDK...')
      await loadPiSDK()

      setAuthMessage('Đang khởi động...')
      window.Pi.init({ version: '2.0', sandbox: false })

      setAuthMessage('Đang xác thực tài khoản Pi...')
      const auth = await window.Pi.authenticate(
        ['username'],
        (payment: any) => { console.warn('[PiAuth] Incomplete payment:', payment) }
      )

      if (!auth?.user) throw new Error('Không nhận được thông tin user từ Pi')

      setUser({ uid: auth.user.uid, username: auth.user.username })
      setIsAuthenticated(true)
      setAuthMessage('Xác thực thành công!')
      console.log('[PiAuth] ✅ Logged in:', auth.user.username)

    } catch (err) {
      console.error('[PiAuth] ❌', err)
      setHasError(true)
      setAuthMessage(err instanceof Error ? err.message : 'Xác thực thất bại')
    }
  }

  useEffect(() => { initialize() }, [])

  return (
    <PiAuthContext.Provider value={{ isAuthenticated, user, authMessage, hasError, reinitialize: initialize }}>
      {children}
    </PiAuthContext.Provider>
  )
}

export function usePiAuth() {
  const ctx = useContext(PiAuthContext)
  if (!ctx) throw new Error('usePiAuth must be used within PiAuthProvider')
  return ctx
}
