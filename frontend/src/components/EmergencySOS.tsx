import { useState } from 'react'
import { AlertTriangle, MapPin, PhoneCall, Share2, X } from 'lucide-react'

export default function EmergencySOS() {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<string>('')
  const [locStatus, setLocStatus] = useState<string>('')

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocStatus('Location not available on this device')
      return
    }
    setLocStatus('Grabbing location...')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const rounded = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        setCoords(rounded)
        setLocStatus('Location locked. Copy and share with responders.')
      },
      () => setLocStatus('Unable to fetch location right now'),
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
    )
  }

  const handleShare = async () => {
    if (!coords) {
      setLocStatus('Tap locate first')
      return
    }
    const payload = `Emergency - I need help. My location: ${coords}`
    if (navigator.share) {
      try {
        await navigator.share({ text: payload })
        setLocStatus('Shared')
        return
      } catch (err) {
        console.error(err)
      }
    }
    try {
      await navigator.clipboard.writeText(payload)
      setLocStatus('Copied to clipboard')
    } catch {
      setLocStatus('Copy not available')
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="w-[320px] rounded-2xl border border-red-200/60 bg-gradient-to-br from-red-700 via-red-600 to-rose-600 p-4 text-white shadow-2xl shadow-red-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em]">
              <AlertTriangle size={16} />
              Emergency SOS
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full bg-white/10 p-1 text-white hover:bg-white/20"
              aria-label="Close emergency panel"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-3 space-y-3 text-sm">
            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
              <PhoneCall size={16} />
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-white/70">Call</p>
                <a className="font-semibold text-white underline" href="tel:112">Call local emergency (112)</a>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
              <MapPin size={16} />
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.14em] text-white/70">Location</p>
                <p className="font-semibold text-white">{coords || 'No location yet'}</p>
                {locStatus && <p className="text-xs text-white/80">{locStatus}</p>}
              </div>
              <button
                onClick={handleLocate}
                className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-white/30"
              >
                Locate
              </button>
            </div>

            <button
              onClick={handleShare}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold uppercase tracking-[0.14em] text-red-700 shadow-lg hover:-translate-y-[1px]"
            >
              <Share2 size={16} /> Share location text
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-red-700 to-orange-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-white shadow-xl shadow-red-900/50 transition hover:-translate-y-[1px]"
        aria-label="Toggle emergency SOS"
      >
        <AlertTriangle size={16} /> SOS
      </button>
    </div>
  )
}
