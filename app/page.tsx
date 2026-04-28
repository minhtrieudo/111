'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import {
  supabase, loadFarm, saveFarm, loadFarmByUsername,
  applyVisitAction, logVisitEvent, loadUnseenVisits, markVisitsSeen,
  type FarmRow, type VisitLogRow
} from '@/lib/supabase'
import { usePiAuth } from '@/contexts/pi-auth-context'
import { PlotCell } from '@/components/PlotCell'
import { RoadFlowers, ZonesAndBuildings, PlotGrids } from '@/components/WorldScene'
import {
  type PlotState, type Plot, type SeedOption, type GameState, type Fish, type Chicken,
  SEEDS, STATE_LABEL, SEED_INFO, GROWTH_STAGES, STAGE_LABELS,
  INITIAL_PLOTS, INITIAL_INVENTORY,
  FISH_GROW_MS, CHICKEN_MATURE_MS, EGG_INTERVAL_MS, FISH_SELL_REWARD, EGG_SELL_REWARD,
  timeStringToMs, msToTimeString, getPlantVisual, getRandomMsg, VISIT_MESSAGES,
} from '@/lib/game-types'
import { saveLocalCache, loadLocalCache, rowToState, resolveReadyPlots } from '@/lib/game-storage'



// ─── MAIN GAME ────────────────────────────────────────────────────────
export default function LangPi() {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [plots, setPlots]           = useState<Plot[]>(INITIAL_PLOTS)
  const [piBalance, setPi]          = useState(0)
  const [stars, setStars]           = useState(0)
  const [charPos, setCharPos]       = useState({ x: 28, y: 38 })
  const [isWalking, setIsWalking]   = useState(false)
  const [walkFrame, setWalkFrame]   = useState(0)
  const [facingLeft, setFacingLeft] = useState(false)
  const [gender, setGender]         = useState<'male'|'female'|null>(null)
  const [showGenderPick, setShowGenderPick] = useState(false)
  const walkTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const [shopTab, setShopTab]       = useState<'seeds'|'fert'|'land'|'animals'>('seeds')
  const [selectedSeed, setSelectedSeed] = useState<SeedOption>(SEEDS[0])
  const [pendingPlot, setPendingPlot]   = useState<number | null>(null)

  // Popup (compact icon menu above plot)
  const [popup, setPopup] = useState<{ idx: number; x: number; y: number } | null>(null)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ idx: number; act: string; message: string } | null>(null)

  // Social system
  const [villageModal, setVillageModal] = useState(false)
  const [visitTarget, setVisitTarget] = useState('')
  const [visitingState, setVisitingState] = useState<{ pi_uid?: string; username: string; plots: Plot[]; charPos: {x:number;y:number} } | null>(null)
  const [visitPopup, setVisitPopup] = useState<{ idx: number; x: number; y: number } | null>(null)
  const [notifications, setNotifications] = useState<string[]>([])
  const [notifModal, setNotifModal] = useState(false)
  const [fish, setFish]           = useState<Fish[]>([])
  const [chickens, setChickens]   = useState<Chicken[]>([])
  const [fishModal, setFishModal] = useState(false)
  const [henModal, setHenModal]   = useState(false)
  const fishId = useRef(0)
  const chickenId = useRef(0)

  const worldRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load cache ngay lập tức khi app mở (không chờ piUser) ──
  useEffect(() => {
    const cache = loadLocalCache()
    if (cache) {
      const s = rowToState(cache)
      const resolvedPlots = resolveReadyPlots(s.plots)
      setPlots(resolvedPlots)
      setPi(s.piBalance)
      setStars(s.stars)
      setCharPos(s.charPos)
      setInventory(s.inventory)
      if (s.fish)     setFish(s.fish)
      if (s.chickens) setChickens(s.chickens)
      if (s.username) setUsername(s.username)
    }
  }, [])

  // ── Save ngay khi user thoát app (không chờ debounce) ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && piUser && username &&
          username !== '...' && username !== '❌') {
        const farm: any = {
          pi_uid: piUser.uid, username,
          pi_balance: piBalance, stars, plots, inventory, char_pos: charPos,
          fish, chickens, gender,
        }
        saveLocalCache(farm)
        saveFarm(farm).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [plots, piBalance, stars, charPos, inventory, fish, chickens, username, piUser])

  // ── Initialize game — Pi SDK Authentication ──
  useEffect(() => {
    const init = async () => {
      if (!piUser) return

      const uid   = piUser.uid
      const uname = piUser.username
      setUsername(uname)
      console.log('[Game] ✅ Logged in:', uname, uid)

      // Load farm từ Supabase
      let row = await loadFarm(uid)

      if (!row) {
        // Người chơi mới — tạo farm
        row = {
          pi_uid: uid, username: uname,
          pi_balance: 10, stars: 0,
          plots: INITIAL_PLOTS, inventory: INITIAL_INVENTORY,
          char_pos: { x: 28, y: 38 },
        }
        try {
          await saveFarm(row)
          console.log('[Game] ✅ Tạo farm mới thành công!')
        } catch (err: any) {
          console.error('[Game] ❌ Lỗi tạo farm:', err?.message || err)
          showToast('❌ Lỗi DB: ' + (err?.message || 'unknown'))
        }
      } else {
        if (row.username !== uname) {
          row.username = uname
          await saveFarm(row)
        }
        console.log('[Game] ✅ Load farm thành công')
      }

      const s = rowToState(row)
      const resolvedPlots = resolveReadyPlots(s.plots)
      setPlots(resolvedPlots); setPi(s.piBalance); setStars(s.stars)
      setCharPos(s.charPos); setInventory(s.inventory)
      // Load cá và gà từ inventory đặc biệt
      if ((s.inventory as any)['__fish__']) setFish((s.inventory as any)['__fish__'])
      if ((s.inventory as any)['__chickens__']) setChickens((s.inventory as any)['__chickens__'])
      // Load gender từ farm
      const savedGender = (row as any).gender
      if (savedGender === 'male' || savedGender === 'female') {
        setGender(savedGender)
      } else {
        setShowGenderPick(true)
      }
      saveLocalCache({ ...row, plots: resolvedPlots })
      setGameState({ username: uname, piBalance: s.piBalance, stars: s.stars, plots: resolvedPlots, charPos: s.charPos, inventory: s.inventory })

      loadNotifications(uid)
      const cleanup = setupRealtime(uid)
      return cleanup
    }

    init()
  }, [piUser])

  // Tách helper load notifications
  const loadNotifications = async (uname: string) => {
    const visits = await loadUnseenVisits(piUser?.uid || uname)
    if (visits.length > 0) {
      const msgs = visits.map(ev => {
        const plantName = ev.plant ? (SEED_INFO[ev.plant]?.name || ev.plant) : 'vườn'
        if (ev.type === 'water') return getRandomMsg(VISIT_MESSAGES.water, ev.visitor_name || ev.visitor_uid, plantName)
        if (ev.type === 'pest')  return getRandomMsg(VISIT_MESSAGES.pest,  ev.visitor_name || ev.visitor_uid, plantName)
        if (ev.type === 'steal') return getRandomMsg(VISIT_MESSAGES.steal, ev.visitor_name || ev.visitor_uid, plantName, ev.amount || 5)
        return ''
      }).filter(Boolean)
      setNotifications(msgs)
      setNotifModal(true)
      await markVisitsSeen(piUser?.uid || uname)
    }
  }

  // Tách helper setup realtime
  const setupRealtime = (uname: string) => {
    const channel = supabase
      .channel(`farm_${uname}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'farms',
        filter: `pi_uid=eq.${uname}`
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

  // ── Auto-save lên Supabase (debounce 800ms) ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!username || username === 'Unknown' || username === '...' || username === '❌' || !piUser) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const farm: any = {
        pi_uid: piUser!.uid, username,
        pi_balance: piBalance, stars, plots, inventory, char_pos: charPos,
        fish, chickens,
      }
      saveLocalCache(farm)
      try { await saveFarm(farm) } catch (err) {
        console.error('[v0] ❌ Failed to save farm:', err)
      }
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [plots, piBalance, stars, charPos, inventory, fish, chickens, username])

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

  // ── Timer gà đẻ trứng (mỗi phút) ──
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const FED_WINDOW = 8 * 60 * 60 * 1000
      setChickens(cs => cs.map(c => {
        if (now < c.matureAt) return c // chưa trưởng thành
        // Không cho ăn → đẻ chậm 2x
        const effectiveInterval = (now - c.fedAt) > FED_WINDOW
          ? EGG_INTERVAL_MS * 2 : EGG_INTERVAL_MS
        const elapsed = now - c.lastEggAt
        const newEggs = Math.floor(elapsed / effectiveInterval)
        if (newEggs <= 0) return c
        return { ...c, eggs: c.eggs + newEggs, lastEggAt: c.lastEggAt + newEggs * effectiveInterval }
      }))
    }, 60000)
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
    const row = await loadFarmByUsername(targetUser)
    if (!row) { showToast(`❌ Không tìm thấy vườn của "${targetUser}"`); return }
    setVisitingState({
      pi_uid: row.pi_uid,
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
      visitingState.pi_uid || visitingState.username, plotIdx, act, visitingState.plots
    )
    await logVisitEvent({
      target_uid:   visitingState.pi_uid || visitingState.username,
      visitor_uid:  piUser?.uid || username,
      visitor_name: username,
      type:         act,
      plot_idx:     plotIdx,
      plant:        plot.plant || undefined,
      amount:       act === 'steal' ? 5 : (act === 'water' ? 20 : 15),
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

  // ── Thả cá vào ao ──
  const addFish = useCallback(() => {
    if (fish.length >= 5) { showToast('❌ Ao đầy rồi! Tối đa 5 con'); return }
    const fishInInv = inventory['🐟'] || 0
    if (fishInInv < 1) { showToast('❌ Không có cá con! Mua ở cửa hàng'); return }
    const now = Date.now()
    const newFish: Fish = {
      id: ++fishId.current,
      placedAt: now, fedAt: now,
      readyAt: now + FISH_GROW_MS,
      name: '🐟',
    }
    setFish(f => [...f, newFish])
    setInventory(inv => {
      const n = (inv['🐟'] || 0) - 1
      return n <= 0 ? (({ '🐟': _, ...rest }) => rest)(inv) : { ...inv, '🐟': n }
    })
    showToast('🐟 Đã thả cá vào ao!')
  }, [fish, inventory, showToast])

  // ── Thả gà vào tổ ──
  const addChicken = useCallback(() => {
    if (chickens.length >= 5) { showToast('❌ Tổ đầy rồi! Tối đa 5 con'); return }
    const chkInInv = inventory['🐣'] || 0
    if (chkInInv < 1) { showToast('❌ Không có gà con! Mua ở cửa hàng'); return }
    const now = Date.now()
    const newChicken: Chicken = {
      id: ++chickenId.current,
      placedAt: now, fedAt: now,
      matureAt: now + CHICKEN_MATURE_MS,
      lastEggAt: now + CHICKEN_MATURE_MS,
      eggs: 0,
    }
    setChickens(c => [...c, newChicken])
    setInventory(inv => {
      const n = (inv['🐣'] || 0) - 1
      return n <= 0 ? (({ '🐣': _, ...rest }) => rest)(inv) : { ...inv, '🐣': n }
    })
    showToast('🐣 Đã thả gà vào tổ!')
  }, [chickens, inventory, showToast])

  // ── Cho cá ăn ──
  const feedFish = useCallback((id: number) => {
    const food = inventory['🌾'] || 0
    if (food < 1) { showToast('❌ Hết thức ăn! Mua thêm ở cửa hàng'); return }
    setFish(fs => fs.map(f => f.id === id ? { ...f, fedAt: Date.now() } : f))
    setInventory(inv => {
      const n = (inv['🌾'] || 0) - 1
      return n <= 0 ? (({ '🌾': _, ...rest }) => rest)(inv) : { ...inv, '🌾': n }
    })
    showToast('🌾 Cho cá ăn rồi! +tốc độ lớn')
  }, [inventory, showToast])

  // ── Cho gà ăn ──
  const feedChicken = useCallback((id: number) => {
    const food = inventory['🌾'] || 0
    if (food < 1) { showToast('❌ Hết thức ăn! Mua thêm ở cửa hàng'); return }
    setChickens(cs => cs.map(c => c.id === id ? { ...c, fedAt: Date.now() } : c))
    setInventory(inv => {
      const n = (inv['🌾'] || 0) - 1
      return n <= 0 ? (({ '🌾': _, ...rest }) => rest)(inv) : { ...inv, '🌾': n }
    })
    showToast('🌾 Cho gà ăn rồi! +trứng')
  }, [inventory, showToast])

  // ── Thu trứng ──
  const collectEggs = useCallback((id: number) => {
    const chicken = chickens.find(c => c.id === id)
    if (!chicken || chicken.eggs <= 0) { showToast('🥚 Chưa có trứng!'); return }
    const reward = Math.round(chicken.eggs * EGG_SELL_REWARD * 100) / 100
    spawnCoin(window.innerWidth / 2, window.innerHeight / 2, `+${reward}π`)
    setPi(b => Math.round((b + reward) * 100) / 100)
    setChickens(cs => cs.map(c => c.id === id ? { ...c, eggs: 0 } : c))
    showToast(`🥚 Thu ${chicken.eggs} trứng! +${reward}π`)
  }, [chickens, spawnCoin, showToast])

  // ── Bán cá ──
  const sellFish = useCallback((id: number) => {
    const f = fish.find(x => x.id === id)
    if (!f) return
    const now = Date.now()
    // Kiểm tra đủ lớn chưa
    if (now < f.readyAt) {
      const rem = msToTimeString(f.readyAt - now)
      showToast(`⏱ Còn ${rem} nữa mới bán được!`); return
    }
    // Tính thưởng — không cho ăn đủ thì giảm
    const FED_WINDOW = 8 * 60 * 60 * 1000 // 8 tiếng
    const timeSinceFed = now - f.fedAt
    const fedMultiplier = timeSinceFed > FED_WINDOW ? 0.5 : 1.0
    const reward = Math.round(FISH_SELL_REWARD * fedMultiplier * 100) / 100
    spawnCoin(window.innerWidth / 2, window.innerHeight / 2, `+${reward}π`)
    setPi(b => Math.round((b + reward) * 100) / 100)
    setFish(fs => fs.filter(x => x.id !== id))
    if (fedMultiplier < 1) showToast(`🐟 Bán cá được ${reward}π (ít vì không cho ăn đủ 😔)`)
    else showToast(`🐟 Bán cá được ${reward}π! Ngon!`)
  }, [fish, spawnCoin, showToast])

  // ── tap world to move char ──
  const handleWorldTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    if (el.closest('button, [data-nobubble]')) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    const newX = Math.max(2, Math.min(px - 2, 90))
    const newY = Math.max(22, Math.min(py - 4, 85))

    // Xác định hướng nhìn
    setCharPos(prev => {
      setFacingLeft(newX < prev.x)
      return { x: newX, y: newY }
    })

    // Bắt đầu animation đi bộ
    setIsWalking(true)
    if (walkTimer.current) clearInterval(walkTimer.current)
    if (stopTimer.current) clearTimeout(stopTimer.current)

    walkTimer.current = setInterval(() => {
      setWalkFrame(f => (f + 1) % 3)
    }, 280)

    // Dừng sau khi đến nơi
    stopTimer.current = setTimeout(() => {
      setIsWalking(false)
      setWalkFrame(0)
      if (walkTimer.current) clearInterval(walkTimer.current)
    }, 650)
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
        @keyframes breathe { 0%,100%{transform:scaleY(1) scaleX(1)} 40%{transform:scaleY(1.03) scaleX(0.98)} 70%{transform:scaleY(0.98) scaleX(1.01)} }
        @keyframes piGlow { 0%,100%{opacity:0.55} 50%{opacity:1} }
        @keyframes piFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes arrBob { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(3px)} }
        @keyframes smoke { 0%{transform:translateY(0) scale(0.5);opacity:0.9} 100%{transform:translateY(-20px) scale(1.4);opacity:0} }
        @keyframes smokeMain { 0%{transform:translateY(0) scale(0.5);opacity:0.9} 100%{transform:translateY(-20px) scale(1.4);opacity:0} }
        @keyframes badgeBob { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-3px)} }
        .char-anim { animation: breathe 1.6s ease-in-out infinite; }
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
          fish={fish}
          onKitchen={() => showToast('🍳 Nhà bếp — chế biến nông sản!')}
          onWarehouse={() => setInvModal(true)}
          onPond={() => setFishModal(true)}
          onHenHouse={() => setHenModal(true)}
        />

        {/* PLOT GRIDS — dùng plots của bạn khi thăm, plots của mình khi ở nhà */}
        <PlotGrids
          plots={visitingState ? visitingState.plots : plots}
          onPlotTap={visitingState ? handleVisitPlotTap : handlePlotTap}
        />

        {/* Character */}
        <div className="absolute pointer-events-none z-50 transition-all duration-[600ms] ease-in-out"
             style={{ left: `${visitingState ? visitingState.charPos.x : charPos.x}%`,
                      top:  `${visitingState ? visitingState.charPos.y : charPos.y}%` }}>
          <div className="relative flex flex-col items-center">
            {/* Sprite nhân vật */}
            {visitingState ? (
              <span className="char-anim block text-center text-3xl drop-shadow-md">🧑‍🌾</span>
            ) : (
              <img
                src={gender === 'female'
                  ? (isWalking
                    ? (walkFrame === 0 ? '/NewSprite4.png' : walkFrame === 1 ? '/NewSprite5.png' : '/NewSprite6.png')
                    : '/NewSprite4.png')
                  : (isWalking
                    ? (walkFrame === 0 ? '/NewSprite.png' : walkFrame === 1 ? '/NewSprite2.png' : '/NewSprite3.png')
                    : '/NewSprite.png')}
                alt="character"
                className="char-anim"
                style={{
                  width: 54,
                  height: 68,
                  objectFit: 'contain',
                  objectPosition: 'bottom',
                  transform: facingLeft ? 'scaleX(-1)' : 'scaleX(1)',
                  filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.4))',
                  imageRendering: 'pixelated',
                  transition: 'transform 0.1s',
                  transformOrigin: 'bottom center',
                }}
              />
            )}
            {/* Badge tên */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap
              bg-yellow-400 text-amber-900 text-[7px] font-black px-1.5 py-0.5
              rounded-md border border-yellow-300 shadow">
              {username.slice(0, 8)}
            </div>
          </div>
          {/* Bóng dưới chân */}
          <div className="w-5 h-1.5 bg-black/25 rounded-full mx-auto blur-[2px] mt-0.5" />
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

        {/* GÀ CHẠY TRONG VƯỜN */}
        {chickens.map((c, i) => {
          const now = Date.now()
          const isMature = now >= c.matureAt
          const emoji = isMature ? '🐔' : '🐣'
          // Mỗi con gà chạy ở vị trí khác nhau trong vùng vườn
          const vw = typeof window !== 'undefined' ? window.innerWidth : 390
          const zoneAW = Math.floor(vw * 0.44)
          const baseX = ((zoneAW + 20) / vw * 100) + (i % 2) * 15 + 5
          const baseY = 55 + Math.floor(i / 2) * 12
          return (
            <div key={c.id} className="absolute pointer-events-none z-[40]"
                 style={{ left: `${baseX}%`, top: `${baseY}%`,
                          animation: `fishSwim ${3 + i * 0.7}s linear ${i * 1.2}s infinite` }}>
              <span style={{ fontSize: isMature ? 18 : 13 }}>{emoji}</span>
              {c.eggs > 0 && (
                <div className="absolute -top-3 -right-2 bg-yellow-400 text-yellow-900 text-[7px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                  {c.eggs}
                </div>
              )}
            </div>
          )
        })}
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

      {/* HỒ CÁ MODAL */}
      {fishModal && (
        <div className="fixed inset-0 z-[650] flex items-end justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setFishModal(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-sm shadow-2xl border-t-4 border-blue-400 pb-8"
               onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
            <div className="px-5 pt-2">
              <h2 className="text-center font-black text-lg mb-1" style={{ fontFamily:"'Baloo 2',cursive" }}>🐟 Hồ Cá</h2>
              {/* Thả cá */}
              {(inventory['🐟'] || 0) > 0 && (
                <button onClick={() => {
                  const now = Date.now()
                  const newFish: Fish = { id: ++fishId.current, placedAt: now, fedAt: now, readyAt: now + FISH_GROW_MS, name: 'Cá' }
                  setFish(f => [...f, newFish])
                  setInventory(inv => {
                    const n = (inv['🐟'] || 0) - 1
                    return n <= 0 ? (() => { const {['🐟']:_, ...r} = inv; return r })() : { ...inv, '🐟': n }
                  })
                  showToast('🐟 Thả cá vào hồ!')
                  setFishModal(false)
                }} className="w-full bg-blue-500 text-white font-black py-2.5 rounded-xl mb-3 active:scale-95">
                  🐟 Thả cá con vào hồ (còn {inventory['🐟'] || 0} con)
                </button>
              )}
              {/* Cho ăn */}
              {fish.length > 0 && (inventory['🌾'] || 0) > 0 && (
                <button onClick={() => {
                  const now = Date.now()
                  setFish(f => f.map(c => ({ ...c, fedAt: now, readyAt: c.readyAt - 30 * 60 * 1000 })))
                  setInventory(inv => {
                    const n = (inv['🌾'] || 0) - 1
                    return n <= 0 ? (() => { const {['🌾']:_, ...r} = inv; return r })() : { ...inv, '🌾': n }
                  })
                  showToast('🌾 Cho cá ăn! -30 phút thời gian nuôi')
                  setFishModal(false)
                }} className="w-full bg-green-500 text-white font-black py-2.5 rounded-xl mb-3 active:scale-95">
                  🌾 Cho cá ăn (còn {inventory['🌾'] || 0} túi)
                </button>
              )}
              {/* Danh sách cá */}
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-3">
                {fish.length === 0 && <p className="text-center text-xs text-slate-400 py-4">Hồ trống! Mua cá con ở cửa hàng 🛍️</p>}
                {fish.map(f => {
                  const now = Date.now()
                  const ready = now >= f.readyAt
                  const remaining = Math.max(0, f.readyAt - now)
                  const hours = Math.floor(remaining / 3600000)
                  const mins = Math.floor((remaining % 3600000) / 60000)
                  return (
                    <div key={f.id} className={`flex items-center gap-3 p-2.5 rounded-xl border-2 ${ready ? 'border-green-400 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
                      <span className="text-2xl">{ready ? '🐠' : '🐟'}</span>
                      <div className="flex-1">
                        <div className="text-xs font-black">{f.name}</div>
                        {ready ? <div className="text-[10px] text-green-600 font-bold">✅ Sẵn sàng bán!</div>
                               : <div className="text-[10px] text-slate-500">⏱ Còn {hours}h{mins}m</div>}
                      </div>
                      {ready && (
                        <button onClick={() => {
                          setPi(b => Math.round((b + FISH_SELL_REWARD) * 100) / 100)
                          setFish(fs => fs.filter(x => x.id !== f.id))
                          showToast(`🐠 Bán cá +${FISH_SELL_REWARD}π!`)
                        }} className="bg-green-600 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg active:scale-95">
                          Bán +{FISH_SELL_REWARD}π
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <button onClick={() => setFishModal(false)} className="w-full bg-slate-100 text-slate-600 font-black py-2.5 rounded-xl active:scale-95">Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* TỔ GÀ MODAL */}
      {henModal && (
        <div className="fixed inset-0 z-[650] flex items-end justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => setHenModal(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-sm shadow-2xl border-t-4 border-yellow-400 pb-8"
               onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-2 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full"/></div>
            <div className="px-5 pt-2">
              <h2 className="text-center font-black text-lg mb-1" style={{ fontFamily:"'Baloo 2',cursive" }}>🐔 Tổ Gà</h2>
              {/* Thả gà */}
              {(inventory['🐣'] || 0) > 0 && (
                <button onClick={() => {
                  const now = Date.now()
                  const newChicken: Chicken = { id: ++chickenId.current, placedAt: now, fedAt: now, matureAt: now + CHICKEN_MATURE_MS, lastEggAt: now + CHICKEN_MATURE_MS, eggs: 0 }
                  setChickens(c => [...c, newChicken])
                  setInventory(inv => {
                    const n = (inv['🐣'] || 0) - 1
                    return n <= 0 ? (() => { const {['🐣']:_, ...r} = inv; return r })() : { ...inv, '🐣': n }
                  })
                  showToast('🐣 Thả gà vào tổ!')
                  setHenModal(false)
                }} className="w-full bg-yellow-500 text-white font-black py-2.5 rounded-xl mb-3 active:scale-95">
                  🐣 Thả gà con vào tổ (còn {inventory['🐣'] || 0} con)
                </button>
              )}
              {/* Cho ăn */}
              {chickens.length > 0 && (inventory['🌾'] || 0) > 0 && (
                <button onClick={() => {
                  setChickens(cs => cs.map(c => ({ ...c, fedAt: Date.now() })))
                  setInventory(inv => {
                    const n = (inv['🌾'] || 0) - 1
                    return n <= 0 ? (() => { const {['🌾']:_, ...r} = inv; return r })() : { ...inv, '🌾': n }
                  })
                  showToast('🌾 Cho gà ăn!')
                  setHenModal(false)
                }} className="w-full bg-green-500 text-white font-black py-2.5 rounded-xl mb-3 active:scale-95">
                  🌾 Cho gà ăn (còn {inventory['🌾'] || 0} túi)
                </button>
              )}
              {/* Danh sách gà */}
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-3">
                {chickens.length === 0 && <p className="text-center text-xs text-slate-400 py-4">Tổ trống! Mua gà con ở cửa hàng 🛍️</p>}
                {chickens.map(c => {
                  const now = Date.now()
                  const mature = now >= c.matureAt
                  const remaining = Math.max(0, c.matureAt - now)
                  const hours = Math.floor(remaining / 3600000)
                  return (
                    <div key={c.id} className={`flex items-center gap-3 p-2.5 rounded-xl border-2 ${mature ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200 bg-slate-50'}`}>
                      <span className="text-2xl">{mature ? '🐔' : '🐣'}</span>
                      <div className="flex-1">
                        <div className="text-xs font-black">{mature ? 'Gà mái' : 'Gà con'}</div>
                        {mature ? <div className="text-[10px] text-yellow-600">🥚 {c.eggs} trứng</div>
                                : <div className="text-[10px] text-slate-500">⏱ Trưởng thành sau {hours}h</div>}
                      </div>
                      {mature && c.eggs > 0 && (
                        <button onClick={() => {
                          const earn = Math.round(c.eggs * EGG_SELL_REWARD * 100) / 100
                          setPi(b => Math.round((b + earn) * 100) / 100)
                          setChickens(cs => cs.map(x => x.id === c.id ? { ...x, eggs: 0 } : x))
                          showToast(`🥚 Thu ${c.eggs} trứng +${earn}π!`)
                        }} className="bg-yellow-500 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg active:scale-95">
                          Thu {c.eggs}🥚
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <button onClick={() => setHenModal(false)} className="w-full bg-slate-100 text-slate-600 font-black py-2.5 rounded-xl active:scale-95">Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* GENDER PICK MODAL */}
      {showGenderPick && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg,rgba(20,10,40,0.95),rgba(40,15,70,0.97))' }}>
          <div className="bg-white rounded-3xl mx-6 shadow-2xl border-4 border-purple-300 max-w-sm w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 px-6 py-5 text-center">
              <div className="text-4xl mb-2">👤</div>
              <div className="text-white font-black text-lg" style={{ fontFamily:"'Baloo 2',cursive" }}>
                Chào mừng đến Làng Pi!
              </div>
              <div className="text-white/80 text-xs mt-1">Bạn muốn chơi với nhân vật nào?</div>
            </div>
            {/* Chọn */}
            <div className="p-5 flex gap-4">
              {/* Nam */}
              <button
                onClick={() => {
                  setGender('male')
                  setShowGenderPick(false)
                }}
                className="flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-3 border-blue-200 bg-blue-50 active:scale-95 transition-all hover:border-blue-400"
                style={{ border: '3px solid #bfdbfe' }}
              >
                <img src="/NewSprite.png" alt="Nam"
                  style={{ width: 64, height: 80, objectFit:'contain', imageRendering:'pixelated',
                           filter:'drop-shadow(0 3px 5px rgba(0,0,0,0.3))' }}/>
                <div className="font-black text-blue-700 text-sm">👦 Nam</div>
              </button>
              {/* Nữ */}
              <button
                onClick={() => {
                  setGender('female')
                  setShowGenderPick(false)
                }}
                className="flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-3 border-pink-200 bg-pink-50 active:scale-95 transition-all hover:border-pink-400"
                style={{ border: '3px solid #fbcfe8' }}
              >
                <img src="/NewSprite4.png" alt="Nữ"
                  style={{ width: 64, height: 80, objectFit:'contain', imageRendering:'pixelated',
                           filter:'drop-shadow(0 3px 5px rgba(0,0,0,0.3))' }}/>
                <div className="font-black text-pink-600 text-sm">👧 Nữ</div>
              </button>
            </div>
            <div className="text-center text-[10px] text-slate-400 pb-4">
              ✨ Lựa chọn này sẽ không thay đổi được
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
              {([['seeds','🌱 Hạt giống'],['fert','⚗️ Phân bón'],['land','🟫 Mua đất'],['animals','🐣 Chăn nuôi']] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setShopTab(tab as 'seeds'|'fert'|'land'|'animals')}
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

            {/* ── CHĂN NUÔI ── */}
            {shopTab === 'animals' && (
              <div className="flex flex-col gap-3">
                <p className="text-center text-xs text-slate-400 mb-1">Mua giống về nuôi kiếm Pi!</p>

                {/* Cá con */}
                <div className="flex items-center gap-3 rounded-xl p-3 border-2 border-blue-200 bg-blue-50">
                  <span className="text-3xl">🐟</span>
                  <div className="flex-1 text-left">
                    <div className="text-xs font-black">Cá con ({fish.length}/5)</div>
                    <div className="text-[10px] text-slate-500">Nuôi 3 ngày → bán được +{FISH_SELL_REWARD}π/con</div>
                    <div className="text-[9px] text-orange-500 mt-0.5">Không cho ăn 8h → bán được 50%</div>
                  </div>
                  <button onClick={() => {
                    if (piBalance < 0.2) { showToast('❌ Cần 0.2π!'); return }
                    if (fish.length >= 5) { showToast('❌ Ao đầy! Tối đa 5 con'); return }
                    setPi(b => Math.round((b - 0.2) * 100) / 100)
                    const now = Date.now()
                    setFish(f => [...f, { id: ++fishId.current, placedAt: now, fedAt: now, readyAt: now + FISH_GROW_MS, name: '🐟' }])
                    showToast('🐟 Đã thả cá vào ao!')
                    setShopModal(false)
                  }} className="bg-blue-600 text-white text-xs font-black px-3 py-2 rounded-xl active:scale-95">
                    π0.2
                  </button>
                </div>

                {/* Gà con */}
                <div className="flex items-center gap-3 rounded-xl p-3 border-2 border-yellow-200 bg-yellow-50">
                  <span className="text-3xl">🐣</span>
                  <div className="flex-1 text-left">
                    <div className="text-xs font-black">Gà con ({chickens.length}/5)</div>
                    <div className="text-[10px] text-slate-500">Sau 1 ngày → đẻ trứng 12h/quả</div>
                    <div className="text-[9px] text-orange-500 mt-0.5">Không cho ăn 8h → đẻ chậm 2x</div>
                  </div>
                  <button onClick={() => {
                    if (piBalance < 0.3) { showToast('❌ Cần 0.3π!'); return }
                    if (chickens.length >= 5) { showToast('❌ Tổ đầy! Tối đa 5 con'); return }
                    setPi(b => Math.round((b - 0.3) * 100) / 100)
                    const now = Date.now()
                    setChickens(c => [...c, { id: ++chickenId.current, placedAt: now, fedAt: now, matureAt: now + CHICKEN_MATURE_MS, lastEggAt: now + CHICKEN_MATURE_MS, eggs: 0 }])
                    showToast('🐣 Đã thả gà vào tổ!')
                    setShopModal(false)
                  }} className="bg-yellow-500 text-white text-xs font-black px-3 py-2 rounded-xl active:scale-95">
                    π0.3
                  </button>
                </div>

                {/* Thức ăn */}
                <div className="flex items-center gap-3 rounded-xl p-3 border-2 border-green-200 bg-green-50">
                  <span className="text-3xl">🌾</span>
                  <div className="flex-1 text-left">
                    <div className="text-xs font-black">Thức ăn tổng hợp</div>
                    <div className="text-[10px] text-slate-500">Dùng cho cả gà lẫn cá · Có {inventory['🌾'] || 0} túi</div>
                    <div className="text-[9px] text-green-600 mt-0.5">Mua 5 túi / lần</div>
                  </div>
                  <button onClick={() => {
                    if (piBalance < 0.05) { showToast('❌ Cần 0.05π!'); return }
                    setPi(b => Math.round((b - 0.05) * 100) / 100)
                    setInventory(inv => ({ ...inv, '🌾': (inv['🌾'] || 0) + 5 }))
                    showToast('✅ Mua 5 túi thức ăn!')
                  }} className="bg-green-600 text-white text-xs font-black px-3 py-2 rounded-xl active:scale-95">
                    π0.05×5
                  </button>
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



      {/* HỒ CÁ MODAL */}
      <Drawer open={fishModal} onOpenChange={setFishModal}>
        <DrawerContent className="rounded-t-3xl max-h-[85vh]"
          style={{ background: 'linear-gradient(180deg,#e0f7fa,#b2ebf2)' }}>
          <DrawerHeader className="pb-0">
            <DrawerTitle className="text-center font-black text-lg">🐟 Hồ Cá</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pt-2 pb-6 overflow-y-auto">
            {fish.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">🌊</div>
                <p className="text-sm font-black text-slate-600 mb-1">Hồ đang trống!</p>
                <p className="text-xs text-slate-400 mb-4">Mua cá con ở cửa hàng để thả vào</p>
                <button onClick={() => { setFishModal(false); setShopTab('animals'); setShopModal(true) }}
                        className="bg-blue-600 text-white font-black text-sm px-6 py-2.5 rounded-xl active:scale-95">
                  🛍️ Mua cá con
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {fish.map((f, i) => {
                  const now = Date.now()
                  const isReady = now >= f.readyAt
                  const progress = isReady ? 100 : Math.min(99, ((now - f.placedAt) / FISH_GROW_MS) * 100)
                  const fedHoursAgo = Math.round((now - f.fedAt) / (60 * 60 * 1000))
                  const needsFood = fedHoursAgo >= 8
                  return (
                    <div key={f.id} className="bg-white rounded-2xl p-3 border-2 border-blue-200 shadow-sm">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">{isReady ? '🐠' : '🐟'}</span>
                        <div className="flex-1">
                          <div className="text-xs font-black">Cá #{i + 1} {isReady ? '✅ Sẵn sàng bán!' : ''}</div>
                          <div className="text-[10px] text-slate-500">
                            {isReady ? 'Bán được ' + FISH_SELL_REWARD + 'π' : `Còn ${msToTimeString(f.readyAt - now)}`}
                            {needsFood && <span className="text-red-500 ml-1">· Đói rồi! -50% giá</span>}
                          </div>
                          <div className="mt-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all"
                                 style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => feedFish(f.id)}
                                className="flex-1 bg-green-500 text-white text-[10px] font-black py-1.5 rounded-xl active:scale-95">
                          🌾 Cho ăn {fedHoursAgo > 0 ? `(${fedHoursAgo}h trước)` : ''}
                        </button>
                        {isReady && (
                          <button onClick={() => { sellFish(f.id) }}
                                  className="flex-1 bg-blue-600 text-white text-[10px] font-black py-1.5 rounded-xl active:scale-95">
                            💰 Bán cá
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {fish.length < 5 && (
                  <button onClick={() => { setFishModal(false); setShopTab('animals'); setShopModal(true) }}
                          className="w-full py-2.5 rounded-xl border-2 border-dashed border-blue-300 text-blue-500 text-xs font-black active:scale-95">
                    + Thêm cá ({fish.length}/5)
                  </button>
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* TỔ GÀ MODAL */}
      <Drawer open={henModal} onOpenChange={setHenModal}>
        <DrawerContent className="rounded-t-3xl max-h-[85vh]"
          style={{ background: 'linear-gradient(180deg,#fff8e1,#ffecb3)' }}>
          <DrawerHeader className="pb-0">
            <DrawerTitle className="text-center font-black text-lg">🐔 Tổ Gà</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pt-2 pb-6 overflow-y-auto">
            {chickens.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">🪹</div>
                <p className="text-sm font-black text-slate-600 mb-1">Tổ đang trống!</p>
                <p className="text-xs text-slate-400 mb-4">Mua gà con ở cửa hàng để thả vào</p>
                <button onClick={() => { setHenModal(false); setShopTab('animals'); setShopModal(true) }}
                        className="bg-yellow-500 text-white font-black text-sm px-6 py-2.5 rounded-xl active:scale-95">
                  🛍️ Mua gà con
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {chickens.map((c, i) => {
                  const now = Date.now()
                  const isMature = now >= c.matureAt
                  const fedHoursAgo = Math.round((now - c.fedAt) / (60 * 60 * 1000))
                  const needsFood = fedHoursAgo >= 8
                  const timeToMature = isMature ? 0 : c.matureAt - now
                  const nextEggTime = isMature && now < c.lastEggAt + EGG_INTERVAL_MS
                    ? msToTimeString(c.lastEggAt + EGG_INTERVAL_MS - now) : null
                  return (
                    <div key={c.id} className="bg-white rounded-2xl p-3 border-2 border-yellow-200 shadow-sm">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">{isMature ? '🐔' : '🐣'}</span>
                        <div className="flex-1">
                          <div className="text-xs font-black">
                            Gà #{i + 1} {isMature ? '· Đang đẻ trứng' : `· Còn ${msToTimeString(timeToMature)} lớn`}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {c.eggs > 0 ? `🥚 ${c.eggs} trứng · +${(c.eggs * EGG_SELL_REWARD).toFixed(2)}π` : nextEggTime ? `Trứng tiếp: ${nextEggTime}` : 'Chờ đẻ...'}
                            {needsFood && <span className="text-red-500 ml-1">· Đói! Đẻ chậm 2x</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => feedChicken(c.id)}
                                className="flex-1 bg-green-500 text-white text-[10px] font-black py-1.5 rounded-xl active:scale-95">
                          🌾 Cho ăn {fedHoursAgo > 0 ? `(${fedHoursAgo}h)` : ''}
                        </button>
                        {c.eggs > 0 && (
                          <button onClick={() => collectEggs(c.id)}
                                  className="flex-1 bg-yellow-500 text-white text-[10px] font-black py-1.5 rounded-xl active:scale-95">
                            🥚 Thu {c.eggs} trứng
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                {chickens.length < 5 && (
                  <button onClick={() => { setHenModal(false); setShopTab('animals'); setShopModal(true) }}
                          className="w-full py-2.5 rounded-xl border-2 border-dashed border-yellow-300 text-yellow-600 text-xs font-black active:scale-95">
                    + Thêm gà ({chickens.length}/5)
                  </button>
                )}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
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
