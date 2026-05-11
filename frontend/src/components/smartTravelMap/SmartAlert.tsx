import { ChevronRight } from 'lucide-react'

type SmartAlertProps = {
  text: string
  tone?: 'default' | 'warning'
}

export default function SmartAlert({ text, tone = 'default' }: SmartAlertProps) {
  return (
    <div className={`rounded-[1.4rem] border p-4 shadow-[0_18px_50px_-30px_rgba(0,0,0,1)] backdrop-blur-xl ${tone === 'warning' ? 'border-amber-300/20 bg-amber-400/10' : 'border-white/10 bg-white/[0.05]'}`}>
      <div className="flex gap-3">
        <div className={`mt-1 h-2.5 w-2.5 rounded-full ${tone === 'warning' ? 'bg-amber-300' : 'bg-[#f2ca50]'}`} />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded-full bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-950 transition hover:translate-y-[-1px]">Accept</button>
            <button className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/10">Modify</button>
            <button className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/10">
              Dismiss <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
