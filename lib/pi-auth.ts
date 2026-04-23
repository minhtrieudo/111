export interface PiUser {
  username: string
  uid: string
}

export interface PiAuthResult {
  user: PiUser
  accessToken: string
}

declare global {
  interface Window {
    Pi: {
      init: (opts: { version: string; sandbox?: boolean }) => void
      authenticate: (
        scopes: string[],
        onIncompletePaymentFound: (payment: any) => void
      ) => Promise<PiAuthResult>
      createPayment: (data: any, callbacks: any) => Promise<any>
    }
  }
}

const IS_SANDBOX = process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'

function waitForPiSDK(timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(false); return }
    if (typeof window.Pi !== 'undefined') { resolve(true); return }
    const start = Date.now()
    const check = setInterval(() => {
      if (typeof window.Pi !== 'undefined') {
        clearInterval(check)
        resolve(true)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(check)
        resolve(false)
      }
    }, 100)
  })
}

export async function authenticateWithPi(): Promise<PiUser | null> {
  if (typeof window === 'undefined') return null

  const sdkReady = await waitForPiSDK()

  if (!sdkReady || typeof window.Pi === 'undefined') {
    console.warn('[Pi Auth] Không tìm thấy window.Pi')
    return null
  }

  try {
    window.Pi.init({ version: '2.0', sandbox: IS_SANDBOX })

    const auth = await window.Pi.authenticate(
      ['username'],
      (payment: any) => {
        console.log('[Pi Auth] Incomplete payment:', payment)
      }
    )

    console.log('[Pi Auth] ✅ OK:', auth.user.username)
    return auth.user

  } catch (err) {
    console.error('[Pi Auth] ❌ Lỗi:', err)
    return null
  }
}

export function isInPiBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return (
    navigator.userAgent.includes('PiBrowser') ||
    typeof window.Pi !== 'undefined' ||
    IS_SANDBOX
  )
}
