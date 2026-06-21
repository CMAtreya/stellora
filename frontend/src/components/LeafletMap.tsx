import { Fragment, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'

type LatLng = [number, number]

type LeafletMapProps = {
  center?: LatLng
  zoom?: number
  focusPoint?: LatLng | null
  focusZoom?: number
  markers?: Array<{ lat: number; lng: number; title?: string }>
  route?: LatLng[]
  startMarker?: { lat: number; lng: number; title?: string }
  currentLocation?: { lat: number; lng: number; title?: string; accuracy?: number }
  locked?: boolean
  routes?: Array<{ id: string; geometry: string; color?: string; duration?: number; distance?: number; title?: string }>
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points || !points.length) return
    const latLngs = points.map((p) => L.latLng(p[0], p[1]))
    const bounds = L.latLngBounds(latLngs)
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [map, points])
  return null
}

function FocusMap({ focusPoint, focusZoom }: { focusPoint: LatLng | null; focusZoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (!focusPoint) return
    map.setView(focusPoint, focusZoom, { animate: true })
  }, [focusPoint, focusZoom, map])
  return null
}

function ZoomButtons() {
  const map = useMap()
  return (
    <div className="absolute right-4 top-6 z-40 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/6 bg-[#1C1C1E]/90 text-[18px] font-bold text-white shadow-lg transition-transform hover:scale-105"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/6 bg-[#1C1C1E]/90 text-[18px] font-bold text-white shadow-lg transition-transform hover:scale-95"
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  )
}

export default function LeafletMap({ center = [12.9716, 77.5946], zoom = 13, focusPoint = null, focusZoom = 15, markers = [], route = [], startMarker, currentLocation, locked = false, routes = [] }: LeafletMapProps) {
  const tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  const createNumberedIcon = (label: number, isFirst: boolean) =>
    L.divIcon({
      className: 'numbered-route-marker',
      html: `
        <div style="
          width: 30px;
          height: 30px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          color: white;
          border: 2px solid rgba(255,255,255,0.8);
          background: ${isFirst ? '#06b6d4' : '#2563eb'};
          box-shadow: 0 8px 20px rgba(0,0,0,0.35);
        ">${label}</div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
    })

  const routePoints: LatLng[] = route

  // decode polyline (Google/OSRM encoded polyline) -> array of [lat,lng]
  const decodePolyline = (encoded = ''): LatLng[] => {
    if (!encoded) return []
    const coords: LatLng[] = []
    let index = 0
    const len = encoded.length
    let lat = 0
    let lng = 0

    while (index < len) {
      let b: number
      let shift = 0
      let result = 0
      do {
        b = encoded.charCodeAt(index++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1
      lat += deltaLat

      shift = 0
      result = 0
      do {
        b = encoded.charCodeAt(index++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1
      lng += deltaLng

      coords.push([lat / 1e5, lng / 1e5])
    }
    return coords
  }

  const fitPoints = routePoints.length
    ? routePoints
    : [
        ...(currentLocation ? [[currentLocation.lat, currentLocation.lng] as LatLng] : []),
        ...(startMarker ? [[startMarker.lat, startMarker.lng] as LatLng] : []),
        ...markers.map((m) => [m.lat, m.lng] as LatLng),
      ]

  const createCurrentLocationIcon = () =>
    L.divIcon({
      className: 'current-location-marker',
      html: `
        <div style="
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          border: 3px solid white;
          background: #2563eb;
          box-shadow: 0 0 0 10px rgba(37,99,235,0.18), 0 8px 20px rgba(0,0,0,0.35);
        "></div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10],
    })

  const createEtaIcon = (etaLabel: string, color: string) =>
    L.divIcon({
      className: 'eta-route-marker',
      html: `
        <div style="
          display:flex;
          align-items:center;
          justify-content:center;
          min-width:48px;
          height:26px;
          padding:0 10px;
          border-radius:9999px;
          border:1px solid rgba(255,255,255,0.85);
          background:${color};
          color:white;
          font-size:11px;
          font-weight:800;
          box-shadow:0 10px 24px rgba(0,0,0,0.35);
        ">${etaLabel}</div>
      `,
      iconSize: [56, 26],
      iconAnchor: [28, 13],
      popupAnchor: [0, -14],
    })

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '--'
    const mins = Math.max(1, Math.round(seconds / 60))
    return `${mins}m`
  }

  const formatDistance = (meters?: number) => {
    if (!meters || meters <= 0) return '--'
    if (meters < 1000) return `${Math.round(meters)}m`
    return `${(meters / 1000).toFixed(1)}km`
  }

  return (
    <div
      className="triparc-leaflet-light"
      style={{
        height: '100%',
        width: '100%',
        pointerEvents: locked ? 'none' : 'auto',
        touchAction: locked ? 'none' : 'auto',
      }}
    >
      <style>{`
        .triparc-leaflet-light .leaflet-container {
          background: #f4f7fb;
          font-family: inherit;
        }

        .triparc-leaflet-light .leaflet-control-zoom,
        .triparc-leaflet-light .leaflet-control-attribution {
          border: 1px solid rgba(15, 23, 42, 0.1);
          border: 1px solid rgba(15, 23, 42, 0.1);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
        }

        .triparc-leaflet-light .leaflet-control-zoom a,
        .triparc-leaflet-light .leaflet-control-attribution {
          background: rgba(16, 16, 20, 0.92);
          background: rgba(255, 255, 255, 0.94);
          color: #1f2937;

        .triparc-leaflet-light .leaflet-control-zoom a {
          border-color: rgba(255, 255, 255, 0.06);
          border-color: rgba(15, 23, 42, 0.08);
          color: #111827;

        .triparc-leaflet-light .leaflet-control-zoom a:hover {
          background: rgba(255, 255, 255, 0.08);
          background: rgba(241, 245, 249, 0.98);
          color: #0f172a;

        .triparc-leaflet-light .leaflet-control-attribution a {
          color: #60a5fa;
          color: #2563eb;

        .triparc-leaflet-light .leaflet-popup-content-wrapper,
        .triparc-leaflet-light .leaflet-popup-tip {
          background: rgba(24, 24, 28, 0.98);
          background: rgba(255, 255, 255, 0.98);
          color: #0f172a;
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.14);

        .triparc-leaflet-light .leaflet-popup-content {
          color: #f9fafb;
          color: #0f172a;
      `}</style>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={!locked}
        attributionControl={false}
        scrollWheelZoom={!locked}
        dragging={!locked}
        touchZoom={!locked}
        doubleClickZoom={!locked}
        boxZoom={!locked}
        keyboard={!locked}
        inertia={!locked}
      >
        <ZoomButtons />
        <TileLayer url={tileUrl} />
        {markers.map((m, idx) => (
          <Marker key={idx} position={[m.lat, m.lng]} icon={createNumberedIcon(idx + 1, idx === 0)}>
            <Popup>{`${idx + 1}. ${m.title || `Point ${idx + 1}`}`}</Popup>
          </Marker>
        ))}
        {startMarker && (
          <Marker
            position={[startMarker.lat, startMarker.lng]}
            icon={L.divIcon({
              className: 'start-route-marker',
              html: `
                <div style="
                  width: 28px;
                  height: 28px;
                  border-radius: 9999px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 12px;
                  font-weight: 800;
                  color: white;
                  border: 2px solid rgba(255,255,255,0.9);
                  background: #10b981;
                  box-shadow: 0 10px 20px rgba(16,185,129,0.35);
                ">S</div>
              `,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
              popupAnchor: [0, -12],
            })}
          >
            <Popup>{startMarker.title || 'Start location'}</Popup>
          </Marker>
        )}
        {routePoints.length > 0 && <Polyline positions={routePoints} color="#2f8cff" weight={4} opacity={0.95} />}
        {/* render per-member routes if provided */}
        {Array.isArray(routes) &&
          routes.map((r, i) => {
            try {
              const pts = decodePolyline(r.geometry || '')
              if (!pts.length) return null
              const color = r.color || '#FF7A59'
              const eta = formatDuration(r.duration)
              const distance = formatDistance(r.distance)
              const markerPoint = pts[0]
              return (
                <Fragment key={`route-${r.id || i}`}>
                  <Polyline positions={pts} color={color} weight={4} opacity={0.9} dashArray={r.color ? undefined : '6 8'} />
                  <Marker position={markerPoint} icon={createEtaIcon(eta, color)}>
                    <Popup>{`${r.title || r.id}: ETA ${eta} • ${distance}`}</Popup>
                  </Marker>
                </Fragment>
              )
            } catch (e) {
              return null
            }
          })}
        {currentLocation && (
          <>
            <Circle
              center={[currentLocation.lat, currentLocation.lng]}
              radius={typeof currentLocation.accuracy === 'number' && currentLocation.accuracy > 0 ? currentLocation.accuracy : 20}
              pathOptions={{ color: '#2f8cff', fillColor: '#2f8cff', fillOpacity: 0.16, weight: 1 }}
            />
            <Marker
              position={[currentLocation.lat, currentLocation.lng]}
              icon={createCurrentLocationIcon()}
            >
              <Popup>{currentLocation.title || 'You are here'}</Popup>
            </Marker>
          </>
        )}
        {focusPoint ? <FocusMap focusPoint={focusPoint} focusZoom={focusZoom} /> : <FitBounds points={fitPoints} />}
      </MapContainer>
    </div>
  )
}
