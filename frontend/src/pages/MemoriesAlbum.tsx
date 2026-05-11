import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, MapPin, Trash2 } from 'lucide-react'
import TripArcShell from '../components/TripArcShell'
import UploadBox from '../components/memories/UploadBox'
import MediaGrid, { type MediaItem } from '../components/memories/MediaGrid'
import MediaLightbox from '../components/memories/MediaLightbox'
import {
  deleteAlbum,
  deleteMedia,
  formatAlbumDateRange,
  getAlbumById,
  listAlbumMedia,
  toggleAlbumVisibility,
  toggleMediaFavorite,
  uploadMedia,
  type MemoryAlbum,
} from '../lib/memoriesApi'

export default function MemoriesAlbumPage() {
  const { albumId } = useParams()
  const navigate = useNavigate()
  const [album, setAlbum] = useState<MemoryAlbum | null>(null)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [featuredMediaId, setFeaturedMediaId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      if (!albumId) {
        setErrorText('Missing album id.')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorText('')

      try {
        const [albumRow, mediaRows] = await Promise.all([
          getAlbumById(albumId),
          listAlbumMedia(albumId),
        ])

        if (!mounted) return

        if (!albumRow) {
          setErrorText('Album not found or you do not have access to it.')
          setAlbum(null)
          setMedia([])
        } else {
          setAlbum(albumRow)
          setMedia(mediaRows)
        }
      } catch (err: any) {
        if (!mounted) return
        setErrorText(err?.message || 'Could not load album right now.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [albumId])

  const dateRange = useMemo(
    () => formatAlbumDateRange(album?.start_date ?? null, album?.end_date ?? null),
    [album?.start_date, album?.end_date],
  )

  const viewerItem = viewerIndex === null ? null : media[viewerIndex] ?? null
  const featuredMedia = media.find((item) => item.id === featuredMediaId && item.type === 'image') ?? media.find((item) => item.type === 'image') ?? media[0] ?? null

  const handleOpenMedia = (item: MediaItem) => {
    const index = media.findIndex((current) => current.id === item.id)
    setViewerIndex(index >= 0 ? index : null)
  }

  const handlePrev = () => {
    if (viewerIndex === null || media.length <= 1) return
    setViewerIndex((viewerIndex - 1 + media.length) % media.length)
  }

  const handleNext = () => {
    if (viewerIndex === null || media.length <= 1) return
    setViewerIndex((viewerIndex + 1) % media.length)
  }

  const handleUpload = async (files: File[]) => {
    if (!albumId || !files.length) return

    setUploading(true)
    setErrorText('')

    const tempItems: MediaItem[] = files.map((file, index) => {
      const isVideo = file.type.startsWith('video')
      return {
        id: `temp-${file.name}-${file.size}-${file.lastModified}-${index}`,
        type: isVideo ? 'video' : 'image',
        src: URL.createObjectURL(file),
        alt: file.name,
        width: isVideo ? 1600 : 1100,
        height: isVideo ? 900 : 1400,
        caption: file.name,
        liked: false,
      }
    })

    setMedia((prev) => [...tempItems, ...prev])

    try {
      const uploaded = await uploadMedia(albumId, files)
      setMedia((prev) => {
        const tempIds = new Set(tempItems.map((item) => item.id))
        const remaining = prev.filter((item) => !tempIds.has(item.id))
        return [...uploaded, ...remaining]
      })

      tempItems.forEach((item) => URL.revokeObjectURL(item.src))
    } catch (err: any) {
      setMedia((prev) => prev.filter((item) => !item.id.startsWith('temp-')))
      tempItems.forEach((item) => URL.revokeObjectURL(item.src))
      setErrorText(err?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (mediaId: string) => {
    const prev = media
    setMedia((current) => current.filter((item) => item.id !== mediaId))
    if (featuredMediaId === mediaId) {
      setFeaturedMediaId(null)
    }

    try {
      await deleteMedia(mediaId)
    } catch (err: any) {
      setMedia(prev)
      setErrorText(err?.message || 'Could not delete this memory.')
    }
  }

  const handleToggleFavorite = async (mediaId: string) => {
    const current = media.find((item) => item.id === mediaId)
    if (!current) return

    const nextValue = !Boolean(current.liked)
    setMedia((rows) => rows.map((item) => (item.id === mediaId ? { ...item, liked: nextValue } : item)))

    try {
      await toggleMediaFavorite(mediaId, nextValue)
    } catch (err: any) {
      setMedia((rows) => rows.map((item) => (item.id === mediaId ? { ...item, liked: !nextValue } : item)))
      setErrorText(err?.message || 'Could not update favorite state.')
    }
  }

  const handleDeleteAlbum = async () => {
    if (!albumId) return
    const confirmed = window.confirm('Delete this album and all of its memories? This cannot be undone.')
    if (!confirmed) return

    setErrorText('')
    try {
      await deleteAlbum(albumId)
      navigate('/triparc/memories')
    } catch (err: any) {
      setErrorText(err?.message || 'Could not delete this album.')
    }
  }

  const handleAlbumVisibilityToggle = async () => {
    if (!album || !albumId) return

    const nextValue = !album.is_public
    setAlbum({ ...album, is_public: nextValue })
    setErrorText('')

    try {
      await toggleAlbumVisibility(albumId, nextValue)
    } catch (err: any) {
      setAlbum({ ...album, is_public: !nextValue })
      setErrorText(err?.message || 'Could not update album visibility.')
    }
  }

  useEffect(() => {
    if (!media.length) {
      setFeaturedMediaId(null)
      return
    }

    const featuredStillExists = media.some((item) => item.id === featuredMediaId && item.type === 'image')
    if (!featuredStillExists) {
      const firstImage = media.find((item) => item.type === 'image')
      setFeaturedMediaId(firstImage?.id ?? null)
    }
  }, [media, featuredMediaId])

  return (
    <TripArcShell mainClassName="max-w-[1700px] pb-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(242,202,80,0.11),transparent_32%),radial-gradient(circle_at_85%_5%,rgba(212,175,55,0.12),transparent_35%),radial-gradient(circle_at_60%_85%,rgba(255,255,255,0.06),transparent_38%)]" />

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-20 space-y-8"
      >
        <div className="rounded-[1.8rem] border border-white/10 bg-[#131318]/75 p-5 backdrop-blur-xl md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <Link
              to="/triparc/memories"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10"
            >
              Back
            </Link>
            {album && <UploadBox onUpload={handleUpload} />}
          </div>

          {loading && <p className="text-sm text-white/70">Loading album...</p>}

          {!loading && album && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_320px]">
              <div className="relative min-h-[320px] overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#0f0f13] shadow-[0_24px_50px_-32px_rgba(0,0,0,1)]">
                {featuredMedia?.type === 'video' ? (
                  <video
                    src={featuredMedia.src}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-700 hover:scale-105"
                  />
                ) : (
                  <img
                    src={featuredMedia?.src || 'https://images.unsplash.com/photo-1604176354204-9268737828e4?auto=format&fit=crop&w=1200&q=80'}
                    alt={album.title}
                    className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-700 hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0f] via-[#0b0b0f]/35 to-transparent" />
                <div className="relative z-10 flex h-full flex-col justify-end p-6 md:p-8">
                  <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[#f2ca50]/20 bg-[#f2ca50]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f7d982]">
                    Featured Memory
                  </span>
                  <h1 className="font-display text-4xl font-semibold text-white md:text-5xl">{album.title}</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 md:text-base">
                    {album.description || 'A new chapter from your journey.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4 rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_50px_-32px_rgba(0,0,0,1)] backdrop-blur-xl md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">Trip Stats</p>
                    <div className="mt-2 text-5xl font-semibold text-white">{media.length}</div>
                    <p className="text-sm text-white/55">Media assets captured</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                    {uploading ? 'Uploading...' : 'Ready'}
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-white/10 bg-[#111116] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-white/50">Location</p>
                      <p className="mt-1 text-sm font-medium text-white">{album.location}</p>
                    </div>
                    <MapPin size={18} className="text-[#f2ca50]" />
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <CalendarDays size={16} className="text-[#f2ca50]" />
                    <p className="text-sm text-white/70">{dateRange}</p>
                  </div>
                </div>

                <button
                  onClick={handleAlbumVisibilityToggle}
                  className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold transition ${album.is_public ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15' : 'border-white/20 bg-white/5 text-white/80 hover:bg-white/10'}`}
                >
                  {album.is_public ? 'Public album' : 'Private album'}
                </button>

                <button
                  onClick={handleDeleteAlbum}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15 hover:text-rose-100"
                >
                  <Trash2 size={16} />
                  Delete album
                </button>

                {errorText && (
                  <p className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {errorText}
                  </p>
                )}
              </div>
            </div>
          )}

          {!loading && !album && !errorText && <p className="text-sm text-white/70">Album unavailable.</p>}
        </div>

        {album && (
          <section className="rounded-[1.6rem] border border-white/10 bg-[#131318]/75 p-5 backdrop-blur-xl md:p-7">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">Gallery</h2>
                <p className="text-sm text-white/50">Tap any image or video to open it full screen</p>
              </div>
              <p className="text-sm text-white/50">{media.length} captures</p>
            </div>
            <MediaGrid
              items={media}
              onToggleLike={handleToggleFavorite}
              onOpen={handleOpenMedia}
            />
          </section>
        )}

        <MediaLightbox
          open={viewerIndex !== null}
          item={viewerItem}
          items={media}
          activeIndex={viewerIndex ?? 0}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDelete}
          onPrev={handlePrev}
          onNext={handleNext}
          onSetFeatured={(id) => setFeaturedMediaId(id)}
        />
      </motion.section>
    </TripArcShell>
  )
}
