import { Fragment, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'

type LatLng = [number, number]

type GroupMember = {
  id: string
  displayName?: string
  live_lat?: number | null
  live_lng?: number | null
  accuracy?: number | null
  last_updated?: string | null
  is_lost?: boolean
  battery?: number | null
  speed?: number | null
}

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
  groupMembers?: GroupMember[]
  meetupPoint?: { lat: number; lng: number; title?: string }
  trafficActive?: boolean
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (!points || !points.length) return
    if (hasFitted.current) return

    const latLngs = points.map((p) => L.latLng(p[0], p[1]))
    const bounds = L.latLngBounds(latLngs)
    map.fitBounds(bounds, { padding: [40, 40] })
    hasFitted.current = true
  }, [map, points])
  return null
}

function FocusMap({ focusPoint, focusZoom }: { focusPoint: LatLng | null; focusZoom: number }) {
  const map = useMap()
  const hasFocused = useRef(false)

  useEffect(() => {
    if (!focusPoint) return

    const isDefaultCenter = focusPoint[0] === 35.0116 && focusPoint[1] === 135.7681
    if (hasFocused.current && isDefaultCenter) return

    map.setView(focusPoint, focusZoom, { animate: true })

    if (!isDefaultCenter) {
      hasFocused.current = true
    }
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

function getTimeAgoString(isoString?: string | null): string {
  if (!isoString) return 'Active now'
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 10) return 'Just now'
  if (diffSecs < 60) return `${diffSecs}s ago`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`
  return 'Over an hour ago'
}

export default function LeafletMap({ center = [12.9716, 77.5946], zoom = 13, focusPoint = null, focusZoom = 15, markers = [], route = [], startMarker, currentLocation, locked = false, routes = [], groupMembers = [], meetupPoint, trafficActive = false }: LeafletMapProps) {
  const tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  const selfUserId = typeof window !== 'undefined' ? window.localStorage.getItem('triparc:user_id') || '' : ''

  const colorByMember = (id: string) => {
    const palette = ['#FF7A59', '#2f8cff', '#06b6d4', '#f59e0b', '#22c55e']
    let acc = 0
    for (let i = 0; i < id.length; i += 1) acc += id.charCodeAt(i)
    return palette[acc % palette.length]
  }

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

  const createMemberIcon = (member: GroupMember, color: string) => {
    const name = member.displayName || 'Member'
    const initials = name
      .split(' ')
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()

    const outerPulseStyle = member.is_lost
      ? `animation: member-pulse-red 2s infinite; border: 2.5px solid #EF4444;`
      : `border: 2px solid white;`

    const badgeHtml = member.is_lost
      ? `<div style="
          position: absolute;
          top: -4px;
          right: -4px;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #ef4444;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        ">
          <span style="font-size: 8px; color: white; font-weight: 900; line-height: 1;">!</span>
        </div>`
      : ''

    return L.divIcon({
      className: `group-member-map-marker ${member.is_lost ? 'is-lost' : ''}`,
      html: `
        <div style="
          position: relative;
          width: 32px;
          height: 32px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background: ${color};
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          box-sizing: border-box;
          ${outerPulseStyle}
        ">
          <span style="font-family: inherit; font-size: 11px; font-weight: 800; tracking: -0.05em;">${initials}</span>
          ${badgeHtml}
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    })
  }

  const createMeetupIcon = () =>
    L.divIcon({
      className: 'meetup-point-marker',
      html: `
        <div style="
          width: 32px;
          height: 32px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #06b6d4;
          border: 2.5px solid white;
          box-shadow: 0 4px 15px rgba(6,182,212,0.4), 0 8px 20px rgba(0,0,0,0.3);
          color: white;
          animation: member-pulse-cyan 2s infinite;
        ">
          <span class="material-symbols-outlined" style="font-size: 18px; font-weight: 800; line-height: 1;">hub</span>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    })

  const routePoints: LatLng[] = route

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

  const memberPoints = groupMembers
    .filter((m) => m.live_lat != null && m.live_lng != null)
    .map((m) => [m.live_lat!, m.live_lng!] as LatLng)

  const fitPoints = routePoints.length
    ? routePoints
    : [
        ...(currentLocation ? [[currentLocation.lat, currentLocation.lng] as LatLng] : []),
        ...(startMarker ? [[startMarker.lat, startMarker.lng] as LatLng] : []),
        ...markers.map((m) => [m.lat, m.lng] as LatLng),
        ...memberPoints,
        ...(meetupPoint ? [[meetupPoint.lat, meetupPoint.lng] as LatLng] : []),
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
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
        }

        .triparc-leaflet-light .leaflet-control-zoom a,
        .triparc-leaflet-light .leaflet-control-attribution {
          background: rgba(255, 255, 255, 0.94);
          color: #1f2937;
        }

        .triparc-leaflet-light .leaflet-control-zoom a {
          border-color: rgba(15, 23, 42, 0.08);
          color: #111827;
        }

        .triparc-leaflet-light .leaflet-control-zoom a:hover {
          background: rgba(241, 245, 249, 0.98);
          color: #0f172a;
        }

        .triparc-leaflet-light .leaflet-control-attribution a {
          color: #2563eb;
        }

        .triparc-leaflet-light .leaflet-popup-content-wrapper,
        .triparc-leaflet-light .leaflet-popup-tip {
          background: rgba(255, 255, 255, 0.98);
          color: #0f172a;
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.14);
        }

        .triparc-leaflet-light .leaflet-popup-content {
          color: #0f172a;
        }

        @keyframes member-pulse-red {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7), 0 4px 10px rgba(0,0,0,0.3); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0), 0 4px 10px rgba(0,0,0,0.3); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0), 0 4px 10px rgba(0,0,0,0.3); }
        }

        @keyframes member-pulse-cyan {
          0% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.7), 0 4px 10px rgba(0,0,0,0.3); }
          70% { box-shadow: 0 0 0 10px rgba(6, 182, 212, 0), 0 4px 10px rgba(0,0,0,0.3); }
          100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0), 0 4px 10px rgba(0,0,0,0.3); }
        }
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
        {trafficActive && (
          <TileLayer
            url="https://mt1.google.com/vt/lyrs=h,traffic&x={x}&y={y}&z={z}"
            zIndex={10}
            opacity={0.7}
          />
        )}
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
        {groupMembers
          .filter((m) => m.live_lat != null && m.live_lng != null && m.id !== selfUserId)
          .map((m) => {
            const memberColor = colorByMember(m.id)
            const position: LatLng = [m.live_lat!, m.live_lng!]
            const accuracyRadius = typeof m.accuracy === 'number' && m.accuracy > 0 ? m.accuracy : 20
            
            return (
              <Fragment key={`member-${m.id}`}>
                <Circle
                  center={position}
                  radius={accuracyRadius}
                  pathOptions={{
                    color: m.is_lost ? '#EF4444' : memberColor,
                    fillColor: m.is_lost ? '#EF4444' : memberColor,
                    fillOpacity: 0.12,
                    weight: 1,
                    dashArray: m.is_lost ? '4 4' : undefined,
                  }}
                />
                <Marker
                  position={position}
                  icon={createMemberIcon(m, memberColor)}
                >
                  <Popup>
                    <div className="flex flex-col gap-1 p-1 text-zinc-900 font-sans min-w-[130px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-extrabold text-sm text-zinc-900">{m.displayName || 'Group Member'}</span>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                          m.is_lost 
                            ? 'bg-red-50 text-red-500 border border-red-200 animate-pulse' 
                            : 'bg-green-50 text-green-600 border border-green-200'
                        }`}>
                          {m.is_lost ? 'Separated' : 'Safe'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-[10px] text-zinc-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>Battery: {m.battery != null ? `${m.battery}%` : '85%'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span>Speed: {m.speed != null ? `${m.speed} km/h` : '0 km/h'}</span>
                        </div>
                        <div className="mt-1.5 border-t border-zinc-100 pt-1 text-[9px] text-zinc-400">
                          Updated {getTimeAgoString(m.last_updated)}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </Fragment>
            )
          })}
        {meetupPoint && (
          <Marker position={[meetupPoint.lat, meetupPoint.lng]} icon={createMeetupIcon()}>
            <Popup>
              <div className="flex flex-col gap-1 p-1 text-zinc-900 font-sans min-w-[120px]">
                <span className="font-extrabold text-sm text-[#06B6D4]">{meetupPoint.title || 'Meetup Point'}</span>
                <span className="text-[10px] text-zinc-500 font-medium">Common meetup centroid calculated for group convergence.</span>
              </div>
            </Popup>
          </Marker>
        )}
        {focusPoint ? <FocusMap focusPoint={focusPoint} focusZoom={focusZoom} /> : <FitBounds points={fitPoints} />}
      </MapContainer>
    </div>
  )
}
