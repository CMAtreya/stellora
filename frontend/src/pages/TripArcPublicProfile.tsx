import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Globe2, Lock, MapPin, Sparkles, UserRound } from 'lucide-react'
import TripArcShell from '../components/TripArcShell'
import {
  formatAlbumDateRange,
  getOwnPublicProfile,
  listAlbums,
  type MemoryAlbum,
  type PublicProfile,
} from '../lib/memoriesApi'

const fallbackAvatar =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&q=80'

export default function TripArcPublicProfilePage() {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [albums, setAlbums] = useState<MemoryAlbum[]>([])
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setErrorText('')

      try {
        const [profileRow, albumRows] = await Promise.all([getOwnPublicProfile(), listAlbums()])
        if (!mounted) return
        setProfile(profileRow)
        setAlbums(albumRows)
      } catch (err: any) {
        if (!mounted) return
        setErrorText(err?.message || 'Could not load profile data right now.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  const visibleAlbums = useMemo(() => {
    if (!profile) return []
    if (profile.share_private_albums) return albums
    return albums.filter((album) => album.is_public)
  }, [albums, profile])

  const travelDistance = useMemo(() => {
    return `${visibleAlbums.length * 210} km`
  }, [visibleAlbums.length])

  return (
    <TripArcShell mainClassName="max-w-7xl pb-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(173,198,255,0.17),transparent_35%),radial-gradient(circle_at_85%_5%,rgba(255,188,124,0.14),transparent_32%),radial-gradient(circle_at_70%_80%,rgba(194,193,255,0.18),transparent_40%)]" />

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-20 space-y-8"
      >
        <header className="rounded-[2rem] border border-white/10 bg-[#121217]/75 p-6 backdrop-blur-xl md:p-8">
          <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-end">
            <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-full border-4 border-white/15 shadow-xl lg:mx-0 lg:h-36 lg:w-36">
              <img
                src={profile?.avatar_url || fallbackAvatar}
                alt={profile?.display_name || 'Profile avatar'}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="text-center lg:text-left">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/70">
                <Sparkles size={12} />
                TripArc Public Profile
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-white md:text-5xl">
                {profile?.display_name || 'Set up your public profile'}
              </h1>
              <p className="mt-2 text-sm text-white/70 md:text-base">
                @{profile?.username || 'username'}
                {profile?.home_base ? ` · ${profile.home_base}` : ''}
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 md:text-base">
                {profile?.bio || 'Create your public profile from the TripArc profile button to share your travel identity.'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75">
                {profile?.is_profile_public ? <Globe2 size={14} className="text-emerald-300" /> : <Lock size={14} className="text-amber-300" />}
                {profile?.is_profile_public ? 'Public profile' : 'Private profile'}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75">
                {profile?.share_private_albums ? <Globe2 size={14} className="text-emerald-300" /> : <Lock size={14} className="text-amber-300" />}
                {profile?.share_private_albums ? 'Sharing private albums' : 'Only sharing public albums'}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Trips', value: String(visibleAlbums.length) },
            { label: 'Distance', value: travelDistance },
            { label: 'Public Albums', value: String(albums.filter((album) => album.is_public).length) },
            { label: 'Total Albums', value: String(albums.length) },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold text-[#adc6ff]">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-[1.8rem] border border-white/10 bg-[#121217]/75 p-6 backdrop-blur-xl md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">Visible Memory Albums</h2>
              <p className="text-sm text-white/55">
                {profile?.share_private_albums
                  ? 'All albums are visible because private sharing is enabled.'
                  : 'Only albums marked as public appear here.'}
              </p>
            </div>
          </div>

          {loading && <p className="text-sm text-white/65">Loading profile...</p>}

          {!loading && errorText && (
            <p className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {errorText}
            </p>
          )}

          {!loading && !errorText && !visibleAlbums.length && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/65">
              No visible albums yet. In Memories, switch an album to Public or enable private sharing in your profile setup popup.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleAlbums.map((album) => (
              <article key={album.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                <div className="h-44 w-full bg-gradient-to-br from-[#1f304f] via-[#0f1116] to-[#3a2a10] p-4">
                  <div className="inline-flex rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">
                    {album.is_public ? 'Public album' : 'Private album'}
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <h3 className="font-display text-xl font-semibold text-white">{album.title}</h3>
                  <p className="inline-flex items-center gap-2 text-sm text-white/65">
                    <MapPin size={14} className="text-[#f2ca50]" />
                    {album.location}
                  </p>
                  <p className="inline-flex items-center gap-2 text-sm text-white/65">
                    <CalendarDays size={14} className="text-[#f2ca50]" />
                    {formatAlbumDateRange(album.start_date, album.end_date)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {!profile && !loading && !errorText && (
          <section className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="inline-flex items-center gap-2 font-semibold">
              <UserRound size={16} />
              Profile setup is pending
            </p>
            <p className="mt-2 text-amber-50/80">
              Go to the profile button in the TripArc top navigation and complete Create your public profile.
            </p>
          </section>
        )}
      </motion.section>
    </TripArcShell>
  )
}
