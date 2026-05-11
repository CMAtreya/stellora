import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'

type LatLng = [number, number]

type LeafletMapProps = {
  center?: LatLng
  zoom?: number
  markers?: Array<{ lat: number; lng: number; title?: string }>
  route?: LatLng[]
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

export default function LeafletMap({ center = [12.9716, 77.5946], zoom = 13, markers = [], route = [] }: LeafletMapProps) {
  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const markerIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })

  const routePoints: LatLng[] = route

  const fitPoints = routePoints.length ? routePoints : markers.map((m) => [m.lat, m.lng] as LatLng)

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={true}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url={tileUrl} />
        {markers.map((m, idx) => (
          <Marker key={idx} position={[m.lat, m.lng]} icon={markerIcon}>
            <Popup>{m.title || `Point ${idx + 1}`}</Popup>
          </Marker>
        ))}
        {routePoints.length > 0 && <Polyline positions={routePoints} color="#f7d982" weight={4} />}
        <FitBounds points={fitPoints} />
      </MapContainer>
    </div>
  )
}
