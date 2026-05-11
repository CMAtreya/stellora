type MealType = 'breakfast' | 'lunch' | 'snacks' | 'dinner'

type MealOption = {
  name: string
  category?: string
  address?: string
  lat?: number
  lng?: number
  type?: string
}

type Props = {
  open: boolean
  mealPlan: Record<MealType, boolean>
  selectedMeals: Partial<Record<MealType, string | 'skip'>>
  mealOptions: Record<MealType, MealOption[]>
  onToggleMeal: (meal: MealType, enabled: boolean) => void
  onSelectMeal: (meal: MealType, value: string | 'skip') => void
  onContinue: () => void
}

const meals: Array<{ key: MealType; label: string; blurb: string }> = [
  { key: 'breakfast', label: 'Breakfast', blurb: 'Start the day light and near your first stop.' },
  { key: 'lunch', label: 'Lunch', blurb: 'Keep lunch aligned to your route and midday weather.' },
  { key: 'snacks', label: 'Snacks', blurb: 'Add a short reset break if the day runs long.' },
  { key: 'dinner', label: 'Dinner', blurb: 'Close the day with a comfortable, nearby meal.' },
]

export default function MealPlannerModal({ open, mealPlan, selectedMeals, mealOptions, onToggleMeal, onSelectMeal, onContinue }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#131317] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)]">
        <div className="border-b border-white/5 bg-gradient-to-r from-[#2563EB]/20 via-transparent to-[#06B6D4]/10 px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#06B6D4]">Meal planning</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Should we reserve meal slots for this timeline?</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#c3c6d7]">Choose which meals to include and pick a restaurant from the curated list. You can still skip any meal before finalizing.</p>
        </div>

        <div className="grid gap-4 px-6 py-6 lg:grid-cols-2">
          {meals.map((meal) => {
            const enabled = mealPlan[meal.key]
            const options = mealOptions[meal.key] || []
            const selectedValue = selectedMeals[meal.key] || ''
            return (
              <div key={meal.key} className="rounded-3xl border border-white/8 bg-[#1b1b1f] p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white">{meal.label}</h3>
                    <p className="text-sm text-[#c3c6d7]">{meal.blurb}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleMeal(meal.key, !enabled)}
                    className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] transition ${enabled ? 'bg-[#2563eb] text-white' : 'bg-white/5 text-[#c3c6d7]'}`}
                  >
                    {enabled ? 'Include' : 'Skip'}
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#c3c6d7]">Restaurant</label>
                  <select
                    disabled={!enabled}
                    value={selectedValue}
                    onChange={(event) => onSelectMeal(meal.key, event.target.value as string | 'skip')}
                    className="w-full rounded-2xl border border-white/8 bg-[#131317] px-4 py-3 text-sm text-white outline-none transition focus:border-[#2563EB]/50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <option value="">Choose a restaurant</option>
                    <option value="skip">Skip this meal</option>
                    {options.map((option) => (
                      <option key={option.name} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>

                  <div className="min-h-14 rounded-2xl border border-white/8 bg-white/5 p-3 text-xs text-[#c3c6d7]">
                    {selectedValue === 'skip'
                      ? 'Meal will be skipped in the final timeline.'
                      : selectedValue
                        ? `Selected ${selectedValue}.`
                        : options.length
                          ? `${options.length} restaurant options ready from your curated list.`
                          : 'No restaurant-type places were found in the curated list. The planner will use nearby options.'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#c3c6d7]">You can still drag, replace, and edit timing after generation.</p>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-full bg-gradient-to-r from-[#2563EB] to-[#06B6D4] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_0_28px_rgba(37,99,235,0.25)] transition hover:opacity-95"
          >
            Generate Timeline
          </button>
        </div>
      </div>
    </div>
  )
}
