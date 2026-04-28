'use client'
import type { Plot } from '@/lib/game-types'

// ─── ROAD FLOWERS ─────────────────────────────────────────────────────
export function RoadFlowers() {
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
export function ZonesAndBuildings({ piBalance, fish, onKitchen, onWarehouse, onPond, onHenHouse }: {
  piBalance: number
  fish: Fish[]
  onKitchen: () => void
  onWarehouse: () => void
  onPond: () => void
  onHenHouse: () => void
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
              style={{ left: zoneAW - 76, top: zoneYS + 14 }}>
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

      {/* ── TỔ GÀ — dưới tượng đài ── */}
      <button onClick={onHenHouse}
              className="absolute z-[15] active:brightness-110"
              style={{ left: Math.round(zoneAW / 2) - 22, top: zoneYS + zoneHF - 70 }}>
        <div className="flex flex-col items-center">
          <div style={{
            width: 48, height: 36,
            background: 'linear-gradient(180deg,#d97706,#92400e)',
            borderRadius: '8px 8px 4px 4px',
            border: '2.5px solid #78350f',
            position: 'relative',
            boxShadow: '0 3px 6px rgba(0,0,0,0.3)',
          }}>
            {/* Mái tổ */}
            <div style={{ position:'absolute', top:-10, left:-4, right:-4, height:14,
                          background:'linear-gradient(180deg,#b45309,#78350f)',
                          borderRadius:'6px 6px 0 0', border:'2px solid #78350f', borderBottom:'none' }}/>
            {/* Lỗ tổ */}
            <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)',
                          width:16, height:14, borderRadius:'50%',
                          background:'#1c0a00', border:'2px solid #78350f' }}/>
            {/* Cỏ */}
            <div style={{ position:'absolute', bottom:-4, left:-2, right:-2, fontSize:10,
                          letterSpacing:-2 }}>🌿🌿🌿</div>
          </div>
          <div style={{ fontSize:7, fontWeight:900, color:'#fff',
                        background:'rgba(0,0,0,0.5)', borderRadius:8,
                        padding:'1px 6px', marginTop:6,
                        textShadow:'0 1px 2px rgba(0,0,0,0.5)' }}>🐔 Tổ gà</div>
        </div>
      </button>

      {/* ── HỒ CÁ ── */}
      <Pond onTap={onPond} fish={fish} zoneAW={zoneAW} zoneYS={zoneYS} zoneHF={zoneHF} />
    </>
  )
}

// ─── BUILDING ─────────────────────────────────────────────────────────
export function Building({ type }: { type: 'kitchen' | 'warehouse' }) {
  const isK = type === 'kitchen'
  return (
    <div className="relative w-[72px]">

      {/* Khói (nhà bếp) */}
      {isK && (
        <div className="absolute right-[18%] z-10" style={{ bottom: '100%', marginBottom: -2 }}>
          <span className="absolute text-[9px]" style={{ animation: 'smokeMain 2.2s ease-out infinite', bottom: '100%', left: 0 }}>💨</span>
          <div style={{ width: 11, height: 16, background: '#78716c', border: '2px solid #44403c', borderRadius: 2 }} />
        </div>
      )}

      {/* Tam giác mái (nhà kho) */}
      {!isK && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[2]"
             style={{ bottom: '100%', width: 0, height: 0,
                      borderLeft: '42px solid transparent',
                      borderRight: '42px solid transparent',
                      borderBottom: '20px solid #546e7a' }} />
      )}

      {/* Mái (nhà bếp) */}
      {isK && (
        <div className="absolute left-[-4px] right-[-4px] z-[1]"
             style={{ bottom: 'calc(52px + 0px)', height: 26,
                      background: 'linear-gradient(180deg,#ef9a9a,#e53e3e)',
                      border: '2px solid #c62828', borderBottom: 'none',
                      borderRadius: '4px 4px 0 0' }}>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2"
               style={{ width: 0, height: 0,
                        borderLeft: '18px solid transparent',
                        borderRight: '18px solid transparent',
                        borderBottom: '13px solid #c62828' }} />
        </div>
      )}

      {/* Mái ngói kẻ sọc (nhà kho) */}
      {!isK && (
        <div className="absolute left-[-4px] right-[-4px] z-[1]"
             style={{ bottom: 52, height: 28,
                      background: 'linear-gradient(180deg,#b0bec5,#78909c)',
                      border: '2px solid #546e7a', borderBottom: 'none',
                      borderRadius: '3px 3px 0 0',
                      backgroundImage: 'repeating-linear-gradient(90deg,transparent 0,transparent 7px,rgba(0,0,0,0.08) 7px,rgba(0,0,0,0.08) 8px)' }} />
      )}

      {/* Thân nhà */}
      <div className="relative border-[3px] border-amber-900 rounded-t-sm"
           style={{ width: 72, height: 52,
                    background: isK
                      ? 'linear-gradient(180deg,#e8c49a,#d4a26a)'
                      : 'linear-gradient(180deg,#d4a26a,#c08040)',
                    boxShadow: 'inset -5px 0 0 rgba(0,0,0,0.1), inset 5px 0 0 rgba(255,255,255,0.08)' }}>



        {/* Cửa sổ trái */}
        <div className="absolute top-2 left-[6px] rounded-sm border-2 border-amber-900"
             style={{ width: 14, height: 14,
                      background: 'linear-gradient(135deg,#bae6fd,#7dd3fc)',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)' }}>
          <div style={{ position:'absolute', top: '45%', left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.2)' }}/>
          <div style={{ position:'absolute', left: '45%', top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.2)' }}/>
        </div>

        {/* Cửa sổ phải */}
        <div className="absolute top-2 right-[6px] rounded-sm border-2 border-amber-900"
             style={{ width: 14, height: 14,
                      background: 'linear-gradient(135deg,#bae6fd,#7dd3fc)',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)' }}>
          <div style={{ position:'absolute', top: '45%', left: 0, right: 0, height: 1, background: 'rgba(0,0,0,0.2)' }}/>
          <div style={{ position:'absolute', left: '45%', top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.2)' }}/>
        </div>

        {/* Cửa ra vào */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 border-2 border-amber-950"
             style={{ width: 18, height: 26,
                      background: 'linear-gradient(180deg,#92400e,#431407)',
                      borderRadius: '10px 10px 0 0' }}>
          <div style={{ position:'absolute', width: 3, height: 3, borderRadius: '50%',
                        background: '#fbbf24', right: '22%', top: '35%',
                        boxShadow: '0 0 4px rgba(255,215,0,0.8)' }}/>
        </div>

        {/* Đèn sáng nhà bếp */}
        {isK && (
          <div style={{ position:'absolute', top: 2, right: 6, width: 14, height: 14,
                        background: 'radial-gradient(circle,rgba(255,230,100,0.6) 0%,transparent 80%)' }}/>
        )}

        {/* Icon góc */}
        <span className="absolute bottom-1 left-1 text-[11px]">{isK ? '🍳' : '🪣'}</span>
        <span className="absolute bottom-1 right-1 text-[10px]">{isK ? '🔥' : '⚗️'}</span>
      </div>

      {/* Mũi tên vào */}
      <div className="absolute -bottom-4 left-1/2 text-[8px] font-black text-white text-center arr-anim"
           style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
        {isK ? 'Bếp' : 'Kho'}<br/><span className="text-yellow-400">▼</span>
      </div>
    </div>
  )
}

// ─── POND ─────────────────────────────────────────────────────────────
export function Pond({ onTap, fish, zoneAW, zoneYS, zoneHF }: { onTap:()=>void; fish: Fish[]; zoneAW:number; zoneYS:number; zoneHF:number }) {
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
        {/* Cá thật từ state */}
        {fish.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[9px] text-white/60 font-black">Trống</span>
          </div>
        ) : fish.map((f, i) => {
          const now = Date.now()
          const isReady = now >= f.readyAt
          const progress = Math.min(1, (now - f.placedAt) / FISH_GROW_MS)
          // Cá lớn dần theo thời gian
          const fishSize = Math.round(10 + progress * 8)
          const positions = [[8,42],[38,62],[18,22],[58,48],[68,28]]
          const [lp, tp] = positions[i % 5]
          const duration = 4 + i * 1.3
          const delay = i * 1.1
          return (
            <div key={f.id} className="absolute pointer-events-none"
                 style={{ top:`${tp}%`, left:`${lp}%`,
                          animation:`fishSwim ${duration}s linear ${delay}s infinite` }}>
              <span style={{ fontSize: fishSize }}>{isReady ? '🐠' : '🐟'}</span>
            </div>
          )
        })}
        {/* Badge số cá */}
        {fish.length > 0 && (
          <div className="absolute top-1 right-1 bg-blue-600/80 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full pointer-events-none">
            {fish.length}/5
          </div>
        )}
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
export function PlotGrids({ plots, onPlotTap }: { plots: Plot[]; onPlotTap: (idx:number, e:React.MouseEvent) => void }) {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const greenY = Math.round(vh * 0.20) + 41
  const greenH = vh - greenY - 111
  const zoneAW = Math.floor(vw * 0.44)
  const zoneBCW = Math.floor((vw - zoneAW - 26) / 2)
  const zoneYS = greenY + 4
  const zoneHF = greenH - 30

  const PAD=5, PG=8, COLS=2
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