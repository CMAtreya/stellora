import { MapPin } from 'lucide-react'
import MapPinMarker from './MapPin'

export type SmartStop = {
  id: string
  title: string
  time: string
  category: 'Food' | 'Heritage' | 'Shopping' | 'Rest'
  status: 'completed' | 'current' | 'upcoming'
  price: string
  rating: string
  icon: string
  x: string
  y: string
  story?: boolean
  crowd?: string
  tagline?: string
}

type MapContainerProps = {
  stops: SmartStop[]
  activeStopId: string
  onSelectStop: (id: string) => void
  toggles: { route: boolean; crowd: boolean; food: boolean }
  onToggleRoute: () => void
  onToggleCrowd: () => void
  onToggleFood: () => void
}

export default function MapContainer({ stops, activeStopId, onSelectStop, toggles, onToggleRoute, onToggleCrowd, onToggleFood }: MapContainerProps) {
  const activeStop = stops.find((stop) => stop.id === activeStopId) ?? stops[0]
  const visibleStops = toggles.food ? stops : stops.filter((stop) => stop.category !== 'Food')
  const visibleStories = visibleStops.filter((stop) => stop.story).length
  const visibleFood = visibleStops.filter((stop) => stop.category === 'Food').length

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d0d11] shadow-[0_30px_60px_-35px_rgba(0,0,0,1)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(242,202,80,0.08),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.05),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />
      <div className="absolute inset-0 bg-[url('https://lh3.googleusercontent.com/aida-public/AB6AXuCmpWHwkR4-gIQtlF3GCzl5ecPLjRuHKpnNJmsNlsC1P0TTMkKCBo0afsmiVdVx_JCx5fE0Vq6Stx0Zp77A_-E6u6rjjQQc92OZ5PMyjyNMK9PvhDvg44hu681NyKRDwOChNfn8DoZFcJKq5HWigJdTbFR-ca0sSC0hZak7Ek4_mq7ibih91BGWjR3DVbKn6zLNs6D8VCtmqcnEHNgZBNEaHYE16w5sOnCF1gqwAOFHI8tjnmIk186xJ56JjBtm_miKKil58UIgfQfG')] bg-cover bg-center opacity-25 grayscale mix-blend-luminosity" />

      {toggles.route && (
        <svg className="absolute inset-0 z-10 h-full w-full pointer-events-none">
          <defs>
            <linearGradient id="triparc-route" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#f2ca50" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#d4af37" stopOpacity="0.95" />
            </linearGradient>
            <filter id="routeGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M 190 420 Q 290 300 390 330 T 560 220 T 760 280"
            fill="none"
            stroke="url(#triparc-route)"
            strokeWidth="4"
            strokeDasharray="11 14"
            strokeLinecap="round"
            filter="url(#routeGlow)"
            className="route-dash"
          />
        </svg>
      )}

      <div className="absolute inset-0 z-20">
        {toggles.crowd && (
          <>
            <div className="pointer-events-none absolute left-[52%] top-[18%] h-48 w-48 -translate-x-1/2 rounded-full bg-rose-400/12 blur-3xl" />
            <div className="pointer-events-none absolute left-[70%] top-[42%] h-44 w-44 -translate-x-1/2 rounded-full bg-amber-300/10 blur-3xl" />
            <div className="pointer-events-none absolute left-[34%] top-[56%] h-56 w-56 -translate-x-1/2 rounded-full bg-emerald-300/10 blur-3xl" />
          </>
        )}

        {visibleStops.map((stop) => (
          <MapPinMarker
            key={stop.id}
            label={stop.title}
            price={stop.price}
            icon={stop.icon}
            rating={stop.rating}
            active={stop.id === activeStopId}
            faded={stop.id !== activeStopId}
            story={stop.story}
            x={stop.x}
            y={stop.y}
            onClick={() => onSelectStop(stop.id)}
          />
        ))}

        {toggles.food &&
          stops
            .filter((stop) => stop.category === 'Food')
            .map((stop) => (
              <div
                key={`food-ring-${stop.id}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: stop.x, top: stop.y }}
              >
                <span className="block h-14 w-14 rounded-full border border-[#f2ca50]/35 bg-[#f2ca50]/10" />
              </div>
            ))}

        <div className="absolute left-[18%] top-[58%] flex flex-col items-center">
          <div className="relative flex h-4 w-4 items-center justify-center">
            <span className="absolute h-10 w-10 animate-ping rounded-full bg-[#f2ca50]/20" />
            <span className="relative h-4 w-4 rounded-full border-2 border-white bg-[#f2ca50] shadow-[0_0_18px_rgba(242,202,80,0.5)]" />
          </div>
          <div className="mt-2 rounded-full border border-[#f2ca50]/20 bg-[#f2ca50]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f7d982] backdrop-blur-xl">
            You are here
          </div>
        </div>

        <div className="absolute left-6 top-6 z-30 rounded-2xl border border-white/10 bg-[#111116]/85 px-4 py-3 backdrop-blur-xl">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Overlay legend</p>
          <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/75">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Stops {visibleStops.length}</span>
            <span className="rounded-full border border-[#f2ca50]/30 bg-[#f2ca50]/10 px-2 py-1 text-[#f7d982]">Stories {visibleStories}</span>
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-emerald-200">Food {visibleFood}</span>
          </div>
        </div>

        <div className="absolute right-6 top-6 z-30 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-white/10 bg-[#111116]/85 p-2 backdrop-blur-xl max-w-[340px]">
          {[
              { id: 'route', label: 'Show Route', action: onToggleRoute },
              { id: 'crowd', label: 'Show Crowd', action: onToggleCrowd },
              { id: 'food', label: 'Show Food Spots', action: onToggleFood },
          ].map((toggle) => (
            <button
              key={toggle.id}
              type="button"
                onClick={toggle.action}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${toggles[toggle.id as keyof typeof toggles] ? 'bg-white text-slate-950 shadow-lg' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
            >
              {toggle.label}
            </button>
          ))}
        </div>

        {activeStop && (
          <div className="absolute left-6 bottom-6 z-30 max-w-sm rounded-[1.6rem] border border-white/10 bg-[#111116]/85 p-4 backdrop-blur-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Current stop</p>
                <h3 className="mt-1 text-xl font-semibold text-white">{activeStop.title}</h3>
                <p className="mt-1 text-sm text-white/65">{activeStop.tagline ?? 'Smart route synced with your itinerary.'}</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                {activeStop.category}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-white/55">
              <MapPin size={12} className="text-[#f2ca50]" />
              Hover and tap pins to sync map + itinerary
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
