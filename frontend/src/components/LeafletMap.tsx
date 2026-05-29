import { useEffect } from 'react'
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

export default function LeafletMap({ center = [12.9716, 77.5946], zoom = 13, focusPoint = null, focusZoom = 15, markers = [], route = [], startMarker, currentLocation, locked = false }: LeafletMapProps) {
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
