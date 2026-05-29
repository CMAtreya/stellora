import React from 'react'
import { CheckCircle, Radio } from 'lucide-react'

export default function SOSStatusPanel() {
  return (
    <div className="bg-[#1a171c] rounded-[1.35rem] p-6 shadow-xl border border-white/5">
      <h3 className="text-xs font-bold uppercase tracking-[0.28em] mb-6 text-[#c8c2cb]">Live Protocol Status</h3>
      <ul className="space-y-4">
        <li className="flex items-center gap-3"><CheckCircle className="text-[#ffab1a] text-xl drop-shadow-[0_0_10px_rgba(255,171,26,0.18)]" /><span className="text-sm font-medium text-[#f2edf0] tracking-[0.04em]">Recording started</span></li>
        <li className="flex items-center gap-3"><CheckCircle className="text-[#ffab1a] text-xl drop-shadow-[0_0_10px_rgba(255,171,26,0.18)]" /><span className="text-sm font-medium text-[#f2edf0] tracking-[0.04em]">Uploading live evidence</span></li>
        <li className="flex items-center gap-3"><CheckCircle className="text-[#ffab1a] text-xl drop-shadow-[0_0_10px_rgba(255,171,26,0.18)]" /><span className="text-sm font-medium text-[#f2edf0] tracking-[0.04em]">Contacting police station</span></li>
        <li className="flex items-center gap-3"><div className="w-5 h-5 border-2 border-[#a7c4ff] border-t-transparent rounded-full animate-spin" /><span className="text-sm font-medium text-[#a7c4ff] tracking-[0.04em]">Alerting ambulance...</span></li>
        <li className="flex items-center gap-3 opacity-40"><Radio className="text-xl text-[#c8c2cb]" /><span className="text-sm font-medium text-[#c8c2cb]">Sharing with emergency contacts</span></li>
      </ul>
    </div>
  )
}
