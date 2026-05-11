import { CalendarDays, MapPin } from 'lucide-react'

type AlbumCardProps = {
  title: string
  location: string
  dateRange: string
  coverImage: string
  isPublic: boolean
  onOpen: () => void
}

export default function AlbumCard({ title, location, dateRange, coverImage, isPublic, onOpen }: AlbumCardProps) {
  return (
    <button
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#151519] text-left shadow-[0_18px_35px_-20px_rgba(0,0,0,0.9)] transition duration-300 hover:scale-[1.03] hover:shadow-[0_26px_48px_-24px_rgba(242,202,80,0.32)]"
      aria-label={`Open album ${title}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <img src={coverImage} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0b0f] via-black/20 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#f2ca50]/35 via-transparent to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />

        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-[#f2ca50]/25 bg-[#f2ca50]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f7d982]">
              <MapPin size={12} />
              {location}
            </div>
            <div className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${isPublic ? 'border border-emerald-300/35 bg-emerald-400/15 text-emerald-200' : 'border border-white/20 bg-white/10 text-white/75'}`}>
              {isPublic ? 'Public' : 'Private'}
            </div>
          </div>
          <h3 className="font-display text-2xl font-semibold text-white">{title}</h3>
          <p className="mt-1 inline-flex items-center gap-2 text-sm text-white/65">
            <CalendarDays size={14} />
            {dateRange}
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
        <span className="rounded-full border border-white/20 bg-white/90 px-6 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#232327] shadow-xl">
          View Album
        </span>
      </div>
    </button>
  )
}
