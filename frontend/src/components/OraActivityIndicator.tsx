import React, { useState, useEffect } from 'react'
import { useTripStore, tripStore } from '../store/tripStore'

export function OraActivityIndicator({ popupOpen = false }: { popupOpen?: boolean }) {
  const activityLog = useTripStore(state => state.activityLog)
  const [visible, setVisible] = useState(false)
  const [lastLogEntry, setLastLogEntry] = useState<any>(null)

  useEffect(() => {
    if (activityLog.length > 0) {
      const latest = activityLog[activityLog.length - 1]
      setLastLogEntry(latest)
      setVisible(true)

      // Auto-hide after 8 seconds
      const timer = setTimeout(() => {
        setVisible(false)
      }, 8000)

      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [activityLog])

  if (!visible || !lastLogEntry) return null

  const getActionText = () => {
    const { action, params } = lastLogEntry
    if (action === 'add_activity') return `added "${params.title}"`
    if (action === 'remove_activity') return `removed "${params.title}"`
    if (action === 'update_itinerary') {
      if (params.city) return `changed city to "${params.city}"`
      return `updated the itinerary`
    }
    if (action === 'set_budget') return `updated budget to ${params.amount} ${params.currency || 'USD'}`
    if (action === 'add_destination') return `set destination to "${params.destination}"`
    return `made a change`
  }

  return (
    <div className={`fixed ${popupOpen ? 'bottom-[540px]' : 'bottom-24'} right-6 z-[60] flex items-center gap-3 rounded-2xl bg-zinc-950/95 border border-white/10 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-xs text-white backdrop-blur-xl transition-all duration-300 min-w-[280px]`}>

      <div className="flex h-2 w-2 items-center justify-center rounded-full bg-blue-500 animate-pulse" />
      <div className="flex-1">
        <span className="text-slate-400 font-medium">ORA </span>
        <span className="text-slate-100 font-semibold">{getActionText()}</span>
      </div>
      <button
        onClick={() => {
          tripStore.undoLastAction()
          setVisible(false)
        }}
        className="text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider text-[10px] bg-blue-500/10 px-2.5 py-1.5 rounded transition-all"
      >
        Undo
      </button>
    </div>
  )
}
