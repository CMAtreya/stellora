import { Heart, PencilLine, PlayCircle } from 'lucide-react'

export type MediaItem = {
  id: string
  type: 'image' | 'video'
  src: string
  alt: string
  width: number
  height: number
  caption?: string
  liked?: boolean
}

type MediaGridProps = {
  items: MediaItem[]
  onToggleLike: (id: string) => void
  onOpen: (item: MediaItem) => void
}

export default function MediaGrid({ items, onToggleLike, onOpen }: MediaGridProps) {
  return (
    <div className="columns-1 gap-4 md:columns-2 xl:columns-3 2xl:columns-4">
      {items.map((item) => (
        <article
          key={item.id}
          className="group mb-4 break-inside-avoid cursor-zoom-in overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0f0f13]"
          onClick={() => onOpen(item)}
        >
          {item.type === 'video' ? (
            <video
              src={item.src}
              muted
              loop
              playsInline
              preload="metadata"
              className="pointer-events-none w-full h-auto max-h-none object-contain transition duration-500 group-hover:scale-[1.01]"
            />
          ) : (
            <img
              src={item.src}
              alt={item.alt}
              loading="lazy"
              decoding="async"
              className="pointer-events-none w-full h-auto object-contain transition duration-500 group-hover:scale-[1.01]"
              style={{ imageRendering: 'auto' }}
            />
          )}

          {item.type === 'video' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/35 p-2 text-white/90 backdrop-blur-sm">
                <PlayCircle size={28} />
              </span>
            </div>
          )}

          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/25 to-transparent opacity-0 transition duration-300 group-hover:opacity-100">
            <div className="w-full p-4">
              <div className="mb-3 flex items-center justify-end gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleLike(item.id)
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/85 transition hover:scale-105 hover:text-[#f7d982]"
                  aria-label="Toggle favorite"
                >
                  <Heart size={16} className={item.liked ? 'fill-[#f2ca50] text-[#f2ca50]' : ''} />
                </button>
                <button
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white/85 transition hover:scale-105 hover:text-white"
                  aria-label="Add caption"
                >
                  <PencilLine size={16} />
                </button>
              </div>
              {item.caption && <p className="line-clamp-2 text-sm text-white/80">{item.caption}</p>}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
