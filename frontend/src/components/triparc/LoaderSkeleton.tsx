export default function LoaderSkeleton() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/70">Creating your personalized itinerary...</p>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="h-4 w-24 animate-pulse rounded bg-white/15" />
            <div className="mt-3 h-6 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-4 w-full animate-pulse rounded bg-white/10" />
            <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-white/10" />
            <div className="mt-5 h-32 animate-pulse rounded-2xl bg-gradient-to-r from-white/5 via-white/15 to-white/5" />
          </div>
        ))}
      </div>
    </div>
  )
}
