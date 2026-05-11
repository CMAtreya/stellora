import { useNavigate } from 'react-router-dom'
import TripArcNav from '../components/TripArcNav'

export default function LostAndFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="bg-[#0B0B0F] font-[Inter] text-white antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

        .glass-edge-soft {
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
        }

        .premium-glass {
          background: rgba(28, 28, 30, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2C2C2E; border-radius: 10px; }

        .aurora-gradient-text {
          background: linear-gradient(to right, #2563EB, #06B6D4);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .aurora-glow {
          box-shadow: 0 0 20px rgba(37, 99, 235, 0.2);
        }

        .route-line-gradient {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: dash 3s ease-in-out forwards;
          filter: drop-shadow(0 0 8px rgba(37, 99, 235, 0.6)) drop-shadow(0 0 12px rgba(6, 182, 212, 0.4));
        }

        .route-line-sarah {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: dash 3.5s ease-in-out forwards;
          filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.6));
        }

        @keyframes dash {
          to { stroke-dashoffset: 0; }
        }

        @keyframes pulse-dot {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }

        .node-pulse::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 9999px;
          background: inherit;
          animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .map-obsidian {
          filter: brightness(0.4) contrast(1.4) grayscale(1);
        }

        .mini-map-glow {
          box-shadow: inset 0 0 40px rgba(0,0,0,0.8);
        }
      `}</style>

      <TripArcNav />

      <main className="mx-auto min-h-screen max-w-7xl px-6 pb-12 pt-6">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <section className="flex flex-col gap-6 md:col-span-8">
            <div className="aurora-glow premium-glass relative overflow-hidden rounded-2xl border-l-4 border-l-[#EF4444] p-6">
              <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#EF4444]/5 blur-3xl" />
              <div className="flex items-start gap-4">
                <div className="rounded-xl border border-[#EF4444]/20 bg-[#EF4444]/10 p-3">
                  <span className="material-symbols-outlined text-[#EF4444]">person_search</span>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-bold uppercase tracking-wider text-white">Lost &amp; Found Intelligence</span>
                    <span className="rounded-full bg-[#EF4444]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#EF4444]">Critical</span>
                  </div>
                  <p className="text-sm leading-snug text-zinc-400">
                    Friends <span className="font-semibold text-white">Leo &amp; Sarah</span> are separated. We&apos;ve identified a{' '}
                    <span className="aurora-gradient-text font-semibold">Shared Safety Meetup Point</span>.
                  </p>
                </div>
              </div>
            </div>

            <div className="group relative min-h-[500px] flex-grow overflow-hidden rounded-[2rem] border border-[#2C2C2E] bg-[#0B0B0F] shadow-2xl">
              <div className="absolute inset-0 bg-[#050505]">
                <img
                  alt="High contrast minimalist map of Kyoto"
                  className="map-obsidian h-full w-full object-cover opacity-40 transition-opacity duration-700"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCyrS7gDoF6DPpywd93Cy29-gCiz__riiqyNVNcBygm6wxLtEZV-AQhCZDo_P3vx1V2ZoTPWSymX3K5ncIKd_xgOjvptsOiVJoMSRZOzA_9XfCFP38m4-_okaDGPytyrJkNeLEbG603Gc1Y0N5Mwy3u-Gfm_eHOcAsqBdO_sZCZ01aOLad5IjtHCS3S2ShM1hxPbbC-_jxMy5Rp90TVRYO0k5uK_sUVolJTu0ipYPHpD0p0nnAT3VXIYRs0DEUKbesMvT85PwEgeIQ"
                />
              </div>

              <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 800 600">
                <defs>
                  <linearGradient id="routeGradientLeo" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2563EB" />
                    <stop offset="100%" stopColor="#06B6D4" />
                  </linearGradient>
                  <linearGradient id="routeGradientSarah" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#EF4444" />
                    <stop offset="100%" stopColor="#F97316" />
                  </linearGradient>
                </defs>
                <path className="route-line-gradient" d="M 576,480 L 520,369" fill="none" stroke="url(#routeGradientLeo)" strokeWidth="4" strokeLinecap="round" />
                <path className="route-line-sarah" d="M 680,240 L 520,369" fill="none" stroke="url(#routeGradientSarah)" strokeWidth="4" strokeLinecap="round" />
                <path className="route-line-gradient opacity-60" d="M 400,280 L 520,369" fill="none" stroke="url(#routeGradientLeo)" strokeWidth="3" strokeDasharray="8,8" strokeLinecap="round" />
              </svg>

              <div className="absolute left-6 right-6 top-6 z-40 flex items-center justify-between">
                <div className="flex gap-2">
                  <button className="premium-glass rounded-full px-4 py-2 text-[11px] font-bold text-white transition-colors hover:bg-white/10">
                    <span className="material-symbols-outlined mr-2 align-middle text-[14px]">layers</span>
                    Traffic
                  </button>
                  <button
                    className="rounded-full border border-[#EF4444]/40 bg-[#EF4444]/20 px-4 py-2 text-[11px] font-bold text-white backdrop-blur-md"
                    onClick={() => navigate('/timeline')}
                  >
                    <span className="material-symbols-outlined mr-2 align-middle text-[14px]">radar</span>
                    Lost &amp; Found (2)
                  </button>
                </div>
                <div className="ml-4 flex items-center gap-2 rounded-full border border-[#2C2C2E] bg-[#1C1C1E] px-3 py-1 shadow-lg">
                  <div className="flex items-center justify-center text-zinc-400">
                    <span className="material-symbols-outlined text-[18px]">search</span>
                  </div>
                  <input className="w-32 border-none bg-transparent p-0 text-[11px] text-white placeholder:text-zinc-400 focus:ring-0" placeholder="Username..." type="text" />
                  <button className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-sm shadow-[#2563EB]/20 transition-colors hover:bg-[#2563EB]/80">
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
              </div>

              <div className="absolute left-1/2 top-20 z-40 -translate-x-1/2">
                <div className="premium-glass rounded-full border border-white/20 px-3 py-1.5 shadow-xl">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white">Intercept at intersection - Walk 450m East</span>
                </div>
              </div>

              <div className="absolute left-[65%] top-[61.5%] z-30 -translate-x-1/2 -translate-y-1/2">
                <div className="group relative">
                  <div className="node-pulse relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#06B6D4] shadow-[0_0_15px_rgba(6,182,212,0.6)]">
                    <span className="material-symbols-outlined text-lg text-white">location_on</span>
                  </div>
                  <div className="absolute right-full top-1/2 z-50 mr-4 -translate-y-1/2 whitespace-nowrap rounded-xl border border-white/10 bg-[#1C1C1E]/90 px-3 py-2 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[14px] text-white">timer</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white">Safety Meetup Point</span>
                    </div>
                    <div className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-white/10 bg-[#1C1C1E]" />
                  </div>
                </div>
              </div>

              <div className="absolute left-[50%] top-[46%] z-30 -translate-x-1/2 -translate-y-1/2">
                <div className="group relative flex flex-col items-center">
                  <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-white ring-4 ring-[#2563EB]/20 transition-transform group-hover:scale-110">
                    <img
                      alt="User"
                      className="h-full w-full object-cover"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDL-EzadmbfXMqmEECzsE7bCU9rPy2rK-eyHW3Abe_SdIqcjUofxN3W8c-aPXrhYi3OJpRAXbVfeRGCVIDpwVv7zDPv0IQxUmK-33Z02QbWM3ty7P6OGScZhIGfrK_JVHt28PsDREV1EFjLVCjJCkAeUgCCiFuRd4eWm_ylFdnClv7YR1rG_yzipCPNSeCsMfbAkaX2jU3FApSQPJ5pXvjRtHaE691zDJPGWInHwMW_06H1tAN8EtWI9F8z_XZKm6LzdAMAxMmM5zI"
                    />
                  </div>
                  <div className="premium-glass mt-2 rounded-full border border-white/20 px-2 py-0.5">
                    <span className="text-[8px] font-bold uppercase tracking-tighter text-white">YOU</span>
                  </div>
                </div>
              </div>

              <div className="absolute left-[72%] top-[80%] z-30 -translate-x-1/2 -translate-y-1/2">
                <div className="group relative flex flex-col items-center">
                  <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-white ring-4 ring-[#06B6D4]/20 transition-transform group-hover:scale-110">
                    <img alt="Leo" className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80" />
                  </div>
                  <div className="premium-glass mt-2 rounded-full border border-white/20 px-2 py-0.5">
                    <span className="text-[8px] font-bold uppercase tracking-tighter text-white">LEO</span>
                  </div>
                </div>
              </div>

              <div className="absolute left-[85%] top-[40%] z-30 -translate-x-1/2 -translate-y-1/2">
                <div className="group relative flex flex-col items-center">
                  <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-white ring-4 ring-[#EF4444]/20 transition-transform group-hover:scale-110">
                    <img alt="Sarah" className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=160&q=80" />
                  </div>
                  <div className="premium-glass mt-2 rounded-full border border-white/20 px-2 py-0.5">
                    <span className="text-[8px] font-bold uppercase tracking-tighter text-white">SARAH</span>
                  </div>
                </div>
              </div>

              <div className="premium-glass absolute bottom-28 right-6 z-50 w-64 rounded-2xl p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 p-2">
                    <span className="material-symbols-outlined text-xl text-[#EF4444]">group_off</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold leading-tight text-white">Leo &amp; Sarah Separated</h4>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-400">Multi-path overlap detected. Shared meetup point active.</p>
                  </div>
                </div>
                <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 text-[11px] font-bold text-white shadow-lg shadow-[#2563EB]/30 transition-all hover:bg-[#2563EB]/90">
                  Navigate to Meetup
                  <span className="material-symbols-outlined text-sm">near_me</span>
                </button>
              </div>

              <div className="premium-glass absolute bottom-6 left-6 right-6 z-40 flex items-center justify-between rounded-2xl p-4">
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1C1C1E] bg-[#2563EB] text-[10px] font-bold shadow-lg">1</div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1C1C1E] bg-[#06B6D4] text-[10px] font-bold shadow-lg">2</div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#1C1C1E] bg-[#2C2C2E] text-[10px] font-bold shadow-lg">3</div>
                  </div>
                  <span className="text-xs font-medium text-white">Group Sync: 1/3 at location</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#EF4444]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Group Recovery Active</span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 md:col-span-4">
            <div className="overflow-hidden rounded-xl border border-[#2C2C2E] bg-[#1C1C1E] shadow-sm">
              <div className="relative h-56 w-full overflow-hidden bg-[#050505]">
                <img
                  alt="Higashiyama District Map Snippet"
                  className="map-obsidian h-full w-full object-cover opacity-60"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCyrS7gDoF6DPpywd93Cy29-gCiz__riiqyNVNcBygm6wxLtEZV-AQhCZDo_P3vx1V2ZoTPWSymX3K5ncIKd_xgOjvptsOiVJoMSRZOzA_9XfCFP38m4-_okaDGPytyrJkNeLEbG603Gc1Y0N5Mwy3u-Gfm_eHOcAsqBdO_sZCZ01aOLad5IjtHCS3S2ShM1hxPbbC-_jxMy5Rp90TVRYO0k5uK_sUVolJTu0ipYPHpD0p0nnAT3VXIYRs0DEUKbesMvT85PwEgeIQ"
                />
                <div className="mini-map-glow absolute inset-0" />

                <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                  <div className="relative">
                    <div className="node-pulse h-6 w-6 rounded-full border-2 border-white bg-[#2563EB] shadow-[0_0_15px_rgba(37,99,235,0.8)]" />
                    <div className="premium-glass absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/20 px-2 py-0.5">
                      <span className="text-[7px] font-black uppercase tracking-tighter text-white">You Are Here</span>
                    </div>
                  </div>
                </div>

                <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0B0B0F]/60 px-2.5 py-1 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22C55E]" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white">Live Tracking</span>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-1 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#2563EB]">location_on</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Current Location</span>
                </div>
                <h2 className="mb-2 font-[Manrope] text-2xl font-bold tracking-tight text-white">Higashiyama District</h2>
                <p className="text-sm leading-relaxed text-zinc-400">
                  Walking through the historic stone-paved streets of Old Kyoto. Headed towards Yasaka Pagoda.
                </p>
              </div>
            </div>

            <div className="premium-glass rounded-2xl border-l-4 border-l-[#2563EB] p-6">
              <h3 className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Recent Pulse</h3>
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#EF4444]" />
                  <div className="space-y-1">
                    <p className="text-[13px] font-bold leading-tight text-white">Live Proximity Alert</p>
                    <p className="text-[12px] text-zinc-400">Leo is <span className="font-semibold text-white">200m away</span> • Sarah is <span className="font-semibold text-white">450m away</span></p>
                    <p className="text-[10px] text-zinc-400/60">Updated just now</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563EB]" />
                  <div className="space-y-0.5">
                    <p className="text-[13px] font-bold leading-tight text-white">Meetup Point Broadcasted</p>
                    <p className="text-[11px] text-zinc-400">1m ago - Group sync established</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2563EB] to-[#06B6D4] py-4 font-bold text-white shadow-lg shadow-[#2563EB]/20 transition-all hover:opacity-90">
                Navigate to Meetup
                <span className="material-symbols-outlined text-sm">near_me</span>
              </button>
              <button className="w-full rounded-full border border-[#2C2C2E] bg-[#1C1C1E] py-3 text-xs font-bold text-white transition-all hover:bg-white/5">
                Broadcast Voice Alert
              </button>
            </div>
          </section>
        </div>
      </main>

      <nav className="fixed bottom-8 left-1/2 z-[100] flex min-w-[320px] -translate-x-1/2 items-center gap-8 rounded-full border border-[#2C2C2E] bg-[#1C1C1E]/80 px-6 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl md:hidden">
        <button className="flex flex-col items-center justify-center p-3 text-zinc-400 transition-all hover:text-white">
          <span className="material-symbols-outlined">home</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-widest">Home</span>
        </button>
        <button className="flex scale-110 flex-col items-center justify-center rounded-full bg-[#2563EB] p-3 text-white shadow-lg shadow-[#2563EB]/40">
          <span className="material-symbols-outlined">map</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-widest">Map</span>
        </button>
        <button className="flex flex-col items-center justify-center p-3 text-zinc-400 transition-all hover:text-white">
          <span className="material-symbols-outlined">auto_stories</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-widest">Stories</span>
        </button>
      </nav>
    </div>
  )
}
