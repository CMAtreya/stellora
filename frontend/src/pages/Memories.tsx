import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TripArcShell from '../components/TripArcShell'
import AlbumCard from '../components/memories/AlbumCard'
import Modal from '../components/memories/Modal'
import {
  createAlbum,
  formatAlbumDateRange,
  listAlbums,
  type MemoryAlbum,
} from '../lib/memoriesApi'

type AlbumWithCover = MemoryAlbum & { coverImage: string }

type NewAlbumForm = {
  albumName: string
  location: string
  startDate: string
  endDate: string
  description: string
}

const initialForm: NewAlbumForm = {
  albumName: '',
  location: '',
  startDate: '',
  endDate: '',
  description: '',
}

const fallbackCover =
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80'

export default function MemoriesPage() {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState<AlbumWithCover[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [form, setForm] = useState<NewAlbumForm>(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setErrorText('')
      try {
        const rows = await listAlbums()
        if (!mounted) return
        setAlbums(rows)
      } catch (err: any) {
        if (!mounted) return
        setErrorText(err?.message || 'Could not load memories right now.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const filteredAlbums = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    if (!search) return albums
    return albums.filter((album) => {
      return album.title.toLowerCase().includes(search) || album.location.toLowerCase().includes(search)
    })
  }, [albums, searchText])

  const createAlbumSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.albumName.trim() || !form.location.trim()) return

    setSubmitting(true)
    setErrorText('')
    try {
      const created = await createAlbum({
        title: form.albumName.trim(),
        location: form.location.trim(),
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        description: form.description.trim() || undefined,
      })

      setAlbums((prev) => [{ ...created, coverImage: '' }, ...prev])
      setForm(initialForm)
      setIsCreateModalOpen(false)
      navigate(`/triparc/memories/${created.id}`)
    } catch (err: any) {
      setErrorText(err?.message || 'Could not create album.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TripArcShell mainClassName="max-w-[1700px] pb-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(242,202,80,0.11),transparent_32%),radial-gradient(circle_at_85%_5%,rgba(212,175,55,0.12),transparent_35%),radial-gradient(circle_at_60%_85%,rgba(255,255,255,0.06),transparent_38%)]" />

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-20"
      >
        <header className="sticky top-[73px] z-20 mb-8 rounded-[1.8rem] border border-white/10 bg-[#101015]/65 px-5 py-5 backdrop-blur-xl md:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#f2ca50]">Travel Archive</p>
              <h1 className="mt-1 font-display text-4xl font-semibold text-white md:text-5xl">Your Memories</h1>
              <p className="mt-2 text-base text-white/60">Relive every journey you&apos;ve experienced</p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:max-w-xl">
              <label className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Search albums or locations"
                  className="w-full rounded-full border border-white/10 bg-[#1a1a20]/80 py-3 pl-11 pr-4 text-sm text-white outline-none transition focus:border-[#f2ca50]/40"
                />
              </label>
              <button className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
                <img
                  className="h-full w-full rounded-full object-cover"
                  src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80"
                  alt="User profile"
                />
              </button>
            </div>
          </div>
        </header>

        <section>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-white">Albums</h2>
            <p className="text-sm text-white/50">{filteredAlbums.length} stories</p>
          </div>

          {loading && <p className="text-sm text-white/70">Loading your memories...</p>}

          {errorText && (
            <p className="mb-4 rounded-xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {errorText}
            </p>
          )}

          {!loading && !filteredAlbums.length && !errorText && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70">
              No albums yet. Use the plus button to create your first travel archive.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredAlbums.map((album, index) => (
              <motion.div
                key={album.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.04 }}
              >
                <AlbumCard
                  title={album.title}
                  location={album.location}
                  dateRange={formatAlbumDateRange(album.start_date, album.end_date)}
                  coverImage={album.coverImage || fallbackCover}
                  isPublic={album.is_public}
                  onOpen={() => navigate(`/triparc/memories/${album.id}`)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      </motion.section>

      <button
        onClick={() => setIsCreateModalOpen(true)}
        className="fixed bottom-7 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-[#f2ca50]/85 to-[#b8860b]/80 text-[#332602] shadow-[0_24px_45px_-20px_rgba(242,202,80,0.5)] backdrop-blur-xl transition duration-300 hover:scale-105 active:scale-95 sm:bottom-10 sm:right-9 sm:h-16 sm:w-16"
        aria-label="Create album"
      >
        <Plus size={28} />
      </button>

      <Modal open={isCreateModalOpen} title="Create Album" onClose={() => setIsCreateModalOpen(false)}>
        <form onSubmit={createAlbumSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-white/75">Album name</span>
            <input
              required
              value={form.albumName}
              onChange={(event) => setForm((prev) => ({ ...prev, albumName: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-white outline-none transition focus:border-[#f2ca50]/45"
              placeholder="Mysore Trip 2025"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-white/75">Location</span>
            <input
              required
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-white outline-none transition focus:border-[#f2ca50]/45"
              placeholder="Karnataka, India"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm text-white/75">Start date</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-white outline-none transition focus:border-[#f2ca50]/45"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/75">End date</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-white outline-none transition focus:border-[#f2ca50]/45"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm text-white/75">Description (optional)</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              className="w-full resize-none rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-white outline-none transition focus:border-[#f2ca50]/45"
              placeholder="A short note for this chapter"
            />
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-gradient-to-br from-[#f2ca50] to-[#c7962f] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[#2f2404] transition hover:scale-[1.02] active:scale-95 disabled:opacity-70"
            >
              {submitting ? 'Saving...' : 'Save album'}
            </button>
          </div>
        </form>
      </Modal>
    </TripArcShell>
  )
}
