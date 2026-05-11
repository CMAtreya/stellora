import { TriangleAlert } from 'lucide-react'

type SmartAlertProps = {
  text: string
  onAccept: () => void
  onModify: () => void
  onDismiss: () => void
}

export default function SmartAlert({ text, onAccept, onModify, onDismiss }: SmartAlertProps) {
  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <TriangleAlert size={16} className="mt-0.5 text-[#f7d982]" />
        <div className="flex-1">
          <p className="text-sm text-white/90">{text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onAccept} className="rounded-full bg-[#f2ca50] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2f2404]">Accept</button>
            <button type="button" onClick={onModify} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">Modify</button>
            <button type="button" onClick={onDismiss} className="rounded-full border border-white/10 bg-transparent px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  )
}
