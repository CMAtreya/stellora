import React from 'react'
import { Cpu } from 'lucide-react'

type SOSLiveBannerProps = {
  noiseLevelDb?: number
  estimatedRoomDbSPL?: number
  isCalibrating?: boolean
  highDecibelAlert?: boolean
  onCalibrate?: () => void | Promise<void>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export default function SOSLiveBanner({ noiseLevelDb = 42, estimatedRoomDbSPL = 45, isCalibrating = false, highDecibelAlert = false, onCalibrate }: SOSLiveBannerProps) {
  const level = clamp(noiseLevelDb, -60, 0)
  const fill = (base: number) => `${clamp(base + (level + 60) * 0.18, 4, 22)}px`

  return (
    <div className={`backdrop-blur-md rounded-[1.1rem] p-4 flex items-center justify-between border shadow-[0_18px_55px_rgba(0,0,0,0.22)] transition-colors ${highDecibelAlert ? 'bg-gradient-to-r from-[#6f1010] via-[#4f1014] to-[#220709]' : ''}`} style={{ background: highDecibelAlert ? undefined : 'linear-gradient(90deg, rgba(75, 12, 28, 0.80) 0%, rgba(44, 11, 27, 0.78) 68%, rgba(29, 9, 24, 0.76) 100%)', borderColor: highDecibelAlert ? 'rgba(255, 92, 92, 0.24)' : 'rgba(255, 180, 171, 0.08)' }}>
      <div className="flex items-center gap-3">
        <Cpu className="text-[#ffb4ab] drop-shadow-[0_0_12px_rgba(255,180,171,0.26)]" />
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.20em] text-[#ffb4ab] drop-shadow-[0_0_12px_rgba(255,180,171,0.22)]">Recording in progress (Audio + Video)</p>
          <p className="text-sm text-[#dfd8dd] tracking-[0.04em]">Your safety stream is being securely shared</p>
          <p className={`mt-1 text-[10px] font-bold uppercase tracking-[0.18em] ${highDecibelAlert ? 'text-[#ff9f9f]' : 'text-[#ffd9d6]'}`}>
            Estimated room loudness: {estimatedRoomDbSPL} dB SPL
          </p>
        </div>
      </div>
      <div className="flex gap-1">
        <span className="w-1 rounded-full bg-[#ffb4ab]/35" style={{ height: fill(4) }} />
        <span className="w-1 rounded-full bg-[#ffb4ab] shadow-[0_0_10px_rgba(255,180,171,0.26)]" style={{ height: fill(6) }} />
        <span className="w-1 rounded-full bg-[#ffb4ab]/20" style={{ height: fill(3) }} />
      </div>
      <div className="ml-4 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffd9d6]">
        {Math.round(level)} dBFS
      </div>
      {onCalibrate && (
        <button
          type="button"
          onClick={onCalibrate}
          disabled={isCalibrating}
          className="ml-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffd9d6] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCalibrating ? 'Calibrating...' : 'Calibrate Mic'}
        </button>
      )}
    </div>
  )
}
