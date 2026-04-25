import { createClient } from '@supabase/supabase-js'

// ── Thay 2 giá trị này bằng thông tin Supabase project của bạn ──
// Lấy tại: Supabase Dashboard > Settings > API
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

console.log('[v0] Supabase URL:', SUPABASE_URL?.substring(0, 30) + '...')
console.log('[v0] Supabase Key:', SUPABASE_ANON?.substring(0, 20) + '...')

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Types khớp với bảng Supabase ──
export interface FarmRow {
  username:    string
  pi_balance:  number
  stars:       number
  plots:       any[]   // Plot[]
  inventory:   Record<string, number>
  char_pos:    { x: number; y: number }
  updated_at?: string
}

export interface VisitLogRow {
  id?:         number
  target:      string
  visitor:     string
  type:        'water' | 'pest' | 'steal'
  plot_idx:    number
  plant?:      string
  amount?:     number
  seen?:       boolean
  created_at?: string
}

// ── DB helpers ──

export async function loadFarm(username: string): Promise<FarmRow | null> {
  const { data, error } = await supabase
    .from('farms')
    .select('*')
    .eq('username', username)
    .single()
  
  if (error) {
    console.error('[v0] Supabase loadFarm error:', error)
    return null
  }
  return data as FarmRow
}

export async function saveFarm(farm: FarmRow): Promise<void> {
  const { error } = await supabase
    .from('farms')
    .upsert(farm, { onConflict: 'username' })
  
  if (error) {
    console.error('[v0] Supabase saveFarm error:', error)
    throw error
  }
}

export async function loadVisitFarm(targetUsername: string): Promise<FarmRow | null> {
  const { data, error } = await supabase
    .from('farms')
    .select('username, plots, pi_balance, inventory, stars, char_pos')
    .eq('username', targetUsername)
    .single()
  if (error) return null
  return data as FarmRow
}

export async function applyVisitAction(
  targetUsername: string,
  plotIdx: number,
  act: 'water' | 'pest' | 'steal',
  currentPlots: any[]
): Promise<{ updatedPlots: any[]; stolen: number }> {
  const plots = [...currentPlots]
  let stolen = 0

  if (act === 'water') {
    plots[plotIdx] = { ...plots[plotIdx], progress: Math.min(95, plots[plotIdx].progress + 20) }
  } else if (act === 'pest') {
    plots[plotIdx] = { ...plots[plotIdx], progress: Math.min(95, plots[plotIdx].progress + 15) }
  } else if (act === 'steal') {
    stolen = Math.round(plots[plotIdx].reward * 0.05 * 100) / 100
    plots[plotIdx] = { ...plots[plotIdx], reward: Math.max(0, plots[plotIdx].reward - stolen) }
  }

  // Cập nhật plots của bạn trong Supabase
  await supabase
    .from('farms')
    .update({ plots })
    .eq('username', targetUsername)

  return { updatedPlots: plots, stolen }
}

export async function logVisitEvent(log: VisitLogRow): Promise<void> {
  await supabase.from('visit_logs').insert(log)
}

export async function loadUnseenVisits(username: string): Promise<VisitLogRow[]> {
  const { data } = await supabase
    .from('visit_logs')
    .select('*')
    .eq('target', username)
    .eq('seen', false)
    .order('created_at', { ascending: true })
  return (data || []) as VisitLogRow[]
}

export async function markVisitsSeen(username: string): Promise<void> {
  await supabase
    .from('visit_logs')
    .update({ seen: true })
    .eq('target', username)
    .eq('seen', false)
}
