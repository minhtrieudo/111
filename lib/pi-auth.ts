// ─── Pi Network Authentication ────────────────────────────────────────────
// Tài liệu: https://pi-apps.github.io/pi-sdk-docs/pi-sdk/Core
//
// Luồng hoạt động:
//   1. Pi Browser load app → window.Pi có sẵn từ sdk.minepi.com/pi-sdk.js
//   2. App gọi Pi.init() → khởi tạo SDK
//   3. App gọi Pi.authenticate() → Pi Browser tự hiện dialog xin quyền
//   4. Pi trả về { user: { username, uid }, accessToken }
//   5. (Khuyến nghị) Verify accessToken qua backend → GET /v2/me
//   6. Lưu username vào state, dùng làm key Supabase

// ─── Types ────────────────────────────────────────────────────────────────
export interface PiUser {
  username: string
  uid: string
}

export interface PiAuthResult {
  user: PiUser
  accessToken: string
}

// Khai báo window.Pi để TypeScript không báo lỗi
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

// ─── Sandbox mode ─────────────────────────────────────────────────────────
// true  = chạy local/test, KHÔNG cần Pi Browser thật
// false = production, PHẢI chạy trong Pi Browser
const IS_SANDBOX = process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'

// ─── Khởi tạo SDK ─────────────────────────────────────────────────────────
// Gọi 1 lần duy nhất khi app load
let initialized = false
export function initPiSDK() {
  if (initialized || typeof window === 'undefined' || !window.Pi) return
  window.Pi.init({ version: '2.0', sandbox: IS_SANDBOX })
  initialized = true
}

// ─── Authenticate ──────────────────────────────────────────────────────────
// Trả về username Pi của người dùng hiện tại
// Pi Browser tự xử lý login — người dùng KHÔNG cần nhập gì thêm
export async function authenticateWithPi(): Promise<PiUser | null> {
  if (typeof window === 'undefined') return null

  // Chờ SDK load xong (tối đa 5 giây)
  await waitForPiSDK()

  if (!window.Pi) {
    console.warn('[Pi Auth] window.Pi không tồn tại — app không chạy trong Pi Browser')
    return null
  }

  try {
    initPiSDK()

    const auth = await window.Pi.authenticate(
      ['username', 'payments'],
      handleIncompletePayment
    )

    console.log('[Pi Auth] ✅ Đăng nhập thành công:', auth.user.username)
    return auth.user

  } catch (err) {
    console.error('[Pi Auth] ❌ Lỗi authenticate:', err)
    return null
  }
}

// ─── Verify token qua backend (bảo mật hơn) ───────────────────────────────
// Gọi Pi API server-side để xác minh accessToken
// Dùng khi cần đảm bảo an toàn tuyệt đối (ví dụ: rút Pi thật)
export async function verifyAccessToken(accessToken: string): Promise<PiUser | null> {
  try {
    const res = await fetch('/api/pi-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.user as PiUser
  } catch {
    return null
  }
}

// ─── Xử lý payment chưa hoàn thành ───────────────────────────────────────
function handleIncompletePayment(payment: any) {
  console.log('[Pi Auth] Có payment chưa xong:', payment)
  // Trong game nông trại, ta không dùng payment phức tạp
  // Nếu sau này thêm tính năng mua Pi thật thì xử lý ở đây
}

// ─── Chờ Pi SDK load ──────────────────────────────────────────────────────
function waitForPiSDK(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (window.Pi) { resolve(); return }
    const start = Date.now()
    const check = setInterval(() => {
      if (window.Pi || Date.now() - start > timeoutMs) {
        clearInterval(check)
        resolve()
      }
    }, 100)
  })
}

// ─── Check có đang chạy trong Pi Browser không ────────────────────────────
export function isInPiBrowser(): boolean {
  if (typeof window === 'undefined') return false
  return (
    navigator.userAgent.includes('PiBrowser') ||
    !!window.Pi ||
    IS_SANDBOX
  )
}
