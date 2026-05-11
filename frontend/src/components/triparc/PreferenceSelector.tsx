import type { ReactNode } from 'react'

type PreferenceSelectorProps = {
  label: string
  hint?: string
  children: ReactNode
}

export default function PreferenceSelector({ label, hint, children }: PreferenceSelectorProps) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#f2ca50]/85">{label}</p>
        {hint && <p className="mt-1 text-sm text-white/60">{hint}</p>}
      </div>
      {children}
    </section>
  )
}
