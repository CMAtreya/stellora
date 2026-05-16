import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveApiPath } from '../lib/apiClient'
import { searchDestinationPlaces } from '../lib/sevenPillarsApi'
import TripArcNav from '../components/TripArcNav'

type PlaceSuggestion = {
  label: string
  name: string
  vicinity?: string
}

type ReelDestination = {
  name?: string
  city?: string
  address?: string
}

const vibeTags = ['Cultural Cities', 'Food Trails', 'Nature Escapes', 'Luxury Retreats', 'Hidden Gems']

const destinationCards = [
  {
    vibe: 'Timeless Tradition',
    city: 'Kyoto, Japan',
    route: '/bucketlist/explore/kyoto',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDas_-CaCEO3lPdes7zhpIzJzq5DYTIpxknzQg4JAsZTRU1eDLYKVBpYZuVNFSHGswCIixLnWfAseQ2-CKX_6aPonwfy59oNzT7zGYIlMJXuyRuyRi-d4WIYLVXjhacMkkG8TkadGY7Rf9rmM_aGQmTsYhoNgtAOnzzS6Mku0WShBvoUhFy3bDnnEPITL-MqQFZ8JZluLqvbTs1DAYZ4e1175mraMZnliMgL31ji62hB0byM4fUhKYkn5MpbuyGLNg3-iFR-jjEuUY',
  },
  {
    vibe: 'Tropical Sanctuary',
    city: 'Bali, Indonesia',
    route: '/bucketlist/explore/bali',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAJ1PJ4KhOx6T9wTo2eDhZMsnf3hW7oZt1I1gCvRI8XuBH3-WYK5TgGoox6H0Wb2ix1fYu_oj-qQ-KiJEsOZUKKAVk0SsdEWc_aXFwUG7xSDIPZahsipKo5bVi2PaN77eiM3vuUjYEy89dE-UEW2thJBCHFsp7FGWTf3ZXi8f0JoP8qERv4tAERMpsZ1pfiTrOmVZTXNzVJDBUNa0WdRva08jSMlMr5--ASoyQiO1KyOSQE33Ra43DtCeRXSb2YwAnIbT4Dcq-P6HY',
  },
  {
    vibe: 'Romantic Architecture',
    city: 'Paris, France',
    route: '/bucketlist/explore/paris',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCpXEXueBpRFzDXuU_s1v20Y2nXNELattTslWUgqeKJ2eXZmTMTK_dikR9VGqjBwiKtIp8-1sbS85Hy7cNeo4QDUmlCGuhZaqtarJuqJ6xt-8ABIAG6_46Ract6K67cSGeDIVzZ1Pok7ksOjrFhDFvtKUBDJf6RYqc1LZjAE2PxMX4fJX3G7WDJNJXGMcP-UJouqK_bWU4ydbXKaWUGlvo08jX_zU9JNYDymacKGBgk3z7l_JQHel5gudqvkMTjjUV5F5Zpj2TSz08',
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState(vibeTags[0])
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [reelUrl, setReelUrl] = useState('')
  const [reelLoading, setReelLoading] = useState(false)
  const [reelStatus, setReelStatus] = useState('')
  const [extracted, setExtracted] = useState<ReelDestination[]>([])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setSearchLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      try {
        const next = await searchDestinationPlaces(trimmed, undefined, 5)
        if (!cancelled) {
          setSuggestions(next)
          setShowSuggestions(true)
        }
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 240)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  const canStart = useMemo(() => query.trim().length > 0, [query])

  const goToPlanner = (destination?: string) => {
    const value = (destination ?? query).trim()
    const target = value ? `/triparc/7pillars?destination=${encodeURIComponent(value)}` : '/triparc/7pillars'
    navigate(target)
  }

  const handlePlannerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    goToPlanner()
  }

  const handleExtractReel = async () => {
    const trimmed = reelUrl.trim()
    if (!trimmed.includes('instagram.com') && !trimmed.includes('instagr.am')) {
      setReelStatus('Please enter a valid Instagram reel URL.')
      return
    }

    setReelLoading(true)
    setReelStatus('Extracting destinations...')
    try {
      const res = await fetch(resolveApiPath('/api/analyze-reel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const payload = (await res.json()) as { destinations?: ReelDestination[]; detail?: string }
      if (!res.ok) {
        throw new Error(payload.detail || 'Extraction failed')
      }

      const items = payload.destinations ?? []
      setExtracted(items)
      if (items.length) {
        setReelStatus(`Detected ${items.length} destination${items.length > 1 ? 's' : ''}. Open Bucketlist to save and organize.`)
      } else {
        setReelStatus(payload.detail || 'No destinations detected from this reel.')
      }
    } catch (error: any) {
      setExtracted([])
      setReelStatus(error?.message || 'Extraction failed')
    } finally {
      setReelLoading(false)
    }
  }

  return (
    <div className="bg-[#131317] font-[Manrope] text-[#E4E1E7] selection:bg-[#b4c5ff]/30 selection:text-[#b4c5ff]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@200;300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }

        .hero-overlay {
          background: linear-gradient(to bottom, rgba(19, 19, 23, 0) 0%, rgba(19, 19, 23, 1) 100%);
        }

        .accent-gradient {
          background: linear-gradient(45deg, #2563EB, #03B5D3);
        }

        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }

        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <TripArcNav />

      <main className="pb-32 pt-0">
        <section className="relative flex h-[870px] w-full items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              alt="Cinematic London night view"
              className="h-full w-full scale-105 object-cover opacity-60"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBwCP371PPWRhmB0c19c_WoxM_q3H0Jxhtu42g2Ou8DhhIoyTBzP9cSVt4EhsPMa6sm12U9E-kp4gJcFyc17fe_zrq_YuGv7Qi_BX2CnKVWkMmcD62yrjtawUASB5uUGAyHlZ2WHz4bS6eLq4XJ_-qo9d4e1fIDcKiMnpW2zdwDKLVWk1SkLLuZX2rVxbabMGh-_qrxQJUzZerVqYSoLWkNtr2oFSsEFQWv-n23AzF5E7T_XQVWZMlotQPq_xyq2QGU685wxDxD4Zk"
            />
            <div className="hero-overlay absolute inset-0" />
          </div>
          <div className="relative z-10 max-w-4xl px-6 text-center">
            <h1 className="mb-6 text-6xl font-extrabold leading-tight tracking-tight md:text-8xl">
              Where do you want to <span className="italic text-[#b4c5ff]">go next?</span>
            </h1>
            <p className="mx-auto mb-12 max-w-2xl text-xl font-light text-[#c3c6d7] md:text-2xl">
              You do not need a plan. Just a direction. TripArc will handle the rest.
            </p>

            <form onSubmit={handlePlannerSubmit} className="relative mx-auto max-w-3xl group">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#2563eb] to-[#03b5d3] opacity-25 blur transition duration-1000 group-hover:opacity-40" />
              <div className="relative flex items-center rounded-full bg-[#2a292e] p-2 pr-4 shadow-2xl">
                <span className="material-symbols-outlined ml-6 text-[#c3c6d7]">search</span>
                <input
                  className="w-full border-none bg-transparent px-4 text-lg text-[#E4E1E7] placeholder:text-[#c3c6d7]/50 focus:ring-0"
                  placeholder="Search destination or paste a travel idea..."
                  type="text"
                  value={query}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    window.setTimeout(() => setShowSuggestions(false), 140)
                  }}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button
                  className="rounded-full bg-[#2563eb] px-8 py-3 font-bold text-[#eeefff] transition-all active:scale-95 disabled:opacity-60"
                  type="submit"
                  disabled={!canStart}
                >
                  Start Planning
                </button>
              </div>

              {showSuggestions && (searchLoading || suggestions.length > 0) && (
                <div className="absolute left-0 right-0 top-[110%] z-30 rounded-3xl border border-[#434655]/40 bg-[#1f1f23]/95 p-2 text-left shadow-2xl backdrop-blur-xl">
                  {searchLoading ? (
                    <p className="px-4 py-3 text-sm text-[#c3c6d7]">Searching destinations...</p>
                  ) : (
                    suggestions.map((item) => (
                      <button
                        key={`${item.name}-${item.vicinity ?? ''}`}
                        type="button"
                        className="flex w-full items-start justify-between rounded-2xl px-4 py-3 text-left transition hover:bg-[#353439]"
                        onClick={() => {
                          setQuery(item.label)
                          setShowSuggestions(false)
                          goToPlanner(item.label)
                        }}
                      >
                        <span className="font-semibold text-[#e4e1e7]">{item.name}</span>
                        <span className="ml-4 text-xs uppercase tracking-[0.1em] text-[#c3c6d7]">{item.vicinity || 'Destination'}</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-center gap-4">
                <span className="text-xs uppercase tracking-widest text-[#c3c6d7]/60">Suggested:</span>
                <button type="button" className="text-xs uppercase tracking-widest text-[#b4c5ff] hover:underline" onClick={() => goToPlanner('Kyoto for 5 days')}>
                  Kyoto for 5 days
                </button>
                <span className="text-[#c3c6d7]/30">•</span>
                <button type="button" className="text-xs uppercase tracking-widest text-[#b4c5ff] hover:underline" onClick={() => goToPlanner('Iceland road trip')}>
                  Iceland road trip
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-8 py-24">
          <div className="mb-16 flex flex-col items-end justify-between gap-8 md:flex-row">
            <div>
              <span className="mb-4 block text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-[#4cd7f6]">Engineered Intelligence</span>
              <h2 className="text-4xl font-bold tracking-tight">Plan your trip in under 60 seconds</h2>
            </div>
            <button className="accent-gradient rounded-full px-10 py-4 font-bold text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-transform hover:scale-105" onClick={() => navigate('/triparc/7pillars')}>
              Create My Trip
            </button>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <button className="rounded-[2.5rem] border border-[#434655]/10 bg-[#1f1f23] p-10 text-left transition-colors hover:bg-[#2a292e]" onClick={() => navigate('/triparc/7pillars')}>
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2563eb]/20 text-[#b4c5ff]">
                <span className="material-symbols-outlined text-3xl">location_on</span>
              </div>
              <h3 className="mb-4 text-2xl font-bold">Choose your destinations</h3>
              <p className="text-[#c3c6d7]">Select from thousands of curated spots or type in your dream locations.</p>
            </button>
            <button className="rounded-[2.5rem] border border-[#434655]/10 bg-[#1f1f23] p-10 text-left transition-colors hover:bg-[#2a292e]" onClick={() => navigate('/triparc/7pillars')}>
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#03b5d3]/20 text-[#4cd7f6]">
                <span className="material-symbols-outlined text-3xl">tune</span>
              </div>
              <h3 className="mb-4 text-2xl font-bold">Tell us your preferences</h3>
              <p className="text-[#c3c6d7]">Relaxed vibes, food-focused, or high-octane adventure? You decide the pace.</p>
            </button>
            <button className="rounded-[2.5rem] border border-[#434655]/10 bg-[#1f1f23] p-10 text-left transition-colors hover:bg-[#2a292e]" onClick={() => navigate('/timeline')}>
              <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6e6d6f]/20 text-[#E4E1E7]">
                <span className="material-symbols-outlined text-3xl">verified</span>
              </div>
              <h3 className="mb-4 text-2xl font-bold">Get a fully guided journey</h3>
              <p className="text-[#c3c6d7]">A seamless, data-driven itinerary optimized for time, weather, and traffic.</p>
            </button>
          </div>
        </section>

        <section className="overflow-hidden bg-[#1b1b1f] py-24">
          <div className="mx-auto mb-12 max-w-7xl px-8">
            <h2 className="text-4xl font-bold tracking-tight">Explore by vibe</h2>
          </div>

          <div className="no-scrollbar mb-8 flex min-w-max gap-4 overflow-x-auto px-8 pb-4">
            {vibeTags.map((tag) => (
              <button
                key={tag}
                className={`rounded-full px-6 py-2 font-bold transition-colors ${activeTag === tag ? 'bg-[#2563eb] text-white' : 'border border-[#434655]/30 text-[#c3c6d7] hover:bg-[#39393d]'}`}
                onClick={() => setActiveTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="no-scrollbar flex overflow-x-auto space-x-6 px-8">
            {destinationCards.map((card) => (
              <button key={card.city} onClick={() => navigate(card.route)} className="group relative h-[500px] min-w-[400px] overflow-hidden rounded-[2.5rem] text-left">
                <img alt={card.city} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" src={card.image} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-8 left-8">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#b4c5ff]">{card.vibe}</p>
                  <h4 className="text-3xl font-bold text-white">{card.city}</h4>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-8 py-24">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
            <div className="group relative overflow-hidden rounded-[3rem] bg-[#1f1f23] p-12">
              <div className="absolute right-0 top-0 p-8">
                <span className="material-symbols-outlined text-8xl text-[#b4c5ff]/20 transition-all group-hover:rotate-12 group-hover:scale-110">movie</span>
              </div>
              <h2 className="mb-4 text-4xl font-bold tracking-tight">Turn inspiration into trips</h2>
              <p className="mb-10 max-w-sm text-[#c3c6d7]">Paste any social media link and our AI will extract every location mentioned into a map-ready itinerary.</p>
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#434655]/10 bg-[#0e0e12] p-6 focus-within:border-[#b4c5ff]/50">
                  <span className="mb-2 block text-[0.6875rem] font-bold uppercase tracking-widest text-[#c3c6d7]/60">Link Source</span>
                  <input
                    className="w-full border-none bg-transparent p-0 text-[#E4E1E7] focus:ring-0"
                    placeholder="Paste Instagram / YouTube link"
                    type="text"
                    value={reelUrl}
                    onChange={(event) => setReelUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        if (!reelLoading) handleExtractReel()
                      }
                    }}
                  />
                </div>
                <button
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#39393d] py-4 font-bold transition-all hover:bg-[#2563eb] hover:text-[#eeefff] disabled:opacity-60"
                  onClick={handleExtractReel}
                  disabled={reelLoading || !reelUrl.trim()}
                >
                  <span className="material-symbols-outlined">auto_fix_high</span>
                  {reelLoading ? 'Extracting...' : 'Extract Destinations'}
                </button>
                {reelStatus && <p className="text-sm text-[#c3c6d7]">{reelStatus}</p>}
                {extracted.length > 0 && (
                  <div className="rounded-2xl border border-[#434655]/20 bg-[#131317] p-4 text-sm">
                    <p className="mb-2 font-bold text-[#b4c5ff]">Latest extraction</p>
                    <ul className="space-y-1 text-[#c3c6d7]">
                      {extracted.slice(0, 3).map((item, idx) => (
                        <li key={`${item.name || 'destination'}-${idx}`}>{item.name || item.address || 'Destination'}{item.city ? `, ${item.city}` : ''}</li>
                      ))}
                    </ul>
                    <button className="mt-4 rounded-full bg-[#2563eb] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[#eeefff]" onClick={() => navigate('/bucketlist')}>
                      Open Bucketlist
                    </button>
                  </div>
                )}
              </div>
              <p className="mt-6 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-[#b4c5ff]/60">We convert travel content into real journeys.</p>
            </div>

            <div className="flex flex-col justify-center">
              <div className="mb-8 flex items-center justify-between">
                <h2 className="text-3xl font-bold">Your Bucketlist</h2>
                <button className="flex items-center gap-2 font-bold text-[#b4c5ff] transition-transform hover:translate-x-1" onClick={() => navigate('/bucketlist')}>
                  View All <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
              <div className="space-y-4">
                <button className="flex items-center gap-6 rounded-3xl bg-[#1b1b1f] p-6 text-left transition-colors hover:bg-[#1f1f23]" onClick={() => navigate('/bucketlist/explore/kyoto')}>
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                    <img
                      alt="Kyoto"
                      className="h-full w-full object-cover"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuCTpGcm3Vn5NYBXZwjFotTS7NblALuMn3674SSTBPXGYbfmNecebBYrrLCXGGrIOL5C5RfTi3jJ50k14wmvNQE-Z1KP0uO3ioBPliMkKXuKNZZMlCavoapQbzyp_m6mSRXv6DFKHvnjSWAAi1jiQKBpRCs8ALDsQ0hI2jfkrTW9gvLPZBluXIXGj8TCQvOzmsMW4xX6Qw6XtEethGeE4pWGGtuOeD8aEtp2vaLetg9l7u6oo1266VK5SgbOyAq_98P5lDVoLHura3w"
                    />
                  </div>
                  <div className="grow">
                    <h4 className="text-lg font-bold">Kyoto, Japan</h4>
                    <p className="text-sm text-[#c3c6d7]">6 places saved</p>
                  </div>
                  <span className="material-symbols-outlined text-[#c3c6d7]/40">more_vert</span>
                </button>
                <button className="flex items-center gap-6 rounded-3xl bg-[#1b1b1f] p-6 text-left transition-colors hover:bg-[#1f1f23]" onClick={() => navigate('/bucketlist/explore/amalfi-coast')}>
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                    <img
                      alt="Amalfi"
                      className="h-full w-full object-cover"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuD59jlaQSjBylByfDSARLgSGBe0FtnnQfkg5uvf9mBIRikn83_WbnvIO2LlADtlPM3KkWImRkcnXc77sgbdnjvs1NC50OZlPZJCoc4WnOlm0bLaMP1f32_02CYJTuPjMLuvk05DI2KLSHgiQi-iDNSh2_Cl_PLRMSKUXuNxano_s0WjQGQyFGETPmRDOtTiXZILkC0p16rUwjdBw5kRbS92rSK-EytCMQjGd2458WETRGN1OtNetzcBor7AY4r6yK7e1UHh_cjJsis"
                    />
                  </div>
                  <div className="grow">
                    <h4 className="text-lg font-bold">Amalfi Coast, Italy</h4>
                    <p className="text-sm text-[#c3c6d7]">7 places saved</p>
                  </div>
                  <span className="material-symbols-outlined text-[#c3c6d7]/40">more_vert</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="relative mx-auto max-w-7xl px-8 py-24">
          <div className="absolute inset-0 rounded-full bg-[#b4c5ff]/5 blur-[120px]" />
          <div className="relative z-10 mb-16 text-center">
            <span className="mb-4 block text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-[#b4c5ff]">Powered by Aurora AI</span>
            <h2 className="text-5xl font-bold tracking-tight">Travel with intelligence</h2>
          </div>
          <div className="relative z-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <button className="flex items-start gap-4 rounded-3xl border border-[#b4c5ff]/10 bg-[#1B1B1F]/60 p-8 text-left backdrop-blur-md transition-all hover:border-[#b4c5ff]/40" onClick={() => navigate('/triparc/insights')}>
              <span className="material-symbols-outlined text-[#b4c5ff]">schedule</span>
              <div>
                <p className="text-lg font-medium text-[#b4c5ff]">Avoid crowds at 12 PM</p>
                <p className="mt-2 text-sm text-[#c3c6d7]">Peak visitor hours detected. We suggest moving your visit to 9 AM.</p>
              </div>
            </button>
            <button className="flex items-start gap-4 rounded-3xl border border-[#4cd7f6]/10 bg-[#1B1B1F]/60 p-8 text-left backdrop-blur-md transition-all hover:border-[#4cd7f6]/40" onClick={() => navigate('/triparc/insights')}>
              <span className="material-symbols-outlined text-[#4cd7f6]">recommend</span>
              <div>
                <p className="text-lg font-medium text-[#4cd7f6]">You will enjoy this hidden cafe</p>
                <p className="mt-2 text-sm text-[#c3c6d7]">Based on your love for quiet reading spots and artisanal coffee.</p>
              </div>
            </button>
            <button className="flex items-start gap-4 rounded-3xl border border-[#E4E1E7]/10 bg-[#1B1B1F]/60 p-8 text-left backdrop-blur-md transition-all hover:border-[#E4E1E7]/40" onClick={() => navigate('/triparc/insights')}>
              <span className="material-symbols-outlined text-[#E4E1E7]">spa</span>
              <div>
                <p className="text-lg font-medium text-[#E4E1E7]">You may need a break at 4 PM</p>
                <p className="mt-2 text-sm text-[#c3c6d7]">Your pace is usually high in the morning. We have scheduled a rest block.</p>
              </div>
            </button>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-8 py-24">
          <h2 className="mb-16 text-4xl font-bold tracking-tight">Not just trips. Stories you will relive.</h2>
          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            <button className="group relative aspect-[16/9] overflow-hidden rounded-[3rem] text-left" onClick={() => navigate('/triparc/memories')}>
              <img
                alt="Travel story"
                className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQPCTAH5fvWaUFVIhv7P1hTGlL7ctQuEr-djtG9-2utNlxFyEdsvnN3aBbS9DP2av4vdISZeBibhOyzid88ULxo1A637GISNWrLe_KMslQGShyxgO-A2mMOXI9LsG4uT-QNJ9966OtPGltlyzdbDApni3iMKJUOQKLVu6d0hWKfjAoE8UDwo_mtxWITP-K-Td6Menm8eJEPfLRTOZjJ0YQ4r95hla07072qfYJEmTmW9I7GDqrDT9zbPV6LVxcj43FD2lwKaTfdIM"
              />
              <div className="absolute inset-0 flex items-end bg-black/40 p-12 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="text-2xl italic text-white">You stayed longer than planned... and did not regret it.</p>
              </div>
            </button>
            <button className="group relative aspect-[16/9] overflow-hidden rounded-[3rem] text-left" onClick={() => navigate('/triparc/memories')}>
              <img
                alt="Travel story 2"
                className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAgB8J2qT0Ad5wAQ_-5v3WVvicFDhmp19eJO_1zMpY1oVB19kVqa_ZAXcUef0Zme4v9g2BZ5wDDEeb0PW_MeUm1-jVQYxoTTvraFWlHCFUnwkz92nnyHwGviV5rGQy7sNpfZIApulI0PraohMCSJt_8s6U_3YWR6Sfq1MGE8PQGc8CGAMjZO0MdsLRHiZbA12U7FJFgwe1uPUuT5ss3OIPeNLwt9ZakFzLvgagGH7qYxzdzn4ZN4SY2kPXU337pQDB6kdFB28J8yP4"
              />
              <div className="absolute inset-0 flex items-end bg-black/40 p-12 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="text-2xl italic text-white">The best moments were not on the map. But we kept track of them.</p>
              </div>
            </button>
          </div>
        </section>

        <section className="mx-auto max-w-7xl border-t border-[#434655]/10 px-8 py-24">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <button className="group flex flex-col items-center gap-4 rounded-3xl bg-[#1f1f23] p-6 transition-all hover:bg-[#2563eb] hover:text-[#eeefff]" onClick={() => navigate('/triparc/7pillars')}>
              <span className="material-symbols-outlined text-3xl transition-transform group-hover:scale-110">add_circle</span>
              <span className="font-bold">Start New Trip</span>
            </button>
            <button className="group flex flex-col items-center gap-4 rounded-3xl bg-[#1f1f23] p-6 transition-all hover:bg-[#03b5d3] hover:text-[#003640]" onClick={() => navigate('/bucketlist')}>
              <span className="material-symbols-outlined text-3xl transition-transform group-hover:scale-110">bookmark</span>
              <span className="font-bold">Open Bucketlist</span>
            </button>
            <button className="group flex flex-col items-center gap-4 rounded-3xl bg-[#1f1f23] p-6 transition-all hover:bg-[#39393d]" onClick={() => navigate('/bucketlist')}>
              <span className="material-symbols-outlined text-3xl transition-transform group-hover:scale-110">auto_awesome</span>
              <span className="font-bold">Try Reel Extractor</span>
            </button>
            <button className="group flex flex-col items-center gap-4 rounded-3xl bg-[#1f1f23] p-6 transition-all hover:bg-[#2563eb] hover:text-[#eeefff]" onClick={() => navigate('/triparc/insights')}>
              <span className="material-symbols-outlined text-3xl transition-transform group-hover:scale-110">chat_bubble</span>
              <span className="font-bold">Ask Concierge</span>
            </button>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 z-50 flex h-24 w-full items-center justify-around rounded-t-[2rem] bg-[#1F1F23]/80 px-6 pb-3 backdrop-blur-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.4)] md:hidden">
        <Link to="/" className="mb-2 flex -translate-y-2 flex-col items-center justify-center rounded-full bg-[#2563EB] p-3 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]">
          <span className="material-symbols-outlined">explore</span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Explore</span>
        </Link>
        <Link to="/triparc/7pillars" className="flex flex-col items-center justify-center text-[#C3C6D7] opacity-60">
          <span className="material-symbols-outlined">map</span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Plan</span>
        </Link>
        <Link to="/translator" className="flex flex-col items-center justify-center text-[#C3C6D7] opacity-60">
          <span className="material-symbols-outlined">translate</span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Translator</span>
        </Link>
        <Link to="/bucketlist" className="flex flex-col items-center justify-center text-[#C3C6D7] opacity-60">
          <span className="material-symbols-outlined">favorite</span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Wishlist</span>
        </Link>
      </div>
    </div>
  )
}
