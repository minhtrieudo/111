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
      authenticate: (scopes: string[], onIncomplete: (p: any) => void) => Promise<{ user: { uid: string; username: string }; accessToken: string }>
    }
    SDKLite: {
      init: () => Promise<{ login: () => Promise<boolean>; state: any }>
    }
  }
}

function loadScript(url: string, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = url
    s.async = true
    const t = setTimeout(() => reject(new Error(`Timeout: ${url}`)), timeout)
    s.onload = () => { clearTimeout(t); resolve() }
    s.onerror = () => { clearTimeout(t); reject(new Error(`Failed: ${url}`)) }
    document.head.appendChild(s)
  })
}

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

      // Load cả 2 SDK song song
      await Promise.all([
        loadScript('https://sdk.minepi.com/pi-sdk.js'),
        loadScript('https://pi-apps.github.io/pi-sdk-lite/build/production/sdklite.js'),
      ])

      setAuthMessage('Đang khởi động...')
      await window.Pi.init({ version: '2.0', sandbox: false })

      // Chờ 300ms để init settle
      await new Promise(r => setTimeout(r, 300))

      setAuthMessage('Đang xác thực...')

      // Chạy song song: SDK Lite login + Pi authenticate
      const [sdkInstance, authResult] = await Promise.all([
        window.SDKLite.init(),
        window.Pi.authenticate(
          ['username'],
          (payment: any) => console.warn('[PiAuth] Incomplete payment:', payment)
        ).catch(() => null),
      ])

      const loginOk = await sdkInstance.login()
      if (!loginOk) throw new Error('SDK Lite login thất bại')
      if (!authResult?.user) throw new Error('Pi không trả về user data')

      const piUser: PiUser = {
        uid: authResult.user.uid,
        username: authResult.user.username,
      }

      setUser(piUser)
      setIsAuthenticated(true)
      setAuthMessage('Xác thực thành công!')
      console.log('[PiAuth] ✅ Logged in:', piUser.username, piUser.uid)

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
