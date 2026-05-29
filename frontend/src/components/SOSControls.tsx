import { useNavigate } from 'react-router-dom'
import { Ambulance, Phone, PauseCircle, RefreshCw, Share2, X } from 'lucide-react'

type SOSControlsProps = {
  isPaused: boolean
  sessionId: string | null
  toggleCamera: () => void | Promise<void>
  toggleRecording: () => void
  endSession: () => Promise<void>
  error?: string | null
}

export default function SOSControls({ isPaused, sessionId, toggleCamera, toggleRecording, endSession, error }: SOSControlsProps) {
  const navigate = useNavigate()

  const callPolice = () => { window.location.href = 'tel:112' }
  const callAmbulance = () => { window.location.href = 'tel:108' }

  const shareAgain = async () => {
    const payload = sessionId ? `Emergency - I need help. SOS session: ${sessionId}` : 'Emergency - I need help.'
    if (navigator.share) {
      try { await navigator.share({ text: payload }); return }
      catch (e) {}
    }
    try { await navigator.clipboard.writeText(payload); alert('Location text copied') }
    catch { alert('Unable to share') }
  }

  const endSOS = async () => {
    await endSession()
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/launch')
  }

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 bg-[#111015]/94 backdrop-blur-2xl rounded-t-[1.6rem] shadow-[0_-8px_64px_-12px_rgba(0,0,0,0.46)] px-6 pt-6 pb-10 border-t border-white/5">
      <div className="max-w-7xl mx-auto flex flex-wrap justify-center gap-4">
        <button onClick={toggleCamera} className="bg-[#2f2d31] hover:bg-[#3a373e] text-[#f4eff2] px-5 py-3 rounded-full flex items-center gap-2 transition-all active:scale-95 border border-white/5 shadow-[0_10px_24px_rgba(0,0,0,0.18)] min-h-[40px]">
          <RefreshCw />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] leading-none">Switch Camera</span>
        </button>
        <button onClick={toggleRecording} className="bg-[#2f2d31] hover:bg-[#3a373e] text-[#f4eff2] px-5 py-3 rounded-full flex items-center gap-2 transition-all active:scale-95 border border-white/5 shadow-[0_10px_24px_rgba(0,0,0,0.18)] min-h-[40px]">
          <PauseCircle />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] leading-none">{isPaused ? 'Resume Recording' : 'Pause Recording'}</span>
        </button>
        <button onClick={callPolice} className="bg-[#ff9f08] text-[#351e00] px-5 py-3 rounded-full flex items-center gap-2 transition-all hover:opacity-90 active:scale-95 font-bold shadow-[0_10px_28px_rgba(255,159,15,0.30)] border border-[#ffb23d]/30 min-h-[40px]">
          <Phone />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] leading-none">Call Police</span>
        </button>
        <button onClick={callAmbulance} className="bg-[#ff9f08] text-[#351e00] px-5 py-3 rounded-full flex items-center gap-2 transition-all hover:opacity-90 active:scale-95 font-bold shadow-[0_10px_28px_rgba(255,159,15,0.30)] border border-[#ffb23d]/30 min-h-[40px]">
          <Ambulance />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] leading-none">Call Ambulance</span>
        </button>
        <button onClick={shareAgain} className="bg-[#2f2d31] hover:bg-[#3a373e] text-[#f4eff2] px-5 py-3 rounded-full flex items-center gap-2 transition-all active:scale-95 border border-white/5 shadow-[0_10px_24px_rgba(0,0,0,0.18)] min-h-[40px]">
          <Share2 />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] leading-none">Share Again</span>
        </button>
        <button onClick={endSOS} className="bg-[#f7b7b0] text-[#4f1114] px-8 py-3 rounded-full flex items-center gap-2 transition-all hover:opacity-95 active:scale-95 font-bold shadow-[0_10px_30px_rgba(247,183,176,0.22)] ring-4 ring-[#f7b7ae]/20 border border-[#7c2a2d]/30 min-h-[40px]">
          <X />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] leading-none">End SOS</span>
        </button>
      </div>
      {error && <p className="mt-3 text-center text-[11px] text-[#ffb4ab]">{error}</p>}
    </div>
  )
}
