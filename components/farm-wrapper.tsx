'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { PiAuthProvider, usePiAuth } from '@/contexts/pi-auth-context'

// ── Màn loading / lỗi hiện trước khi game render ──
function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, authMessage, hasError, reinitialize } = usePiAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  if (isAuthenticated) return <>{children}</>

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center"
         style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 50%,#1a0533 100%)' }}>
      <style>{`
        @keyframes piFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes dot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
      `}</style>

      <div style={{ fontSize: 64, animation: 'piFloat 2s ease-in-out infinite', marginBottom: 16,
                    filter: 'drop-shadow(0 0 20px rgba(168,85,247,0.9))',
                    background: 'linear-gradient(180deg,#f0d0ff,#c084fc,#9333ea)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        π
      </div>

      <div className="text-white text-xl font-black mb-2"
           style={{ fontFamily: 'system-ui', letterSpacing: 1 }}>
        Làng Pi
      </div>

      <div className="text-purple-300 text-sm text-center mb-6 px-8 leading-relaxed">
        {authMessage}
      </div>

      {!hasError ? (
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2.5 h-2.5 rounded-full bg-purple-400"
                 style={{ animation: `dot 1.4s ease-in-out ${i * 0.16}s infinite` }} />
          ))}
        </div>
      ) : (
        <button onClick={reinitialize}
                className="bg-purple-600 text-white font-black px-8 py-3 rounded-xl mt-2"
                style={{ boxShadow: '0 4px 0 #4a1080' }}>
          🔄 Thử lại
        </button>
      )}
    </div>
  )
}

export function FarmWrapper({ children }: { children: ReactNode }) {
  return (
    <PiAuthProvider>
      <AuthGate>{children}</AuthGate>
    </PiAuthProvider>
  )
}
