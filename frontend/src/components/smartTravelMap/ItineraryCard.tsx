import { CheckCircle2, Clock3, Navigation, Sparkles } from 'lucide-react'

type ItineraryCardProps = {
  time: string
  title: string
  category: 'Food' | 'Heritage' | 'Shopping' | 'Rest'
  status: 'completed' | 'current' | 'upcoming'
  active: boolean
  onClick: () => void
}

const statusLabel: Record<ItineraryCardProps['status'], string> = {
  completed: 'Completed ✔',
  current: 'Current 🔵',
  upcoming: 'Upcoming ⚪',
}

export default function ItineraryCard({ time, title, category, status, active, onClick }: ItineraryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[1.4rem] border p-4 text-left transition duration-300 hover:scale-[1.02] ${active ? 'border-[#f2ca50]/30 bg-white/[0.07] shadow-[0_18px_45px_-28px_rgba(242,202,80,0.18)]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/55">
            <Clock3 size={12} />
            {time}
          </div>
          <h4 className="mt-2 text-lg font-semibold text-white">{title}</h4>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${active ? 'bg-[#f2ca50] text-slate-950' : 'bg-white/5 text-white/70'}`}>
          {statusLabel[status]}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
          {category}
        </span>
        {status === 'current' ? <Navigation size={13} className="text-[#f2ca50]" /> : status === 'completed' ? <CheckCircle2 size={13} className="text-emerald-300" /> : <Sparkles size={13} className="text-white/35" />}
      </div>
    </button>
  )
}
