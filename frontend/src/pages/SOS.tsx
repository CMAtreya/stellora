import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ShieldAlert, Circle } from 'lucide-react'
import SOSHeader from '../components/SOSHeader'
import SOSLiveBanner from '../components/SOSLiveBanner'
import SOSStatusPanel from '../components/SOSStatusPanel'
import SOSControls from '../components/SOSControls'
import LeafletMap from '../components/LeafletMap'
import { useSOSMediaSession } from '../hooks/useSOSMediaSession'

export default function SOS() {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  const sosMediaSession = useSOSMediaSession()
  const liveVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    document.title = 'TripArc SOS Active'
    document.documentElement.classList.add('dark')
    return () => { document.documentElement.classList.remove('dark') }
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    let watchId: number | null = null
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        },
        () => {
          setCurrentLocation(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      ) as unknown as number
    } catch {
      setCurrentLocation(null)
    }

    return () => {
      try {
        if (watchId != null && navigator.geolocation.clearWatch) navigator.geolocation.clearWatch(watchId)
      } catch {}
    }
  }, [])

  useEffect(() => {
    const videoEl = liveVideoRef.current
    const stream = sosMediaSession.mediaStream
    if (videoEl) {
      if (!stream) {
        videoEl.srcObject = null
      } else {
        videoEl.srcObject = stream
        void videoEl.play().catch(() => {})
      }
    }
  }, [sosMediaSession.mediaStream])

  return (
    <div className="min-h-screen bg-[#0b0b11] text-[#f1eced] selection:bg-[#ffb4ab]/30 relative overflow-hidden">
      <div
        className="aurora-bg"
        style={{
          position: 'fixed',
          background: 'radial-gradient(circle at 50% 18%, rgba(110, 20, 36, 0.34) 0%, rgba(11, 11, 17, 0) 46%), radial-gradient(circle at 72% 60%, rgba(24, 76, 145, 0.12) 0%, rgba(11, 11, 17, 0) 36%)',
        }}
      />
      <SOSHeader />
      <main className="pt-20 pb-32 px-4 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 flex flex-col gap-6">
          <SOSLiveBanner
            noiseLevelDb={sosMediaSession.noiseLevelDb}
            estimatedRoomDbSPL={sosMediaSession.estimatedRoomDbSPL}
            isCalibrating={sosMediaSession.isCalibrating}
            highDecibelAlert={sosMediaSession.highDecibelAlert}
            onCalibrate={sosMediaSession.calibrateLoudness}
          />
          {sosMediaSession.highDecibelAlert && (
            <div className="rounded-[1.1rem] border border-red-400/20 bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-100 shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
              High decibel alert: the microphone is detecting screaming or a very loud sound right now.
            </div>
          )}
          <div className="relative rounded-xl overflow-hidden aspect-video lg:aspect-auto lg:h-[500px] bg-[#0e0d12] shadow-[0_24px_90px_rgba(0,0,0,0.42)]">
            <video
              ref={liveVideoRef}
              className="w-full h-full object-cover opacity-80"
              autoPlay
              playsInline
              muted
            />
            <div className="absolute bottom-4 right-4 h-48 w-48 overflow-hidden rounded-[1.4rem] border border-white/10 ring-4 ring-black/20 shadow-[0_24px_60px_rgba(0,0,0,0.45)] z-10">
              <LeafletMap
                center={currentLocation ? [currentLocation.lat, currentLocation.lng] : [12.9716, 77.5946]}
                zoom={currentLocation ? 15 : 13}
                currentLocation={currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng, title: 'Your current location' } : undefined}
                locked
              />
            </div>

            <div className="absolute top-4 left-4 bg-[#08090d]/80 backdrop-blur-xl px-4 py-3 rounded-[1.2rem] flex items-center gap-4 border border-white/5 shadow-[0_18px_50px_rgba(0,0,0,0.35)] z-10">
              <div className="flex items-end gap-1 h-4">
                <div className="w-1 bg-[#adc6ff] rounded-full h-2 animate-pulse" />
                <div className="w-1 bg-[#adc6ff] rounded-full h-4" />
                <div className="w-1 bg-[#adc6ff] rounded-full h-3" />
                <div className="w-1 bg-[#adc6ff] rounded-full h-1" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-extrabold tracking-[0.22em] text-[#adc6ff] drop-shadow-[0_0_18px_rgba(173,198,255,0.32)]">Audio Active</p>
                <p className="text-[10px] text-[#cec7ce] font-medium tracking-[0.14em]">MIC LEVEL: {sosMediaSession.estimatedRoomDbSPL}dB SPL</p>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-4 flex flex-col gap-6">
          <SOSStatusPanel />
          <div className="bg-[#1b171d] rounded-xl p-6 shadow-xl flex-1 border border-white/5">
            <h3 className="text-xs font-bold uppercase tracking-[0.28em] mb-6 text-[#c9c2cb]">Access &amp; Monitoring</h3>
            {/* keep static contacts/nearby UI from original markup for now */}
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-bold text-[#9fbbff] uppercase mb-3 tracking-[0.22em] drop-shadow-[0_0_10px_rgba(159,187,255,0.18)]">emergency contacts (Viewing)</p>
                <div className="flex -space-x-3">
                  <img className="w-10 h-10 rounded-full border-2 border-surface-container-low" alt="Contact" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAFQLV0-TZCDpM62pBOE1vsv2B95h9fS5mGNG7oe8hys5GvZ4ePMnwSiBdAuPmCUJjuiB0mVtgPk3dRk_ep_a0fxI9B04B-FHc7mgFuDtrxZry0XZVjMnoIh9KfgRZkCLJF72_zdrySuXya0EOYlMskARHjm_GEHSiZryPxD6COfsffyuH49ppKN4E4AYCCBaAM8SggRDPCB-8zKqTuLHFZALBgw_NVkCDaYn3UxdePP9Wdp9AoA6tJ00fGC1SuRhFntSzi7NFLYTA" />
                  <img className="w-10 h-10 rounded-full border-2 border-surface-container-low" alt="Contact" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBxhk4uzsGkZIq0_rZ5N-IBbdAgQeD-xYiCe83a6feGfGqZo67AbHLeSHKWJjiDFVB-u-0lyXqvqm1FQKfXKe2hp_1lGDMpV1kEIL-mWeZDOM0EgrMzJbSLhgXC_qj-9Qh2zjTYJ683ZGpgceuz_Pmy2lrfKUndWKFwFdnsvuQM5IALOU2ExjIeThhIKzeTOCVt-usbyLYj2r4XfOVncJyghas4fUblcmqxAUQNqDaLjdKBixZ0FBEI5-EiDYI_UnG11u6U8r0e--I" />
                  <div className="w-10 h-10 rounded-full bg-[#3b3941] flex items-center justify-center text-xs font-bold border-2 border-surface-container-low text-[#f3eef0] shadow-[0_0_24px_rgba(255,255,255,0.04)]">+3</div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[#ffb31a] uppercase mb-3 tracking-[0.22em] drop-shadow-[0_0_10px_rgba(255,179,26,0.16)]">Authorities (Evidence Shared)</p>
                <div className="flex items-center gap-3 bg-[#0b0b0d] p-3 rounded-full border border-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                  <ShieldAlert className="text-[#ffb31a]" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-[#f7f1f0] tracking-[0.06em]">Metropolitan Dispatch</p>
                    <p className="text-[10px] text-[#c6c1c9] tracking-[0.18em]">CONNECTED • UPLOADING</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[#c5c0c8] uppercase mb-3 tracking-[0.22em]">Nearby Connections (Alerted)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#0b0b0d] p-2 rounded-[1.1rem] text-center border border-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                    <p className="text-xs font-medium text-[#f4eff0]">Marcus J.</p>
                    <p className="text-[9px] text-[#bdb7c1]">250m away</p>
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <ArrowDown className="text-[10px] text-[#adc6ff]" />
                      <p className="text-[8px] font-bold text-[#adc6ff] uppercase tracking-[0.12em]">4 km/h • Toward you</p>
                    </div>
                  </div>
                  <div className="bg-[#0b0b0d] p-2 rounded-[1.1rem] text-center border border-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                    <p className="text-xs font-medium text-[#f4eff0]">Sarah L.</p>
                    <p className="text-[9px] text-[#bdb7c1]">400m away</p>
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <Circle className="text-[10px] text-[#c2bcc4]" />
                      <p className="text-[8px] font-bold text-[#c2bcc4] uppercase tracking-[0.12em]">Stationary</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>
      </main>



      <SOSControls
        isPaused={sosMediaSession.isPaused}
        sessionId={sosMediaSession.sessionId}
        toggleCamera={sosMediaSession.toggleCamera}
        toggleRecording={sosMediaSession.toggleRecording}
        endSession={sosMediaSession.endSession}
        error={sosMediaSession.error}
      />
    </div>
  )
}
