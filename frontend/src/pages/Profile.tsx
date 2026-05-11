import Navbar from '../components/Navbar'

const preferences = [
  { label: 'Travel style', value: 'Calm + Curious' },
  { label: 'Language', value: 'English, Kannada' },
  { label: 'Offline packs', value: 'Mysore, Bengaluru' },
  { label: 'Group', value: 'Friends · 3 synced' },
]

export default function ProfilePage() {
  return (
    <div className="relative min-h-screen bg-dark-navy text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden>
        <div className="aurora-bg" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 pb-12 pt-6">
        <Navbar mode="triparc" status="On track" />

        <header className="mb-5">
          <p className="text-sm uppercase tracking-[0.2em] text-white/70">Profile</p>
          <h1 className="font-display text-4xl font-semibold">You, tuned</h1>
          <p className="text-white/70">Preferences and packs shared across both modes.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {preferences.map((p) => (
            <div key={p.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-white/60">{p.label}</p>
              <p className="text-white font-semibold">{p.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
