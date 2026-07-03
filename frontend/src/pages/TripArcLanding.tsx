import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchDestinationPlaces } from '../lib/sevenPillarsApi'
import { tripStore } from '../store/tripStore'

// Localized robust fallbacks
const fallbackBengaluru = {
  city: "Bengaluru",
  weather: { temp: 26, condition: "Clear Skies" },
  attractions: [
    { name: "Lalbagh Botanical Garden", vicinity: "Mavalli, Bengaluru" },
    { name: "Bangalore Palace", vicinity: "Vasanth Nagar, Bengaluru" },
    { name: "Cubbon Park", vicinity: "Kasturba Road, Bengaluru" },
    { name: "Tipu Sultan Palace", vicinity: "Kalasipalya, Bengaluru" },
    { name: "Bull Temple", vicinity: "Basavanagudi, Bengaluru" }
  ],
  restaurants: [
    { name: "MTR - Mavalli Tiffin Room", vicinity: "Lalbagh Road, Bengaluru" },
    { name: "CTR - Shree Sagar", vicinity: "Malleshwaram, Bengaluru" },
    { name: "Vidyarthi Bhavan", vicinity: "Gandhi Bazaar, Bengaluru" }
  ],
  transit: [
    { name: "Majestic Metro Station", vicinity: "Kempegowda, Bengaluru" }
  ]
}

const fallbackKyoto = {
  city: "Kyoto",
  weather: { temp: 22, condition: "Clear Skies" },
  attractions: [
    { name: "Fushimi Inari Taisha", vicinity: "Fushimi-ku, Kyoto" },
    { name: "Arashiyama Bamboo Grove", vicinity: "Ukyo-ku, Kyoto" },
    { name: "Kiyomizu-dera Temple", vicinity: "Higashiyama-ku, Kyoto" },
    { name: "Kinkaku-ji Pagoda", vicinity: "Kita-ku, Kyoto" }
  ],
  restaurants: [
    { name: "Gion District Tea House", vicinity: "Gion, Kyoto" }
  ],
  transit: [
    { name: "Kyoto Bus 206 North", vicinity: "Kyoto Station" }
  ]
}

function sanitizeCityName(name: string): string {
  let cleaned = name.trim()
  const words = cleaned.split(/\s+/)
  if (words.length === 2 && words[0].toLowerCase() === words[1].toLowerCase()) {
    cleaned = words[0]
  }
  const halfLen = cleaned.length / 2
  if (cleaned.length % 2 === 0) {
    const firstHalf = cleaned.slice(0, halfLen)
    const secondHalf = cleaned.slice(halfLen)
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      cleaned = firstHalf
    }
  }
  return cleaned
}

export default function TripArcLanding() {
  const navigate = useNavigate()
  const [oraQuery, setOraQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  
  // Real-time state
  const [city, setCity] = useState('Bengaluru')
  const [weather, setWeather] = useState({ temp: 26, condition: 'Clear Skies' })
  const [coords, setCoords] = useState({ lat: 12.9716, lng: 77.5946 })
  
  // Places state
  const [attractions, setAttractions] = useState<any[]>([])
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [transit, setTransit] = useState<any[]>([])

  useEffect(() => {
    async function initRealTimePage() {
      try {
        // Step 1: Detect active planned trip destination from tripStore / localStorage
        let plannedCity = 'Kyoto'
        let plannedItems: any[] = []
        try {
          const rawDraft = localStorage.getItem('triparc:journey:draft:v1')
          if (rawDraft) {
            const parsed = JSON.parse(rawDraft)
            if (parsed.city) plannedCity = sanitizeCityName(parsed.city)
            if (Array.isArray(parsed.items)) plannedItems = parsed.items
          } else {
            plannedCity = sanitizeCityName(tripStore.getState().destination || 'Kyoto')
          }
        } catch (e) {
          plannedCity = sanitizeCityName(tripStore.getState().destination || 'Kyoto')
        }

        // Step 2: Resolve coordinates for the planned city
        let activeLat = 35.0116
        let activeLng = 135.7681
        let detectedCity = plannedCity

        let resolvedCoords = null
        if (plannedCity.toLowerCase().includes("bengaluru") || plannedCity.toLowerCase().includes("bangalore")) {
          resolvedCoords = { lat: 12.9716, lng: 77.5946 }
        } else if (plannedCity.toLowerCase().includes("kyoto")) {
          resolvedCoords = { lat: 35.0116, lng: 135.7681 }
        } else {
          // Dynamic geocode lookup for custom destinations
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(plannedCity)}&limit=1`, {
              headers: { 'User-Agent': 'StelloraTravelCompanion/1.0' }
            })
            if (res.ok) {
              const data = await res.json()
              if (data && data.length > 0) {
                resolvedCoords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
              }
            }
          } catch (e) {}
        }

        // Fallback to browser geolocation if geocoding failed or we don't have coords
        if (resolvedCoords) {
          activeLat = resolvedCoords.lat
          activeLng = resolvedCoords.lng
        } else {
          const position = await new Promise<GeolocationPosition | null>((res) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => res(pos),
              () => res(null),
              { timeout: 3000 }
            )
          })
          if (position) {
            activeLat = position.coords.latitude
            activeLng = position.coords.longitude
            
            try {
              const geocodeRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${activeLat}&lon=${activeLng}`,
                { headers: { 'User-Agent': 'StelloraTravelCompanion/1.0' } }
              )
              if (geocodeRes.ok) {
                const data = await geocodeRes.json()
                const addr = data.address || {}
                detectedCity = sanitizeCityName(addr.city || addr.town || addr.suburb || addr.village || addr.county || addr.state || plannedCity)
              }
            } catch (e) {}
          }
        }

        setCoords({ lat: activeLat, lng: activeLng })
        setCity(detectedCity)

        // Step 3: Fetch Weather
        try {
          const weatherRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${activeLat}&longitude=${activeLng}&current=temperature_2m,weather_code`
          )
          if (weatherRes.ok) {
            const wData = await weatherRes.json()
            const temp = Math.round(wData.current.temperature_2m)
            const code = wData.current.weather_code
            
            let condition = "Clear Skies"
            if (code >= 1 && code <= 3) condition = "Partly Cloudy"
            else if (code === 45 || code === 48) condition = "Foggy"
            else if (code >= 51 && code <= 57) condition = "Drizzle"
            else if (code >= 61 && code <= 67) condition = "Rainy"
            else if (code >= 71 && code <= 77) condition = "Snowy"
            else if (code >= 80 && code <= 82) condition = "Rain Showers"
            else if (code >= 95) condition = "Thunderstorm"

            setWeather({ temp, condition })
          }
        } catch (e) {
          console.warn("Weather fetch failed:", e)
        }

        // Step 4: Fetch Places
        const isKyoto = detectedCity.toLowerCase().includes("kyoto")
        const activeFallback = isKyoto ? fallbackKyoto : fallbackBengaluru

        // Build list from planned items if they exist
        let resolvedAttractions: any[] = []
        if (plannedItems.length > 0) {
          resolvedAttractions = plannedItems.map(item => ({
            name: item.title || item.location,
            vicinity: item.location || detectedCity,
            lat: item.lat,
            lng: item.lng
          }))
        }

        try {
          const placesList = await searchDestinationPlaces("tourist attraction", detectedCity, 6)
          const combined = [...resolvedAttractions, ...placesList]
          setAttractions(combined.length > 0 ? combined : activeFallback.attractions)
        } catch (e) {
          setAttractions(resolvedAttractions.length > 0 ? resolvedAttractions : activeFallback.attractions)
        }

        try {
          const restList = await searchDestinationPlaces("restaurant", detectedCity, 4)
          setRestaurants(restList.length > 0 ? restList : activeFallback.restaurants)
        } catch (e) {
          setRestaurants(activeFallback.restaurants)
        }

        try {
          const transList = await searchDestinationPlaces("transit station", detectedCity, 2)
          setTransit(transList.length > 0 ? transList : activeFallback.transit)
        } catch (e) {
          setTransit(activeFallback.transit)
        }

      } catch (err) {
        console.error("Initialization of real-time page failed:", err)
        setCity(fallbackKyoto.city)
        setWeather(fallbackKyoto.weather)
        setAttractions(fallbackKyoto.attractions)
        setRestaurants(fallbackKyoto.restaurants)
        setTransit(fallbackKyoto.transit)
      } finally {
        setIsLoading(false)
      }
    }

    void initRealTimePage()
  }, [])

  const handleSendToOra = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!oraQuery.trim()) return
    window.dispatchEvent(
      new CustomEvent('stellora:open-ora', {
        detail: { query: oraQuery, activeListen: true }
      })
    )
    setOraQuery('')
  }

  const handleTriggerOra = () => {
    window.dispatchEvent(
      new CustomEvent('stellora:open-ora', {
        detail: { activeListen: true }
      })
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#131317] text-[#e4e1e7] flex flex-col items-center justify-center font-manrope">
        <div className="relative flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-[#2563eb] border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(37,99,235,0.4)]"></div>
          <p className="text-xl font-bold tracking-tight text-white animate-pulse">
            Calibrating Real-Time TripArc...
          </p>
          <p className="text-sm text-[#c3c6d7] opacity-60">
            Detecting location and fetching famous landmarks
          </p>
        </div>
      </div>
    )
  }

  // Bind dynamic references for layout
  const currentStop = attractions[0] || { name: "Lalbagh Botanical Garden", vicinity: "Mavalli, Bengaluru" }
  const nextUp = attractions[1] || attractions[0] || { name: "Bangalore Palace", vicinity: "Vasanth Nagar, Bengaluru" }
  const sunsetStop = attractions[2] || attractions[0] || { name: "Cubbon Park", vicinity: "Kasturba Road, Bengaluru" }
  const natureStop = attractions[3] || attractions[0] || { name: "Tipu Sultan Palace", vicinity: "Kalasipalya, Bengaluru" }
  const foodStop = restaurants[0] || { name: "MTR - Mavalli Tiffin Room", vicinity: "Lalbagh Road, Bengaluru" }
  const transitStop = transit[0] || { name: "Majestic Metro Station", vicinity: "Kempegowda, Bengaluru" }

  const getHeroImage = (cityName: string) => {
    if (cityName.toLowerCase().includes("bengaluru") || cityName.toLowerCase().includes("bangalore")) {
      return "https://images.unsplash.com/photo-1605649487212-47bdab064df7?auto=format&fit=crop&w=1200&q=80"
    }
    if (cityName.toLowerCase().includes("kyoto")) {
      return "https://lh3.googleusercontent.com/aida-public/AB6AXuDWUDczUr2J-rmNbjRPcCSM3G62CHLgtC6lwq1ADlnx6G1cGpQFc-6hOzLeWpecqDwucpyQVZqz4OKdvH5LyACjv449ZyDRzg_K4EMYi2JATt-FPokGgU2bBRcL7Qrfhkrg85UzdPAWSREC0rAThKXd9HcahpXN_qXSVLtGTW_1JTo0q2zaA4W2hoYSGF55bTrC2-RsmU-pIgYJPL0gFfhDL_I83WzkDGjOIZeCb-rDCCiad3a36Jjsg_BxXfqbed5aT6uF-EI74PY"
    }
    return "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80"
  }

  const isBng = city.toLowerCase().includes("bengaluru") || city.toLowerCase().includes("bangalore")

  return (
    <div className="min-h-screen bg-[#131317] text-[#e4e1e7] font-manrope selection:bg-primary-container selection:text-white overflow-x-hidden">
      <style dangerouslySetInnerHTML={{ __html: `
        body { font-family: 'Manrope', sans-serif; background-color: #131317; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .glass-panel { backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
        .asymmetric-grid { display: grid; grid-template-columns: 1.5fr 1fr; }
        .ora-glow { box-shadow: 0 0 25px rgba(37, 99, 235, 0.45); }
        @keyframes pulse-soft {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        .animate-pulse-soft { animation: pulse-soft 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes scroll-endless {
            0% { transform: translateX(0); }
            100% { transform: translateX(calc(-50% - 12px)); }
        }
        .animate-scroll-endless {
            display: flex;
            width: max-content;
            animation: scroll-endless 25s linear infinite;
        }
        .animate-scroll-endless:hover {
            animation-play-state: paused;
        }
      ` }} />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-[#1f1f23] bg-[#0B0B0F]/82 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-none items-center justify-between gap-6 px-6 py-4 text-sm font-semibold text-white md:px-10">
          <Link className="flex items-center gap-2 text-lg tracking-[0.18em] uppercase" to="/triparc">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sparkles" ariaHidden="true">
                <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>
                <path d="M20 2v4"></path>
                <path d="M22 4h-4"></path>
                <circle cx="4" cy="20" r="2"></circle>
              </svg>
            </span>
            TripArc
          </Link>
          <nav className="flex flex-1 items-center justify-center gap-8">
            <Link className="transition-colors duration-200 text-[#2563EB] border-b-2 border-[#2563EB] pb-1" to="/triparc">TripArc</Link>
            <Link className="transition-colors duration-200 text-[#a1a1aa] hover:text-white" to="/bucketlist">Bucketlist</Link>
            <Link className="transition-colors duration-200 text-[#a1a1aa] hover:text-white" to="/triparc/7pillars">PreTrip</Link>
            <Link className="transition-colors duration-200 text-[#a1a1aa] hover:text-white" to="/triparc/ontrip">OnTrip</Link>
            <Link className="transition-colors duration-200 text-[#a1a1aa] hover:text-white" to="/triparc/smart-itinerary">Smart Itinerary</Link>
            <Link className="transition-colors duration-200 text-[#a1a1aa] hover:text-white" to="/triparc/lostandfound">LAF</Link>
            <Link className="transition-colors duration-200 text-[#a1a1aa] hover:text-white" to="/triparc/memories">Memories</Link>
            <Link className="transition-colors duration-200 text-[#a1a1aa] hover:text-white" to="/translator">Translator</Link>
          </nav>
          <div className="flex items-center gap-2">
            <button className="flex h-10 w-10 items-center justify-center rounded-full text-[#a1a1aa] transition hover:bg-white/5 hover:text-white" ariaLabel="Notifications" onClick={() => alert("No new notifications")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bell" ariaHidden="true">
                <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
                <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
              </svg>
            </button>
            <button className="h-10 w-10 overflow-hidden rounded-full border border-[#2c2c2e] bg-white/10 shadow-sm" ariaLabel="Open profile" onClick={() => navigate('/triparc/profile')}>
              <img alt="User profile avatar" className="h-full w-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDL-EzadmbfXMqmEECzsE7bCU9rPy2rK-eyHW3Abe_SdIqcjUofxN3W8c-aPXrhYi3OJpRAXbVfeRGCVIDpwVv7zDPv0IQxUmK-33Z02QbWM3ty7P6OGScZhIGfrK_JVHt28PsDREV1EFjLVCjJCkAeUgCCiFuRd4eWm_ylFdnClv7YR1rG_yzipCPNSeCsMfbAkaX2jU3FApSQPJ5pXvjRtHaE691zDJPGWInHwMW_06H1tAN8EtWI9F8z_XZKm6LzdAMAxMmM5zI" />
            </button>
            <button className="hidden items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-white transition hover:border-white/35" ariaLabel="Log out" onClick={() => navigate('/auth')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-log-out" ariaHidden="true">
                <path d="m16 17 5-5-5-5"></path>
                <path d="M21 12H9"></path>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-32">
        {/* Hero Section: Active Trip */}
        <section className="relative w-full h-[870px] overflow-hidden flex items-end">
          <img 
            alt="City Landmark" 
            className="absolute inset-0 w-full h-full object-cover" 
            src={getHeroImage(city)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131317] via-[#131317]/20 to-transparent"></div>
          
          <div className="relative w-full max-w-7xl mx-auto px-8 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-end">
            <div>
              <span className="bg-[#2563eb] text-white px-4 py-1.5 rounded-full text-[0.6875rem] font-bold tracking-[0.12em] uppercase shadow-lg shadow-blue-600/30">
                Active Journey
              </span>
              <h1 className="text-[3.5rem] font-black tracking-tight mt-6 leading-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                {city} Zen Explorer
              </h1>
              <p className="text-[#c3c6d7] text-xl mt-3 font-semibold tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
                Day 3 of 7 — On Track
              </p>
              
              <div className="mt-10 flex flex-wrap gap-4">
                <button 
                  onClick={() => navigate('/timeline')}
                  className="bg-[#2563eb] text-white px-8 py-4 rounded-full font-bold hover:bg-blue-700 active:scale-95 transition-all duration-300 flex items-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  Resume Today's Journey
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
                <button 
                  onClick={() => navigate('/timeline')}
                  className="bg-[#1f1f23]/60 backdrop-blur-xl border border-white/10 text-white px-8 py-4 rounded-full font-bold hover:bg-[#2a292e] hover:border-white/20 active:scale-95 transition-all duration-300"
                >
                  View Full Itinerary
                </button>
              </div>
            </div>

            {/* Dashboard Glass Panel */}
            <div className="glass-panel bg-[#1f1f23]/70 p-8 rounded-[2rem] border border-white/5 space-y-8 shadow-[0_24px_50px_rgba(0,0,0,0.5)]">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[#C3C6D7] uppercase tracking-widest text-[0.6875rem] font-bold mb-1">
                    Energy Levels
                  </p>
                  <p className="text-2xl font-black text-[#4cd7f6]">
                    68%
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[#C3C6D7] uppercase tracking-widest text-[0.6875rem] font-bold mb-1">
                    Budget REMAINING
                  </p>
                  <p className="text-2xl font-black text-white">
                    $1,240
                  </p>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2 text-sm font-bold text-[#c3c6d7] uppercase tracking-wider">
                  <span>Daily Progress</span>
                  <span>4/7 Landmarks</span>
                </div>
                <div className="w-full h-1.5 bg-[#353439] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#2563eb] to-[#03b5d3] w-[57%] rounded-full shadow-[0_0_10px_rgba(3,181,211,0.5)]"></div>
                </div>
              </div>

              {/* Ora Quick Access in Panel */}
              <div className="pt-6 border-t border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#b4c5ff] text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>
                      auto_awesome
                    </span>
                    <span className="text-xs font-black uppercase tracking-widest text-[#c3c6d7]">
                      Ora Intelligence
                    </span>
                  </div>
                  <span className="text-[10px] bg-[#4cd7f6]/10 text-[#4cd7f6] px-2.5 py-1 rounded-full font-bold uppercase tracking-tighter border border-[#4cd7f6]/20">
                    Active
                  </span>
                </div>
                <form onSubmit={handleSendToOra} className="relative">
                  <input 
                    value={oraQuery}
                    onChange={(e) => setOraQuery(e.target.value)}
                    className="w-full bg-[#131317]/50 border border-white/5 rounded-xl py-3.5 pl-4 pr-12 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-[#2563eb] focus:border-[#2563eb] transition-all" 
                    placeholder={`I need coffee in ${city}...`} 
                    type="text"
                  />
                  <button 
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-[#2563eb] rounded-lg flex items-center justify-center hover:bg-blue-600 active:scale-90 transition-all text-white"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">send</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* Smart Snapshot */}
        <section className="max-w-7xl mx-auto px-8 py-20">
          <h2 className="text-[1.75rem] font-black mb-10 tracking-tight text-white">Your Day at a Glance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Weather */}
            <div className="glass-panel bg-[#1f1f23]/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-xl">
              <span className="material-symbols-outlined text-[#4cd7f6] text-3xl">wb_sunny</span>
              <div>
                <p className="text-[#c3c6d7] uppercase tracking-widest text-[0.6875rem] font-bold">Weather</p>
                <p className="text-lg font-black text-white mt-1">{weather.condition}, {weather.temp}°C</p>
              </div>
            </div>
            {/* Movement */}
            <div className="glass-panel bg-[#1f1f23]/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-xl">
              <span className="material-symbols-outlined text-[#b4c5ff] text-3xl">distance</span>
              <div>
                <p className="text-[#c3c6d7] uppercase tracking-widest text-[0.6875rem] font-bold">Movement</p>
                <p className="text-lg font-black text-white mt-1">8.4 KM Logged</p>
              </div>
            </div>
            {/* Energy */}
            <div className="glass-panel bg-[#1f1f23]/70 p-6 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-xl">
              <span className="material-symbols-outlined text-[#ffb4ab] text-3xl">battery_charging_60</span>
              <div>
                <p className="text-[#c3c6d7] uppercase tracking-widest text-[0.6875rem] font-bold">vitality projection</p>
                <p className="text-lg font-black text-white mt-1">Fatigue by 4 PM</p>
              </div>
            </div>
            {/* AI Suggestion */}
            <div 
              onClick={handleTriggerOra}
              className="bg-gradient-to-br from-[#2563eb] to-[#03b5d3] p-6 rounded-2xl flex flex-col gap-4 shadow-lg shadow-blue-600/20 group cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
            >
              <span className="material-symbols-outlined text-white text-3xl group-hover:rotate-12 transition-transform" style={{ fontVariationSettings: '"FILL" 1' }}>
                auto_awesome
              </span>
              <div>
                <p className="text-white/80 uppercase tracking-widest text-[0.6875rem] font-bold">ORA's Suggestion</p>
                <p className="text-lg font-black text-white mt-1">{isBng ? "Best filter coffee nearby" : "Hidden shrine nearby"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Continue Where You Left */}
        <section className="max-w-7xl mx-auto px-8 py-12">
          <div className="bg-[#1b1b1f] rounded-[2.5rem] overflow-hidden asymmetric-grid gap-0 min-h-[400px] border border-white/5 shadow-2xl">
            {/* Map panel */}
            <div className="relative p-12 flex flex-col justify-between">
              <div className="absolute inset-0 z-0 overflow-hidden rounded-l-[2rem]">
                {/* Enhanced Obsidian Map Base */}
                <div className="absolute inset-0 bg-[#0a0a0d] overflow-hidden">
                  {/* Grid Pattern */}
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#2563EB 0.5px, transparent 0.5px)', backgroundSize: '32px 32px' }}></div>
                  {/* Street Grid Layer */}
                  <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                    <line stroke="#2563EB" strokeWidth="0.5" x1="0" x2="100%" y1="100" y2="150"></line>
                    <line stroke="#2563EB" strokeWidth="0.5" x1="0" x2="100%" y1="200" y2="250"></line>
                    <line stroke="#2563EB" strokeWidth="0.5" x1="100" x2="150" y1="0" y2="100%"></line>
                    <line stroke="#2563EB" strokeWidth="0.5" x1="300" x2="350" y1="0" y2="100%"></line>
                  </svg>
                  {/* Street Names & Landmarks */}
                  <div className="absolute inset-0 p-8 pointer-events-none">
                    <span className="absolute top-[10%] left-[20%] text-[8px] font-bold text-blue-500/40 uppercase tracking-widest">
                      {isBng ? "Sampige Road" : "Inari-dori St."}
                    </span>
                    <span className="absolute top-[40%] right-[15%] text-[8px] font-bold text-blue-500/40 uppercase tracking-widest">
                      {isBng ? "Margosa Path" : "Torii Path"}
                    </span>
                    <span className="absolute bottom-[20%] left-[30%] text-[8px] font-bold text-blue-500/40 uppercase tracking-widest">
                      {isBng ? "Malleshwaram Link" : "Mt. Inari Trail"}
                    </span>
                  </div>
                  {/* Route Path (SVG) */}
                  <svg className="absolute inset-0 w-full h-full opacity-60" preserveAspectRatio="none" viewBox="0 0 400 400">
                    <path className="drop-shadow-[0_0_12px_rgba(37,99,235,0.8)]" d="M -50 450 Q 100 350 200 200" fill="none" stroke="#2563EB" strokeWidth="4"></path>
                    <path className="opacity-30" d="M 200 200 Q 300 50 450 -50" fill="none" stroke="#2563EB" strokeDasharray="8 8" strokeWidth="2"></path>
                  </svg>
                  {/* Interactive Map Layer */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Live Location Pulse */}
                      <div className="absolute -inset-8 bg-blue-500/20 rounded-full blur-2xl animate-pulse scale-150"></div>
                      <div className="absolute -inset-4 bg-blue-500/40 rounded-full animate-ping opacity-20"></div>
                      
                      {/* Premium Glowing Pin */}
                      <div className="relative group cursor-pointer">
                        <div className="relative z-10 bg-[#131317] p-2 rounded-full border border-[#2563eb] shadow-[0_0_30px_rgba(37,99,235,0.6)]">
                          <span className="material-symbols-outlined text-[#2563eb] text-3xl" style={{ fontVariationSettings: '"FILL" 1' }}>
                            location_on
                          </span>
                        </div>
                        {/* Label */}
                        <span className="absolute top-12 left-1/2 -translate-x-1/2 text-[10px] font-black text-white bg-[#2563eb] px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                          YOU ARE HERE
                        </span>
                      </div>

                      {/* High-end Glassmorphic Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 group-hover:scale-105 transition-transform duration-300">
                        <div 
                          onClick={() => {
                            navigator.clipboard.writeText(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
                            alert(`Coordinates copied to clipboard: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
                          }}
                          className="glass-panel bg-[#1f1f23]/80 backdrop-blur-xl border border-white/20 px-5 py-2.5 rounded-2xl whitespace-nowrap shadow-2xl flex items-center gap-3 group cursor-pointer hover:bg-surface-container transition-all duration-300"
                        >
                          <span className="text-[0.625rem] font-black text-white tracking-[0.2em] uppercase">Send this location</span>
                          <span className="material-symbols-outlined text-[#2563eb] text-lg">share</span>
                        </div>
                        {/* Tooltip Pointer */}
                        <div className="w-3 h-3 bg-white/10 backdrop-blur-xl border-r border-b border-white/20 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2"></div>
                      </div>
                    </div>
                  </div>
                  {/* Map Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0d] via-transparent to-transparent pointer-events-none"></div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0d]/80 via-transparent to-transparent pointer-events-none"></div>
                </div>
              </div>
              <div className="relative z-10">
                <span className="text-[#4cd7f6] text-[0.6875rem] font-bold tracking-widest uppercase">CURRENT STOP</span>
                <h3 className="text-4xl font-black text-white mt-4">{currentStop.name}</h3>
                <p className="text-[#c3c6d7] mt-4 max-w-md text-sm leading-relaxed">
                  Exploring {currentStop.name} located at {currentStop.vicinity || city}. Live crowd metrics optimal.
                </p>
              </div>
              <div className="relative flex items-center gap-6 mt-12 z-10">
                <div className="h-12 w-12 rounded-full border-2 border-[#2563eb] flex items-center justify-center bg-blue-600/10">
                  <span className="material-symbols-outlined text-[#2563eb]">play_arrow</span>
                </div>
                <div>
                  <p className="text-[0.6875rem] font-bold text-[#c3c6d7] uppercase tracking-wider">Next Up</p>
                  <p className="font-bold text-white">{nextUp.name}</p>
                </div>
              </div>
            </div>

            {/* Transport Panel */}
            <div className="bg-[#2a292e] flex flex-col justify-between">
              <div className="h-1/2 w-full overflow-hidden">
                <img 
                  alt="City transport stop" 
                  className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700 cursor-pointer" 
                  src="https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=800&q=80" 
                />
              </div>
              <div className="h-1/2 p-8 flex flex-col justify-center bg-[#1f1f23]">
                <p className="text-[#c3c6d7] text-[0.6875rem] font-bold tracking-widest uppercase mb-3">Transport Option</p>
                <div className="flex items-center gap-4 bg-[#131317]/50 p-4 rounded-xl border border-white/5">
                  <span className="material-symbols-outlined text-[#2563eb] text-2xl">directions_bus</span>
                  <div>
                    <p className="font-bold text-white text-sm">{transitStop.name}</p>
                    <p className="text-xs text-[#c3c6d7] mt-0.5">Arriving in 4 mins • $2.30</p>
                  </div>
                  <button 
                    onClick={() => alert(`Booking bus from ${transitStop.name}...`)}
                    className="ml-auto bg-[#2563eb]/20 text-[#b4c5ff] hover:bg-[#2563eb]/30 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300"
                  >
                    BOOK
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Explore Experiences */}
        <section className="max-w-7xl mx-auto px-8 py-20">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-[1.75rem] font-black tracking-tight text-white">Expand Your Horizon</h2>
              <p className="text-[#c3c6d7] mt-2 text-sm">Curated for your aesthetic and energy levels</p>
            </div>
            <button 
              onClick={() => navigate('/bucketlist')}
              className="text-[#2563eb] font-bold flex items-center gap-2 hover:translate-x-1 transition-transform"
            >
              View All <span className="material-symbols-outlined text-sm font-bold">north_east</span>
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Cultural Walks */}
            <div 
              onClick={() => navigate('/bucketlist')}
              className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer shadow-xl"
            >
              <img 
                alt="Culture" 
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=600&q=80" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#131317] via-transparent to-transparent"></div>
              <div className="absolute bottom-0 p-6 w-full">
                <p className="text-xl font-black text-white">Cultural Walks</p>
                <div className="flex justify-between items-center mt-4 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <button className="bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-bold border border-white/20 hover:bg-white/20">
                    Add to Bucketlist
                  </button>
                  <span className="material-symbols-outlined text-[#ffb4ab] text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>
                    favorite
                  </span>
                </div>
              </div>
            </div>

            {/* Food Trails */}
            <div 
              onClick={() => navigate('/bucketlist')}
              className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer shadow-xl"
            >
              <img 
                alt="Food" 
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAsADwkTivNsVlm-XBZRFFnmdFQWRpXPHIoq9dTDxfvGYUW0pIHL1cFqa97v7PzD6iAUgTW1abVCgAtgrtWfxT_rcDKwmVUrqZUlCiguc0OCUykozrjhD2HK69wDtgFEAHiN8WJHH5VQMPmgUwfOxBdnd9-BhEi6-yG5l876JHIiygYDwwGybQNPLkoS8s-uhm3JJ_sYwhXirwkJBTm7UgYctaxPbRuTHP5OghJRBWOQAFZzDaHWgfrjRSP7oe_2nmG-PKLq5yunWU" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#131317] via-transparent to-transparent"></div>
              <div className="absolute bottom-0 p-6 w-full">
                <p className="text-xl font-black text-white">{foodStop.name || "Food Trails"}</p>
                <div className="flex justify-between items-center mt-4 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <button className="bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-bold border border-white/20 hover:bg-white/20">
                    Add to Bucketlist
                  </button>
                  <span className="material-symbols-outlined text-[#ffb4ab] text-xl">favorite</span>
                </div>
              </div>
            </div>

            {/* Nature Walks */}
            <div 
              onClick={() => navigate('/bucketlist')}
              className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer shadow-xl"
            >
              <img 
                alt="Nature" 
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                src="https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=600&q=80" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#131317] via-transparent to-transparent"></div>
              <div className="absolute bottom-0 p-6 w-full">
                <p className="text-xl font-black text-white">{natureStop.name || "Nature Walks"}</p>
                <div className="flex justify-between items-center mt-4 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <button className="bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-bold border border-white/20 hover:bg-white/20">
                    Add to Bucketlist
                  </button>
                  <span className="material-symbols-outlined text-[#ffb4ab] text-xl">favorite</span>
                </div>
              </div>
            </div>

            {/* Sunset Trails */}
            <div 
              onClick={() => navigate('/bucketlist')}
              className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer shadow-xl"
            >
              <img 
                alt="Sunset" 
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                src="https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=600&q=80" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#131317] via-transparent to-transparent"></div>
              <div className="absolute bottom-0 p-6 w-full">
                <p className="text-xl font-black text-white">{sunsetStop.name || "Sunset Trails"}</p>
                <div className="flex justify-between items-center mt-4 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <button className="bg-white/10 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-bold border border-white/20 hover:bg-white/20">
                    Add to Bucketlist
                  </button>
                  <span className="material-symbols-outlined text-[#ffb4ab] text-xl">favorite</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Memory Lane */}
        <section className="max-w-7xl mx-auto px-8 py-20 overflow-hidden">
          <h2 className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-center text-[#c3c6d7] mb-16">
            Memory Lane
          </h2>
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="w-full md:w-1/3 text-center md:text-left">
              <span className="material-symbols-outlined text-[#b4c5ff] text-6xl mb-6">format_quote</span>
              <p className="text-3xl font-light italic leading-relaxed text-white">
                "That sunset in Santorini... it wasn't just a view, it was a calibration of the soul."
              </p>
              <p className="mt-8 text-[0.6875rem] font-bold text-[#c3c6d7] tracking-widest uppercase">
                — SEPT 2023
              </p>
            </div>
                  <div className="w-full md:w-2/3 overflow-hidden relative">
              {/* Fade masks on the edges for a premium look */}
              <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#131317] to-transparent z-10 pointer-events-none"></div>
              <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#131317] to-transparent z-10 pointer-events-none"></div>

              <div className="animate-scroll-endless flex gap-6 pb-8">
                {/* Santorini */}
                <div 
                  onClick={() => navigate('/triparc/memories')}
                  className="min-w-[300px] h-[400px] bg-[#1f1f23] p-4 pb-12 rounded-3xl rotate-[-2deg] shadow-2xl hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer border border-white/5"
                >
                  <div className="w-full h-full rounded-2xl overflow-hidden mb-4">
                    <img 
                      alt="Santorini" 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBZ42GnzXvindqBlbJZdE4X0BV8kBM5p2GjAFxknVoM65Vu0WBAMdw2cVssx9A605vsvg9WrzNT4TqFpV_H6J9FUOfcIQ8UCVdZxzS7FMBLiD_vXaDQ_vqQid-TNPqK5XTOPAFxjQsyeFc5w4kRCnA0wiObtD9LUpOYMVqmJTx0LssOTghNoLDivKFujOUb0JEpttSTXTSpWwwszN9Hz7EZToPaEiowScaATKdo27-0d3LQWc8shi8cw_eDGrlSoKNFByimjA4F4O8" 
                    />
                  </div>
                  <p className="text-center font-bold text-sm tracking-widest text-[#c3c6d7] uppercase">SANTORINI, GREECE</p>
                </div>

                {/* Venice */}
                <div 
                  onClick={() => navigate('/triparc/memories')}
                  className="min-w-[300px] h-[400px] bg-[#1f1f23] p-4 pb-12 rounded-3xl rotate-[3deg] mt-8 shadow-2xl hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer border border-white/5"
                >
                  <div className="w-full h-full rounded-2xl overflow-hidden mb-4">
                    <img 
                      alt="Venice" 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuAoALkM_WfFk_SuRLDDgfignYWDvA7sko1SurVLXPoPFRJ2rxg8q3NKCL_7V9ZfBQysAJGVQhcbk7spruPAxZD7-eHYYNdiBToumSorItp3z2ouHAwpVVcBJLZ_l8fFBGxQ8hGR_QPEqzVbUEI2-OX6p3a7B-wjuW2-lSkPpVBIi-s0zgNRnTbcUtGj-g5Ic9vZWvO1ZkULQuGjpKMwLL6eNkihkGtwM9xgjJTmwiyyKm1DYhLGnA_ulTudygZNOy8gchbDgsU_cMw" 
                    />
                  </div>
                  <p className="text-center font-bold text-sm tracking-widest text-[#c3c6d7] uppercase">VENICE, ITALY</p>
                </div>

                {/* Banff */}
                <div 
                  onClick={() => navigate('/triparc/memories')}
                  className="min-w-[300px] h-[400px] bg-[#1f1f23] p-4 pb-12 rounded-3xl rotate-[-1deg] shadow-2xl hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer border border-white/5"
                >
                  <div className="w-full h-full rounded-2xl overflow-hidden mb-4">
                    <img 
                      alt="Banff" 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBmyCJ9I2Sjy3Izg6iZ_lVQr1T7qJy6cetty4HkJ9acg7E2mncMEVoeYjeb3opHv-RpFlNPAfe6dOuFGOnc5MZnfNmm7mhAzohDbAHG2mHhkNkhxsoTyQ2LQMbUdtYJ2CwVhKCiapEclbuO3eR3Wrm9wEUMzc40OLNv7aXYub41pmz7Chgt-y79ru6kr96pwvnv0M96zeOOS4vdTdzcCnk6G9oVl_UUEWzKprYLZKPALJah-TSaQIZg5yGoxm_LhI0W9lfanEcArH0" 
                    />
                  </div>
                  <p className="text-center font-bold text-sm tracking-widest text-[#c3c6d7] uppercase">BANFF, CANADA</p>
                </div>

                {/* Santorini Duplicate */}
                <div 
                  onClick={() => navigate('/triparc/memories')}
                  className="min-w-[300px] h-[400px] bg-[#1f1f23] p-4 pb-12 rounded-3xl rotate-[-2deg] shadow-2xl hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer border border-white/5"
                >
                  <div className="w-full h-full rounded-2xl overflow-hidden mb-4">
                    <img 
                      alt="Santorini duplicate" 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBZ42GnzXvindqBlbJZdE4X0BV8kBM5p2GjAFxknVoM65Vu0WBAMdw2cVssx9A605vsvg9WrzNT4TqFpV_H6J9FUOfcIQ8UCVdZxzS7FMBLiD_vXaDQ_vqQid-TNPqK5XTOPAFxjQsyeFc5w4kRCnA0wiObtD9LUpOYMVqmJTx0LssOTghNoLDivKFujOUb0JEpttSTXTSpWwwszN9Hz7EZToPaEiowScaATKdo27-0d3LQWc8shi8cw_eDGrlSoKNFByimjA4F4O8" 
                    />
                  </div>
                  <p className="text-center font-bold text-sm tracking-widest text-[#c3c6d7] uppercase">SANTORINI, GREECE</p>
                </div>

                {/* Venice Duplicate */}
                <div 
                  onClick={() => navigate('/triparc/memories')}
                  className="min-w-[300px] h-[400px] bg-[#1f1f23] p-4 pb-12 rounded-3xl rotate-[3deg] mt-8 shadow-2xl hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer border border-white/5"
                >
                  <div className="w-full h-full rounded-2xl overflow-hidden mb-4">
                    <img 
                      alt="Venice duplicate" 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuAoALkM_WfFk_SuRLDDgfignYWDvA7sko1SurVLXPoPFRJ2rxg8q3NKCL_7V9ZfBQysAJGVQhcbk7spruPAxZD7-eHYYNdiBToumSorItp3z2ouHAwpVVcBJLZ_l8fFBGxQ8hGR_QPEqzVbUEI2-OX6p3a7B-wjuW2-lSkPpVBIi-s0zgNRnTbcUtGj-g5Ic9vZWvO1ZkULQuGjpKMwLL6eNkihkGtwM9xgjJTmwiyyKm1DYhLGnA_ulTudygZNOy8gchbDgsU_cMw" 
                    />
                  </div>
                  <p className="text-center font-bold text-sm tracking-widest text-[#c3c6d7] uppercase">VENICE, ITALY</p>
                </div>

                {/* Banff Duplicate */}
                <div 
                  onClick={() => navigate('/triparc/memories')}
                  className="min-w-[300px] h-[400px] bg-[#1f1f23] p-4 pb-12 rounded-3xl rotate-[-1deg] shadow-2xl hover:rotate-0 hover:scale-105 transition-all duration-300 cursor-pointer border border-white/5"
                >
                  <div className="w-full h-full rounded-2xl overflow-hidden mb-4">
                    <img 
                      alt="Banff duplicate" 
                      className="w-full h-full object-cover" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuBmyCJ9I2Sjy3Izg6iZ_lVQr1T7qJy6cetty4HkJ9acg7E2mncMEVoeYjeb3opHv-RpFlNPAfe6dOuFGOnc5MZnfNmm7mhAzohDbAHG2mHhkNkhsoTyQ2LQMbUdtYJ2CwVhKCiapEclbuO3eR3Wrm9wEUMzc40OLNv7aXYub41pmz7Chgt-y79ru6kr96pwvnv0M96zeOOS4vdTdzcCnk6G9oVl_UUEWzKprYLZKPALJah-TSaQIZg5yGoxm_LhI0W9lfanEcArH0" 
                    />
                  </div>
                  <p className="text-center font-bold text-sm tracking-widest text-[#c3c6d7] uppercase">BANFF, CANADA</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-8 z-50 pointer-events-none">
        <div className="bg-[#1F1F23]/70 backdrop-blur-3xl rounded-full px-6 py-3 w-fit min-w-[400px] border border-[#C3C6D7]/10 flex justify-center shadow-[0_24px_48px_-12px_rgba(180,197,255,0.06)] pointer-events-auto">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate('/triparc/7pillars')}
              className="flex flex-col items-center justify-center text-[#C3C6D7] px-5 py-2 hover:text-white transition-all duration-200 active:scale-90"
            >
              <span className="material-symbols-outlined">add_circle</span>
              <span className="uppercase text-[0.6875rem] tracking-[0.1em] font-bold mt-1">New Trip</span>
            </button>
            <button 
              onClick={() => navigate('/timeline')}
              className="flex flex-col items-center justify-center bg-gradient-to-r from-[#2563EB] to-[#03B5D3] text-white rounded-full px-6 py-2.5 active:scale-95 shadow-lg shadow-blue-500/20 hover:scale-105 transition-all duration-200"
            >
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>map</span>
                <span className="uppercase text-[0.6875rem] tracking-[0.1em] font-black">View Trips</span>
              </div>
            </button>
            <button 
              onClick={handleTriggerOra}
              className="flex flex-col items-center justify-center text-[#C3C6D7] px-5 py-2 hover:text-white transition-all duration-200 active:scale-90"
            >
              <span className="material-symbols-outlined">support_agent</span>
              <span className="uppercase text-[0.6875rem] tracking-[0.1em] font-bold mt-1">Concierge</span>
            </button>
            <button 
              onClick={() => navigate('/sos')}
              className="flex flex-col items-center justify-center text-[#C3C6D7] px-5 py-2 hover:text-white transition-all duration-200 active:scale-90"
            >
              <span className="material-symbols-outlined text-[#ffb4ab]">emergency</span>
              <span className="uppercase text-[0.6875rem] tracking-[0.1em] font-bold mt-1">Emergency</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="flex flex-col items-center gap-6 w-full border-t border-[#C3C6D7]/5 bg-[#131317] py-12">
        <div className="text-[#E4E1E7] font-bold tracking-widest text-[0.6875rem] uppercase">KINETIC HORIZON</div>
        <div className="flex gap-8">
          <Link className="text-[#C3C6D7] hover:text-[#4CD7F6] transition-colors text-[0.6875rem] tracking-widest uppercase font-bold" to="/privacy">Privacy</Link>
          <Link className="text-[#C3C6D7] hover:text-[#4CD7F6] transition-colors text-[0.6875rem] tracking-widest uppercase font-bold" to="/terms">Terms</Link>
          <Link className="text-[#C3C6D7] hover:text-[#4CD7F6] transition-colors text-[0.6875rem] tracking-widest uppercase font-bold" to="/sos-settings">Safety</Link>
          <Link className="text-[#C3C6D7] hover:text-[#4CD7F6] transition-colors text-[0.6875rem] tracking-widest uppercase font-bold" to="/contact">Contact</Link>
        </div>
        <p className="uppercase text-[0.6875rem] tracking-widest text-[#C3C6D7] opacity-50 font-bold">
          © 2024 KINETIC HORIZON. ALL INSTRUMENTS CALIBRATED.
        </p>
      </footer>
    </div>
  )
}
