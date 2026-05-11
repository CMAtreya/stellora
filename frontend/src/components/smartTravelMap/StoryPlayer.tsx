import { Headphones, Pause, Play } from 'lucide-react'

type StoryPlayerProps = {
  title: string
  duration: string
  progress: number
  playing: boolean
  onTogglePlay: () => void
}

export default function StoryPlayer({ title, duration, progress, playing, onTogglePlay }: StoryPlayerProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-[#111116]/90 p-4 shadow-[0_18px_50px_-30px_rgba(0,0,0,1)] backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#f2ca50] to-[#c7962f] text-[#2f2404] shadow-lg shadow-[#f2ca50]/20 transition hover:scale-105 active:scale-95"
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
            <Headphones size={12} /> Story player
          </div>
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/55">Duration {duration}</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-[#f2ca50] to-[#d4af37] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
