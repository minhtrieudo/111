import { createClient } from '@supabase/supabase-js'

// ⚠️ Với output: export (static), phải dùng URL trực tiếp
// Lấy tại: Supabase Dashboard > Settings > API
const SUPABASE_URL  = 'https://ggdapoglyqgsxmxawddo.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnZGFwb2dseXFnc3hteGF3ZGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDI5OTUsImV4cCI6MjA5MjQ3ODk5NX0.pXoiXRPbX8n64aEKUDQ8hLSUZBmWYzTr7raSFlHp1y4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Types khớp với bảng Supabase v2 (dùng pi_uid) ──
export interface FarmRow {
  pi_uid:      string                    // Primary key — ID Pi không đổi
  username:    string                    // Tên hiển thị
  pi_balance:  number
  stars:       number
  plots:       any[]
  inventory:   Record<string, number>
  char_pos:    { x: number; y: number }
  updated_at?: string
}

export interface VisitLogRow {
  id?:           number
  target_uid:    string                  // pi_uid chủ vườn
  visitor_uid:   string                  // pi_uid người thăm
  visitor_name:  string                  // username người thăm (để hiển thị)
  type:          'water' | 'pest' | 'steal'
  plot_idx:      number
  plant?:        string
  amount?:       number
  seen?:         boolean
  created_at?:   string
}

// ── DB helpers ──

export async function loadFarm(pi_uid: string): Promise<FarmRow | null> {
  const { data, error } = await supabase
    .from('farms')
    .select('*')
    .eq('pi_uid', pi_uid)
    .single()
  if (error) {
    console.error('[Supabase] loadFarm error:', error.message)
    return null
  }
  return data as FarmRow
}

export async function saveFarm(farm: FarmRow): Promise<void> {
  const { error } = await supabase
    .from('farms')
    .upsert(farm, { onConflict: 'pi_uid' })
  if (error) {
    console.error('[Supabase] saveFarm error:', error.message)
    throw error
  }
}

export async function loadVisitFarm(pi_uid: string): Promise<FarmRow | null> {
  const { data, error } = await supabase
    .from('farms')
    .select('pi_uid, username, plots, pi_balance, inventory, stars, char_pos')
    .eq('pi_uid', pi_uid)
    .single()
  if (error) return null
  return data as FarmRow
}

export async function loadFarmByUsername(username: string): Promise<FarmRow | null> {
  const { data, error } = await supabase
    .from('farms')
    .select('pi_uid, username, plots, pi_balance, inventory, stars, char_pos')
    .eq('username', username)
    .single()
  if (error) return null
  return data as FarmRow
}

export async function applyVisitAction(
  target_uid: string,
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

  await supabase
    .from('farms')
    .update({ plots })
    .eq('pi_uid', target_uid)

  return { updatedPlots: plots, stolen }
}

export async function logVisitEvent(log: VisitLogRow): Promise<void> {
  await supabase.from('visit_logs').insert(log)
}

export async function loadUnseenVisits(pi_uid: string): Promise<VisitLogRow[]> {
  const { data } = await supabase
    .from('visit_logs')
    .select('*')
    .eq('target_uid', pi_uid)
    .eq('seen', false)
    .order('created_at', { ascending: true })
  return (data || []) as VisitLogRow[]
}

export async function markVisitsSeen(pi_uid: string): Promise<void> {
  await supabase
    .from('visit_logs')
    .update({ seen: true })
    .eq('target_uid', pi_uid)
    .eq('seen', false)
}
