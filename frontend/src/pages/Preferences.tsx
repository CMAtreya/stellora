import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TripArcNav from '../components/TripArcNav'

type TimelineRow = {
  kind: 'past' | 'current' | 'upcoming' | 'transition'
  time?: string
  title?: string
  subtitle?: string
  done?: boolean
  icon?: string
  text?: string
  badge?: string
  image?: string
  priceLevel?: number
  category?: string
}

const JOURNEY_DRAFT_STORAGE_KEY = 'triparc:journey:draft:v1'

function readJourneyDraft(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(JOURNEY_DRAFT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    0.5 - Math.cos(dLat)/2 + 
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    (1 - Math.cos(dLon))/2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export default function PreferencesPage() {
  const navigate = useNavigate()
  const persistedDraft = useMemo(() => readJourneyDraft(), [])
  const city = persistedDraft?.city || 'Kyoto'
  const [timelineRows, setTimelineRows] = useState<TimelineRow[]>([
    {
      kind: 'past',
      time: '08:00 AM — 09:30 AM',
      title: 'Traditional Tea Ceremony',
      subtitle: 'Gion District Tea House',
      done: true,
    },
    {
      kind: 'transition',
      icon: 'directions_bus',
      text: 'Bus • 15 min • 2.4 km via Kawaramachi-dori',
    },
    {
      kind: 'current',
      time: '10:00 AM — 12:30 PM',
      title: 'Fushimi Inari Shrine Hike',
      subtitle: 'Kyoto, Japan',
    },
    {
      kind: 'transition',
      icon: 'train',
      text: 'Train • 12 min • 3.1 km via JR Nara Line',
    },
    {
      kind: 'upcoming',
      time: '01:00 PM — 02:30 PM',
      title: 'Lunch at Nishiki Market',
      subtitle: 'Street Food Exploration',
      badge: 'Refuel Point',
    },
    {
      kind: 'transition',
      icon: 'directions_walk',
      text: 'Walk • 8 min • 600m via Higashiyama Streets',
    },
    {
      kind: 'upcoming',
      time: '06:00 PM — 08:00 PM',
      title: 'Pontocho Alley Dinner',
      subtitle: 'Riverside Kaiseki Dining',
    },
  ])

  useEffect(() => {
    const items = persistedDraft?.items || [];
    if (items.length === 0) return;

    const buildRows = (closestIdx: number) => {
      const rows: TimelineRow[] = [];
      items.forEach((item: any, index: number) => {
        if (index > 0) {
           rows.push({
             kind: 'transition',
             icon: 'directions_walk',
             text: 'Transition • Route to next stop',
           })
        }
        
        let kind: 'past' | 'current' | 'upcoming' = 'upcoming';
        if (index < closestIdx) kind = 'past';
        else if (index === closestIdx) kind = 'current';

        rows.push({
          kind,
          time: item.time || (item.durationMinutes ? `${item.durationMinutes} min` : 'Anytime'),
          title: item.title || item.name || 'Planned Stop',
          subtitle: item.location || city,
          done: kind === 'past',
          image: item.image || item.photoUrl,
          category: item.category,
          priceLevel: item.priceLevel,
        });
      });
      setTimelineRows(rows);
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          let closestIdx = 0;
          let minDistance = Infinity;
          
          items.forEach((item: any, index: number) => {
            if (item.lat && item.lng) {
              const dist = getDistance(latitude, longitude, item.lat, item.lng);
              if (dist < minDistance) {
                minDistance = dist;
                closestIdx = index;
              }
            }
          });
          
          buildRows(closestIdx);
        },
        (error) => {
          console.warn('Geolocation failed or denied, defaulting to first item.', error);
          buildRows(0);
        }
      );
    } else {
      buildRows(0);
    }
  }, [persistedDraft, city]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0B0B0F] text-[#E4E1E7]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@500;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }

        .aurora-glow {
          background: radial-gradient(600px circle at 50% 0%, rgba(37, 99, 235, 0.08), transparent);
        }

        .aurora-gradient {
          background: linear-gradient(135deg, #2563EB 0%, #06B6D4 100%);
        }

        .glass-card {
          background: rgba(53, 52, 57, 0.4);
          backdrop-filter: blur(12px);
        }

        .pref-slider {
          -webkit-appearance: none;
          width: 100%;
          height: 4px;
          background: #353439;
          border-radius: 9999px;
          outline: none;
        }

        .pref-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: #2563EB;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 0 10px rgba(37, 99, 235, 0.5);
        }

        details > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>

      <TripArcNav />

      <div className="flex min-h-screen flex-col pt-0">
        <section className="sticky top-20 z-40 w-full border-b border-white/5 bg-[#1C1C1E]/80 backdrop-blur-md">
          <details className="group mx-auto max-w-[1600px]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-8 py-4 transition-colors hover:bg-white/5">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#b4c5ff]" style={{ fontVariationSettings: '"FILL" 1' }}>settings_suggest</span>
                <span className="text-sm font-bold uppercase tracking-wider text-[#E4E1E7]/80">Day Preferences</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden gap-6 text-[10px] font-medium uppercase tracking-widest text-[#c8c6c8] md:flex">
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#b4c5ff]" /> 08:00 — 20:00</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#b4c5ff]" /> Walking / Public • 8KM</span>
                </div>
                <span className="material-symbols-outlined text-[#c8c6c8] transition-transform duration-300 group-open:rotate-180">expand_more</span>
              </div>
            </summary>

            <div className="border-t border-white/5 bg-[#1C1C1E] p-8">
              <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
                <div className="space-y-4 md:col-span-3">
                  <h5 className="text-[11px] font-black uppercase tracking-widest text-[#b4c5ff]">Timeline</h5>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] uppercase text-[#c8c6c8]">Start</label>
                      <div className="flex items-center justify-between rounded-xl border border-[#434655]/10 bg-[#353439] px-4 py-3">
                        <span className="text-sm font-bold text-white">08:00</span>
                        <span className="text-[10px] font-bold text-[#c8c6c8]">AM</span>
                      </div>
                    </div>
                    <div className="mt-4 text-[#c8c6c8]">—</div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] uppercase text-[#c8c6c8]">End</label>
                      <div className="flex items-center justify-between rounded-xl border border-[#434655]/10 bg-[#353439] px-4 py-3">
                        <span className="text-sm font-bold text-white">08:00</span>
                        <span className="text-[10px] font-bold text-[#c8c6c8]">PM</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 md:col-span-5">
                  <h5 className="text-[11px] font-black uppercase tracking-widest text-[#b4c5ff]">Transport Mode</h5>
                  <div className="flex flex-wrap gap-2">
                    <button className="flex items-center gap-2 rounded-full border border-[#2563eb] bg-[#b4c5ff] px-4 py-2.5 text-xs font-bold text-[#002a78]">
                      <span className="material-symbols-outlined text-sm">directions_walk</span>Walking
                    </button>
                    <button className="flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-4 py-2.5 text-xs font-bold text-[#c8c6c8] transition-all hover:border-white/20">
                      <span className="material-symbols-outlined text-sm">local_taxi</span>Taxi
                    </button>
                    <button className="flex items-center gap-2 rounded-full border border-[#2563eb] bg-[#b4c5ff] px-4 py-2.5 text-xs font-bold text-[#002a78]">
                      <span className="material-symbols-outlined text-sm">directions_bus</span>Public
                    </button>
                    <button className="flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-4 py-2.5 text-xs font-bold text-[#c8c6c8] transition-all hover:border-white/20">
                      <span className="material-symbols-outlined text-sm">directions_bike</span>Cycling
                    </button>
                  </div>
                </div>

                <div className="space-y-4 md:col-span-3">
                  <h5 className="text-[11px] font-black uppercase tracking-widest text-[#b4c5ff]">Walking Tolerance</h5>
                  <div className="px-2">
                    <input className="pref-slider" max="2" min="0" step="1" type="range" defaultValue="1" />
                    <div className="mt-3 flex justify-between">
                      <span className="text-[10px] font-bold uppercase text-[#c8c6c8]">Minimal</span>
                      <span className="text-[10px] font-bold uppercase text-[#b4c5ff]">Balanced</span>
                      <span className="text-[10px] font-bold uppercase text-[#c8c6c8]">Explorer</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-end justify-end md:col-span-1">
                  <button className="aurora-gradient w-full rounded-2xl px-8 py-3.5 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all active:scale-95 hover:brightness-110 md:w-auto">
                    Update
                  </button>
                </div>
              </div>
            </div>
          </details>
        </section>

        <main className="aurora-glow mx-auto w-full max-w-[1600px] flex-grow p-8 pb-24 lg:p-12 lg:pb-12">
          <header className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="mb-2 font-headline text-5xl font-extrabold tracking-tighter text-white lg:text-6xl">Kyoto Zen Explorer</h1>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 rounded-full bg-[#2a292e] px-3 py-1 text-xs font-bold text-[#b4c5ff]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#22C55E]" />On Track — Day 3 of 7
                </span>
                <span className="text-sm font-medium text-[#c8c6c8]">October 24, 2024</span>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="min-w-[120px] rounded-2xl border border-[#434655]/10 bg-[#1b1b1f] p-4 text-center">
                <span className="mb-1 block text-xs text-[#c8c6c8]">Energy</span>
                <span className="font-headline text-2xl font-bold text-[#F59E0B]">68%</span>
              </div>
              <div className="min-w-[120px] rounded-2xl border border-[#434655]/10 bg-[#1b1b1f] p-4 text-center">
                <span className="mb-1 block text-xs text-[#c8c6c8]">Budget</span>
                <span className="font-headline text-2xl font-bold text-white">$1,240</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="space-y-8 lg:col-span-8">
              <section className="space-y-0">
                <h3 className="mb-10 flex w-full items-center justify-between font-headline text-xl font-bold text-white">
                  <div className="flex items-center gap-2"><span className="material-symbols-outlined text-2xl text-[#b4c5ff]">schedule</span>Today's Timeline</div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 rounded-full border border-[#434655]/10 bg-[#1b1b1f] px-4 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#c8c6c8]">Sync</span>
                      <label className="relative inline-flex scale-75 cursor-pointer items-center">
                        <input defaultChecked className="peer sr-only" type="checkbox" />
                        <div className="h-5 w-9 rounded-full bg-[#353439] after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#2563EB] peer-checked:after:translate-x-4" />
                      </label>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-[#434655]/10 bg-[#1b1b1f] px-4 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#c8c6c8]">Shuffle</span>
                      <label className="relative inline-flex scale-75 cursor-pointer items-center">
                        <input className="peer sr-only" type="checkbox" />
                        <div className="h-5 w-9 rounded-full bg-[#353439] after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#2563EB] peer-checked:after:translate-x-4" />
                      </label>
                    </div>
                  </div>
                </h3>

                {timelineRows.map((row, index) => {
                  if (row.kind === 'transition') {
                    return (
                      <div key={`transition-${index}`} className="relative border-l border-[#434655]/20 py-6 pl-10">
                        <div className="flex items-center gap-3 text-sm font-medium text-gray-500">
                          <span className="material-symbols-outlined text-lg">{row.icon}</span>
                          <span>{row.text}</span>
                        </div>
                      </div>
                    )
                  }

                  if (row.kind === 'current') {
                    return (
                      <div key={`current-${index}`} className="relative border-l border-blue-600/50 pb-8 pl-10">
                        <div className="aurora-gradient absolute -left-[10px] top-0 h-[21px] w-[21px] rounded-full ring-4 ring-[#0B0B0F]" />
                        <div className="glass-card rounded-[2.5rem] border border-[#b4c5ff]/20 p-8 shadow-2xl">
                          <div className="mb-6 flex items-start justify-between">
                            <div>
                              <span className="text-xs font-bold uppercase tracking-widest text-[#b4c5ff]">{row.time}</span>
                              <h4 className="mt-1 text-3xl font-bold text-white">{row.title}</h4>
                              <div className="mt-2 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm text-[#c8c6c8]">location_on</span>
                                <span className="text-sm text-[#c8c6c8]">{row.subtitle}</span>
                              </div>
                            </div>
                            <div className="rounded-lg bg-blue-500/10 px-4 py-1.5 text-xs font-bold uppercase text-[#b4c5ff]">Active Now</div>
                          </div>
                          <div className="relative mb-6 h-64 w-full overflow-hidden rounded-3xl">
                            <img
                              alt={row.title}
                              className="h-full w-full object-cover"
                              src={row.image || "https://lh3.googleusercontent.com/aida-public/AB6AXuAY7GhvB40eOC97eGSzX-HVLZJIrFnkZyxjUYXmBe6626fYyHC7yNM15PkRVQCaQOGhwlIHi7V3FQkGMdRvqipF49fxilY4e2r6Vufwb6jwP6rkB384c4i4HbnPUdM9k4HG_4L_DM7KJ1LQB1iMq2L7tEML1juYfrj_erUSJzfZEuLgf2YylK4lMfTVDojNPuuBJ2JKLUgmHIfBEv2qUc-l4n48VgdmIzEa-OnP4NmasUpY1jCqbnLwb0kt6xfWD8b5wIuanh9oAvw"}
                            />
                          </div>
                          <div className="flex items-center justify-between text-base">
                            <div className="flex items-center gap-3 text-[#c8c6c8]"><span className="material-symbols-outlined">directions_walk</span><span className="font-medium">4.2 km loop</span></div>
                            {row.category && (row.category.toLowerCase().includes('food') || row.category.toLowerCase().includes('restaurant')) ? (
                              <div className="flex items-center gap-3 text-[#c8c6c8]">
                                <span className="material-symbols-outlined">payments</span>
                                <span className="font-medium">
                                  {row.priceLevel !== undefined && row.priceLevel > 0 ? `Est. Price: ${'$'.repeat(row.priceLevel)}` : 'Pricing Unavailable'}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 text-[#c8c6c8]">
                                <span className="material-symbols-outlined">payments</span>
                                <span className="font-medium">Est. ¥1,200</span>
                              </div>
                            )}
                            <div className="flex items-center gap-3 text-[#EF4444]"><span className="material-symbols-outlined">warning</span><span className="font-medium">Crowd alert: High</span></div>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={`item-${index}`} className="relative border-l border-[#434655]/20 pb-8 pl-10">
                      <div className={`absolute -left-[5px] top-0 h-[11px] w-[11px] rounded-full ${row.kind === 'past' ? 'bg-[#c8c6c8]' : 'bg-[#434655]'}`} />
                      <div className="flex items-start justify-between">
                        <div className={row.kind === 'past' ? 'opacity-50' : ''}>
                          <span className="text-xs font-bold uppercase tracking-widest text-[#c8c6c8]">{row.time}</span>
                          <h4 className="mt-1 text-2xl font-bold text-white">{row.title}</h4>
                          <p className="mt-1 text-sm text-[#c8c6c8]">{row.subtitle}</p>
                        </div>
                        {row.done && <span className="material-symbols-outlined text-2xl text-[#22C55E]">check_circle</span>}
                        {row.badge && (
                          <div className="flex items-center gap-2 rounded-full border border-[#434655]/10 bg-[#1f1f23] px-4 py-2">
                            <span className="material-symbols-outlined text-sm text-[#F59E0B]">bolt</span>
                            <span className="text-xs font-bold text-[#c8c6c8]">{row.badge}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </section>
            </div>

            <div className="space-y-10 lg:col-span-4">
              <div className="relative rounded-[2.5rem] border border-[#434655]/10 bg-[#1b1b1f] p-8 shadow-2xl">
                <div className="mb-8 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="aurora-gradient flex h-12 w-12 items-center justify-center rounded-2xl">
                      <span className="material-symbols-outlined text-2xl text-white" style={{ fontVariationSettings: '"FILL" 1' }}>timer</span>
                    </div>
                    <h3 className="flex items-center font-headline text-lg font-bold text-white">Schedule Tracker<span className="material-symbols-outlined ml-1 text-sm opacity-50">expand_more</span></h3>
                  </div>
                  <div className="flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-1.5">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter text-blue-500">Live</span>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="glass-card rounded-[2rem] border border-[#b4c5ff]/20 bg-blue-500/5 p-6">
                    <div className="mb-5 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">live Status</span>
                      <span className="whitespace-nowrap rounded-full bg-[#22C55E]/10 px-3 py-1.5 text-[10px] font-bold text-[#22C55E]">15 Mins Ahead</span>
                    </div>
                    <div className="mb-6 flex items-center gap-4">
                      <div className="h-1.5 flex-grow overflow-hidden rounded-full bg-[#353439]">
                        <div className="aurora-gradient h-full w-[85%] rounded-full shadow-[0_0_15px_rgba(37,99,235,0.4)]" />
                      </div>
                      <span className="text-xs font-bold text-[#c8c6c8]">85% Sync</span>
                    </div>
                    <h4 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#b4c5ff]">Efficiency Suggestion</h4>
                    <p className="text-sm font-medium leading-relaxed text-[#E4E1E7]">Since you are ahead, let us visit this hidden temple nearby. It is a 4-minute walk and rarely crowded.</p>
                    <div className="mt-6 flex gap-4">
                      <button className="flex-1 rounded-2xl bg-[#b4c5ff] py-3 text-xs font-bold uppercase tracking-wider text-[#002a78]">Apply</button>
                      <button className="flex-1 rounded-2xl border border-white/5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400 transition-all hover:bg-white/5">Dismiss</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative rounded-[2.5rem] border border-[#434655]/10 bg-[#1b1b1f] p-8 shadow-2xl">
                <div className="mb-8 flex items-center gap-4">
                  <div className="aurora-gradient flex h-12 w-12 items-center justify-center rounded-2xl">
                    <span className="material-symbols-outlined text-2xl text-white" style={{ fontVariationSettings: '"FILL" 1' }}>smart_toy</span>
                  </div>
                  <div>
                    <h3 className="flex items-center font-headline text-lg font-bold text-white">Aurora Intelligence<span className="material-symbols-outlined ml-1 text-sm opacity-50">expand_more</span></h3>
                    <p className="text-[10px] font-bold uppercase text-[#b4c5ff]">Always Active</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border-l-4 border-blue-500 bg-[#0B0B0F] p-5 text-sm leading-relaxed text-[#c8c6c8]">Weather at Nishiki Market is currently clearing. I recommend outdoor seating for lunch.</div>
                  <div className="rounded-2xl border-l-4 border-[#F59E0B] bg-[#0B0B0F] p-5 text-sm leading-relaxed text-[#c8c6c8]">Energy levels dropping. Should I suggest a nearby Matcha cafe for a 15-minute rest?</div>
                </div>
                <div className="mt-8">
                  <div className="relative">
                    <input className="h-14 w-full rounded-[1.25rem] border-none bg-[#353439] py-4 pl-6 pr-24 text-sm text-white placeholder:text-gray-600 focus:ring-2 focus:ring-[#b4c5ff]/20" placeholder="Ask anything..." type="text" />
                    <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                      <button className="rounded-full p-2 text-[#b4c5ff] transition-all hover:bg-[#b4c5ff]/10"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>mic</span></button>
                      <button className="p-2 text-[#b4c5ff] transition-transform hover:scale-110"><span className="material-symbols-outlined">send</span></button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2.5rem] border border-[#434655]/5 bg-[#2a292e] p-8 shadow-xl">
                <h4 className="mb-8 font-headline text-lg font-bold text-white">Live Insights</h4>
                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold"><span className="uppercase tracking-widest text-[#c8c6c8]">Walking Distance</span><span className="text-white">8.4 / 12 km</span></div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#0e0e12]"><div className="aurora-gradient h-full w-[70%] rounded-full" /></div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold"><span className="uppercase tracking-widest text-[#c8c6c8]">Budget Utilization</span><span className="text-white">42%</span></div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#0e0e12]"><div className="h-full w-[42%] rounded-full bg-[#22C55E]" /></div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-bold"><span className="uppercase tracking-widest text-[#c8c6c8]">Schedule Sync</span><span className="text-[#22C55E]">15m Ahead</span></div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#0e0e12]"><div className="h-full w-[85%] rounded-full bg-[#22C55E]" /></div>
                  </div>
                </div>
              </div>

              <div className="group relative h-56 overflow-hidden rounded-[2.5rem] border border-[#434655]/10 shadow-2xl">
                <img
                  alt="Kyoto Map"
                  className="h-full w-full object-cover opacity-50 grayscale transition-transform duration-700 group-hover:scale-110"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBaNjCf_2Icr6FzIZg4mJrn8MI7IHI-TbiET--Uqsi2wTlKt9ngPVoTIA4nrfdL8lPCb54pwrSeo9q1pvAsr47LlTMSEcnekXUGXyRddxnjznB492vaXhXg6EnqUCKjPd28qZXP_xn89gwWBTRLB2vTx01SbR8kbiznobsHlUgNjuLP5myYMm1QmVuvqAabtJVR4z_frVNKKH7fgBcFEg_9-56owqqVWk9HFMc7Xd7cMgRJ58mhRpN02ZaLj9BS1xfFgP9AJ6coRuM"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0F] via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between">
                  <div>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#c8c6c8]">Current Zone</p>
                    <p className="text-lg font-bold text-white">Higashiyama Ward</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-full border border-white/10 bg-white/10 p-3 backdrop-blur-md transition-all hover:bg-white/20"
                      onClick={() => navigate('/bucketlist')}
                      aria-label="Open places"
                    >
                      <span className="material-symbols-outlined text-sm text-white">place</span>
                    </button>
                    <button className="rounded-full border border-white/10 bg-white/10 p-3 backdrop-blur-md transition-all hover:bg-white/20">
                      <span className="material-symbols-outlined text-sm text-white">open_in_full</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-3xl border-t border-white/5 bg-[#0B0B0F]/80 px-4 py-3 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] backdrop-blur-lg md:hidden">
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-90"><span className="material-symbols-outlined">explore</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Explore</span></button>
        <button className="flex flex-col items-center justify-center rounded-xl bg-blue-500/10 px-4 py-2 text-blue-500 transition-transform active:scale-90"><span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>map</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">My Trips</span></button>
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-90" onClick={() => navigate('/bucketlist')}><span className="material-symbols-outlined">place</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Places</span></button>
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-90"><span className="material-symbols-outlined">smart_toy</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Concierge</span></button>
        <button className="flex flex-col items-center justify-center text-gray-500 transition-transform active:scale-90"><span className="material-symbols-outlined">person</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Account</span></button>
      </nav>

      <button className="aurora-gradient fixed bottom-24 right-8 z-40 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-2xl transition-all active:scale-90 hover:scale-110 lg:hidden" onClick={() => navigate('/triparc/7pillars')}>
        <span className="material-symbols-outlined text-3xl">add</span>
      </button>
    </div>
  )
}
