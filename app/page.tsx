'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  supabase, loadFarm, saveFarm, loadVisitFarm,
  applyVisitAction, logVisitEvent, loadUnseenVisits, markVisitsSeen,
  type FarmRow, type VisitLogRow
} from '@/lib/supabase'
import { usePiAuth } from '@/contexts/pi-auth-context'

// ─── TYPES ───────────────────────────────────────────────────────────
type PlotState = 'grass' | 'tilled' | 'seeded' | 'growing' | 'watered' | 'ready' | 'buy'

interface Plot {
  state: PlotState
  plant: string | null
  progress: number
  reward: number
  timer: string
  price?: number
  plantedAt?: number // Timestamp khi gieo (milliseconds)
  growTime?: number // Thời gian lớn (milliseconds)
}

interface SeedOption {
  emoji: string
  name: string
  time: string
  reward: number
}

interface GameState {
  username: string
  piBalance: number
  stars: number
  plots: Plot[]
  charPos: { x: number; y: number }
  inventory: Record<string, number> // { '🥬': 12, '🍅': 0, ... }
}

// ─── CONSTANTS ───────────────────────────────────────────────────────
const SEEDS: SeedOption[] = [
  { emoji: '🥬', name: 'Rau cải',  time: '2h',  reward: 0.15 },
  { emoji: '🍅', name: 'Cà chua',  time: '4h',  reward: 0.35 },
  { emoji: '🌽', name: 'Bắp ngô',  time: '6h',  reward: 0.55 },
  { emoji: '🥕', name: 'Cà rốt',   time: '8h',  reward: 0.70 },
  { emoji: '🎃', name: 'Bí ngô',   time: '12h', reward: 1.20 },
]

const STATE_LABEL: Record<string, string> = {
  grass: 'Đất trống', tilled: 'Đã làm đất',
  seeded: 'Đã gieo hạt', growing: 'Đang lớn',
  watered: 'Đã tưới', ready: 'Thu hoạch',
}

// ─── TIME HELPERS ──────────────────────────────────────────────────
const timeStringToMs = (timeStr: string): number => {
  const match = timeStr.match(/(\d+)([hm])/)
  if (!match) return 0
  const value = parseInt(match[1])
  const unit = match[2]
  if (unit === 'h') return value * 60 * 60 * 1000
  return value * 60 * 1000
}

const msToTimeString = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h${minutes}` : `${hours}h`
  }
  return `${minutes}m`
}

const INITIAL_PLOTS: Plot[] = [
  { state:'grass',   plant:null, progress:0,   reward:0,    timer:'' },
  { state:'grass',   plant:null, progress:0,   reward:0,    timer:'' },
  { state:'grass',   plant:null, progress:0,   reward:0,    timer:'' },
  { state:'grass',   plant:null, progress:0,   reward:0,    timer:'' },
  { state:'grass',   plant:null, progress:0,   reward:0,    timer:'' },
  { state:'grass',   plant:null, progress:0,   reward:0,    timer:'' },
]

const INITIAL_INVENTORY: Record<string, number> = {
  '🥬': 5, // 5 hạt rau cải để bắt đầu
}

// Mapping emoji hạt → thông tin seed
const SEED_INFO: Record<string, SeedOption> = {
  '🌹': { emoji:'🌹', name:'Hoa hồng',  time:'6h',  reward:0.80 },
  '🌷': { emoji:'🌷', name:'Hoa tulip', time:'8h',  reward:1.00 },
  '🌾': { emoji:'🌾', name:'Lúa',       time:'4h',  reward:0.45 },
  '🌽': { emoji:'🌽', name:'Ngô',       time:'6h',  reward:0.55 },
  '🎃': { emoji:'🎃', name:'Bí ngô',    time:'12h', reward:1.20 },
  '🥬': { emoji:'🥬', name:'Rau cải',   time:'2h',  reward:0.15 },
  '🍅': { emoji:'🍅', name:'Cà chua',   time:'4h',  reward:0.35 },
  '🥕': { emoji:'🥕', name:'Cà rốt',    time:'8h',  reward:0.70 },
}

// Các giai đoạn phát triển theo % progress
// [0-15]: hạt mầm, [15-35]: mọc mầm, [35-60]: cây non, [60-80]: ra hoa/kết trái, [80-100]: chín
const GROWTH_STAGES: Record<string, string[]> = {
  // emoji: [hạt mầm, mọc mầm, cây non, ra hoa/kết trái, chín/thu hoạch]
  '🥬': ['🌰', '🌱', '🪴', '🥬', '🥬'],
  '🍅': ['🌰', '🌱', '🌿', '🍅', '🍅'],
  '🌽': ['🌰', '🌱', '🌿', '🌽', '🌽'],
  '🥕': ['🌰', '🌱', '🌿', '🥕', '🥕'],
  '🎃': ['🌰', '🌱', '🌿', '🎃', '🎃'],
  '🌹': ['🌰', '🌱', '🌿', '🌸', '🌹'],
  '🌷': ['🌰', '🌱', '🌿', '🌸', '🌷'],
  '🌾': ['🌰', '🌱', '🌿', '🌾', '🌾'],
}

// Nhãn giai đoạn
const STAGE_LABELS = ['Hạt mầm', 'Mọc mầm', 'Cây non', 'Ra hoa', 'Chín']

// Lấy emoji và size theo progress
function getPlantVisual(plant: string, progress: number): { emoji: string; size: string; label: string } {
  const stages = GROWTH_STAGES[plant] || ['🌰','🌱','🌿', plant, plant]
  let stageIdx: number
  if (progress < 15)      stageIdx = 0
  else if (progress < 35) stageIdx = 1
  else if (progress < 60) stageIdx = 2
  else if (progress < 85) stageIdx = 3
  else                     stageIdx = 4

  const sizeMap = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl']
  return {
    emoji: stages[stageIdx],
    size: sizeMap[stageIdx],
    label: STAGE_LABELS[stageIdx],
  }
}

// ─── SOCIAL SYSTEM ────────────────────────────────────────────────────
const getRandomMsg = (arr: ((...a: any[]) => string)[], ...args: any[]) =>
  arr[Math.floor(Math.random() * arr.length)](...args)

const VISIT_MESSAGES = {
  water: [
    (v: string, p: string) => `💧 ${v} đã ghé vườn và tưới cây ${p} cho bạn! Ấm lòng ghê~`,
    (v: string, p: string) => `🌊 Ôi trời! ${v} tốt bụng quá, tưới cả ${p} cho mình luôn 🥹`,
    (v: string, p: string) => `💦 ${v} vừa tưới ${p} — bạn bè kiểu này mới gọi là real friend!`,
  ],
  pest: [
    (v: string, p: string) => `🐛 ${v} đã bắt sâu cho ${p} của bạn! Anh hùng thầm lặng 🦸`,
    (v: string, p: string) => `🪲 Nhờ ${v} bắt sâu, ${p} nhà bạn sạch bóng! Cảm ơn chiến hữu~`,
    (v: string, p: string) => `🐜 ${v} tay không bắt giặc (sâu), cứu ${p} khỏi nguy hiểm 😤`,
  ],
  steal: [
    (v: string, p: string, a: number) => `🥷 Ối dời! ${v} lén lút cuỗm mất ${a}% ${p} của bạn! Mặt dày thật sự 😤`,
    (v: string, p: string, a: number) => `😱 ${v} đã trộm ${a}% ${p}! Hàng xóm kiểu này thì... thôi kệ 🫠`,
    (v: string, p: string, a: number) => `🤡 ${v} nghĩ mình trộm giỏi lắm, lấy ${a}% ${p} của bạn đấy! Ghi tên lại nhé~`,
  ],
}

// ─── STORAGE HELPERS (Supabase) ───────────────────────────────────────


// ─── STORAGE HELPERS (Supabase + Pi Auth) ─────────────────────────────────
// Cache local để không mất data khi mạng chậm
const LOCAL_KEY = 'lang_pi_game_state'

const saveLocalCache = (farm: FarmRow) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(farm)) } catch {}
}

const loadLocalCache = (): FarmRow | null => {
  try {
    const d = localStorage.getItem(LOCAL_KEY)
    return d ? JSON.parse(d) : null
  } catch { return null }
}

const farmToRow = (state: {
  username: string; piBalance: number; stars: number;
  plots: Plot[]; inventory: Record<string,number>; charPos: {x:number;y:number}
}): FarmRow => ({
  username:   state.username,
  pi_balance: state.piBalance,
  stars:      state.stars,
  plots:      state.plots,
  inventory:  state.inventory,
  char_pos:   state.charPos,
})

const rowToState = (row: FarmRow) => ({
  username:  row.username,
  piBalance: row.pi_balance,
  stars:     row.stars,
  plots:     (row.plots || INITIAL_PLOTS) as Plot[],
  inventory: row.inventory || INITIAL_INVENTORY,
  charPos:   row.char_pos  || { x: 28, y: 38 },
})

// ─── PLOT COMPONENT ───────────────────────────────────────────────────
function PlotCell({ plot, onClick }: { plot: Plot; onClick: (e: React.MouseEvent) => void }) {
  const bgMap: Record<string, string> = {
    grass: 'bg-amber-700 border-amber-900',
    tilled: 'bg-amber-900 border-amber-950',
    seeded: 'bg-amber-800 border-amber-900',
    growing: 'bg-amber-800 border-amber-900',
    watered: 'bg-amber-950 border-stone-900',
    ready: 'bg-green-700 border-green-900 shadow-[0_0_12px_rgba(74,222,128,0.5)]',
    buy: 'bg-green-600/40 border-dashed border-green-500',
  }

  // Lấy visual theo giai đoạn phát triển
  const visual = plot.plant && plot.state !== 'buy' && plot.state !== 'ready'
    ? getPlantVisual(plot.plant, plot.progress)
    : null

  return (
    <button
      onClick={onClick}
      className={`relative rounded-md border-2 aspect-square flex flex-col items-center justify-center 
        transition-all duration-100 active:scale-90 overflow-visible
        ${bgMap[plot.state] || bgMap.grass}
        ${plot.state === 'ready' ? 'animate-pulse' : ''}
      `}
      style={{
        backgroundImage: plot.state !== 'buy'
          ? 'repeating-linear-gradient(90deg,transparent 0,transparent 9px,rgba(0,0,0,0.07) 9px,rgba(0,0,0,0.07) 10px)'
          : undefined,
      }}
    >
      {/* Buy slot */}
      {plot.state === 'buy' && (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-lg">🔓</span>
          <span className="text-[9px] font-black text-green-800 bg-white/60 px-1 rounded">+{plot.price}π</span>
        </div>
      )}

      {/* Cây đã chín — hiện emoji gốc to */}
      {plot.state === 'ready' && plot.plant && (
        <span className="text-2xl drop-shadow-md animate-[plantBob_2.5s_ease-in-out_infinite]">
          {plot.plant}
        </span>
      )}

      {/* Cây đang lớn — hiện theo giai đoạn */}
      {visual && (
        <div className="flex flex-col items-center gap-0.5">
          <span className={`${visual.size} drop-shadow-md animate-[plantBob_2.5s_ease-in-out_infinite] transition-all duration-1000`}>
            {visual.emoji}
          </span>
          <span className="text-[7px] font-black text-white/70 leading-none">{visual.label}</span>
        </div>
      )}

      {/* Tilled empty hint */}
      {plot.state === 'tilled' && (
        <span className="text-xl opacity-30">🌱</span>
      )}

      {/* Water shine */}
      {plot.state === 'watered' && (
        <span className="absolute top-1 right-1 text-[9px]">💧</span>
      )}

      {/* Progress bar */}
      {(plot.state === 'growing' || plot.state === 'watered') && (
        <div className="absolute bottom-1 left-1.5 right-1.5 h-1 bg-black/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-lime-300 to-green-400 rounded-full transition-all"
            style={{ width: `${plot.progress}%` }}
          />
        </div>
      )}

      {/* Ready badge */}
      {plot.state === 'ready' && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap
          bg-green-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full
          shadow-md animate-bounce z-10">
          ✨ Thu hoạch!
          <div className="text-center text-[6px] leading-none">▼</div>
        </div>
      )}

      {/* Timer */}
      {(plot.state === 'growing' || plot.state === 'watered') && plot.timer && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap
          bg-black/60 text-white text-[7px] font-black px-1 py-0.5 rounded z-10">
          ⏱{plot.timer}
        </div>
      )}
    </button>
  )
}

// ─── COIN FX ─────────────────────────────────────────────────────────
interface CoinFx { id: number; x: number; y: number; text: string }

// ─── MAIN GAME ────────────────────────────────────────────────────────
export default function LangPi() {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [plots, setPlots]           = useState<Plot[]>(INITIAL_PLOTS)
  const [piBalance, setPi]          = useState(0)
  const [stars, setStars]           = useState(0)
  const [charPos, setCharPos]       = useState({ x: 28, y: 38 })
  const { user: piUser } = usePiAuth()
  const [username, setUsername]     = useState('')
  const [toast, setToast]           = useState<string | null>(null)
  const [coins, setCoins]           = useState<CoinFx[]>([])
  const [showUsernameInput, setShowUsernameInput] = useState(false)
  const [inventory, setInventory]   = useState<Record<string, number>>(INITIAL_INVENTORY)

  const coinId                      = useRef(0)

  // Modal states
  const [seedModal, setSeedModal]   = useState(false)
  const [invModal, setInvModal]     = useState(false)
  const [shopModal, setShopModal]   = useState(false)
  const [shopTab, setShopTab]       = useState<'seeds'|'fert'|'land'>('seeds')
  const [selectedSeed, setSelectedSeed] = useState<SeedOption>(SEEDS[0])
  const [pendingPlot, setPendingPlot]   = useState<number | null>(null)

  // Popup (compact icon menu above plot)
  const [popup, setPopup] = useState<{ idx: number; x: number; y: number } | null>(null)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ idx: number; act: string; message: string } | null>(null)

  // Social system
  const [villageModal, setVillageModal] = useState(false)
  const [visitTarget, setVisitTarget] = useState('')
  const [visitingState, setVisitingState] = useState<{ username: string; plots: Plot[]; charPos: {x:number;y:number} } | null>(null)
  const [visitPopup, setVisitPopup] = useState<{ idx: number; x: number; y: number } | null>(null)
  const [notifications, setNotifications] = useState<string[]>([])
  const [notifModal, setNotifModal] = useState(false)

  const worldRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Initialize game — Pi SDK Authentication ──
  useEffect(() => {
    const init = async () => {
      if (!piUser) return
      setUsername('...')

      // Username lấy từ PiAuthContext — đã xác thực trước khi game render
      const uname = piUser.username
      setUsername(uname)
      console.log('[Game] ✅ Logged in as:', uname)

      // 3. Load farm từ Supabase
      let row = await loadFarm(uname)
      if (!row) {
        row = {
          username: uname, pi_balance: 10, stars: 0,
          plots: INITIAL_PLOTS, inventory: INITIAL_INVENTORY,
          char_pos: { x: 28, y: 38 },
        }
        await saveFarm(row)
      }

      const s = rowToState(row)
      const resolvedPlots = resolveReadyPlots(s.plots)
      setPlots(resolvedPlots); setPi(s.piBalance); setStars(s.stars)
      setCharPos(s.charPos); setInventory(s.inventory)
      saveLocalCache({ ...row, plots: resolvedPlots })
      setGameState({ username: uname, piBalance: s.piBalance, stars: s.stars, plots: resolvedPlots, charPos: s.charPos, inventory: s.inventory })

      loadNotifications(uname)
      const cleanup = setupRealtime(uname)
      return cleanup
    }

    init()
  }, [piUser])

  // Tách helper load notifications
  const loadNotifications = async (uname: string) => {
    const visits = await loadUnseenVisits(uname)
    if (visits.length > 0) {
      const msgs = visits.map(ev => {
        const plantName = ev.plant ? (SEED_INFO[ev.plant]?.name || ev.plant) : 'vườn'
        if (ev.type === 'water') return getRandomMsg(VISIT_MESSAGES.water, ev.visitor, plantName)
        if (ev.type === 'pest')  return getRandomMsg(VISIT_MESSAGES.pest,  ev.visitor, plantName)
        if (ev.type === 'steal') return getRandomMsg(VISIT_MESSAGES.steal, ev.visitor, plantName, ev.amount || 5)
        return ''
      }).filter(Boolean)
      setNotifications(msgs)
      setNotifModal(true)
      await markVisitsSeen(uname)
    }
  }

  // Tách helper setup realtime
  const setupRealtime = (uname: string) => {
    const channel = supabase
      .channel(`farm_${uname}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'farms',
        filter: `username=eq.${uname}`
      }, payload => {
        const updated = payload.new as FarmRow
        setPlots(resolveReadyPlots(updated.plots))
        setPi(updated.pi_balance)
        setInventory(updated.inventory)
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'visit_logs',
        filter: `target=eq.${uname}`
      }, payload => {
        const ev = payload.new as VisitLogRow
        const plantName = ev.plant ? (SEED_INFO[ev.plant]?.name || ev.plant) : 'vườn'
        let msg = ''
        if (ev.type === 'water') msg = getRandomMsg(VISIT_MESSAGES.water, ev.visitor, plantName)
        if (ev.type === 'pest')  msg = getRandomMsg(VISIT_MESSAGES.pest,  ev.visitor, plantName)
        if (ev.type === 'steal') msg = getRandomMsg(VISIT_MESSAGES.steal, ev.visitor, plantName, ev.amount || 5)
        if (msg) { setNotifications(n => [...n, msg]); setNotifModal(true) }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }

  // Helper: resolve plots đã chín khi load
  const resolveReadyPlots = (plots: Plot[]) => plots.map(plot => {
    if ((plot.state === 'growing' || plot.state === 'watered') && plot.plantedAt && plot.growTime) {
      const elapsed = Date.now() - plot.plantedAt
      if (elapsed >= plot.growTime)
        return { ...plot, state: 'ready' as PlotState, timer: '', progress: 100 }
      return { ...plot, progress: Math.min(99, (elapsed / plot.growTime) * 100), timer: msToTimeString(plot.growTime - elapsed) }
    }
    return plot
  })

  // ── Auto-save lên Supabase (debounce 2s) ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!username || username === 'Unknown' || username === '...' || username === '❌' || !piUser) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const farm: FarmRow = {
        username, pi_balance: piBalance, stars, plots, inventory, char_pos: charPos
      }
      saveLocalCache(farm)       // cache local ngay lập tức
      await saveFarm(farm)       // sync lên Supabase
    }, 2000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [plots, piBalance, stars, charPos, inventory, username])

  // ── Timer update every second ──
  useEffect(() => {
    const interval = setInterval(() => {
      setPlots(currentPlots => {
        const updated = currentPlots.map(plot => {
          if ((plot.state !== 'growing' && plot.state !== 'watered') || !plot.plantedAt || !plot.growTime) {
            return plot
          }

          const elapsed = Date.now() - plot.plantedAt
          const remaining = plot.growTime - elapsed

          if (remaining <= 0) {
            return { ...plot, state: 'ready' as PlotState, timer: '', progress: 100 }
          }

          const progress = Math.min(100, (elapsed / plot.growTime) * 100)
          const timer = msToTimeString(remaining)

          return { ...plot, progress, timer }
        })
        return updated
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // ── helpers ──
  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2400)
  }, [])

  const spawnCoin = useCallback((x: number, y: number, text: string) => {
    const id = ++coinId.current
    setCoins(c => [...c, { id, x, y, text }])
    setTimeout(() => setCoins(c => c.filter(f => f.id !== id)), 950)
  }, [])

  // ── execute action on a specific plot ──
  const executeAction = useCallback((idx: number, act: string) => {
    setPlots(ps => ps.map((p, i) => {
      if (i !== idx) return p
      if (act === 'till')  return { ...p, state: 'tilled' as PlotState, plant: null, progress: 0, timer: '' }
      if (act === 'water') return { ...p, state: (p.state === 'seeded' ? 'growing' : 'watered') as PlotState, progress: Math.min(95, p.progress + 15), timer: p.timer || '2h00', plantedAt: p.state === 'seeded' ? Date.now() : p.plantedAt, growTime: p.growTime || timeStringToMs(p.timer || '2h00') }
      if (act === 'fert')  return { ...p, progress: Math.min(95, p.progress + 22) }
      return p
    }))
    if (act === 'till') showToast('⛏️ Đã làm đất!')
    if (act === 'water') showToast('💧 Đã tưới! +30% tốc độ')
    if (act === 'fert') showToast('⚗️ Bón phân xong!')
  }, [showToast])

  // ── popup action: chọn công cụ từ menu ──
  const doAction = useCallback((idx: number, act: string) => {
    setPopup(null)
    setActiveAction(act)
    if (act === 'seed') {
      setPendingPlot(idx)
      setSeedModal(true)
      return
    }
    executeAction(idx, act)
  }, [executeAction])

  // ── plot tap ──
  const handlePlotTap = useCallback((idx: number, e: React.MouseEvent) => {
    const plot = plots[idx]
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const wRect = worldRef.current?.getBoundingClientRect()

    // Move character
    if (wRect) {
      const tx = Math.max(2, ((rect.left - wRect.left - 28) / wRect.width) * 100)
      const ty = Math.max(22, ((rect.top - wRect.top - 10) / wRect.height) * 100)
      setCharPos({ x: Math.min(tx, 90), y: Math.min(ty, 85) })
    }

    if (!plot || plot.state === 'buy') { setShopTab('land'); setShopModal(true); return }

    // Thu hoạch
    if (plot.state === 'ready') {
      spawnCoin(rect.left + rect.width / 2, rect.top, `+${plot.reward}π`)
      setPi(b => Math.round((b + plot.reward) * 100) / 100)
      setPlots(ps => ps.map((pp, i) => i === idx
        ? { ...pp, state: 'grass', plant: null, progress: 0, reward: 0, timer: '', plantedAt: undefined, growTime: undefined }
        : pp))
      showToast(`✅ Thu hoạch +${plot.reward}π!`)
      return
    }

    // Nếu đang có active action
    if (activeAction) {
      const hasPlant = ['seeded','growing','watered'].includes(plot.state)

      // Làm đất
      if (activeAction === 'till') {
        if (plot.state === 'grass') {
          executeAction(idx, 'till')
          return
        }
        if (plot.state === 'tilled') {
          // Đã làm đất rồi → tắt action, mở popup
          setActiveAction(null)
          setPopup({ idx, x: rect.left, y: rect.top })
          return
        }
        if (hasPlant) {
          // Có cây → hỏi xác nhận
          setConfirmModal({ idx, act: 'till', message: '⚠️ Ô này đang có cây! Làm đất sẽ xóa cây. Tiếp tục?' })
          return
        }
      }

      // Gieo hạt
      if (activeAction === 'seed') {
        if (plot.state === 'tilled') {
          setPendingPlot(idx)
          setSeedModal(true)
          return
        }
        if (hasPlant) {
          // Đã có cây → tắt action, mở popup
          setActiveAction(null)
          setPopup({ idx, x: rect.left, y: rect.top })
          return
        }
      }

      // Tưới nước
      if (activeAction === 'water') {
        if (plot.state === 'seeded' || plot.state === 'growing') {
          executeAction(idx, 'water')
          return
        }
        if (plot.state === 'watered' || hasPlant) {
          // Không đủ điều kiện hoặc đã tưới → tắt action, mở popup
          setActiveAction(null)
          setPopup({ idx, x: rect.left, y: rect.top })
          return
        }
      }

      // Bón phân
      if (activeAction === 'fert') {
        if (plot.state === 'growing' || plot.state === 'watered') {
          executeAction(idx, 'fert')
          return
        }
        if (hasPlant || plot.state === 'seeded') {
          // Không đủ điều kiện → tắt action, mở popup
          setActiveAction(null)
          setPopup({ idx, x: rect.left, y: rect.top })
          return
        }
      }

      // Mọi trường hợp khác → mở popup chọn
      setActiveAction(null)
      setPopup({ idx, x: rect.left, y: rect.top })
      return
    }

    // Không có action nào → mở popup chọn công cụ
    setPopup({ idx, x: rect.left, y: rect.top })
  }, [plots, spawnCoin, showToast, activeAction, executeAction])

  // ── plant seed ──
  const plantSeed = useCallback(() => {
    const idx = pendingPlot !== null ? pendingPlot : plots.findIndex(p => p.state === 'tilled')
    if (idx === -1) { showToast('⛏️ Làm đất trước!'); setSeedModal(false); return }
    // Kiểm tra còn hạt không
    if ((inventory[selectedSeed.emoji] || 0) < 1) {
      showToast(`❌ Hết hạt ${selectedSeed.name}! Mua thêm ở cửa hàng.`)
      setSeedModal(false)
      return
    }
    const growTime = timeStringToMs(selectedSeed.time)
    setPlots(ps => ps.map((p, i) => i === idx
      ? { ...p, state: 'growing', plant: selectedSeed.emoji, progress: 0, timer: selectedSeed.time, reward: selectedSeed.reward, plantedAt: Date.now(), growTime: growTime }
      : p))
    // Trừ 1 hạt khỏi kho
    setInventory(inv => {
      const newQty = (inv[selectedSeed.emoji] || 0) - 1
      if (newQty <= 0) {
        const { [selectedSeed.emoji]: _, ...rest } = inv
        return rest
      }
      return { ...inv, [selectedSeed.emoji]: newQty }
    })
    setSeedModal(false)
    setPendingPlot(null)
    showToast(`🌱 Đã gieo ${selectedSeed.name}!`)
  }, [pendingPlot, plots, selectedSeed, inventory, showToast])

  // ── thăm vườn bạn bè (Supabase) ──
  const visitFriend = useCallback(async (targetUser: string) => {
    if (!targetUser.trim()) return
    if (targetUser === username) { showToast('😅 Không thể thăm vườn chính mình!'); return }
    showToast('🔍 Đang tìm vườn...')
    const row = await loadVisitFarm(targetUser)
    if (!row) { showToast(`❌ Không tìm thấy vườn của "${targetUser}"`); return }
    setVisitingState({
      username: targetUser,
      plots: row.plots as Plot[],
      charPos: row.char_pos || { x: 28, y: 38 }
    })
    setVillageModal(false)
  }, [username, showToast])

  // ── tap ô đất khi đang thăm vườn ──
  const handleVisitPlotTap = useCallback((idx: number, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setVisitPopup({ idx, x: rect.left, y: rect.top })
  }, [])

  // ── hành động trên vườn bạn (Supabase) ──
  const doVisitAction = useCallback(async (act: 'water' | 'pest' | 'steal', plotIdx: number) => {
    if (!visitingState) return
    const plot = visitingState.plots[plotIdx]
    if (!plot || !['growing','watered','ready'].includes(plot.state)) {
      showToast('⚠️ Ô này không có gì để làm~'); setVisitPopup(null); return
    }

    const { updatedPlots, stolen } = await applyVisitAction(
      visitingState.username, plotIdx, act, visitingState.plots
    )
    await logVisitEvent({
      target:   visitingState.username,
      visitor:  username,
      type:     act,
      plot_idx: plotIdx,
      plant:    plot.plant || undefined,
      amount:   act === 'steal' ? 5 : (act === 'water' ? 20 : 15),
    })

    if (act === 'water')      showToast(`💧 Tưới xong! ${visitingState.username} sẽ vui lắm~`)
    else if (act === 'pest')  showToast(`🐛 Bắt sâu xong! Cây của ${visitingState.username} sạch rồi!`)
    else if (act === 'steal') {
      setPi(b => Math.round((b + stolen) * 100) / 100)
      showToast(`🥷 Cuỗm được ${stolen}π! Chạy mau~`)
    }

    setVisitingState(v => v ? { ...v, plots: updatedPlots } : null)
    setVisitPopup(null)
  }, [visitingState, username, showToast])
  const nextPlotPrice = Math.round(plots.length * 1.5 * 10) / 10

  const buyPlot = useCallback(() => {
    const price = Math.round(plots.length * 1.5 * 10) / 10
    if (piBalance < price) { showToast(`❌ Cần ${price}π!`); return }
    setPi(b => Math.round((b - price) * 100) / 100)
    setPlots(ps => [...ps, { state: 'grass', plant: null, progress: 0, reward: 0, timer: '' }])
    showToast(`🎉 Mở ô đất mới! -${price}π`)
  }, [piBalance, plots.length, showToast])

  // ── tap world to move char ──
  const handleWorldTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    if (el.closest('button, [data-nobubble]')) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    setCharPos({ x: Math.max(2, Math.min(px - 2, 90)), y: Math.max(22, Math.min(py - 4, 85)) })
  }, [])

  // Luôn hiện 4 công cụ
  const ALL_ACTIONS = [
    { id:'till',  icon:'⛏️', label:'Làm đất' },
    { id:'seed',  icon:'🌱', label:'Gieo hạt' },
    { id:'water', icon:'💧', label:'Tưới' },
    { id:'fert',  icon:'⚗️', label:'Bón phân' },
  ]

  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-400 touch-none select-none"
         style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Baloo+2:wght@700;800&display=swap');
        @keyframes plantBob { 0%,100%{transform:rotate(-1.5deg)} 50%{transform:rotate(1.5deg) translateY(-2px)} }
        @keyframes treeSway { 0%,100%{transform:rotate(-1.5deg)} 50%{transform:rotate(1.5deg)} }
        @keyframes cloudDrift { from{transform:translateX(-200px)} to{transform:translateX(110vw)} }
        @keyframes sunPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
        @keyframes ripple { 0%{transform:scale(0.15);opacity:0.9} 100%{transform:scale(2);opacity:0} }
        @keyframes spark { 0%,100%{opacity:0;transform:scale(0.4)} 50%{opacity:1;transform:scale(1.2)} }
        @keyframes fishSwim { 0%{transform:translateX(0) scaleX(1)} 45%{transform:translateX(28px) scaleX(1)} 50%{transform:translateX(28px) scaleX(-1)} 95%{transform:translateX(0) scaleX(-1)} 100%{transform:translateX(0) scaleX(1)} }
        @keyframes leafSway { 0%,100%{transform:rotate(-4deg)} 50%{transform:rotate(4deg) translateY(-1px)} }
        @keyframes coinUp { 0%{transform:translateY(0) scale(1.2);opacity:1} 100%{transform:translateY(-65px) scale(0.4);opacity:0} }
        @keyframes charBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
        @keyframes piGlow { 0%,100%{opacity:0.55} 50%{opacity:1} }
        @keyframes piFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes arrBob { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(3px)} }
        @keyframes smoke { 0%{transform:translateY(0) scale(0.5);opacity:0.9} 100%{transform:translateY(-20px) scale(1.4);opacity:0} }
        @keyframes smokeMain { 0%{transform:translateY(0) scale(0.5);opacity:0.9} 100%{transform:translateY(-20px) scale(1.4);opacity:0} }
        @keyframes badgeBob { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-3px)} }
        .char-anim { animation: charBob 1.6s ease-in-out infinite; }
        .arr-anim { animation: arrBob 1s ease-in-out infinite; }
        .tree-sway { animation: treeSway 4s ease-in-out infinite; }
        .cloud-drift-1 { animation: cloudDrift 28s linear infinite; }
        .cloud-drift-2 { animation: cloudDrift 40s linear infinite 12s; }
        .cloud-drift-3 { animation: cloudDrift 22s linear infinite 7s; }
      `}</style>

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 z-[200] px-3 pt-2 pb-1
        bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between">
        <div style={{ fontFamily: "'Baloo 2', cursive" }}
             className="text-white text-lg font-bold drop-shadow-[2px_2px_0_rgba(0,0,0,0.5)]">
          {visitingState ? (
            <button onClick={() => { setVisitingState(null); setVisitPopup(null) }}
                    className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 active:scale-95">
              <span className="text-sm">←</span>
              <span className="text-yellow-300 text-sm">🏡 {visitingState.username}</span>
              <span className="text-white/60 text-[10px] font-normal">Về nhà</span>
            </button>
          ) : username ? (
            <span><span className="text-yellow-400">👤 {username}</span>
              <span className="text-xs text-white/60 font-normal ml-1" style={{ fontFamily: 'Nunito' }}>Lv.7</span>
            </span>
          ) : (
            <span>Làng <span className="text-yellow-400">Pi</span>{' '}
              <span className="text-xs text-white/60 font-normal" style={{ fontFamily: 'Nunito' }}>Lv.7</span>
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {visitingState ? (
            <div className="flex items-center gap-1 bg-orange-500/70 border border-orange-300/40 rounded-full px-2.5 py-1 text-white text-[10px] font-black backdrop-blur">
              👀 Đang thăm
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 bg-black/50 border border-white/20 rounded-full px-2.5 py-1 text-white text-xs font-black backdrop-blur">
                <div className="w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center text-[9px] font-black">π</div>
                <span id="pi-display">{piBalance.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-1 bg-black/50 border border-white/20 rounded-full px-2.5 py-1 text-white text-xs font-black backdrop-blur">
                ⭐{stars}
              </div>
            </>
          )}
        </div>
      </div>

      {/* WORLD */}
      <div ref={worldRef} className="absolute inset-0" onClick={handleWorldTap}
           style={{ background: 'linear-gradient(180deg,#4aa8d0 0%,#7ec8e8 28%,#aaddf5 50%,#c5e8a8 68%,#8fc860 100%)' }}>

        {/* Sun */}
        <div className="absolute top-3.5 right-16 w-10 h-10 rounded-full"
             style={{ background: 'radial-gradient(circle,#fffde7 30%,#ffd740 60%,transparent 100%)',
                      boxShadow: '0 0 28px 10px rgba(255,220,50,0.28)',
                      animation: 'sunPulse 4s ease-in-out infinite' }} />

        {/* Clouds */}
        <div className="cloud-drift-1 absolute top-4 pointer-events-none" style={{ left: '-120px' }}>
          <div className="relative w-24 h-5 bg-white rounded-full">
            <div className="absolute -top-7 left-3 w-12 h-10 bg-white rounded-full" />
            <div className="absolute -top-5 right-2 w-8 h-7 bg-white rounded-full" />
          </div>
        </div>
        <div className="cloud-drift-2 absolute top-11 pointer-events-none" style={{ left: '-80px' }}>
          <div className="relative w-16 h-4 bg-white rounded-full">
            <div className="absolute -top-5 left-2 w-9 h-8 bg-white rounded-full" />
          </div>
        </div>
        <div className="cloud-drift-3 absolute top-6 pointer-events-none" style={{ left: '-110px' }}>
          <div className="relative w-28 h-5 bg-white rounded-full">
            <div className="absolute -top-7 left-4 w-14 h-12 bg-white rounded-full" />
            <div className="absolute -top-5 right-3 w-9 h-7 bg-white rounded-full" />
          </div>
        </div>

        {/* BG Trees */}
        <div className="absolute flex items-end pointer-events-none" style={{ top: `${(typeof window!=="undefined"?window.innerHeight:700)*0.20 - 50}px`, left:0, right:0 }}>
          {['🌳','🌲','🌳','🌲','🌳','🌲','🌳'].map((t,i) => (
            <span key={i} className="tree-sway" style={{ fontSize: [46,34,44,32,46,36,42][i], opacity: [0.62,0.5,0.58,0.46,0.62,0.5,0.58][i], animationDelay: `${i*0.5}s` }}>{t}</span>
          ))}
        </div>

        {/* Fence */}
        <div className="absolute left-0 right-0 pointer-events-none overflow-hidden"
             style={{ top: `${(typeof window!=="undefined"?window.innerHeight:700)*0.20}px`, fontSize:17, letterSpacing:2, lineHeight:1, whiteSpace:'nowrap' }}>
          {'🪵'.repeat(40)}
        </div>

        {/* Road */}
        <div className="absolute left-0 right-0 pointer-events-none"
             style={{ top:`${(typeof window!=="undefined"?window.innerHeight:700)*0.20+15}px`, height:26,
                      background:'linear-gradient(180deg,#c8a46e 0%,#b09050 100%)',
                      borderTop:'2px solid rgba(255,255,255,0.15)', borderBottom:'2px solid rgba(0,0,0,0.12)' }} />

        {/* Green ground */}
        <div className="absolute left-0 right-0 bottom-0 pointer-events-none"
             style={{ top:`${(typeof window!=="undefined"?window.innerHeight:700)*0.20+41}px`,
                      background:'#c8a46e' }} />

        {/* Road bottom — màu nâu đậm #b09050 giống chân dải trên */}
        <div className="absolute left-0 right-0 pointer-events-none"
             style={{ bottom:85, height:26,
                      background:'linear-gradient(180deg,#b09050 0%,#a07840 100%)',
                      borderTop:'2px solid rgba(255,255,255,0.12)', borderBottom:'2px solid rgba(0,0,0,0.15)' }} />

        {/* Fence bottom */}
        <div className="absolute left-0 right-0 pointer-events-none overflow-hidden"
             style={{ bottom:70, fontSize:17, letterSpacing:2, lineHeight:1, whiteSpace:'nowrap' }}>
          {'🪵'.repeat(40)}
        </div>

        {/* Road bottom */}
        <div className="absolute left-0 right-0 pointer-events-none"
             style={{ bottom:85, height:26, background:'linear-gradient(180deg,#c8a46e 0%,#b09050 100%)',
                      borderTop:'2px solid rgba(255,255,255,0.15)', borderBottom:'2px solid rgba(0,0,0,0.12)' }} />
        {/* Fence bottom */}
        <div className="absolute left-0 right-0 pointer-events-none overflow-hidden"
             style={{ bottom:70, fontSize:17, letterSpacing:2, lineHeight:1, whiteSpace:'nowrap' }}>
          {'🪵'.repeat(40)}
        </div>
        {/* Hedge bottom */}
        <div className="absolute left-0 right-0 pointer-events-none overflow-hidden"
             style={{ bottom:52, fontSize:18, letterSpacing:-1, whiteSpace:'nowrap' }}>
          {'🌿'.repeat(40)}
        </div>

        {/* Road flowers */}
        <RoadFlowers />

        {/* Dividers & Zones */}
        <ZonesAndBuildings
          piBalance={piBalance}
          onKitchen={() => showToast('🍳 Nhà bếp — chế biến nông sản!')}
          onWarehouse={() => setInvModal(true)}
          onPond={() => showToast('🐟 Câu cá — +1.2π mỗi 6h!')}
        />

        {/* PLOT GRIDS — dùng plots của bạn khi thăm, plots của mình khi ở nhà */}
        <PlotGrids
          plots={visitingState ? visitingState.plots : plots}
          onPlotTap={visitingState ? handleVisitPlotTap : handlePlotTap}
        />

        {/* Character */}
        <div className="absolute pointer-events-none z-50 transition-all duration-[350ms] ease-in-out"
             style={{ left: `${visitingState ? visitingState.charPos.x : charPos.x}%`,
                      top:  `${visitingState ? visitingState.charPos.y : charPos.y}%` }}>
          <div className="relative">
            <span className="char-anim block text-center text-3xl drop-shadow-md">
              {visitingState ? '🧑‍🌾' : '🧑‍🌾'}
            </span>
            <div className="absolute -top-1.5 -right-2 bg-yellow-400 text-amber-900 text-[7px] font-black px-1 rounded-md border border-yellow-300">
              {visitingState ? visitingState.username.slice(0,4) : 'Lv7'}
            </div>
          </div>
          <div className="w-4 h-1.5 bg-black/18 rounded-full mx-auto blur-[2px]" />
        </div>

        {/* Popup khi đang THĂM vườn — 3 action: tưới, bắt sâu, trộm */}
        {visitingState && visitPopup && (() => {
          const p = visitingState.plots[visitPopup.idx]
          const canAct = p && ['growing','watered','ready'].includes(p.state)
          const popW = 3 * 72 + 24
          let px = visitPopup.x + 20 - popW / 2
          px = Math.max(6, Math.min((typeof window!=='undefined'?window.innerWidth:390) - popW - 6, px))
          return (
            <>
              <div className="fixed inset-0 z-[340]" onClick={() => setVisitPopup(null)} />
              <div className="fixed z-[350] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
                   style={{ left: px, top: visitPopup.y - 10, transform: 'translateY(-100%)',
                            background: 'rgba(18,12,6,0.92)', backdropFilter: 'blur(12px)', padding: '8px 10px' }}>
                <div className="text-[9px] font-black text-white/50 uppercase tracking-wider mb-1.5 text-center">
                  {p ? (STATE_LABEL[p.state] || 'Ô đất') : 'Ô đất'}
                </div>
                {canAct ? (
                  <div className="flex gap-2">
                    {[
                      { act:'water' as const, icon:'💧', label:'Tưới nước', color:'bg-blue-600/60 border-blue-400/40' },
                      { act:'pest'  as const, icon:'🐛', label:'Bắt sâu',   color:'bg-green-700/60 border-green-400/40' },
                      { act:'steal' as const, icon:'🥷', label:'Ăn trộm',   color:'bg-red-700/60 border-red-400/40' },
                    ].map(a => (
                      <button key={a.act} onClick={() => doVisitAction(a.act, visitPopup.idx)}
                              className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl min-w-[52px] border transition-all active:scale-90 ${a.color}`}>
                        <span className="text-xl leading-none">{a.icon}</span>
                        <span className="text-[9px] font-black text-white whitespace-nowrap">{a.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-white/50 text-center px-2 py-1">Ô này chưa có cây 🌿</p>
                )}
                <button onClick={() => setVisitPopup(null)}
                        className="block w-full text-center text-[9px] text-white/35 font-bold mt-1.5">
                  ✕ đóng
                </button>
              </div>
            </>
          )
        })()}

        {/* Popup menu — CHỈ hiện khi ở vườn mình */}
        {!visitingState && popup && (() => {
          const p = plots[popup.idx]
          const popW = ALL_ACTIONS.length * 72 + 24
          let px = popup.x + 20 - popW / 2
          px = Math.max(6, Math.min((typeof window!=="undefined"?window.innerWidth:390) - popW - 6, px))
          // Xác định action nào hợp lệ với trạng thái hiện tại
          const validActions: Record<string, boolean> = {
            till:  p.state === 'grass',
            seed:  p.state === 'tilled',
            water: p.state === 'seeded' || p.state === 'growing',
            fert:  p.state === 'growing' || p.state === 'watered',
          }
          return (
            <>
              <div className="fixed inset-0 z-[340]" onClick={() => setPopup(null)} />
              <div className="fixed z-[350] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
                   style={{ left: px, top: popup.y - 10, transform: 'translateY(-100%)',
                            background: 'rgba(18,12,6,0.92)', backdropFilter: 'blur(12px)', padding: '8px 10px' }}>
                <div className="text-[9px] font-black text-white/50 uppercase tracking-wider mb-1.5 text-center">
                  {STATE_LABEL[p.state] || 'Ô đất'}
                </div>
                <div className="flex gap-2">
                  {ALL_ACTIONS.map(a => {
                    const isValid = validActions[a.id]
                    const isActive = activeAction === a.id
                    return (
                      <button key={a.id} onClick={() => doAction(popup.idx, a.id)}
                              className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl min-w-[52px]
                                border transition-all active:scale-90
                                ${isActive ? 'bg-yellow-500/70 border-yellow-300/60' :
                                  isValid ? 'bg-green-700/60 border-green-400/40' :
                                  'bg-white/10 border-white/15 opacity-50'}`}>
                        <span className="text-xl leading-none">{a.icon}</span>
                        <span className="text-[9px] font-black text-white whitespace-nowrap">{a.label}</span>
                      </button>
                    )
                  })}
                </div>
                <button onClick={() => setPopup(null)}
                        className="block w-full text-center text-[9px] text-white/35 font-bold mt-1.5 hover:text-white/60">
                  ✕ đóng
                </button>
                {activeAction && (
                  <button onClick={() => { setActiveAction(null); setPopup(null) }}
                          className="block w-full text-center text-[9px] text-yellow-400 font-bold mt-1 hover:text-yellow-300 border-t border-white/15 pt-1">
                    Dừng {activeAction === 'till' ? '⛏️' : activeAction === 'seed' ? '🌱' : activeAction === 'water' ? '💧' : '⚗️'}
                  </button>
                )}
              </div>
            </>
          )
        })()}

        {/* Coin FX */}
        {coins.map(c => (
          <div key={c.id} className="fixed pointer-events-none z-[600] font-black text-yellow-400 text-sm"
               style={{ left: c.x, top: c.y, animation: 'coinUp 0.9s ease forwards',
                        textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            {c.text}
          </div>
        ))}

        {/* Toast */}
        {toast && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[500] pointer-events-none
            bg-black/85 text-white px-4 py-2 rounded-2xl text-xs font-bold
            border border-yellow-400/30 whitespace-nowrap shadow-xl
            animate-in fade-in slide-in-from-top-2 duration-300">
            {toast}
          </div>
        )}
      </div>

      {/* BOTTOM NAV — ẩn khi đang thăm vườn */}
      {!visitingState && (
      <div className="fixed bottom-0 left-0 right-0 z-[200] flex"
           style={{ background: 'linear-gradient(180deg,rgba(10,5,0,0.93),rgba(5,2,0,0.97))',
                    borderTop: '1px solid rgba(255,200,80,0.2)' }}>
        {[
          { icon:'🌾', label:'Vườn',      active:true,  onClick: undefined },
          { icon:'🏪', label:'Chợ',       badge:0,      onClick: () => showToast('🏪 Chợ làng') },
          { icon:'🛍️', label:'Cửa hàng',               onClick: () => { setShopTab('seeds'); setShopModal(true) } },
          { icon:'👥', label:'Làng',      badge:0,      onClick: () => setVillageModal(true) },
          { icon:'🎒', label:'Ba lô',                   onClick: () => setInvModal(true) },
        ].map((n, i) => (
          <button key={i} onClick={n.onClick}
                  className="flex-1 py-2.5 flex flex-col items-center gap-0.5 relative transition-transform active:scale-85">
            <span className={`text-xl ${n.active ? 'scale-110' : ''}`}>{n.icon}</span>
            <span className={`text-[8px] font-semibold ${n.active ? 'text-yellow-400 font-black' : 'text-white/50'}`}>{n.label}</span>
            {n.badge && (
              <div className="absolute top-1 right-[calc(50%-14px)] bg-red-500 text-white text-[8px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {n.badge}
              </div>
            )}
          </button>
        ))}
      </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-5 mx-6 shadow-2xl border-2 border-orange-200 max-w-xs w-full">
            <p className="text-sm font-black text-center text-amber-900 mb-4">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => {
                  executeAction(confirmModal.idx, confirmModal.act)
                  setConfirmModal(null)
                }}
                className="flex-1 bg-red-500 text-white font-black py-2.5 rounded-xl active:scale-95">
                Tiếp tục
              </button>
              <button onClick={() => setConfirmModal(null)}
                className="flex-1 bg-gray-100 text-gray-700 font-black py-2.5 rounded-xl active:scale-95">
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION MODAL — hiện khi mở app có sự kiện */}
      {notifModal && notifications.length > 0 && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl mx-5 shadow-2xl border-2 border-yellow-300 max-w-sm w-full overflow-hidden">
            <div className="bg-gradient-to-br from-yellow-400 to-orange-400 px-5 py-4 text-center">
              <div className="text-3xl mb-1">📬</div>
              <div className="text-white font-black text-base">Có tin tức từ làng!</div>
              <div className="text-white/80 text-[11px]">Chuyện gì đó đã xảy ra khi bạn vắng mặt...</div>
            </div>
            <div className="p-4 max-h-64 overflow-y-auto flex flex-col gap-2">
              {notifications.map((msg, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[12px] text-amber-900 font-semibold leading-snug">
                  {msg}
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <button onClick={() => setNotifModal(false)}
                      className="w-full bg-gradient-to-br from-green-500 to-green-700 text-white font-black py-3 rounded-xl shadow-[0_4px_0_#1b5e20] active:translate-y-1 active:shadow-none">
                Đã hiểu rồi! 👍
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VILLAGE MODAL */}
      {villageModal && (
        <div className="fixed inset-0 z-[650] flex items-end justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setVillageModal(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-sm shadow-2xl border-t-4 border-green-400 pb-8"
               onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="px-5 pt-2 pb-4">
              <h2 className="text-center font-black text-lg mb-1" style={{ fontFamily:"'Baloo 2',cursive" }}>
                👥 Thăm Vườn Bạn Bè
              </h2>
              <p className="text-center text-xs text-slate-400 mb-4">Nhập username Pi của người bạn muốn thăm</p>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="VD: nguyenvana"
                  value={visitTarget}
                  onChange={e => setVisitTarget(e.target.value)}
                  className="flex-1 px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-semibold focus:border-green-400 focus:outline-none"
                />
                <button onClick={() => visitFriend(visitTarget)}
                        className="bg-green-600 text-white font-black px-4 rounded-xl active:scale-95">
                  Đi 🚶
                </button>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <p className="text-[11px] font-black text-amber-700 mb-1.5">🌟 Bạn có thể làm gì khi thăm?</p>
                <div className="flex flex-col gap-1 text-[11px] text-slate-600">
                  <span>💧 Tưới nước — giúp cây lớn nhanh hơn +20%</span>
                  <span>🐛 Bắt sâu — tăng sản lượng +15%</span>
                  <span>🥷 Ăn trộm — cuỗm tối đa 5% sản lượng</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEED DRAWER */}
      <Drawer open={seedModal} onOpenChange={setSeedModal}>
        <DrawerContent className="rounded-t-2xl border-t-4 border-yellow-300" style={{ background: 'linear-gradient(180deg,#fff9e6,#fffde7)' }}>
          <DrawerHeader className="pb-0">
            <DrawerTitle style={{ fontFamily:"'Baloo 2',cursive" }} className="text-center text-xl">🌱 Gieo hạt</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 pt-2">
            {(() => {
              // Chỉ lấy hạt giống (không lấy phân bón) có số lượng > 0
              const FERT_EMOJIS = ['⚗️','🧪','💎','🌿']
              const ownedSeeds = Object.entries(inventory)
                .filter(([emoji, qty]) => qty > 0 && !FERT_EMOJIS.includes(emoji) && SEED_INFO[emoji])
                .map(([emoji, qty]) => ({ ...SEED_INFO[emoji], qty }))

              if (ownedSeeds.length === 0) {
                return (
                  <div className="text-center py-6">
                    <div className="text-4xl mb-3">🌾</div>
                    <p className="text-sm font-black text-slate-600 mb-1">Kho hạt giống trống!</p>
                    <p className="text-xs text-slate-400 mb-4">Mua hạt giống ở cửa hàng để bắt đầu trồng</p>
                    <button onClick={() => { setSeedModal(false); setShopTab('seeds'); setShopModal(true) }}
                            className="bg-gradient-to-br from-green-500 to-green-700 text-white font-black text-sm px-6 py-2.5 rounded-xl shadow-[0_4px_0_#1b5e20] active:translate-y-1 active:shadow-none">
                      🛍️ Đến cửa hàng
                    </button>
                  </div>
                )
              }

              return (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {ownedSeeds.map(s => (
                      <button key={s.emoji} onClick={() => setSelectedSeed(s)}
                              className={`relative rounded-xl p-2.5 text-center border-2 transition-all active:scale-95
                                ${selectedSeed.emoji === s.emoji ? 'border-green-500 bg-green-50' : 'border-lime-200 bg-lime-50'}`}>
                        {/* Badge số lượng */}
                        <div className="absolute -top-1.5 -right-1.5 bg-violet-600 text-white text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                          {s.qty}
                        </div>
                        <div className="text-2xl mb-0.5">{s.emoji}</div>
                        <div className="text-[10px] font-black">{s.name}</div>
                        <div className="text-[9px] text-slate-400 mb-1">⏱ {s.time}</div>
                        <div className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-md">+{s.reward}π</div>
                      </button>
                    ))}
                  </div>
                  <button onClick={plantSeed}
                          className="w-full bg-gradient-to-br from-green-500 to-green-700 text-white font-black text-base py-3.5 rounded-xl shadow-[0_4px_0_#1b5e20] active:translate-y-1 active:shadow-none">
                    🌱 Gieo ngay
                  </button>
                </>
              )
            })()}
          </div>
        </DrawerContent>
      </Drawer>

      {/* SHOP DRAWER */}
      <Drawer open={shopModal} onOpenChange={setShopModal}>
        <DrawerContent className="rounded-t-2xl border-t-4 border-yellow-400 max-h-[85vh]" style={{ background: 'linear-gradient(180deg,#fff9e6,#fffde7)' }}>
          <DrawerHeader className="pb-0">
            <DrawerTitle style={{ fontFamily:"'Baloo 2',cursive" }} className="text-center text-xl">🛍️ Cửa Hàng</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pt-2 pb-1">
            {/* Tabs */}
            <div className="flex gap-2 mb-3">
              {([['seeds','🌱 Hạt giống'],['fert','⚗️ Phân bón'],['land','🟫 Mua đất']] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setShopTab(tab as 'seeds'|'fert'|'land')}
                        className={`flex-1 py-1.5 rounded-xl text-[11px] font-black border-2 transition-all
                          ${shopTab === tab ? 'bg-green-600 text-white border-green-700' : 'bg-white text-slate-500 border-slate-200'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto px-4 pb-5" style={{ maxHeight: '55vh' }}>

            {/* ── HẠT GIỐNG ── */}
            {shopTab === 'seeds' && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { emoji:'🌹', name:'Hoa hồng',  time:'6h',  reward:0.80, price:0.10, qty:5  },
                  { emoji:'🌷', name:'Hoa tulip',  time:'8h',  reward:1.00, price:0.15, qty:5  },
                  { emoji:'🌾', name:'Lúa',        time:'4h',  reward:0.45, price:0.06, qty:10 },
                  { emoji:'🌽', name:'Ngô',        time:'6h',  reward:0.55, price:0.08, qty:10 },
                  { emoji:'🎃', name:'Bí ngô',     time:'12h', reward:1.20, price:0.18, qty:5  },
                  { emoji:'🥬', name:'Rau cải',    time:'2h',  reward:0.15, price:0.03, qty:10 },
                ].map(item => (
                  <button key={item.name}
                          onClick={() => {
                            if (piBalance < item.price) { showToast(`❌ Cần ${item.price}π!`); return }
                            setPi(b => Math.round((b - item.price) * 100) / 100)
                            setInventory(inv => ({ ...inv, [item.emoji]: (inv[item.emoji] || 0) + item.qty }))
                            showToast(`✅ Mua ${item.qty} hạt ${item.name}!`)
                          }}
                          className="rounded-xl p-2 text-center border-2 border-lime-200 bg-lime-50 active:scale-95 transition-all">
                    <div className="text-2xl mb-0.5">{item.emoji}</div>
                    <div className="text-[10px] font-black leading-tight">{item.name}</div>
                    <div className="text-[9px] text-slate-400">⏱ {item.time}</div>
                    <div className="text-[9px] text-green-600 font-bold">+{item.reward}π</div>
                    <div className="mt-1 bg-violet-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-lg">
                      π{item.price} ×{item.qty}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── PHÂN BÓN ── */}
            {shopTab === 'fert' && (
              <div className="flex flex-col gap-2.5">
                {[
                  { emoji:'⚗️', name:'Phân thường',   desc:'Tăng 20% tốc độ lớn',  price:0.05, qty:5  },
                  { emoji:'🧪', name:'Phân khoáng',    desc:'Tăng 40% tốc độ lớn',  price:0.12, qty:5  },
                  { emoji:'💎', name:'Phân đặc biệt',  desc:'Tăng 80% tốc độ lớn',  price:0.25, qty:3  },
                  { emoji:'🌿', name:'Phân hữu cơ',    desc:'Cây không bị héo 24h',  price:0.08, qty:5  },
                ].map(item => (
                  <button key={item.name}
                          onClick={() => {
                            if (piBalance < item.price) { showToast(`❌ Cần ${item.price}π!`); return }
                            setPi(b => Math.round((b - item.price) * 100) / 100)
                            setInventory(inv => ({ ...inv, [item.emoji]: (inv[item.emoji] || 0) + item.qty }))
                            showToast(`✅ Mua ${item.qty} ${item.name}!`)
                          }}
                          className="flex items-center gap-3 rounded-xl p-3 border-2 border-amber-200 bg-amber-50 active:scale-95 transition-all">
                    <span className="text-3xl">{item.emoji}</span>
                    <div className="flex-1 text-left">
                      <div className="text-xs font-black">{item.name}</div>
                      <div className="text-[10px] text-slate-500">{item.desc}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">Số lượng: ×{item.qty}</div>
                    </div>
                    <div className="bg-violet-600 text-white text-xs font-black px-2.5 py-1.5 rounded-xl">
                      π{item.price}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── MUA ĐẤT ── */}
            {shopTab === 'land' && (
              <div>
                <p className="text-center text-xs text-slate-400 mb-4">Ô mới xuất hiện ngay trong vườn!</p>
                {/* Giá tăng theo số ô hiện có */}
                <div className="bg-white rounded-2xl border-2 border-amber-200 p-4 mb-3 text-center shadow-sm">
                  <div className="text-4xl mb-2">🟫</div>
                  <div className="text-sm font-black mb-1">Ô đất #{plots.length + 1}</div>
                  <div className="text-xs text-slate-400 mb-3">Hiện có {plots.length} ô · Giá tăng theo số ô</div>
                  <button onClick={buyPlot}
                          className="w-full bg-gradient-to-br from-violet-600 to-violet-800 text-white font-black text-base py-3 rounded-xl shadow-[0_4px_0_#3b0764] active:translate-y-1 active:shadow-none">
                    Mua ngay — π {nextPlotPrice.toFixed(1)}
                  </button>
                </div>
                {/* Bảng giá */}
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                  <p className="text-[10px] font-black text-amber-700 mb-2">📊 Bảng giá tiếp theo</p>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[0,1,2].map(offset => {
                      const n = plots.length + offset
                      const p = Math.round(n * 1.5 * 10) / 10
                      return (
                        <div key={offset} className={`rounded-lg py-1.5 ${offset === 0 ? 'bg-violet-100 border border-violet-300' : 'bg-white border border-slate-100'}`}>
                          <div className="text-[9px] text-slate-400">Ô #{n + 1}</div>
                          <div className={`text-[11px] font-black ${offset === 0 ? 'text-violet-700' : 'text-slate-600'}`}>π {p.toFixed(1)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>
        </DrawerContent>
      </Drawer>

      {/* INVENTORY DIALOG */}
      <Dialog open={invModal} onOpenChange={setInvModal}>
        <DialogContent className="rounded-2xl border-t-4 border-yellow-300 max-w-sm mx-auto"
                        style={{ background: 'linear-gradient(180deg,#fff9e6,#fffde7)' }}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily:"'Baloo 2',cursive" }} className="text-center text-xl">🏚 Nhà Kho</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {(() => {
              const ALL_ITEM_NAMES: Record<string, string> = {
                '🥬':'Rau cải','🌹':'Hoa hồng','🌷':'Hoa tulip','🌾':'Lúa',
                '🌽':'Ngô','🎃':'Bí ngô','🍅':'Cà chua','🥕':'Cà rốt',
                '⚗️':'Phân thường','🧪':'Phân khoáng','💎':'Phân đặc biệt','🌿':'Phân hữu cơ',
              }
              const items = Object.entries(inventory).filter(([, qty]) => qty > 0)
              if (items.length === 0) {
                return (
                  <div className="col-span-4 text-center py-4 text-slate-400 text-xs">
                    Kho trống! Hãy trồng cây hoặc mua đồ ở cửa hàng.
                  </div>
                )
              }
              return items.map(([emoji, qty]) => (
                <button key={emoji} onClick={() => showToast(`${emoji} ${ALL_ITEM_NAMES[emoji] || emoji}: ${qty}`)}
                        className="relative rounded-xl border-2 border-gray-100 bg-white p-2 text-center active:scale-90">
                  <div className="text-2xl">{emoji}</div>
                  <div className="text-[8px] font-black mt-0.5">{ALL_ITEM_NAMES[emoji] || emoji}</div>
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">{qty}</div>
                </button>
              ))
            })()}
          </div>
          <button onClick={() => { showToast('🏪 Mở chợ...'); setInvModal(false) }}
                  className="w-full bg-gradient-to-br from-violet-600 to-violet-800 text-white font-black text-sm py-3 rounded-xl shadow-[0_4px_0_#3b0764] active:translate-y-1 active:shadow-none">
            🏪 Bán nông sản
          </button>
        </DialogContent>
      </Dialog>



      {/* LỖI KHÔNG VÀO ĐƯỢC PIBROWSER */}
      {username === '❌' && (
        <div className="fixed inset-0 z-[900] flex flex-col items-center justify-center px-8"
             style={{ background: 'linear-gradient(135deg,#1a0533 0%,#2d0a5e 50%,#1a0533 100%)' }}>
          <div style={{ fontSize:56, marginBottom:16 }}>😢</div>
          <div className="text-white text-lg font-black mb-3 text-center" style={{ fontFamily:"'Baloo 2',cursive" }}>
            Cần mở bằng Pi Browser
          </div>
          <div className="text-purple-300 text-sm text-center mb-6 leading-relaxed">
            Game này chỉ chạy trong Pi Browser.<br/>
            Vui lòng mở link bằng ứng dụng Pi Browser.
          </div>
          <button onClick={() => window.location.reload()}
                  className="bg-purple-600 text-white font-black px-8 py-3 rounded-xl active:scale-95">
            🔄 Thử lại
          </button>
        </div>
      )}
    </div>
  )
}

// ─── ROAD FLOWERS ─────────────────────────────────────────────────────
function RoadFlowers() {
  const roadY = typeof window !== 'undefined' ? (window.innerHeight * 0.20 + 15 + 5) : 120
  return (
    <>
      {[['🌼',7,'0s'],['🌸',32,'0.6s'],['🌼',64,'1.2s'],['💐',87,'0.9s']].map(([f,pct,delay],i) => (
        <span key={i} className="absolute text-[9px] pointer-events-none"
              style={{ top: roadY + (i%2)*2, left:`${pct}%`,
                       animation: `leafSway 3s ease-in-out ${delay} infinite` }}>
          {f}
        </span>
      ))}
    </>
  )
}

// ─── ZONES & BUILDINGS ────────────────────────────────────────────────
function ZonesAndBuildings({ piBalance, onKitchen, onWarehouse, onPond }: {
  piBalance: number
  onKitchen: () => void
  onWarehouse: () => void
  onPond: () => void
}) {
  // Computed from viewport
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const greenY = Math.round(vh * 0.20) + 41
  const greenH = vh - greenY - 111
  const zoneHF = greenH - 30
  const zoneAW = Math.floor(vw * 0.44)
  const zoneBCW = Math.floor((vw - zoneAW - 26) / 2)
  const zoneYS = greenY + 4
  const bldY = zoneYS + 20

  return (
    <>
      {/* Zone borders */}
      {[
        { x:0,           w:zoneAW,   lbl:'🏡 Khu nhà & hồ' },
        { x:zoneAW+13,   w:zoneBCW,  lbl:'🌱 Vườn 1' },
        { x:zoneAW+13+zoneBCW+13, w:zoneBCW, lbl:'🌱 Vườn 2' },
      ].map((z, i) => (
        <div key={i} className="absolute rounded-lg border-[3px] border-green-800 pointer-events-none"
             style={{ left:z.x, top:zoneYS, width:z.w, height:zoneHF,
                      boxShadow:'inset 0 0 18px rgba(0,0,0,0.07),0 3px 8px rgba(0,0,0,0.13)',
                      background:'radial-gradient(circle at 12% 20%,rgba(255,255,255,0.07) 2px,transparent 3px),linear-gradient(155deg,#6abf40 0%,#5aaf30 45%,#4a9f20 100%)' }}>
          <div className="text-center text-[8px] font-black text-white/65 uppercase tracking-widest mt-1">{z.lbl}</div>
        </div>
      ))}

      {/* Vertical dividers */}
      {[zoneAW, zoneAW+13+zoneBCW].map((x, i) => (
        <div key={i} className="absolute pointer-events-none"
             style={{ left:x, top:greenY, width:13, bottom:111,
                      background:'#c8a46e' }} />
      ))}

      {/* ── NHÀ BẾP — trái khu nhà ── */}
      <button onClick={onKitchen} className="absolute z-[15] active:brightness-110"
              style={{ left: 4, top: zoneYS + 14 }}>
        <Building type="kitchen" />
      </button>

      {/* ── NHÀ KHO — phải khu nhà ── */}
      <button onClick={onWarehouse} className="absolute z-[15] active:brightness-110"
              style={{ left: zoneAW - 72, top: zoneYS + 14 }}>
        <Building type="warehouse" />
      </button>

      {/* ── TƯỢNG ĐÀI PI — giữa nhà và hồ cá ── */}
      <div className="absolute z-[16] pointer-events-none flex flex-col items-center"
           style={{ left: Math.round(zoneAW / 2) - 30, top: zoneYS + 115 }}>
        <div style={{ position:'absolute', width:60, height:60, borderRadius:'50%', top:0,
                      background:'radial-gradient(circle,rgba(160,100,255,0.6) 0%,transparent 70%)',
                      animation:'piGlow 2.5s ease-in-out infinite' }} />
        <span style={{
          fontSize:44, lineHeight:1, fontWeight:900, fontFamily:"'Baloo 2',cursive",
          background:'linear-gradient(180deg,#f0d0ff 0%,#c084fc 35%,#9333ea 70%,#6b21a8 100%)',
          WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
          filter:'drop-shadow(0 0 8px rgba(168,85,247,0.95)) drop-shadow(0 3px 0 rgba(0,0,0,0.5))',
          animation:'piFloat 3s ease-in-out infinite', position:'relative', zIndex:2,
        }}>π</span>
        <div style={{ width:52, height:14, marginTop:1,
                      background:'linear-gradient(180deg,#8b7aa0,#4a3f5c)',
                      borderRadius:'3px 3px 0 0', border:'1px solid #a990c0',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      boxShadow:'0 2px 6px rgba(0,0,0,0.5)' }}>
          <span style={{ fontSize:5.5, fontWeight:900, color:'#f0d0ff', letterSpacing:1 }}>LÀNG PI</span>
        </div>
        <div style={{ width:60, height:6, background:'linear-gradient(180deg,#5a4f6a,#3a3048)',
                      borderRadius:'0 0 4px 4px', boxShadow:'0 4px 8px rgba(0,0,0,0.6)' }} />
        {[[-22,3,8,14],[-12,-1,6,10],[12,-1,6,10],[22,3,8,14]].map(([x,y,w,h],i)=>(
          <div key={i} style={{ position:'absolute', bottom:4, left:`calc(50% + ${x}px)`,
            width:w, height:h, background:'linear-gradient(180deg,#d8b4fe,#7c3aed)',
            clipPath:'polygon(50% 0%,100% 100%,0% 100%)', opacity:0.85 }} />
        ))}
      </div>

      {/* ── HỒ CÁ ── */}
      <Pond onTap={onPond} zoneAW={zoneAW} zoneYS={zoneYS} zoneHF={zoneHF} />
    </>
  )
}

// ─── BUILDING ─────────────────────────────────────────────────────────
function Building({ type }: { type: 'kitchen' | 'warehouse' }) {
  const isK = type === 'kitchen'
  return (
    <div className="relative w-[68px]">
      {/* Chimney (kitchen only) */}
      {isK && (
        <div className="absolute right-[18%] bg-stone-500 border-2 border-stone-700 z-10"
             style={{ bottom:'100%', width:11, height:16, marginBottom:-2 }}>
          <span className="absolute text-[9px]" style={{ animation:'smokeMain 2.2s ease-out infinite', bottom:'100%', left:0 }}>💨</span>
        </div>
      )}
      {/* Triangle peak (warehouse) */}
      {!isK && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[2]"
             style={{ bottom:'100%', width:0, height:0,
                      borderLeft:'39px solid transparent', borderRight:'39px solid transparent',
                      borderBottom:'16px solid #546e7a' }} />
      )}
      {/* Roof */}
      <div className="absolute left-[-4px] right-[-4px] z-[1]"
           style={{ bottom: isK ? '100%' : 'calc(48px + 25px)', height: isK ? 22 : 25,
                    background: isK ? 'linear-gradient(180deg,#ef9a9a,#e57373)' : 'linear-gradient(180deg,#b0bec5,#90a4ae)',
                    border: `2px solid ${isK ? '#c62828' : '#546e7a'}`, borderBottom:'none', borderRadius:'3px 3px 0 0' }}>
        {isK && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2"
               style={{ width:0, height:0, borderLeft:'17px solid transparent', borderRight:'17px solid transparent', borderBottom:`11px solid #c62828` }} />
        )}
        {!isK && (
          <div className="absolute inset-0"
               style={{ background:'repeating-linear-gradient(90deg,transparent 0,transparent 7px,rgba(0,0,0,0.07) 7px,rgba(0,0,0,0.07) 8px)' }} />
        )}
      </div>
      {/* Body */}
      <div className="relative border-[3px] border-amber-900 rounded-t-sm"
           style={{ width:68, height:48, marginTop: isK ? 22 : 48+25,
                    background: isK ? 'linear-gradient(180deg,#e8c49a,#d4a26a)' : 'linear-gradient(180deg,#d4a26a,#c08040)',
                    boxShadow:'inset -4px 0 0 rgba(0,0,0,0.12)' }}>
        {/* Sign */}
        <div className="absolute -top-[15px] left-1/2 -translate-x-1/2 whitespace-nowrap
          bg-gradient-to-br from-yellow-200 to-yellow-400 border-2 border-orange-600 rounded-md
          px-1.5 py-0.5 text-[7px] font-black text-amber-900 shadow">
          {isK ? 'NHÀ BẾP' : '🏚 NHÀ KHO'}
        </div>
        {/* Windows */}
        <div className="absolute w-3 h-3 top-2 left-[5px] rounded-sm border-2 border-amber-900 bg-gradient-to-br from-sky-200 to-sky-400" />
        <div className="absolute w-3 h-3 top-2 right-[5px] rounded-sm border-2 border-amber-900 bg-gradient-to-br from-sky-200 to-sky-400" />
        {/* Door */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[17px] h-6 rounded-t-sm border-2 border-amber-950 bg-gradient-to-b from-amber-800 to-amber-950">
          <div className="absolute w-1 h-1 rounded-full bg-yellow-400 right-[18%] top-[32%]" style={{ boxShadow:'0 0 3px rgba(255,215,0,0.7)' }} />
        </div>
        {/* Decoration */}
        <span className="absolute bottom-0.5 left-1 text-[10px]">{isK ? '🍳' : '🪣'}</span>
        <span className="absolute bottom-0.5 right-1 text-[9px]">{isK ? '🔥' : '⚗️'}</span>
      </div>
      {/* Enter arrow */}
      <div className="absolute -bottom-4 left-1/2 text-[8px] font-black text-white text-center arr-anim"
           style={{ textShadow:'0 1px 2px rgba(0,0,0,0.5)' }}>
        {isK ? 'Vào' : 'Kho'}<br/><span className="text-yellow-400">▼</span>
      </div>
    </div>
  )
}

// ─── POND ─────────────────────────────────────────────────────────────
function Pond({ onTap, zoneAW, zoneYS, zoneHF }: { onTap:()=>void; zoneAW:number; zoneYS:number; zoneHF:number }) {
  const bldSecH = Math.round(zoneHF * 0.52)
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const pondSize = Math.min(Math.round(zoneAW * 0.74), Math.round(zoneHF * 0.42))
  const pondX = Math.round((zoneAW - pondSize) / 2)
  const pondY = zoneYS + bldSecH + 10
  const FH=20, FW=20, PAD=5
  const wrapW = pondSize + (PAD+FW)*2
  const wrapH = pondSize + (PAD+FH)*2
  const wrapX = pondX - PAD - FW
  const wrapY = pondY - PAD - FH
  const gateH = Math.round(wrapH * 0.35)
  const solidH = wrapH - gateH

  // Tree position
  const kitchX = Math.round((zoneAW*0.5 - 68)/2 - 2)
  const treeX = Math.max(4, Math.round((kitchX + 68 + wrapX) / 2) - 22)
  const treeY2 = wrapY + solidH - 14

  const fenceStyle = {
    h: {
      height: FH,
      backgroundImage: 'repeating-linear-gradient(90deg,#7a4e20 0px,#7a4e20 8px,#c8943a 8px,#e0b060 12px,#c8943a 12px,#c8943a 17px,transparent 17px,transparent 22px)',
      borderTop: '3px solid #d4a040',
      borderBottom: '2px solid #7a4010',
    },
    v: {
      width: FW,
      backgroundImage: 'repeating-linear-gradient(180deg,#7a4e20 0px,#7a4e20 8px,#c8943a 8px,#e0b060 12px,#c8943a 12px,#c8943a 17px,transparent 17px,transparent 22px)',
      borderLeft: '3px solid #d4a040',
      borderRight: '2px solid #7a4010',
    },
  }

  return (
    <>
      {/* Pond tree */}
      <div className="absolute pointer-events-none tree-sway z-[14]"
           style={{ left:treeX, top:treeY2 }}>
        <span className="text-5xl drop-shadow-lg">🌳</span>
      </div>

      {/* Fence wrapper */}
      <div className="absolute z-[9]" style={{ left:wrapX, top:wrapY, width:wrapW, height:wrapH }}>
        {/* Top fence */}
        <div className="absolute pointer-events-none box-border" style={{ top:0, left:0, width:wrapW, ...fenceStyle.h }} />
        {/* Right fence */}
        <div className="absolute pointer-events-none box-border" style={{ top:0, right:0, height:wrapH, ...fenceStyle.v }} />
        {/* Bottom fence */}
        <div className="absolute pointer-events-none box-border" style={{ bottom:0, left:0, width:wrapW, ...fenceStyle.h }} />
        {/* Left fence (gate at bottom) */}
        <div className="absolute pointer-events-none box-border" style={{ top:0, left:0, height:solidH, ...fenceStyle.v }} />
      </div>

      {/* Pond itself */}
      <button onClick={onTap} className="absolute z-[10] rounded-lg overflow-hidden"
              style={{ left: pondX, top: pondY, width: pondSize, height: pondSize,
                       background: 'radial-gradient(ellipse at 28% 28%,rgba(255,255,255,0.30) 0%,transparent 55%),radial-gradient(ellipse at 74% 70%,rgba(255,255,255,0.12) 0%,transparent 45%),linear-gradient(160deg,#4dd0e1 0%,#26c6da 35%,#00acc1 60%,#00838f 100%)',
                       border:'3px solid #006064',
                       boxShadow:'inset 0 4px 14px rgba(255,255,255,0.20),inset 0 -4px 10px rgba(0,80,100,0.25),0 4px 16px rgba(0,150,180,0.28)' }}>
        {/* Ripples */}
        {[[30,35,0.28,'0s','3s'],[60,20,0.18,'1.1s','3.5s'],[18,62,0.15,'2s','4s'],[68,58,0.21,'0.6s','3.2s']].map(([l,t,r,d,dur],i) => {
          const w = Math.round(pondSize * (r as number))
          return (
            <div key={i} className="absolute rounded-full border-2 border-white/40 pointer-events-none"
                 style={{ left:`${l}%`, top:`${t}%`, width:w, height:Math.round(w*0.55),
                          marginLeft:-Math.round(w/2), marginTop:-Math.round(w*0.28),
                          animation:`ripple ${dur} ease-out ${d} infinite` }} />
          )
        })}
        {/* Sparkles */}
        {[['20%','28%','0s'],['70%','18%','0.9s'],['44%','52%','1.6s'],['14%','68%','2.3s'],['80%','60%','0.4s']].map(([l,t,d],i) => (
          <i key={i} className="absolute text-white not-italic text-[9px] pointer-events-none"
             style={{ left:l, top:t, animation:`spark ${1.6+parseFloat(d as string)*0.4}s ease-in-out ${d} infinite` }}>✦</i>
        ))}
        {/* Leaves */}
        {[['16%','58%',0.18,'0s','3.8s'],['50%','50%',0.14,'1.4s','4.2s'],['70%','26%',0.12,'2.2s','3.5s']].map(([l,t,sz,d,dur],i) => (
          <div key={i} className="absolute pointer-events-none"
               style={{ left:l as string, top:t as string, fontSize:Math.round(pondSize*(sz as number)),
                        animation:`leafSway ${dur} ease-in-out ${d} infinite` }}>🍃</div>
        ))}
        {/* Fish */}
        <div className="absolute pointer-events-none text-[11px]"
             style={{ top:'42%', left:'8%', animation:'fishSwim 5s linear infinite' }}>🐟</div>
        <div className="absolute pointer-events-none text-[11px]"
             style={{ top:'62%', left:'38%', animation:'fishSwim 7s linear 2s infinite' }}>🐟</div>
        {/* Reflection */}
        <div className="absolute top-0 left-0 right-0 h-[38%] pointer-events-none"
             style={{ background:'linear-gradient(180deg,rgba(255,255,255,0.16) 0%,transparent 100%)' }} />
        {/* Label */}
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] font-black text-white/70 whitespace-nowrap pointer-events-none"
             style={{ textShadow:'0 1px 3px rgba(0,0,0,0.4)' }}>🌊 Hồ nước</div>
      </button>
    </>
  )
}

// ─── PLOT GRIDS ───────────────────────────────────────────────────────
function PlotGrids({ plots, onPlotTap }: { plots: Plot[]; onPlotTap: (idx:number, e:React.MouseEvent) => void }) {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const greenY = Math.round(vh * 0.20) + 41
  const greenH = vh - greenY - 111
  const zoneAW = Math.floor(vw * 0.44)
  const zoneBCW = Math.floor((vw - zoneAW - 26) / 2)
  const zoneYS = greenY + 4
  const zoneHF = greenH - 30

  const PAD=5, PG=4, COLS=2
  const plotW = Math.floor((zoneBCW - PAD*2 - PG) / COLS)
  const plotH = Math.floor(plotW * 0.88)
  const rows = Math.floor((zoneHF - 20 + PG) / (plotH + PG))
  const maxPer = COLS * rows

  const zoneXs = [zoneAW + 13, zoneAW + 13 + zoneBCW + 13]

  return (
    <>
      {[0, 1].map(z => {
        const startIdx = z * maxPer
        const zPlots = plots.slice(startIdx, startIdx + maxPer)
        return (
          <div key={z} className="absolute"
               style={{ left: zoneXs[z] + PAD, top: zoneYS + 18,
                        display:'grid', gridTemplateColumns: `repeat(${COLS},${plotW}px)`,
                        gridAutoRows: plotH, columnGap: PG, rowGap: PG }}>
            {zPlots.map((p, li) => (
              <PlotCell key={li} plot={p} onClick={(e) => onPlotTap(startIdx + li, e)} />
            ))}
          </div>
        )
      })}
    </>
  )
}
