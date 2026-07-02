import React from 'react'
import { CheckCircle, Radio, Loader2 } from 'lucide-react'

type SOSStatusPanelProps = {
  completedSteps?: Set<'recording' | 'uploading' | 'contacts'>
}

export default function SOSStatusPanel({ completedSteps = new Set() }: SOSStatusPanelProps) {
  const isRecording = completedSteps.has('recording')
  const isUploading = completedSteps.has('uploading')
  const isContacts = completedSteps.has('contacts')

  return (
    <div className="bg-[#1a171c] rounded-[1.35rem] p-6 shadow-xl border border-white/5">
      <h3 className="text-xs font-bold uppercase tracking-[0.28em] mb-6 text-[#c8c2cb]">Live Protocol Status</h3>
      <ul className="space-y-4">
        {/* Step 1: Recording */}
        <li className="flex items-center gap-3">
          {isRecording ? (
            <CheckCircle className="text-[#ffab1a] text-xl drop-shadow-[0_0_10px_rgba(255,171,26,0.18)]" />
          ) : (
            <Loader2 className="text-[#a7c4ff] text-xl animate-spin" />
          )}
          <span className={`text-sm font-medium tracking-[0.04em] ${isRecording ? 'text-[#f2edf0]' : 'text-[#a7c4ff]'}`}>
            {isRecording ? 'Recording active' : 'Initializing camera/mic...'}
          </span>
        </li>

        {/* Step 2: Uploading */}
        <li className="flex items-center gap-3">
          {isUploading ? (
            <CheckCircle className="text-[#ffab1a] text-xl drop-shadow-[0_0_10px_rgba(255,171,26,0.18)]" />
          ) : isRecording ? (
            <Loader2 className="text-[#a7c4ff] text-xl animate-spin" />
          ) : (
            <Radio className="text-xl text-[#c8c2cb]/40" />
          )}
          <span className={`text-sm font-medium tracking-[0.04em] ${isUploading ? 'text-[#f2edf0]' : isRecording ? 'text-[#a7c4ff]' : 'text-[#c8c2cb]/50'}`}>
            {isUploading ? 'Evidence uploaded to vault' : isRecording ? 'Uploading live clips...' : 'Waiting for media stream...'}
          </span>
        </li>

        {/* Step 3: Contacts */}
        <li className="flex items-center gap-3">
          {isContacts ? (
            <CheckCircle className="text-[#ffab1a] text-xl drop-shadow-[0_0_10px_rgba(255,171,26,0.18)]" />
          ) : isUploading ? (
            <Loader2 className="text-[#a7c4ff] text-xl animate-spin" />
          ) : (
            <Radio className="text-xl text-[#c8c2cb]/40" />
          )}
          <span className={`text-sm font-medium tracking-[0.04em] ${isContacts ? 'text-[#f2edf0]' : isUploading ? 'text-[#a7c4ff]' : 'text-[#c8c2cb]/50'}`}>
            {isContacts ? 'Emergency contacts notified' : 'Prepping WhatsApp alerts...'}
          </span>
        </li>
      </ul>
    </div>
  )
}
