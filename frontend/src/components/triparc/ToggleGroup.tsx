type ToggleOption = {
  value: string
  label: string
  icon?: React.ReactNode
}

type ToggleGroupProps = {
  options: ToggleOption[]
  value: string
  onChange: (value: string) => void
  segmented?: boolean
}

export default function ToggleGroup({ options, value, onChange, segmented = false }: ToggleGroupProps) {
  if (segmented) {
    return (
      <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${active ? 'bg-white text-slate-900 shadow-lg' : 'text-white/65 hover:text-white'}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-3">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${active ? 'border-[#f2ca50]/45 bg-[#f2ca50]/15 text-[#f7d982]' : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:text-white'}`}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
