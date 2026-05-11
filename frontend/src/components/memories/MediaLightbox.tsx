import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, Star, Trash2, PlayCircle } from 'lucide-react'
import Modal from './Modal'
import type { MediaItem } from './MediaGrid'

type Props = {
  open: boolean
  item: MediaItem | null
  items: MediaItem[]
  activeIndex: number
  onClose: () => void
  onDelete: (id: string) => void
  onPrev: () => void
  onNext: () => void
  onSetFeatured: (id: string) => void
}

export default function MediaLightbox({ open, item, items, activeIndex, onClose, onDelete, onPrev, onNext, onSetFeatured }: Props) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') onPrev()
      if (event.key === 'ArrowRight') onNext()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onPrev, onNext])

  if (!item) return null

  const total = items.length

  return (
    <Modal
      open={open}
      title={`${item.caption || item.alt || 'Memory'} ${total ? `(${activeIndex + 1}/${total})` : ''}`}
      onClose={onClose}
      widthClassName="max-w-5xl"
      headerActions={
        <div className="flex items-center gap-2">
          {item.type === 'image' && (
            <button
              onClick={() => onSetFeatured(item.id)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#f2ca50]/25 bg-[#f2ca50]/10 text-[#f7d982] transition hover:scale-105 hover:bg-[#f2ca50]/15"
              aria-label="Set as featured image"
              title="Set as featured"
            >
              <Star size={16} />
            </button>
          )}
          <button
            onClick={onPrev}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:scale-105 hover:bg-white/10 hover:text-white"
            aria-label="Previous memory"
            disabled={total <= 1}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={onNext}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:scale-105 hover:bg-white/10 hover:text-white"
            aria-label="Next memory"
            disabled={total <= 1}
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:scale-105 hover:bg-white/10 hover:text-rose-300"
            aria-label="Delete memory"
          >
            <Trash2 size={16} />
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-black">
          {item.type === 'video' ? (
            <video
              key={item.id}
              src={item.src}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="h-full max-h-[75vh] w-full object-contain"
            />
          ) : (
            <img src={item.src} alt={item.alt} loading="eager" decoding="async" className="max-h-[75vh] w-full object-contain" />
          )}
          {item.type === 'video' && (
            <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-xs uppercase tracking-[0.14em] text-white/80 backdrop-blur-sm">
              <PlayCircle size={14} /> Video
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 text-sm text-white/70">
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{item.caption || item.alt}</p>
            <p>{item.type === 'video' ? 'Video memory' : 'Photo memory'}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
