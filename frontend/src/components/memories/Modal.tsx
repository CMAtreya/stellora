import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  widthClassName?: string
  headerActions?: ReactNode
}

export default function Modal({ open, title, onClose, children, widthClassName = 'max-w-xl', headerActions }: ModalProps) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal>
      <button
        aria-label="Close modal backdrop"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative z-10 w-full ${widthClassName} rounded-3xl border border-[#d4af37]/20 bg-[#151519]/85 p-6 shadow-2xl shadow-[#f2ca50]/10 backdrop-blur-2xl`}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="font-display text-2xl font-semibold text-white">{title}</h3>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:scale-105 hover:bg-white/10 hover:text-white"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
