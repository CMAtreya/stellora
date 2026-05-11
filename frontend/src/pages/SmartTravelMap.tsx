import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, MapPinned, Menu, Sparkles } from 'lucide-react'
import TripArcShell from '../components/TripArcShell'
import MapContainer, { type SmartStop } from '../components/smartTravelMap/MapContainer'
import ItineraryCard from '../components/smartTravelMap/ItineraryCard'
import SmartAlert from '../components/smartTravelMap/SmartAlert'
import SuggestionCard from '../components/smartTravelMap/SuggestionCard'
import StoryPlayer from '../components/smartTravelMap/StoryPlayer'

const stops: SmartStop[] = [
  {
    id: 'breakfast',
    title: 'Mylari Dosa',
    time: '08:30 AM',
    category: 'Food',
    status: 'completed',
    price: '₹₹',
    rating: '4.8',
    icon: 'food',
    x: '38%',
    y: '42%',
    story: true,
    tagline: 'Fresh dosa, fast service, calm start.',
    crowd: 'Low',
  },
  {
    id: 'palace',
    title: 'Mysore Palace',
    time: '10:00 AM',
    category: 'Heritage',
    status: 'current',
    price: '₹₹₹',
    rating: '4.9',
    icon: 'heritage',
    x: '58%',
    y: '28%',
    story: true,
    tagline: 'Royal architecture with the best audio story.',
    crowd: 'Moderate',
  },
  {
    id: 'market',
    title: 'Devaraja Market',
    time: '01:30 PM',
    category: 'Shopping',
    status: 'upcoming',
    price: '₹₹',
    rating: '4.7',
    icon: 'shopping',
    x: '72%',
    y: '36%',
    story: false,
    tagline: 'Color, spice, flowers, quick local finds.',
    crowd: 'Rising',
  },
  {
    id: 'lunch',
    title: 'Lunch: Vinayaka Mylari',
    time: '02:15 PM',
    category: 'Food',
    status: 'upcoming',
    price: '₹₹',
    rating: '4.8',
    icon: 'food',
    x: '66%',
    y: '58%',
    story: false,
    tagline: 'Best dosa here. Keep a 10 min buffer.',
    crowd: 'High soon',
  },
  {
    id: 'sunset',
    title: 'Chamundi Hills',
    time: '06:00 PM',
    category: 'Heritage',
    status: 'upcoming',
    price: '₹₹',
    rating: '4.9',
    icon: 'heritage',
    x: '28%',
    y: '68%',
    story: true,
    tagline: 'Best golden hour view for the day.',
    crowd: 'Light',
  },
]

const alerts = [
  {
    id: 'late',
    tone: 'warning' as const,
    text: "You're running 20 min late — adjust route?",
  },
  {
    id: 'crowd',
    tone: 'default' as const,
    text: 'Lunch spot will get crowded in 15 min.',
  },
]

const suggestions = [
  {
    name: 'Mylari Dosa House',
    distance: '400m away',
    tagline: 'Best dosa here',
    image: 'https://images.unsplash.com/photo-1626132647523-1b53e0f75f54?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Devaraja Bazaar',
    distance: '1.2km away',
    tagline: 'Spice lanes + local finds',
    image: 'https://images.unsplash.com/photo-1505934454133-8cc3c7b8c8b7?auto=format&fit=crop&w=900&q=80',
  },
  {
    name: 'Palace Coffee Corner',
    distance: '700m away',
    tagline: 'Quick espresso stop',
    image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=80',
  },
]

const tabs = [
  { id: 'map', label: 'Map', icon: MapPinned },
  { id: 'itinerary', label: 'Itinerary', icon: LayoutGrid },
] as const

type TabId = (typeof tabs)[number]['id']

export default function SmartTravelMap() {
  const [activeStopId, setActiveStopId] = useState('palace')
  const [routeVisible, setRouteVisible] = useState(true)
  const [crowdVisible, setCrowdVisible] = useState(true)
  const [foodVisible, setFoodVisible] = useState(true)
  const [playing, setPlaying] = useState(true)
  const [storyProgress, setStoryProgress] = useState(42)
  const [mobileTab, setMobileTab] = useState<TabId>('map')

  const activeStop = useMemo(() => stops.find((stop) => stop.id === activeStopId) ?? stops[0], [activeStopId])

  useEffect(() => {
    if (!playing) return

    const timer = window.setInterval(() => {
      setStoryProgress((progress) => (progress >= 100 ? 0 : progress + 1))
    }, 220)

    return () => window.clearInterval(timer)
  }, [playing])

  useEffect(() => {
    if (activeStop.status === 'current') {
      setPlaying(true)
    }
  }, [activeStop.status])

  return (
    <TripArcShell mainClassName="max-w-[1700px] pb-24 pt-6 lg:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(242,202,80,0.1),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.05),transparent_24%),radial-gradient(circle_at_60%_80%,rgba(0,0,0,0.25),transparent_35%)]" />

      <div className="relative z-10 flex items-center justify-between gap-4 pb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-white/45">Live navigation</p>
          <h1 className="font-display text-4xl font-semibold text-white md:text-5xl">Smart Travel Map</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/65 md:text-base">An intelligent map-based assistant that syncs your itinerary, route, crowd timing, and story playback in real time.</p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/70 lg:flex">
          <Sparkles size={14} className="text-[#f2ca50]" />
          AI travel assistant
        </div>
      </div>

      <div className="lg:hidden sticky top-[72px] z-30 mb-5 flex items-center justify-between rounded-full border border-white/10 bg-[#111116]/85 p-2 backdrop-blur-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = mobileTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition ${active ? 'bg-white text-slate-950' : 'text-white/65'}`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr] lg:items-stretch">
        <section className={`relative ${mobileTab === 'itinerary' ? 'hidden lg:block' : 'block'} min-h-[calc(100vh-170px)]`}>
          <MapContainer
            stops={stops}
            activeStopId={activeStopId}
            onSelectStop={setActiveStopId}
            toggles={{ route: routeVisible, crowd: crowdVisible, food: foodVisible }}
            onToggleRoute={() => setRouteVisible((value) => !value)}
            onToggleCrowd={() => setCrowdVisible((value) => !value)}
            onToggleFood={() => setFoodVisible((value) => !value)}
          />
        </section>

        <section className={`flex flex-col gap-5 ${mobileTab === 'map' ? 'hidden lg:flex' : 'flex'} min-h-[calc(100vh-170px)] overflow-hidden rounded-[2rem] border border-white/10 bg-[#111116]/80 p-5 shadow-[0_24px_60px_-35px_rgba(0,0,0,1)] backdrop-blur-2xl md:p-6`}>
          <div className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-3xl font-semibold text-white">Today's Journey</h2>
                <p className="text-sm text-white/55">8 AM – 8 PM Plan</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold text-[#f2ca50]">65%</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">Complete</p>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} transition={{ duration: 0.7 }} className="h-full rounded-full bg-gradient-to-r from-[#f2ca50] to-[#d4af37]" />
            </div>
          </div>

          <div className="grid gap-3">
            {alerts.map((alert) => (
              <motion.div key={alert.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <SmartAlert text={alert.text} tone={alert.tone} />
              </motion.div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Itinerary</h3>
              <button className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65 transition hover:bg-white/10">
                Current stop auto-sync
              </button>
            </div>
            <div className="space-y-3">
              {stops.map((stop) => (
                <ItineraryCard
                  key={stop.id}
                  time={stop.time}
                  title={stop.title}
                  category={stop.category}
                  status={stop.status}
                  active={stop.id === activeStopId}
                  onClick={() => setActiveStopId(stop.id)}
                />
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Recommended Nearby</h3>
                <button className="text-xs font-semibold uppercase tracking-[0.14em] text-[#f2ca50]">View all</button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {suggestions.map((item) => (
                  <SuggestionCard key={item.name} {...item} />
                ))}
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 mt-2">
            <StoryPlayer
              title={`Story of ${activeStop.title}`}
              duration="3:12"
              progress={storyProgress}
              playing={playing}
              onTogglePlay={() => setPlaying((value) => !value)}
            />
          </div>
        </section>
      </div>

      <div className="fixed bottom-5 right-5 z-40 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab((current) => (current === 'map' ? 'itinerary' : 'map'))}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#f2ca50] to-[#d4af37] text-[#2f2404] shadow-[0_24px_45px_-18px_rgba(242,202,80,0.5)] transition hover:scale-105 active:scale-95"
          aria-label="Toggle map and itinerary"
        >
          <Menu size={22} />
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[#111116]/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <StoryPlayer
          title={`Story of ${activeStop.title}`}
          duration="3:12"
          progress={storyProgress}
          playing={playing}
          onTogglePlay={() => setPlaying((value) => !value)}
        />
      </div>
    </TripArcShell>
  )
}
