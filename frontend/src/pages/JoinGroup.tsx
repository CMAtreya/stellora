import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Users, Compass } from 'lucide-react'
import { resolveApiPath } from '../lib/apiClient'

export default function JoinGroupPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const code = searchParams.get('code') || ''

  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Generate a friendly default nickname if none entered yet
  useEffect(() => {
    const randomGuestNum = Math.floor(100 + Math.random() * 900)
    setDisplayName(`Explorer-${randomGuestNum}`)
  }, [])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code) {
      setError('No invite code found in the URL link.')
      return
    }

    setLoading(true)
    setError(null)

    const userId = window.localStorage.getItem('triparc:user_id') || undefined

    try {
      const res = await fetch(resolveApiPath('/api/groups/join'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group_code: code.trim(),
          display_name: displayName.trim() || 'Guest',
          user_id: userId,
        }),
      })

      const data = await res.json()

      if (res.ok && data?.group_id) {
        // Store group id and code
        window.localStorage.setItem('triparc:group_id', data.group_id)
        window.localStorage.setItem('triparc:group_code', code.trim())
        window.localStorage.setItem('triparc:is_group_host', 'false')
        
        // Save user ID to local storage if returned by backend and different
        if (data.member?.user_id) {
          window.localStorage.setItem('triparc:user_id', data.member.user_id)
        }

        setSuccess(true)
        setTimeout(() => {
          navigate('/lostandfound')
        }, 1200)
      } else {
        setError(data?.detail || 'Failed to join group. Check the invite code and try again.')
      }
    } catch (err) {
      console.error(err)
      setError('A network error occurred. Please make sure the backend server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0e0e0e] font-[Manrope] text-[#e5e2e1] selection:bg-[#4b8eff]/40 selection:text-white">
      {/* Background gradients */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-[10%] -top-[10%] h-[60%] w-[60%] rounded-full bg-[#4b8eff]/20 blur-[120px]" />
        <div className="absolute -right-[5%] top-[40%] h-[50%] w-[50%] rounded-full bg-[#06B6D4]/10 blur-[120px]" />
      </div>

      <header className="absolute top-0 z-50 flex w-full items-center justify-between px-8 py-8">
        <div className="text-2xl font-black tracking-tighter text-[#adc6ff]">TRIPARC</div>
      </header>

      <main className="relative z-10 w-full max-w-md px-6">
        <div className="group relative">
          {/* Card Border glow */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-[#4b8eff]/30 to-[#06B6D4]/30 opacity-25 blur transition duration-1000 group-hover:opacity-45" />
          
          <div className="relative rounded-3xl bg-[#1c1b1b]/60 p-8 shadow-[0_32px_64px_rgba(0,0,0,0.6)] backdrop-blur-3xl border border-white/5">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#06B6D4] text-white shadow-xl shadow-blue-500/20">
                <Users size={28} />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                Join Expedition
              </h1>
              <p className="mt-2 text-sm text-[#c1c6d7]">
                You have been invited to join a real-time coordination group.
              </p>
            </div>

            <form onSubmit={handleJoin} className="space-y-5">
              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#c1c6d7]">Invite Code</label>
                <input
                  type="text"
                  value={code}
                  disabled
                  placeholder="Invite Code (e.g. e1f4a9b2)"
                  className="w-full rounded-2xl border border-white/5 bg-[#2a2a2a]/40 px-4 py-3.5 text-[#e5e2e1] outline-none cursor-not-allowed opacity-60 font-mono text-center tracking-wider"
                />
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#c1c6d7]">Your Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alice"
                  className="w-full rounded-2xl border border-white/10 bg-[#2a2a2a]/60 px-4 py-3.5 text-[#e5e2e1] placeholder:text-[#8b90a0] outline-none transition focus:border-[#4b8eff]/50 focus:bg-[#2a2a2a]/80"
                />
              </div>

              <button
                type="submit"
                disabled={loading || success || !code}
                className="relative flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2563EB] to-[#06B6D4] py-4 text-xs font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-blue-500/20 transition-all hover:shadow-[0_0_20px_rgba(75,142,255,0.4)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Joining Group...
                  </>
                ) : success ? (
                  <>
                    <Compass size={16} className="animate-pulse" />
                    Success! Redirecting...
                  </>
                ) : (
                  'Join Group Coordination'
                )}
              </button>
            </form>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs text-red-300">
                {error}
              </div>
            )}

            {!code && (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-300">
                Warning: Missing invite code. Make sure your link contains <code className="bg-black/30 px-1 py-0.5 rounded font-mono">?code=...</code>.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
