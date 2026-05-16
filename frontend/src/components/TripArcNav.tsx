import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const navItems = [
  { label: 'TripArc', to: '/triparc' },
  { label: 'Bucketlist', to: '/bucketlist' },
  { label: 'PreTrip', to: '/pretrip' },
  { label: 'OnTrip', to: '/ontrip' },
  { label: 'LAF', to: '/lostandfound' },
  { label: 'Memories', to: '/triparc/memories' },
  { label: 'Translator', to: '/translator' },
]

export default function TripArcNav() {
  const location = useLocation()
  const navigate = useNavigate()

  const isLostAndFoundRoute = location.pathname === '/lostandfound' || location.pathname.startsWith('/triparc/lostandfound')

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  const handleProfileClick = () => {
    navigate('/private-profile')
  }

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-black/65 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-none items-center justify-between gap-6 px-6 py-4 text-sm font-semibold text-white md:px-10">
          <Link to="/triparc" className="flex items-center gap-2 text-lg tracking-[0.18em] uppercase">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg">
              <Sparkles size={16} />
            </span>
            TripArc
          </Link>
          <nav className="flex flex-1 items-center justify-center gap-4">
            {navItems.map((item) => {
              const active = item.label === 'LAF'
                ? isLostAndFoundRoute
                : item.label === 'PreTrip'
                  ? (
                    location.pathname === '/pretrip' ||
                    location.pathname.startsWith('/pretrip/') ||
                    location.pathname === '/triparc/pretrip' ||
                    location.pathname.startsWith('/triparc/pretrip/') ||
                    location.pathname === '/triparc/7pillars' ||
                    location.pathname.startsWith('/triparc/7pillars/') ||
                    location.pathname === '/7pillars' ||
                    location.pathname.startsWith('/7pillars/') ||
                    location.pathname === '/curate' ||
                    location.pathname.startsWith('/curate/') ||
                    location.pathname === '/triparc/curate' ||
                    location.pathname.startsWith('/triparc/curate/') ||
                    location.pathname === '/timeline' ||
                    location.pathname.startsWith('/timeline/') ||
                    location.pathname === '/triparc/timeline' ||
                    location.pathname.startsWith('/triparc/timeline/') ||
                    location.pathname === '/triparc/timeline-new' ||
                    location.pathname.startsWith('/triparc/timeline-new/')
                  )
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

              const lafClass = active
                ? 'bg-[#EF4444] text-white shadow-[0_0_20px_rgba(239,68,68,0.45)]'
                : 'text-white/85 hover:bg-[#EF4444]/20 hover:text-[#FCA5A5] active:bg-[#EF4444] active:text-white'

              const defaultClass = active
                ? 'bg-white text-slate-900 shadow-lg'
                : 'text-white/80 hover:bg-white/10'

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-full px-4 py-2 transition-all duration-200 ${item.label === 'LAF' ? lafClass : defaultClass}`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={handleProfileClick}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.16em] text-white transition hover:border-white/35"
            >
              Profile
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-white transition hover:border-white/35"
              aria-label="Log out"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>
      </header>
    </>
  )
}

