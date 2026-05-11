import { motion } from 'framer-motion'
import { Castle, Clock3, MapPin as Pin, Star, Store, UtensilsCrossed } from 'lucide-react'

type MapPinProps = {
  label: string
  price: string
  icon: string
  rating: string
  active?: boolean
  faded?: boolean
  story?: boolean
  x: string
  y: string
  onClick: () => void
}

export default function MapPin({ label, price, icon, rating, active, faded, story, x, y, onClick }: MapPinProps) {
  const iconNode =
    icon === 'food' ? <UtensilsCrossed size={15} /> : icon === 'heritage' ? <Castle size={15} /> : icon === 'shopping' ? <Store size={15} /> : <Pin size={15} />

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.98 }}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-[#111116]/90 px-3 py-2 text-left shadow-[0_16px_30px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl transition duration-300 ${active ? 'ring-1 ring-[#f2ca50]/45' : ''} ${faded ? 'opacity-40' : 'opacity-100'}`}
      style={{ left: x, top: y }}
    >
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#f2ca50] to-[#c7962f] text-[#2f2404] shadow-md shadow-[#f2ca50]/20">
          {iconNode}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{price}</span>
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/80">
          <Star size={11} className="text-[#f7d982]" />
          {rating}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-white/45">
        {story && <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5"><Clock3 size={10} /> audio story</span>}
      </div>
    </motion.button>
  )
}
