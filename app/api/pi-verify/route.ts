// app/api/pi-verify/route.ts
// Backend endpoint để verify Pi accessToken
// Pi Network khuyến nghị: luôn verify token server-side trước khi tin dùng

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json()
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 })
    }

    // Gọi Pi Platform API để verify
    const piRes = await fetch('https://api.minepi.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!piRes.ok) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const piUser = await piRes.json()
    // piUser = { uid, username, roles, ... }

    return NextResponse.json({
      user: {
        uid:      piUser.uid,
        username: piUser.username,
      }
    })

  } catch (err) {
    console.error('[pi-verify] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
