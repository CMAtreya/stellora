import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

type Mode = 'login' | 'signup'

type AuthState = {
  email: string
  password: string
  loading: boolean
  message: string
  error: string
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [state, setState] = useState<AuthState>({ email: '', password: '', loading: false, message: '', error: '' })
  const navigate = useNavigate()

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setState((s) => ({ ...s, loading: true, message: '', error: '' }))

    if (!state.email || !state.password) {
      setState((s) => ({ ...s, loading: false, error: 'Email and password are required.' }))
      return
    }

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: state.email, password: state.password })
      if (error) {
        setState((s) => ({ ...s, loading: false, error: error.message }))
        return
      }
      setState((s) => ({ ...s, loading: false, message: '' }))
      navigate('/launch')
    } else {
      const { error } = await supabase.auth.signUp({ email: state.email, password: state.password })
      if (error) {
        setState((s) => ({ ...s, loading: false, error: error.message }))
        return
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('triparc.profileSetupPrompt', '1')
      }
      setState((s) => ({ ...s, loading: false, message: 'Account created.' }))
      navigate('/launch')
    }
  }

  const handleMagicLink = async () => {
    setState((s) => ({ ...s, loading: true, message: '', error: '' }))
    if (!state.email) {
      setState((s) => ({ ...s, loading: false, error: 'Enter an email to send a magic link.' }))
      return
    }
    const { error } = await supabase.auth.signInWithOtp({ email: state.email, options: { emailRedirectTo: window.location.origin } })
    if (error) {
      setState((s) => ({ ...s, loading: false, error: error.message }))
      return
    }
    setState((s) => ({ ...s, loading: false, message: 'Magic link sent. Check your inbox.' }))
  }

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setState((s) => ({ ...s, loading: true, message: '', error: '' }))
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/launch`,
      },
    })
    if (error) {
      setState((s) => ({ ...s, loading: false, error: error.message }))
      return
    }
    setState((s) => ({ ...s, loading: false }))
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0e0e0e] font-[Manrope] text-[#e5e2e1] selection:bg-[#4b8eff]/40 selection:text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-[10%] -top-[10%] h-[60%] w-[60%] rounded-full bg-[#4b8eff]/20 blur-[120px]" />
        <div className="absolute -right-[5%] top-[40%] h-[50%] w-[50%] rounded-full bg-[#8382ff]/10 blur-[120px]" />
        <div className="absolute -bottom-[10%] left-[20%] h-[40%] w-[70%] rounded-full bg-[#fe9400]/5 blur-[120px]" />
      </div>

      <header className="fixed top-0 z-50 flex w-full items-center justify-between px-8 py-8">
        <div className="text-2xl font-black tracking-tighter text-[#adc6ff]">TRIPARC</div>
        <div className="hidden gap-8 md:flex">
          <span className="cursor-default text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Safety</span>
          <span className="cursor-default text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Support</span>
        </div>
      </header>

      <main className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 pt-28 lg:grid-cols-12">
        <section className="flex flex-col space-y-6 lg:col-span-7">
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[#2a2a2a] px-3 py-1">
            <Sparkles size={14} className="text-[#ffbc7c]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#ffbc7c]">New: AI Route Intelligence</span>
          </div>

          <h1 className="text-5xl font-extrabold leading-none tracking-tighter text-[#e5e2e1] md:text-7xl lg:text-8xl">
            Your journey
            <br />
            <span className="text-[#adc6ff]">starts here.</span>
          </h1>

          <p className="max-w-xl text-lg font-light leading-relaxed text-[#c1c6d7] md:text-xl">
            Unlock a world of curated experiences, intelligent navigation, and a global community of modern explorers.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-[#414755]/20 pt-8">
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Exclusive</span>
              <p className="text-sm font-semibold">12k+ Hidden Destinations</p>
            </div>
            <div>
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Concierge</span>
              <p className="text-sm font-semibold">24/7 AI-Travel Assistance</p>
            </div>
          </div>
        </section>

        <section className="group relative lg:col-span-5">
          <div className="absolute -inset-1 rounded-[1rem] bg-gradient-to-br from-[#adc6ff]/20 to-[#8382ff]/20 opacity-25 blur transition duration-1000 group-hover:opacity-40" />
          <div className="relative rounded-[1rem] bg-[#1c1b1b]/60 p-8 shadow-[0_64px_64px_-12px_rgba(0,0,0,0.5)] backdrop-blur-3xl md:p-12">
            <div className="flex gap-8 border-b border-[#414755]/25 pb-4">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`-mb-[18px] border-b-2 pb-4 text-xs font-bold uppercase tracking-[0.1em] transition-colors ${mode === 'login' ? 'border-[#adc6ff] text-[#adc6ff]' : 'border-transparent text-[#c1c6d7] hover:text-[#e5e2e1]'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`-mb-[18px] border-b-2 pb-4 text-xs font-bold uppercase tracking-[0.1em] transition-colors ${mode === 'signup' ? 'border-[#adc6ff] text-[#adc6ff]' : 'border-transparent text-[#c1c6d7] hover:text-[#e5e2e1]'}`}
              >
                Create Account
              </button>
            </div>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Email Address</label>
                <input
                  type="email"
                  value={state.email}
                  onChange={(e) => setState((s) => ({ ...s, email: e.target.value }))}
                  placeholder="explorer@triparc.com"
                  className="w-full rounded-[1rem] border-none bg-[#2a2a2a]/70 px-4 py-4 text-[#e5e2e1] placeholder:text-[#8b90a0] outline-none ring-0 transition focus:ring-1 focus:ring-[#adc6ff]/50"
                />
              </div>

              <div className="space-y-2">
                <div className="ml-1 flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Password</label>
                  <button
                    type="button"
                    onClick={handleMagicLink}
                    className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#c2c1ff] transition-colors hover:text-[#adc6ff]"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={state.password}
                    onChange={(e) => setState((s) => ({ ...s, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full rounded-[1rem] border-none bg-[#2a2a2a]/70 px-4 py-4 pr-12 text-[#e5e2e1] placeholder:text-[#8b90a0] outline-none ring-0 transition focus:ring-1 focus:ring-[#adc6ff]/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b90a0]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={state.loading}
                className="w-full rounded-full bg-gradient-to-r from-[#adc6ff] to-[#4b8eff] py-4 text-xs font-extrabold uppercase tracking-[0.1em] text-[#002e69] transition-all hover:shadow-[0_0_20px_rgba(75,142,255,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {state.loading ? 'Working...' : mode === 'login' ? 'Access Journey' : 'Create Account'}
              </button>
            </form>

            {(state.error || state.message) && (
              <div className={`mt-4 rounded-[1rem] border px-4 py-3 text-sm ${state.error ? 'border-red-400/50 bg-red-500/10 text-red-200' : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-100'}`}>
                {state.error || state.message}
              </div>
            )}

            <div className="relative mt-8 flex items-center gap-4">
              <div className="h-px flex-grow bg-[#414755]/20" />
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7]">Or continue with</span>
              <div className="h-px flex-grow bg-[#414755]/20" />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <button
                type="button"
                disabled={state.loading}
                onClick={() => handleOAuth('google')}
                className="flex items-center justify-center gap-3 rounded-full border border-[#414755]/20 bg-[#2a2a2a]/70 py-3 transition-colors hover:bg-[#353534] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <img
                  alt="Google"
                  className="h-5 w-5"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCLhX77k5gX3XTOpdybPDhobmbAmT_-NtmLBqMEijuUVKooPKwsKVyf3ZruunfxlOaR3ffdQe8mA3-OLkRybPtUKvYVVQ8i07d67j0SV5TW_YPyuLBJc45Uf0bm3eUX79QHOn8LSWDyouiOAy1iOXc1dOy57xrhTK8PhuT7geC1dl6QVXd2xZzoeFF91LiHL2uwBAqI4wevxd7V4m8ACrtsm9pJYBDe2ZOQyoMjcbzwjKhRwdJidmOurfEzAf52tILFNDUidQcVOIY"
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Google</span>
              </button>
              <button
                type="button"
                disabled={state.loading}
                onClick={() => handleOAuth('apple')}
                className="flex items-center justify-center gap-3 rounded-full border border-[#414755]/20 bg-[#2a2a2a]/70 py-3 transition-colors hover:bg-[#353534] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="text-xl"></span>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em]">Apple ID</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="fixed bottom-8 flex w-full flex-col items-center justify-between gap-4 px-8 md:flex-row">
        <div className="flex gap-6">
          <span className="cursor-default text-[9px] font-bold uppercase tracking-[0.1em] text-[#8b90a0]">Privacy Policy</span>
          <span className="cursor-default text-[9px] font-bold uppercase tracking-[0.1em] text-[#8b90a0]">Terms of Service</span>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#8b90a0]/70">© {new Date().getFullYear()} TRIPARC DIGITAL LTD. ALL RIGHTS RESERVED.</p>
      </footer>
    </div>
  )
}