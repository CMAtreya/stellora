import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import LeafletMap from '../components/LeafletMap'
import TripArcShell from '../components/TripArcShell'

type TimelineItem = {
  id: string
  time: string
  title: string
  category: string
  duration: string
  description: string
  status: 'completed' | 'current' | 'upcoming'
}

type MapState = {
  items?: TimelineItem[]
  destination?: string
  mapMarkers?: Array<{ lat: number; lng: number; title?: string }>
  routePoints?: Array<[number, number]>
  startLocation?: { lat: number; lng: number; label?: string }
}

export default function FullPageMap() {
  const location = useLocation()
  const navigate = useNavigate()
  const [optimizedRoute, setOptimizedRoute] = useState<Array<[number, number]>>([])
  const [optimizedMarkers, setOptimizedMarkers] = useState<Array<{ lat: number; lng: number; title?: string }>>([])
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [totalDistance, setTotalDistance] = useState<number | null>(null)

  const mapState = useMemo(() => (location.state as MapState | undefined) || {}, [location.state])
  const items = mapState.items || []
  const destination = mapState.destination || 'Your destination'
  const mapMarkers = mapState.mapMarkers || []
  const routePoints = mapState.routePoints || []
  const startLocation = mapState.startLocation || null

  // Optimize route using OSRM Trip API for shortest routing
  useEffect(() => {
    let active = true

    const optimizeRoute = async () => {
      if (!mapMarkers.length) {
        setOptimizedRoute([])
        setOptimizedMarkers([])
        return
      }

      setIsOptimizing(true)

      try {
        // Build coordinate string for OSRM Trip API: lon,lat;lon,lat;...
        const coordPairs = mapMarkers.map((m) => `${m.lng},${m.lat}`)
        const coordStr = coordPairs.join(';')

        // Use OSRM Trip API to find the shortest route that visits all waypoints
        // source=first means we start and end at the first location
        const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}?overview=full&geometries=geojson&source=first&destination=first`
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`OSRM Trip ${resp.status}`)
        
        const body = await resp.json()
        const trip = body.trips && body.trips[0]
        if (!trip) throw new Error('no trip found')

        // Extract optimized waypoint order
        const orderedIndices = trip.waypoint_indices || []
        const optimizedMarkerList = orderedIndices.map((idx: number) => mapMarkers[idx])

        // Extract geometry for the optimized route
        const geom: Array<[number, number]> = []
        if (trip.geometry && trip.geometry.coordinates) {
          for (const coord of trip.geometry.coordinates) {
            geom.push([coord[1], coord[0]]) // [lon, lat] -> [lat, lon]
          }
        }

        const totalMeters = trip.distance as number
        const totalKm = Math.round((totalMeters / 1000) * 10) / 10

        if (active) {
          setOptimizedRoute(geom)
          setOptimizedMarkers(optimizedMarkerList)
          setTotalDistance(totalKm)
        }
      } catch (err) {
        console.error('Route optimization failed:', err)
        // Fallback to original route
        if (active) {
          setOptimizedRoute(routePoints)
          setOptimizedMarkers(mapMarkers)
          setTotalDistance(null)
        }
      } finally {
        if (active) {
          setIsOptimizing(false)
        }
      }
    }

    void optimizeRoute()

    return () => {
      active = false
    }
  }, [mapMarkers, routePoints])

  return (
    <TripArcShell mainClassName="max-w-full">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Interactive Map</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-white">Route Optimization</h1>
          <p className="mt-2 text-white/65">{destination} — {items.length} destinations</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/40 hover:bg-black/60 text-white/80 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="relative h-[600px] overflow-hidden rounded-3xl border border-white/10 bg-[#05070a] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <LeafletMap
          markers={routePoints.length ? mapMarkers : optimizedMarkers}
          route={routePoints.length ? routePoints : optimizedRoute}
          startMarker={startLocation ? { lat: startLocation.lat, lng: startLocation.lng, title: startLocation.label || 'Start location' } : undefined}
        />
        
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          {isOptimizing && (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/70 px-4 py-2 backdrop-blur-md">
              <div className="h-2 w-2 rounded-full bg-[#06B6D4] animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-widest text-white">Optimizing...</span>
            </div>
          )}
          {totalDistance != null && !isOptimizing && (
            <div className="rounded-lg border border-white/10 bg-black/70 px-4 py-2 backdrop-blur-md">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/60">Total Distance</span>
              <p className="text-lg font-bold text-[#06B6D4]">{totalDistance} km</p>
            </div>
          )}
        </div>

        <div className="absolute bottom-4 left-4 z-20 rounded-lg border border-white/10 bg-black/70 px-4 py-2 backdrop-blur-md max-w-xs">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60 mb-2">Visited Stops</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {optimizedMarkers.map((m, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-[10px] font-bold text-[#06B6D4] whitespace-nowrap">{idx + 1}.</span>
                <span className="text-[10px] text-white/70 line-clamp-1">{m.title || `Point ${idx + 1}`}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 pointer-events-none" />
      </div>
    </TripArcShell>
  )
}
