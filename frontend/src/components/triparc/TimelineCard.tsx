import { CheckCircle2, Clock3, GripVertical, RefreshCw, Trash2 } from 'lucide-react'

export type TimelineStatus = 'completed' | 'current' | 'upcoming'

export type TimelineItem = {
  id: string
  time: string
  title: string
  category: string
  duration: string
  description: string
  status: TimelineStatus
}

type TimelineCardProps = {
  item: TimelineItem
  expanded: boolean
  onToggleExpand: () => void
  onRemove: () => void
  onReplace: () => void
  onEditTime: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
}

const statusStyles: Record<TimelineStatus, string> = {
  completed: 'border-emerald-300/30 bg-emerald-300/10 opacity-70',
  current: 'border-[#f2ca50]/45 bg-[#f2ca50]/10 shadow-[0_20px_40px_-28px_rgba(242,202,80,0.45)]',
  upcoming: 'border-white/10 bg-white/5',
}

export default function TimelineCard({
  item,
  expanded,
  onToggleExpand,
  onRemove,
  onReplace,
  onEditTime,
  onDragStart,
  onDragOver,
  onDrop,
}: TimelineCardProps) {
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver()
      }}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
      className={`group rounded-3xl border p-4 transition hover:scale-[1.01] ${statusStyles[item.status]}`}
    >
      <button type="button" className="w-full text-left" onClick={onToggleExpand}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <GripVertical size={16} className="mt-1 text-white/35" />
            <div>
              <p className="text-sm font-bold text-[#f7d982]">{item.time}</p>
              <h3 className="mt-1 text-lg font-semibold text-white">{item.title}</h3>
              <p className="mt-1 text-xs text-white/60">{item.category} • {item.duration}</p>
            </div>
          </div>
          {item.status === 'completed' && <CheckCircle2 size={16} className="text-emerald-200" />}
          {item.status === 'current' && <span className="rounded-full border border-[#f2ca50]/35 bg-[#f2ca50]/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f7d982]">Current</span>}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="text-sm text-white/75">{item.description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200"><Trash2 size={12} /> Remove</button>
            <button type="button" onClick={onReplace} className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85"><RefreshCw size={12} /> Replace</button>
            <button type="button" onClick={onEditTime} className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85"><Clock3 size={12} /> Edit time</button>
          </div>
        </div>
      )}
    </article>
  )
}
