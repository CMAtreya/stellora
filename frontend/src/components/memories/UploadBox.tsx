import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { ArrowUpToLine } from 'lucide-react'

type UploadBoxProps = {
  onUpload: (files: File[]) => void
}

export default function UploadBox({ onUpload }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [progressByFile, setProgressByFile] = useState<Record<string, number>>({})
  const clearTimerRef = useRef<number | null>(null)

  const hasProgress = useMemo(() => Object.keys(progressByFile).length > 0, [progressByFile])

  useEffect(() => {
    const values = Object.values(progressByFile)
    if (!values.length) return
    if (!values.every((value) => value >= 100)) return

    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current)
    }

    clearTimerRef.current = window.setTimeout(() => {
      setProgressByFile({})
    }, 850)

    return () => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current)
      }
    }
  }, [progressByFile])

  const beginFakeUpload = (files: File[]) => {
    onUpload(files)
    files.forEach((file, index) => {
      const key = `${file.name}-${index}`
      let value = 0
      setProgressByFile((prev) => ({ ...prev, [key]: 0 }))

      const timer = window.setInterval(() => {
        value += Math.round(Math.random() * 22)
        setProgressByFile((prev) => {
          const nextValue = Math.min(value, 100)
          const next = { ...prev, [key]: nextValue }
          if (nextValue >= 100) {
            window.clearInterval(timer)
          }
          return next
        })
      }, 180)
    })
  }

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDragActive(false)
    const files = Array.from(event.dataTransfer.files)
    if (!files.length) return
    beginFakeUpload(files)
  }

  const onSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    beginFakeUpload(files)
  }

  return (
    <section className="relative flex flex-col items-end gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={onSelectFiles}
      />

      <button
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`inline-flex h-12 w-12 items-center justify-center rounded-full border transition duration-300 ${dragActive ? 'border-[#f2ca50]/80 bg-[#f2ca50]/15 text-[#f7d982]' : 'border-white/12 bg-white/[0.05] text-white/80 hover:border-[#f2ca50]/45 hover:bg-white/[0.08] hover:text-white'}`}
        aria-label="Upload memories"
      >
        <ArrowUpToLine size={18} />
      </button>

      {hasProgress && (
        <div className="w-full max-w-sm space-y-3 rounded-2xl border border-white/10 bg-[#101015]/80 p-3 shadow-[0_18px_35px_-24px_rgba(0,0,0,1)] backdrop-blur-xl">
          {Object.entries(progressByFile).map(([fileName, progress]) => (
            <div key={fileName} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-white/70">
                <span className="truncate">{fileName}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[#f2ca50] to-[#d4af37] transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
