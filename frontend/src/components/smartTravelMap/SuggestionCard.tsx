type SuggestionCardProps = {
  name: string
  distance: string
  tagline: string
  image: string
}

export default function SuggestionCard({ name, distance, tagline, image }: SuggestionCardProps) {
  return (
    <button className="min-w-[210px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] text-left transition duration-300 hover:scale-[1.03] hover:bg-white/[0.06]">
      <div className="h-28 w-full bg-cover bg-center" style={{ backgroundImage: `url('${image}')` }} />
      <div className="p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-white/50">{distance}</p>
        <h4 className="mt-1 text-sm font-semibold text-white">{name}</h4>
        <p className="mt-1 text-xs text-white/65">{tagline}</p>
      </div>
    </button>
  )
}
