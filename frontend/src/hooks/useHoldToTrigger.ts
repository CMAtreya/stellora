import { useCallback, useRef, useState } from 'react'

export function useHoldToTrigger(durationMs: number, onTrigger: () => void) {
  const [progress, setProgress] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const triggeredRef = useRef(false)

  const tick = useCallback(() => {
    if (startTimeRef.current === null) return
    const elapsed = Date.now() - startTimeRef.current
    const currentProgress = Math.min(1, elapsed / durationMs)
    setProgress(currentProgress)

    if (elapsed >= durationMs) {
      if (!triggeredRef.current) {
        triggeredRef.current = true
        onTrigger()
      }
      startTimeRef.current = null
      return
    }

    frameRef.current = requestAnimationFrame(tick)
  }, [durationMs, onTrigger])

  const start = useCallback((e: React.PointerEvent) => {
    // Only trigger on primary button (left click / touch)
    if (e.button !== 0) return
    triggeredRef.current = false
    startTimeRef.current = Date.now()
    setProgress(0)
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [tick])

  const cancel = useCallback(() => {
    startTimeRef.current = null
    setProgress(0)
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  return {
    progress,
    start,
    cancel,
    isTriggered: triggeredRef.current,
  }
}
