import { useEffect, useState } from 'react'
import {
  Compass,
  Bot,
  Grid3X3,
  List,
  LocateFixed,
  Map,
  Mountain,
  Navigation,
  User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AuroraTopNav from '../components/AuroraTopNav'
import AlbumCard from '../components/memories/AlbumCard'
import { formatAlbumDateRange, listAlbums, type MemoryAlbum } from '../lib/memoriesApi'

type Friend = {
  name: string
  note: string
  image: string
  cta: 'View Profile' | 'Connect'
}

type TripRow = {
  destination: string
  country: string
  duration: string
  type: 'Cultural' | 'Adventure'
  status: 'Active' | 'Completed'
}

type AlbumWithCover = MemoryAlbum & { coverImage: string }

const friends: Friend[] = [
  {
    name: 'Leo Dubois',
    note: 'Met in Paris Expedition',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80',
    cta: 'View Profile',
  },
  {
    name: 'Amara Okafor',
    note: 'Met in Lagos Summit',
    image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80',
    cta: 'View Profile',
  },
  {
    name: 'Julian Voss',
    note: 'Met in Berlin Solo',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
    cta: 'Connect',
  },
  {
    name: 'Yuki Tanaka',
    note: 'Met in Osaka Trails',
    image: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=120&q=80',
    cta: 'View Profile',
  },
]

const tripRows: TripRow[] = [
  {
    destination: 'Osaka & Kyoto Expedition',
    country: 'Japan',
    duration: '14 Days',
    type: 'Cultural',
    status: 'Active',
  },
  {
    destination: 'Yosemite Wilderness Solo',
    country: 'USA',
    duration: '7 Days',
    type: 'Adventure',
    status: 'Completed',
  },
]

export default function PrivateProfilePage() {
  const navigate = useNavigate()
  const [walkingTolerance, setWalkingTolerance] = useState(() => {
    const stored = localStorage.getItem('stellora_walking_tolerance')
    return stored ? Number(stored) : 15
  })
  const [albumView, setAlbumView] = useState<'grid' | 'list'>('grid')
  const [albums, setAlbums] = useState<AlbumWithCover[]>([])
  const [albumsLoading, setAlbumsLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadAlbums = async () => {
      setAlbumsLoading(true)
      try {
        const rows = await listAlbums()
        if (!active) return
        setAlbums(rows)
      } catch {
        if (!active) return
        setAlbums([])
      } finally {
        if (active) setAlbumsLoading(false)
      }
    }

    loadAlbums()
    return () => {
      active = false
    }
  }, [])

  // Save walking tolerance to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('stellora_walking_tolerance', String(walkingTolerance))
  }, [walkingTolerance])

  return (
    <div className="min-h-screen bg-[#131317] px-0 text-[#e4e1e7]">
      <AuroraTopNav />

      <main className="relative mx-auto max-w-7xl overflow-hidden px-6 pb-32 pt-28 lg:px-12">
        <div className="pointer-events-none absolute -left-64 top-0 -z-10 h-[800px] w-[800px] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.12)_0%,rgba(19,19,23,0)_70%)]" />

        <header className="mb-16 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="flex items-center gap-8">
            <div className="group relative">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-[#2563EB] to-[#06B6D4] opacity-25 blur transition duration-1000 group-hover:opacity-50" />
              <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-white/20">
                <img
                  alt="Elena Vance"
                  className="h-full w-full object-cover"
                  src="https://images.unsplash.com/photo-1619946794135-5bc917a27793?auto=format&fit=crop&w=300&q=80"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-6">
                <div>
                  <h1 className="mb-2 text-5xl font-extrabold tracking-tight text-white">Elena Vance</h1>
                  <p className="flex items-center gap-2 text-[#c3c6d7]">
                    <span className="text-[#b4c5ff]">✦</span>
                    Elite Voyager · Level 42
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center">
                  <span className="text-3xl text-white">⌗</span>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <span className="rounded-full bg-[#353439] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#dbe1ff]">
                  Aurora Member
                </span>
                <span className="rounded-full border border-[#2563eb]/40 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#b4c5ff]">
                  Bio-Sync Active
                </span>
              </div>
            </div>
          </div>

          <div className="flex h-12 items-center gap-4">
            <button className="h-full rounded-xl bg-gradient-to-br from-[#2563EB] to-[#06B6D4] px-8 font-bold text-white shadow-lg shadow-blue-900/20 transition active:scale-95" type="button">
              Edit Profile
            </button>
            <button className="h-full rounded-xl bg-[#353439] px-6 font-bold text-[#dbe1ff] transition active:scale-95" type="button">
              Share DNA
            </button>
          </div>
        </header>

        <section className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-12">
          <div className="relative flex min-h-[400px] flex-col justify-between overflow-hidden rounded-3xl bg-[#1f1f23] p-8 md:col-span-8">
            <div className="relative z-10">
              <h2 className="mb-1 text-2xl font-bold text-white">TravelDNA</h2>
              <p className="mb-8 text-sm text-[#c3c6d7]">Biometric exploration signatures</p>
              <div className="flex flex-wrap gap-12">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#8d90a0]">Walking Distance</p>
                  <p className="text-4xl font-black tracking-tight text-white">
                    1,284<span className="ml-1 text-sm font-medium text-[#c3c6d7]">km</span>
                  </p>
                  <div className="mt-2 h-1 w-32 rounded-full bg-[#353439]">
                    <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#2563EB] to-[#06B6D4]" />
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#8d90a0]">Voyage Points</p>
                  <p className="text-4xl font-black tracking-tight text-[#b4c5ff]">84.2k</p>
                  <p className="text-xs text-[#c3c6d7]">+12% from last month</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#8d90a0]">Walking Capacity</p>
                  <p className="text-4xl font-black tracking-tight text-white">
                    94<span className="ml-1 text-sm font-medium text-[#c3c6d7]">%</span>
                  </p>
                  <p className="text-xs text-[#4cd7f6]">Peak performance state</p>
                </div>
              </div>

              <div className="mt-12 max-w-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-[#b4c5ff]">Walking tolerance</h3>
                  <span className="text-lg font-bold text-white">{walkingTolerance} km/day</span>
                </div>
                <input
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-[#353439] accent-[#2563EB]"
                  max={40}
                  min={5}
                  step={1}
                  type="range"
                  value={walkingTolerance}
                  onChange={(event) => setWalkingTolerance(Number(event.target.value))}
                />
                <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-[#c3c6d7]">
                  Target max daily walking distance
                </p>
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-0 right-0 top-0 flex w-1/2 items-center justify-end pr-8 opacity-40">
              <div className="relative flex h-64 w-64 items-center justify-center rounded-full border-2 border-[#b4c5ff]/20">
                <div className="absolute h-48 w-48 animate-pulse rounded-full border-2 border-[#4cd7f6]/20" />
                <div className="absolute h-32 w-32 rounded-full bg-gradient-to-br from-[#2563EB] to-[#06B6D4] opacity-30 blur-2xl" />
                <Compass size={56} className="text-[#b4c5ff]" />
              </div>
            </div>
          </div>

          <div className="flex flex-col rounded-3xl bg-[#2a292e] p-8 md:col-span-4">
            <h3 className="mb-6 text-xl font-bold text-white">Social Graph</h3>
            <div className="flex-1 space-y-6">
              <div className="flex items-center justify-between rounded-2xl border border-[#2563eb]/20 bg-[#2563eb]/10 p-4">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#b4c5ff] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#b4c5ff]" />
                  </span>
                  <p className="text-sm font-bold text-[#b4c5ff]">Meetup Alert</p>
                </div>
                <p className="text-xs text-[#c3c6d7]">Tokyo Sector</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <img
                    alt="Marcus"
                    className="h-10 w-10 rounded-full object-cover"
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=80&q=80"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Marcus Thorne</p>
                    <p className="text-xs text-[#c3c6d7]">Colliding at Shibuya Sky</p>
                  </div>
                  <LocateFixed size={16} className="text-[#b4c5ff]" />
                </div>

                <div className="flex items-center gap-3">
                  <img
                    alt="Sarah"
                    className="h-10 w-10 rounded-full object-cover"
                    src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=80&q=80"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">Sarah Chen</p>
                    <p className="text-xs text-[#c3c6d7]">Arriving Tokyo in 2h</p>
                  </div>
                  <Navigation size={16} className="text-[#8d90a0]" />
                </div>
              </div>
            </div>

            <button className="mt-6 w-full rounded-xl bg-[#353439] py-3 text-sm font-bold text-white transition hover:bg-[#39393d]" type="button">
              View Social Map
            </button>
          </div>
        </section>

        <section className="mb-16">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">Voyage Friends</h2>
              <p className="mt-1 text-[#c3c6d7]">Explorers you've connected with on the road</p>
            </div>
            <button className="text-sm font-bold uppercase tracking-widest text-[#b4c5ff] hover:underline" type="button">
              More
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {friends.map((friend) => (
              <div key={friend.name} className="rounded-2xl border border-white/5 bg-[#1f1f23] p-6 text-center backdrop-blur-xl">
                <img
                  alt={friend.name}
                  className="mx-auto mb-4 h-20 w-20 rounded-full border-2 border-[#2563eb]/20 p-1 object-cover"
                  src={friend.image}
                />
                <h4 className="text-lg font-bold text-white">{friend.name}</h4>
                <p className="mb-6 text-xs text-[#c3c6d7]">{friend.note}</p>
                <button
                  className={`w-full rounded-lg py-2 text-xs font-bold transition ${
                    friend.cta === 'Connect'
                      ? 'border border-[#8d90a0]/30 text-white hover:bg-white/5'
                      : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
                  }`}
                  type="button"
                >
                  {friend.cta}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">Memorial Handbook</h2>
              <p className="mt-1 text-[#c3c6d7]">Albums from the Memories page</p>
            </div>
            <div className="flex gap-2">
              <button
                className={`rounded-lg p-2 transition ${albumView === 'grid' ? 'bg-[#1f1f23] text-[#b4c5ff]' : 'bg-[#1f1f23] text-[#8d90a0]'}`}
                type="button"
                aria-label="Grid view"
                onClick={() => setAlbumView('grid')}
              >
                <Grid3X3 size={16} />
              </button>
              <button
                className={`rounded-lg p-2 transition ${albumView === 'list' ? 'bg-[#1f1f23] text-[#b4c5ff]' : 'bg-[#1f1f23] text-[#8d90a0]'}`}
                type="button"
                aria-label="List view"
                onClick={() => setAlbumView('list')}
              >
                <List size={16} />
              </button>
            </div>
          </div>

          {albumsLoading ? (
            <p className="text-sm text-[#c3c6d7]">Loading memories albums...</p>
          ) : !albums.length ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-[#c3c6d7]">
              No albums yet. Create some in Memories and they will appear here.
            </div>
          ) : (
            <div className={albumView === 'grid' ? 'grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3' : 'grid grid-cols-1 gap-5'}>
              {albums.map((album) => (
                <div
                  key={album.id}
                  className={
                    albumView === 'grid'
                      ? 'space-y-3'
                      : 'flex flex-col gap-4 rounded-[1.7rem] border border-white/10 bg-[#151519] p-4 md:flex-row'
                  }
                >
                  <div className={albumView === 'list' ? 'w-full shrink-0 md:w-[260px]' : ''}>
                    <AlbumCard
                      title={album.title}
                      location={album.location}
                      dateRange={formatAlbumDateRange(album.start_date, album.end_date)}
                      coverImage={album.coverImage || 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80'}
                      isPublic={album.is_public}
                      onOpen={() => navigate(`/triparc/memories/${album.id}`)}
                    />
                  </div>
                  <div className={albumView === 'list' ? 'flex flex-1 flex-col justify-between py-2' : 'px-2'}>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#8d90a0]">{album.is_public ? 'Public album' : 'Private album'}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[#c3c6d7]">{album.description || 'Album from the Memories page.'}</p>
                    <p className="mt-3 text-xs text-[#8d90a0]">{formatAlbumDateRange(album.start_date, album.end_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-16">
          <h2 className="mb-8 text-3xl font-extrabold tracking-tight text-white">Trip History</h2>
          <div className="overflow-hidden rounded-3xl bg-[#1f1f23]">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#434655]/30">
                  <th className="px-8 py-6 text-xs font-bold uppercase tracking-widest text-[#8d90a0]">Destination</th>
                  <th className="px-8 py-6 text-xs font-bold uppercase tracking-widest text-[#8d90a0]">Duration</th>
                  <th className="px-8 py-6 text-xs font-bold uppercase tracking-widest text-[#8d90a0]">Type</th>
                  <th className="px-8 py-6 text-right text-xs font-bold uppercase tracking-widest text-[#8d90a0]">Status</th>
                </tr>
              </thead>
              <tbody>
                {tripRows.map((row, index) => (
                  <tr key={row.destination} className={`transition-colors hover:bg-white/5 ${index !== tripRows.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#353439]">
                          {index === 0 ? <Map size={16} className="text-[#b4c5ff]" /> : <Mountain size={16} className="text-[#8d90a0]" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{row.destination}</p>
                          <p className="text-xs text-[#c3c6d7]">{row.country}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-sm font-medium text-[#c3c6d7]">{row.duration}</td>
                    <td className="px-8 py-6">
                      <span
                        className={`rounded px-2 py-1 text-xs ${
                          row.type === 'Cultural'
                            ? 'border border-cyan-300/20 bg-cyan-500/20 text-cyan-300'
                            : 'border border-[#b4c5ff]/20 bg-[#2563eb]/20 text-[#b4c5ff]'
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${row.status === 'Active' ? 'text-[#b4c5ff]' : 'text-[#c3c6d7]'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-3xl border-t border-white/5 bg-[#0B0B0F]/80 px-4 py-3 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] backdrop-blur-lg md:hidden">
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform hover:text-blue-400 active:scale-90" type="button">
          <Compass size={18} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Explore</span>
        </button>
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform hover:text-blue-400 active:scale-90" type="button">
          <Map size={18} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">My Trips</span>
        </button>
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform hover:text-blue-400 active:scale-90" type="button">
          <Bot size={18} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Concierge</span>
        </button>
        <button className="flex flex-col items-center justify-center rounded-xl bg-blue-500/10 px-4 py-2 text-blue-500 transition-transform active:scale-90" type="button">
          <User size={18} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Account</span>
        </button>
      </nav>
    </div>
  )
}
