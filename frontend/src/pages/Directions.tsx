import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2, MapPin, Navigation, Route as RouteIcon, Trees } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import type { LngLatBoundsLike, LngLatLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import TripArcShell from '../components/TripArcShell'

// Minimal route shape from Mapbox Directions API
interface RouteOption {
  id: string
  distanceKm: number
  durationMin: number
  geometry: GeoJSON.LineString
  label: string
  treeCount?: number
  treeNote?: string
  mapsLink?: string
}

type Coord = { lat: number; lng: number }

type MapPreviewProps = {
  routes: RouteOption[]
  start: Coord | null
  dest: Coord | null
  tileUrl: string
}

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

async function fetchDirections(start: Coord, dest: Coord, osrmBase: string): Promise<RouteOption[]> {
  const base = osrmBase || 'https://router.project-osrm.org'
  const url = `${base}/route/v1/foot/${start.lng},${start.lat};${dest.lng},${dest.lat}?overview=full&alternatives=true&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  const routes = Array.isArray(data?.routes) ? data.routes : []
  return routes.map((r: any, idx: number) => ({
    id: r?.route_id || r?.id || `route-${idx}`,
    distanceKm: (r?.distance || 0) / 1000,
    durationMin: (r?.duration || 0) / 60,
    geometry: r?.geometry,
    label: idx === 0 ? 'Fastest' : 'Alternate',
    mapsLink: `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${dest.lat},${dest.lng}&travelmode=walking`,
  }))
}

function computeBbox(line: GeoJSON.LineString) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (const [lng, lat] of line.coordinates) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  const pad = 0.01
  return { south: minLat - pad, north: maxLat + pad, west: minLng - pad, east: maxLng + pad }
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]

async function overpassFetch(query: string, timeoutMs = 8000): Promise<any | null> {
  for (const base of OVERPASS_ENDPOINTS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${base}?data=${encodeURIComponent(query)}`, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) continue
      return res.json()
    } catch (err) {
      clearTimeout(timer)
      continue
    }
  }
  return null
}

async function fetchTreeCount(line: GeoJSON.LineString): Promise<number> {
  const { south, north, west, east } = computeBbox(line)
  const bbox = `${south},${west},${north},${east}`
  const query = `[out:json][timeout:8];(node["natural"="tree"](${bbox});way["natural"="wood"](${bbox});way["landuse"="forest"](${bbox}););out;`
  const data = await overpassFetch(query, 8000)
  if (!data || !Array.isArray(data?.elements)) return 0
  return data.elements.length
}

async function fetchTreePoints(line: GeoJSON.LineString): Promise<GeoJSON.FeatureCollection | null> {
  const { south, north, west, east } = computeBbox(line)
  const bbox = `${south},${west},${north},${east}`
  const query = `[out:json][timeout:8];(node["natural"="tree"](${bbox}););out;`
  const data = await overpassFetch(query, 8000)
  if (!data || !Array.isArray(data?.elements)) return { type: 'FeatureCollection', features: [] }
  const features: GeoJSON.Feature[] = data.elements
    .filter((e: any) => e?.type === 'node' && typeof e.lat === 'number' && typeof e.lon === 'number')
    .map((e: any) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
      properties: {},
    }))
  return { type: 'FeatureCollection', features }
}

export default function DirectionsPage() {
  const query = useQuery()
  const navigate = useNavigate()

  const destName = query.get('name') || 'Destination'
  const destLat = Number(query.get('lat'))
  const destLng = Number(query.get('lng'))
  const destCoord = !Number.isNaN(destLat) && !Number.isNaN(destLng) ? { lat: destLat, lng: destLng } : null

  const [start, setStart] = useState<Coord | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const osrmBase = import.meta.env.VITE_OSRM_URL as string | undefined
  const tileUrl = (import.meta.env.VITE_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

  useEffect(() => {
    // Default to current location if available
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setError('Allow location or enter a start point manually.')
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [])

  // Auto load routes once we have both points
  useEffect(() => {
    if (start && destCoord) {
      loadRoutes().catch(() => null)
    }
  }, [start, destCoord])

  async function loadRoutes() {
    setError('')
    if (!start || Number.isNaN(destLat) || Number.isNaN(destLng)) {
      setError('Start or destination is missing coordinates.')
      return
    }
    setLoading(true)
    try {
      const fetched = await fetchDirections(start, { lat: destLat, lng: destLng }, osrmBase || 'https://router.project-osrm.org')
      const withTrees = await Promise.all(
        fetched.map(async (r) => {
          if (!r.geometry?.coordinates?.length) return r
          const treeCount = await fetchTreeCount(r.geometry)
          return {
            ...r,
            treeCount,
            treeNote: treeCount > 0 ? `${treeCount} tree/green features along this path` : 'Low greenery detected',
          }
        })
      )
      const ranked = [...withTrees].sort((a, b) => (b.treeCount || 0) - (a.treeCount || 0))
      setRoutes(ranked)
    } catch (err: any) {
      setError(err?.message || 'Failed to load routes')
    } finally {
      setLoading(false)
    }
  }

  return (
    <TripArcShell mainClassName="max-w-6xl">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/60">Directions</p>
          <h1 className="font-display text-3xl font-semibold text-white">Find the best way to {destName}</h1>
          <p className="text-white/70">We suggest the shortest walking route and greener options with more trees (OSRM + OpenStreetMap).</p>
        </div>
        <button
          className="rounded-full border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white/80 hover:border-white/40"
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow">
          <div className="mb-3 flex items-center gap-2 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900"><Navigation size={16} /></div>
            <div>
              <p className="text-sm font-semibold">Route planner</p>
              <p className="text-xs text-white/60">Shortest path + greener alternatives.</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-white/80">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-white/60">Destination</p>
              <p className="text-base font-semibold text-white">{destName}</p>
              <p className="text-xs text-white/60">{Number.isNaN(destLat) ? 'Lat missing' : destLat}, {Number.isNaN(destLng) ? 'Lng missing' : destLng}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-white/60">Start</p>
              {start ? (
                <p className="text-base font-semibold text-white">Current: {start.lat.toFixed(4)}, {start.lng.toFixed(4)}</p>
              ) : (
                <button
                  onClick={() => navigator.geolocation.getCurrentPosition((pos) => setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }))}
                  className="rounded-full border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white/80 hover:border-white/40"
                >
                  Use my location
                </button>
              )}
            </div>
            <button
              onClick={loadRoutes}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gradient px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RouteIcon size={16} />}
              {loading ? 'Calculating routes' : 'Show routes'}
            </button>
            {error && <p className="text-xs text-red-300">{error}</p>}
          </div>

          <div className="mt-4 space-y-3">
            {routes.map((r, idx) => (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between text-white">
                  <div>
                    <p className="text-sm font-semibold">{r.label}{idx === 0 ? ' (Top)' : ''}</p>
                    <p className="text-xs text-white/60">{r.distanceKm.toFixed(2)} km / {r.durationMin.toFixed(0)} min walk</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-emerald-200">
                    <Trees size={14} />
                    {r.treeNote || 'Tree data pending'}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
                  <MapPin size={12} />
                  <span>Prefer shade? This path offers trees along the way. Want to walk under them and enjoy the breeze?</span>
                </div>
                {r.mapsLink && (
                  <a
                    href={r.mapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.14em] text-white/80 hover:border-white/40"
                  >
                    Open in Google Maps
                  </a>
                )}
              </div>
            ))}

            {!routes.length && !loading && (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-3 text-xs text-white/70">
                Routes will appear here once calculated.
              </div>
            )}
          </div>
        </div>

        <div className="relative min-h-[520px] overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <MapPreview routes={routes} start={start} dest={destCoord} tileUrl={tileUrl} />
        </div>
      </div>
    </TripArcShell>
  )
}

function MapPreview({ routes, start, dest, tileUrl }: MapPreviewProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Initialize map
  useEffect(() => {
    if (!mapDivRef.current) return
    if (mapRef.current) return
    const center: LngLatLike = dest ? [dest.lng, dest.lat] : [0, 0]
    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center,
      zoom: dest ? 13 : 2,
      attributionControl: { compact: true },
    })
    map.on('load', () => setMapReady(true))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [dest, tileUrl])

  // Update routes and overlay trees
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (!map.isStyleLoaded()) {
      map.once('idle', () => setMapReady(true))
      return
    }

    const routeFeatures = routes
      .filter((r) => r.geometry?.coordinates?.length)
      .map((r, idx) => ({
        type: 'Feature' as const,
        geometry: r.geometry,
        properties: { rank: idx },
      }))

    const routeCollection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: routeFeatures }

    if (!map.getSource('routes')) {
      map.addSource('routes', { type: 'geojson', data: routeCollection })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': ['interpolate', ['linear'], ['get', 'rank'], 0, '#34d399', 1, '#60a5fa', 2, '#a78bfa'],
          'line-width': 5,
          'line-opacity': 0.9,
        },
      })
    } else {
      const src = map.getSource('routes') as maplibregl.GeoJSONSource
      src.setData(routeCollection)
    }

    // Start/Dest markers as circle layers
    const startFeature: GeoJSON.Feature<GeoJSON.Point> | null = start
      ? { type: 'Feature', geometry: { type: 'Point', coordinates: [start.lng, start.lat] }, properties: {} }
      : null
    const destFeature: GeoJSON.Feature<GeoJSON.Point> | null = dest
      ? { type: 'Feature', geometry: { type: 'Point', coordinates: [dest.lng, dest.lat] }, properties: {} }
      : null

    const emptyCollection: GeoJSON.FeatureCollection<GeoJSON.Point> = { type: 'FeatureCollection', features: [] }
    const startData: GeoJSON.FeatureCollection<GeoJSON.Point> = startFeature
      ? { type: 'FeatureCollection', features: [startFeature] }
      : emptyCollection
    const destData: GeoJSON.FeatureCollection<GeoJSON.Point> = destFeature
      ? { type: 'FeatureCollection', features: [destFeature] }
      : emptyCollection

    if (!map.getSource('start-pin')) {
      map.addSource('start-pin', { type: 'geojson', data: startData })
      map.addLayer({
        id: 'start-pin',
        type: 'circle',
        source: 'start-pin',
        paint: { 'circle-radius': 6, 'circle-color': '#22c55e', 'circle-stroke-width': 2, 'circle-stroke-color': '#0f172a' },
      })
    } else {
      (map.getSource('start-pin') as maplibregl.GeoJSONSource).setData(startData)
    }

    if (!map.getSource('dest-pin')) {
      map.addSource('dest-pin', { type: 'geojson', data: destData })
      map.addLayer({
        id: 'dest-pin',
        type: 'circle',
        source: 'dest-pin',
        paint: { 'circle-radius': 7, 'circle-color': '#fb7185', 'circle-stroke-width': 2, 'circle-stroke-color': '#0f172a' },
      })
    } else {
      (map.getSource('dest-pin') as maplibregl.GeoJSONSource).setData(destData)
    }

    // Trees overlay for top route
    if (routes[0]?.geometry) {
      const geom = routes[0].geometry as GeoJSON.LineString
      fetchTreePoints(geom).then((fc) => {
        if (!map.getSource('trees')) {
          map.addSource('trees', { type: 'geojson', data: fc || { type: 'FeatureCollection', features: [] } })
          map.addLayer({
            id: 'trees',
            type: 'circle',
            source: 'trees',
            paint: {
              'circle-radius': 3,
              'circle-color': '#22c55e',
              'circle-stroke-width': 1,
              'circle-stroke-color': '#0f172a',
              'circle-opacity': 0.9,
            },
          })
        } else {
          const src = map.getSource('trees') as maplibregl.GeoJSONSource
          src.setData(fc || { type: 'FeatureCollection', features: [] })
        }
      })
    }

    // Fit bounds
    const bounds = new maplibregl.LngLatBounds()
    routeFeatures.forEach((feat) => {
      const coords = (feat.geometry as GeoJSON.LineString).coordinates
      coords.forEach(([lng, lat]) => bounds.extend([lng, lat]))
    })
    if (start) bounds.extend([start.lng, start.lat])
    if (dest) bounds.extend([dest.lng, dest.lat])

    if (bounds.isEmpty()) {
      if (dest) map.flyTo({ center: [dest.lng, dest.lat], zoom: 13 })
    } else {
      map.fitBounds(bounds as LngLatBoundsLike, { padding: 60, duration: 400 })
    }
  }, [routes, start, dest, mapReady])

  return <div ref={mapDivRef} className="absolute inset-0" aria-label="Route map preview" />
}
