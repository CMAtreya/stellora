import type { ReactNode } from 'react'
import TripArcNav from './TripArcNav'

type Props = {
  children: ReactNode
  mainClassName?: string
}

export default function TripArcShell({ children, mainClassName }: Props) {
  const base = 'relative z-10 mx-auto w-full max-w-none px-6 pb-14 pt-10 lg:px-12'
  return (
    <div className="relative min-h-screen bg-[#0B0B0F] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <TripArcNav />

      <main className={mainClassName ? `${base} ${mainClassName}` : base}>
        {children}
      </main>
    </div>
  )
}
