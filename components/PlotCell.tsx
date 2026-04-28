'use client'
import type { Plot } from '@/lib/game-types'
import { STATE_LABEL, getPlantVisual } from '@/lib/game-types'

interface CoinFx { id: number; x: number; y: number; text: string }

// ─── PLOT COMPONENT ───────────────────────────────────────────────────
export function PlotCell({ plot, onClick }: { plot: Plot; onClick: (e: React.MouseEvent) => void }) {
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

      {/* Cây đã chín — rung rinh mời thu hoạch */}
      {plot.state === 'ready' && plot.plant && (
        <span className="text-2xl drop-shadow-md animate-[plantBob_1.2s_ease-in-out_infinite]">
          {plot.plant}
        </span>
      )}

      {/* Cây đang lớn — hiện theo giai đoạn */}
      {visual && (
        <div className="flex flex-col items-center">
          <span className={`${visual.size} drop-shadow-md transition-all duration-1000`}>
            {visual.emoji}
          </span>
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