import { MapPin, Plus } from 'lucide-react'

type SuggestionCardProps = {
  image: string
  name: string
  distance: string
  reason: string
  onAdd: () => void
}

export default function SuggestionCard({ image, name, distance, reason, onAdd }: SuggestionCardProps) {
  return (
    <article className="min-w-[240px] overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_20px_50px_-35px_rgba(0,0,0,1)]">
      <img src={image} alt={name} className="h-32 w-full object-cover" loading="lazy" />
      <div className="space-y-2 p-4">
        <p className="text-sm font-semibold text-white">{name}</p>
        <p className="inline-flex items-center gap-1 text-xs text-white/55"><MapPin size={12} /> {distance}</p>
        <p className="text-xs text-[#f7d982]">{reason}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-full border border-[#f2ca50]/35 bg-[#f2ca50]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f7d982]"
        >
          <Plus size={12} /> Add stop
        </button>
      </div>
    </article>
  )
}
