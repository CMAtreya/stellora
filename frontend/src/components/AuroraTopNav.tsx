import { Bell, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

type AuroraTopNavProps = {
  activeLabel?: 'Discover' | 'Setup' | 'Concierge' | 'Profile'
  avatarSrc?: string
  avatarAlt?: string
}

const navLinks = [
  { label: 'Discover', to: '/triparc' },
  { label: 'Setup', to: '/triparc/7pillars' },
  { label: 'Concierge', to: '/triparc/map' },
  { label: 'Profile', to: '/private-profile' },
] as const

export default function AuroraTopNav({
  activeLabel = 'Profile',
  avatarSrc = 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=120&q=80',
  avatarAlt = 'Profile avatar',
}: AuroraTopNavProps) {
  return (
    <nav className="fixed top-0 z-50 flex h-20 w-full items-center justify-between bg-[#0B0B0F]/60 px-8 shadow-2xl shadow-blue-900/10 backdrop-blur-xl">
      <Link to="/triparc" className="text-2xl font-bold tracking-tighter text-white font-headline">
        TripArc Aurora
      </Link>
      <div className="hidden items-center space-x-8 md:flex">
        {navLinks.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className={`text-sm transition-colors ${
              item.label === activeLabel ? 'border-b-2 border-blue-600 pb-1 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center space-x-6">
        <button className="rounded-full p-2 text-gray-400 transition-all hover:bg-white/5 active:scale-90" type="button" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <button className="rounded-full p-2 text-gray-400 transition-all hover:bg-white/5 active:scale-90" type="button" aria-label="Settings">
          <Settings size={18} />
        </button>
        <div className="h-10 w-10 overflow-hidden rounded-full border border-outline-variant/30">
          <img alt={avatarAlt} className="h-full w-full object-cover" src={avatarSrc} />
        </div>
      </div>
    </nav>
  )
}