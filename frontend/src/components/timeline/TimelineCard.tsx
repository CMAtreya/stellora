type TimelineEntry = {
  id: string
  kind: 'place' | 'meal' | 'insight'
  title: string
  category?: string
  description?: string
  placeName?: string
  location?: string
  time?: string
  timeSlot?: string
  timeRangeLabel?: string
  durationMinutes?: number
  bestTimeLabel?: string
  weatherLabel?: string
  weather?: {
    tempC?: number | null
    condition?: string
    hour?: number
  }
  mealType?: 'breakfast' | 'lunch' | 'snacks' | 'dinner'
  note?: string
  skipped?: boolean
  photoUrl?: string
  placeId?: string
  lat?: number
  lng?: number
  rating?: number
}

type MealPlaceOption = {
  label: string
  name: string
  vicinity?: string
  lat?: number
  lng?: number
  rating?: number
  placeId?: string
  types?: string[]
}

type Props = {
  entry: TimelineEntry
  active?: boolean
  onDragStart?: (id: string) => void
  onDragOver?: (id: string, event: React.DragEvent<HTMLDivElement>) => void
  onDrop?: (id: string) => void
  onEditTime?: (id: string) => void
  onReplace?: (id: string) => void
  onMealSearchOpen?: (id: string) => void
  onMealSuggestNearby?: (id: string) => void
  onMealSearchChange?: (id: string, query: string) => void
  onMealSearchSelect?: (id: string, option: MealPlaceOption) => void
  onMealSearchClose?: () => void
  mealSearchActiveId?: string | null
  mealSearchQuery?: string
  mealSearchOptions?: MealPlaceOption[]
  mealSearchLoading?: boolean
  mealSearchError?: string
  mealSuggestionNote?: string
}

function formatWeatherLabel(tempC?: number | null, condition?: string) {
  const temp = typeof tempC === 'number' ? `${Math.round(tempC)}°C` : 'Weather-aware'
  const suffix = condition ? ` • ${condition}` : ''
  return `${temp}${suffix}`
}

export default function TimelineCard({
  entry,
  active,
  onDragStart,
  onDragOver,
  onDrop,
  onEditTime,
  onReplace,
  onMealSearchOpen,
  onMealSuggestNearby,
  onMealSearchChange,
  onMealSearchSelect,
  onMealSearchClose,
  mealSearchActiveId,
  mealSearchQuery,
  mealSearchOptions,
  mealSearchLoading,
  mealSearchError,
  mealSuggestionNote,
}: Props) {
  const isMeal = entry.kind === 'meal'
  const dragEnabled = entry.kind === 'place'
  const isMealEditorOpen = isMeal && mealSearchActiveId === entry.id

  return (
    <article
      draggable={dragEnabled}
      onDragStart={() => dragEnabled && onDragStart?.(entry.id)}
      onDragOver={(event) => dragEnabled && onDragOver?.(entry.id, event)}
      onDrop={() => dragEnabled && onDrop?.(entry.id)}
      className={`group relative overflow-hidden rounded-3xl border transition-all duration-300 ${isMeal ? 'border-[#4cd7f6]/15 bg-gradient-to-br from-[#1b1b1f] to-[#151519]' : active ? 'border-[#2563eb]/30 bg-[#1f1f23] shadow-[0_24px_50px_-28px_rgba(37,99,235,0.45)]' : 'border-[#434655]/15 bg-[#1b1b1f] hover:border-[#2563eb]/20 hover:bg-[#1f1f23]'} ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className={`absolute inset-0 pointer-events-none ${isMeal ? 'bg-[radial-gradient(circle_at_top_right,rgba(76,215,246,0.12),transparent_45%)]' : 'bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.1),transparent_45%)]'}`} />
      <div className="relative z-10 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border ${isMeal ? 'border-[#4cd7f6]/25 bg-[#4cd7f6]/10 text-[#acedff]' : 'border-white/10 bg-white/5 text-[#b4c5ff]'}`}>
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>{isMeal ? 'restaurant' : 'schedule'}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
              <span className={isMeal ? 'rounded-full border border-[#4cd7f6]/20 bg-[#4cd7f6]/10 px-2.5 py-1 text-[#acedff]' : 'rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[#c3c6d7]'}>
                {isMeal ? entry.mealType?.toUpperCase() : entry.bestTimeLabel || 'Best time to visit'}
              </span>
              {!isMeal && entry.weatherLabel && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[#c3c6d7]">
                  {entry.weatherLabel}
                </span>
              )}
              {!isMeal && entry.weather && (
                <span className="rounded-full border border-[#2563eb]/20 bg-[#2563eb]/10 px-2.5 py-1 text-[#b4c5ff]">
                  {formatWeatherLabel(entry.weather.tempC, entry.weather.condition)}
                </span>
              )}
              {isMeal && (
                <span className="rounded-full border border-[#4cd7f6]/20 bg-[#4cd7f6]/10 px-2.5 py-1 text-[#acedff]">
                  Recommended based on weather
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-black tracking-tight text-white md:text-2xl">{entry.title}</h3>
                {entry.category && (
                  <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#c3c6d7]">
                    {entry.category}
                  </span>
                )}
              </div>
              <p className="text-sm text-[#c3c6d7]">
                {entry.timeRangeLabel || entry.timeSlot || entry.time || 'Auto scheduled'}
                {entry.durationMinutes ? ` • ${entry.durationMinutes} min` : ''}
              </p>
              <p className="text-sm text-[#c3c6d7]/90">{isMeal ? (entry.skipped ? 'Skipped' : entry.placeName || entry.note || 'Select a restaurant') : entry.description}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#c3c6d7]">
            {!isMeal && entry.location && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{entry.location}</span>}
            {!isMeal && entry.lat != null && entry.lng != null && <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Geo tagged</span>}
            {isMeal && <span className="rounded-full border border-[#4cd7f6]/20 bg-[#4cd7f6]/10 px-3 py-1 text-[#acedff]">Meal card</span>}
          </div>

          <div className="flex items-center gap-2">
            {dragEnabled && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#c3c6d7]">
                Drag to reorder
              </span>
            )}
            {isMeal && (
              <>
                <button
                  type="button"
                  onClick={() => onMealSearchOpen?.(entry.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/10"
                  title="Search meal place"
                >
                  <span className="material-symbols-outlined text-sm">search</span>
                  Place
                </button>
                <button
                  type="button"
                  onClick={() => onMealSuggestNearby?.(entry.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/10"
                  title="Suggest nearest top-rated"
                >
                  <span className="material-symbols-outlined text-sm">info</span>
                  Suggest
                </button>
              </>
            )}
            {onEditTime && (
              <button type="button" onClick={() => onEditTime(entry.id)} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/10">
                Edit time
              </button>
            )}
            {onReplace && !isMeal && (
              <button type="button" onClick={() => onReplace(entry.id)} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/10">
                Replace
              </button>
            )}
          </div>
        </div>

        {isMealEditorOpen && (
          <div className="mt-3 rounded-2xl border border-[#4cd7f6]/20 bg-[#0f151a] p-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#acedff]">search</span>
              <input
                value={mealSearchQuery || ''}
                onChange={(e) => onMealSearchChange?.(entry.id, e.target.value)}
                placeholder="Search meal place..."
                className="w-full rounded-lg border border-white/10 bg-[#131317] px-3 py-2 text-sm text-white outline-none focus:border-[#4cd7f6]/60"
              />
              <button
                type="button"
                onClick={onMealSearchClose}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-white/80 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            {mealSearchLoading && <p className="mt-2 text-xs text-[#c3c6d7]">Searching places...</p>}
            {mealSearchError && <p className="mt-2 text-xs text-red-300">{mealSearchError}</p>}

            {(mealSearchOptions || []).length > 0 && (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-[#111318] p-1">
                {(mealSearchOptions || []).map((option, index) => (
                  <button
                    key={`${option.label}-${index}`}
                    type="button"
                    onClick={() => onMealSearchSelect?.(entry.id, option)}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs text-white/85 hover:bg-white/10"
                  >
                    <div className="font-semibold">{option.name}</div>
                    <div className="text-white/60">{option.vicinity || option.label}</div>
                    {typeof option.rating === 'number' && <div className="text-[#f7d982]">Rating {option.rating.toFixed(1)}</div>}
                  </button>
                ))}
              </div>
            )}

            {mealSuggestionNote && <p className="mt-2 text-xs text-[#acedff]">{mealSuggestionNote}</p>}
          </div>
        )}
      </div>
    </article>
  )
}
