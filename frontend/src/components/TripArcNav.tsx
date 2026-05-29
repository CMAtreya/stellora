import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const navItems = [
  { label: 'TripArc', to: '/triparc' },
  { label: 'Bucketlist', to: '/bucketlist' },
  { label: 'PreTrip', to: '/pretrip' },
  { label: 'OnTrip', to: '/ontrip' },
  { label: 'Smart Itinerary', to: '/smart-itinerary' },
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
      <header className="sticky top-0 z-40 w-full border-b border-[#1f1f23] bg-[#0B0B0F]/82 backdrop-blur-2xl">
        <div className="mx-auto flex w-full max-w-none items-center justify-between gap-6 px-6 py-4 text-sm font-semibold text-white md:px-10">
          <Link to="/triparc" className="flex items-center gap-2 text-lg tracking-[0.18em] uppercase">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg">
              <Sparkles size={16} />
            </span>
            TripArc
          </Link>
          <nav className="flex flex-1 items-center justify-center gap-8">
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
                  : item.label === 'Smart Itinerary'
                    ? (
                      location.pathname === '/smart-itinerary' ||
                      location.pathname.startsWith('/smart-itinerary/') ||
                      location.pathname === '/smart-itenarry' ||
                      location.pathname.startsWith('/smart-itenarry/') ||
                      location.pathname === '/triparc/smart-itinerary' ||
                      location.pathname.startsWith('/triparc/smart-itinerary/') ||
                      location.pathname === '/triparc/smart-itenarry' ||
                      location.pathname.startsWith('/triparc/smart-itenarry/')
                    )
                  : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

              const lafClass = active
                ? 'text-white border-b-2 border-[#2563EB] pb-1'
                : 'text-[#a1a1aa] hover:text-white'

              const defaultClass = active
                ? 'text-[#2563EB] border-b-2 border-[#2563EB] pb-1'
                : 'text-[#a1a1aa] hover:text-white'

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`transition-colors duration-200 ${item.label === 'LAF' ? lafClass : defaultClass}`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="flex items-center gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#a1a1aa] transition hover:bg-white/5 hover:text-white"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>
            <button
              onClick={handleProfileClick}
              className="h-10 w-10 overflow-hidden rounded-full border border-[#2c2c2e] bg-white/10 shadow-sm"
              aria-label="Open profile"
            >
              <img alt="User profile avatar" className="h-full w-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDL-EzadmbfXMqmEECzsE7bCU9rPy2rK-eyHW3Abe_SdIqcjUofxN3W8c-aPXrhYi3OJpRAXbVfeRGCVIDpwVv7zDPv0IQxUmK-33Z02QbWM3ty7P6OGScZhIGfrK_JVHt28PsDREV1EFjLVCjJCkAeUgCCiFuRd4eWm_ylFdnClv7YR1rG_yzipCPNSeCsMfbAkaX2jU3FApSQPJ5pXvjRtHaE691zDJPGWInHwMW_06H1tAN8EtWI9F8z_XZKm6LzdAMAxMmM5zI" />
            </button>
            <button
              onClick={handleLogout}
              className="hidden items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-white transition hover:border-white/35"
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

