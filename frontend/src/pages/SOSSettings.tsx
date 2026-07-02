import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MdSettings,
  MdAccountCircle,
  MdLocationOn,
  MdVerifiedUser,
  MdCheckCircle,
  MdVideocam,
  MdMic,
  MdPhotoCamera,
  MdAutoAwesome,
  MdLocalHospital,
  MdLocalPolice,
  MdCall,
  MdDirections,
  MdMedicalServices,
  MdContactPhone,
  MdFavorite,
  MdPerson,
  MdChevronRight,
  MdAdd,
  MdEmergency,
  MdDelete,
} from 'react-icons/md'
import { resolveApiPath } from '../lib/apiClient'
import { useHoldToTrigger } from '../hooks/useHoldToTrigger'

export default function SOSSettings() {
  const navigate = useNavigate()
  const [recordingEnabled, setRecordingEnabled] = useState(() => {
    return localStorage.getItem('triparc:sos:recording_enabled') !== 'false'
  })
  const [now, setNow] = useState(() => new Date())

  // Dynamic contacts list
  const [contactsList, setContactsList] = useState<any[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactRel, setNewContactRel] = useState('')

  const fetchContacts = async () => {
    try {
      const res = await fetch(resolveApiPath('/api/sos/contacts'))
      if (res.ok) {
        const data = await res.json()
        setContactsList(data)
      }
    } catch (err) {
      console.error('Failed to fetch emergency contacts:', err)
    }
  }

  const handleAddContact = async () => {
    if (!newContactName.trim() || !newContactPhone.trim()) return
    try {
      const res = await fetch(resolveApiPath('/api/sos/contacts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newContactName.trim(),
          phone_number: newContactPhone.trim(),
          relationship: newContactRel.trim(),
          priority_order: contactsList.length + 1
        })
      })
      if (res.ok) {
        fetchContacts()
        setShowAddForm(false)
        setNewContactName('')
        setNewContactPhone('')
        setNewContactRel('')
      }
    } catch (err) {
      console.error('Failed to add emergency contact:', err)
    }
  }

  const handleDeleteContact = async (id: string) => {
    try {
      const res = await fetch(resolveApiPath(`/api/sos/contacts/${id}`), {
        method: 'DELETE'
      })
      if (res.ok) {
        fetchContacts()
      }
    } catch (err) {
      console.error('Failed to delete emergency contact:', err)
    }
  }

  const handleSOSTrigger = async () => {
    try {
      const res = await fetch(resolveApiPath('/api/sos/trigger'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerType: 'manual' })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.sessionId) {
          navigate(`/sos?session=${data.sessionId}`)
        }
      }
    } catch (err) {
      console.error('SOS trigger failed:', err)
      const fallbackId = crypto.randomUUID()
      navigate(`/sos?session=${fallbackId}`)
    }
  }

  const { progress, start, cancel } = useHoldToTrigger(3000, handleSOSTrigger)

  useEffect(() => {
    document.title = 'Safety Hub | THE CELESTIAL CURATOR'
    document.documentElement.classList.add('dark')
    void fetchContacts()

    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => {
      window.clearInterval(timer)
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const localTimeLabel = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0e0e0e] text-[#e5e2e1] antialiased font-[Manrope] pb-40">
      <div className="fixed top-[-100px] left-[-100px] h-[400px] w-[400px] rounded-full bg-[#4b8eff] opacity-15 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-100px] right-[-100px] h-[400px] w-[400px] rounded-full bg-[#8382ff] opacity-10 blur-[120px] pointer-events-none" />

      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/5 bg-[#131313]/60 px-6 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <span
            className="cursor-pointer text-[13px] font-black uppercase tracking-[-0.04em] text-zinc-100 transition-opacity hover:opacity-80"
            onClick={() => navigate('/sos')}
          >
            THE CELESTIAL CURATOR
          </span>
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#C1C6D7] transition-colors hover:bg-white/10"
            aria-label="Settings"
            onClick={() => navigate('/sos')}
          >
            <MdSettings size={24} />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#C1C6D7] transition-colors hover:bg-white/10"
            aria-label="Profile"
            onClick={() => navigate('/profile')}
          >
            <MdAccountCircle size={24} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 pb-32 pt-24 relative z-10">
        <section className="mb-8 pt-0.5">
          <div className="mb-1 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <p className="text-[10px] uppercase tracking-[0.1em] text-primary">Monitoring active</p>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-[#f6f3f2]">Safety Hub</h1>
          <p className="font-medium text-[#c1c6d7]">You&apos;re safe • All systems nominal</p>
        </section>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <div className="space-y-6 rounded-[1rem] border border-white/5 bg-[#1b1b1b]/60 p-6 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.01)]">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-[#c1c6d7]">Live Context</p>
                  <h2 className="text-xl font-bold text-[#f6f3f2]">Shinjuku, Tokyo</h2>
                  <p className="text-sm text-[#c1c6d7]/80">{localTimeLabel} local time</p>
                </div>
                <MdLocationOn className="text-[#adc6ff]" size={24} />
              </div>

              <div className="relative h-[400px] w-full overflow-hidden rounded-2xl border border-white/5 bg-[#111111] shadow-inner shadow-black/35 ring-1 ring-white/5">
                <img
                  alt="Dark aerial map of Shinjuku city grid at night with subtle blue highlights"
                  className="h-full w-full object-cover grayscale-[0.35] opacity-72 contrast-125 saturate-75 brightness-90"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBTprdUkfIwXz1yfQQ64aXB8zmSprWC-kPu58XFZqAJHKiCf6E_72L9NhzGHXrPIQsfStJsxgzyAFYAi2qKI2EH0u6_8YzgVkKP9S7_8QQBRmBDBC5HoQamGID8pHATUpyghplLQ6xZyydOSv75AYdUtA6kjoBxlY1wzIUdnL3J32wxOPC7j5d5j-m3qvYti1TIrraST5sPk3C3hVt9aRD_FbJqP8vjQi3n3747BNmazgQ381aF-3esDz5C7X8BjbcYauV8znLSkbI"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(173,198,255,0.16),transparent_35%),radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.06),transparent_52%)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111111]/92 via-[#171717]/52 to-[#1b1b1b]/18" />
                <div className="absolute left-1/3 top-1/2 h-8 w-8 animate-pulse rounded-full border border-[#adc6ff]/35 bg-[#adc6ff]/16" />
                <div className="absolute right-1/4 top-1/4 h-12 w-12 rounded-full border border-[#adc6ff]/18 bg-[#adc6ff]/8" />
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 rounded-full bg-[#2a2a2a] px-4 py-2 text-xs uppercase tracking-wider text-[#e5e2e1]">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Low crowd
                </div>
                <div className="flex items-center gap-2 rounded-full bg-[#2a2a2a] px-4 py-2 text-xs uppercase tracking-wider text-[#e5e2e1]">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Well-lit area
                </div>
                <div className="flex items-center gap-2 rounded-full bg-[#2a2a2a] px-4 py-2 text-xs uppercase tracking-wider text-[#e5e2e1]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#adc6ff]" /> Safe zone
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-6 rounded-[1rem] border border-white/5 bg-gradient-to-br from-[#1c1b1b]/60 to-[#2a2a2a]/60 p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.1em] text-[#c1c6d7]">Current Status</p>
                    <h3 className="text-2xl font-black text-green-400">LOW RISK</h3>
                  </div>
                  <MdVerifiedUser className="scale-125 text-green-400" size={24} />
                </div>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-[#c1c6d7]">
                    <MdCheckCircle className="text-green-400" size={18} />
                    Area verified safe by local data
                  </li>
                  <li className="flex items-center gap-3 text-sm text-[#c1c6d7]">
                    <MdCheckCircle className="text-green-400" size={18} />
                    No unusual activity detected
                  </li>
                  <li className="flex items-center gap-3 text-sm text-[#c1c6d7]">
                    <MdCheckCircle className="text-green-400" size={18} />
                    Connectivity stable (5G/Cloud synced)
                  </li>
                </ul>
              </div>

              <div className="space-y-4 rounded-[1rem] border border-white/5 bg-[#1c1b1b]/60 p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] uppercase tracking-[0.1em] text-[#c1c6d7]">People Nearby</h4>
                  <span className="rounded-full bg-[#adc6ff]/10 px-2 py-0.5 text-[8px] font-bold text-[#adc6ff]">GROUP SYNCED</span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full border border-[#adc6ff]/20">
                      <img alt="Avatar of Ananya" className="h-full w-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDUbLS1oYGdbBEHzSBhlH-pv9hJuIV82FhneHGlTJZp8MvNjgau6maIr78Qn97e2l2aHD9Td4Jiev8spkxLRPyszeMqIfowuRl6KizNkEoejZqRMs1rW550FKNy4WAGnuuFAwsUMZZkzHlAKNCOY7Q5t8VyGje2PQCTARP8OYacibOCZ3mTM037A_8EPEnyIH0RdN8h40wbY-mFYPP1GTq2gsk9QSKiDePC_kXABfEFIHquWrOHtPSds0CYonmJSRPzAq5DtGMGRWY" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#f6f3f2]">Ananya</p>
                      <p className="text-[10px] uppercase tracking-tighter text-[#c1c6d7]">500m away • Active</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full border border-[#adc6ff]/20">
                      <img alt="Avatar of Rohan" className="h-full w-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVGMJ4S_DaS_vyv51-xdaNy6pYFdDTtUvIH3c99RaNayaDev8jgh9PoAzd9By1g-z7TtPoJ0F3qPj4VSfC7U3vbZxgXwQTf-daJSvQfvbiadxNkOnhV7lvB5acPnh0oyVab5dVsnyfZ1KZzANjjdHzXz7ZunSZAhS5nzHlQRDPz2hTDi8UmWCS6zu1QGIey-uLAsAln4DP_2uMIJmd4xH3zxg6updGHHy2Msg_KN69XuOnj0ZDx_eiFy4IzJHA370k6FyicxrT5iA" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#f6f3f2]">Rohan</p>
                      <p className="text-[10px] uppercase tracking-tighter text-[#c1c6d7]">Same area • Active</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

              <div className="rounded-[1rem] border border-[#adc6ff]/10 bg-[#1c1b1b]/40 p-6 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#adc6ff]/20 text-[#adc6ff]">
                    <MdVideocam size={24} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#f6f3f2]">Emergency Recording: Ready</h4>
                    <p className="text-xs text-[#c1c6d7]">Auto-activation prepped</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRecordingEnabled((previous) => {
                    const next = !previous
                    localStorage.setItem('triparc:sos:recording_enabled', String(next))
                    return next
                  })}
                  className={`relative flex h-6 w-12 items-center rounded-full px-1 transition-colors duration-300 ${recordingEnabled ? 'bg-[#fe9400]' : 'border border-white/10 bg-[#2a2a2a]'}`}
                  aria-label="Toggle emergency recording preparation"
                >
                  <div className={`h-4 w-4 rounded-full bg-white transition-transform duration-300 ${recordingEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-[#c1c6d7]">
                Camera, audio &amp; location sharing are prepared. Tap SOS to activate instantly. Evidence is streamed in real-time to our secure vault.
              </p>
              <div className="flex items-center gap-4 border-t border-[#414755]/15 py-3">
                <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] transition-all duration-300 ${recordingEnabled ? 'text-[#adc6ff]' : 'text-[#c1c6d7]/40'}`}>
                  <MdMic size={14} /> Audio {recordingEnabled ? 'ready' : 'inactive'}
                </div>
                <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] transition-all duration-300 ${recordingEnabled ? 'text-[#adc6ff]' : 'text-[#c1c6d7]/40'}`}>
                  <MdPhotoCamera size={14} /> Lens {recordingEnabled ? 'active' : 'inactive'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-4">
            <div className="space-y-4 rounded-[1rem] border border-[#414755]/10 bg-[#1c1b1b]/60 p-6 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <MdAutoAwesome className="scale-75 text-[#ffbc7c]" size={24} />
                <h4 className="text-[10px] uppercase tracking-[0.1em] text-[#c1c6d7]">Ora Safety Insight</h4>
              </div>
              <p className="text-sm leading-relaxed italic text-[#c1c6d7]">
                "This area tends to get crowded after 10 PM. Consider leaving early or switching to the well-lit main avenue for your return route."
              </p>
            </div>

            <div className="space-y-6 rounded-[1rem] border border-white/5 bg-[#1c1b1b]/60 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-[#c1c6d7]">Rapid Response</p>
                  <h4 className="text-xl font-bold text-[#f6f3f2]">Nearby Services</h4>
                </div>
                <MdLocalHospital className="text-[#adc6ff]" size={24} />
              </div>
              <div className="space-y-4">
                <div className="space-y-4 rounded-xl border border-[#414755]/10 bg-[#2a2a2a]/40 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#adc6ff]/10 text-[#adc6ff]">
                        <MdLocalPolice size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#f6f3f2]">Shinjuku Police Station</p>
                        <p className="text-[10px] uppercase tracking-tighter text-[#c1c6d7]">450m away • 6 min walk</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" className="flex items-center justify-center gap-2 rounded-full border border-[#b7c8ff]/30 bg-[#adc6ff] py-2 text-[10px] font-bold uppercase tracking-wider text-[#00285c] transition-opacity hover:opacity-90">
                      <MdCall size={14} /> Call
                    </button>
                    <button type="button" className="flex items-center justify-center gap-2 rounded-full border border-[#414755]/30 py-2 text-[10px] font-bold uppercase tracking-wider text-[#c1c6d7] transition-colors hover:bg-white/5">
                      <MdDirections size={14} /> Navigate
                    </button>
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-[#414755]/10 bg-[#2a2a2a]/40 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffbc7c]/20 text-[#ffbc7c]">
                        <MdMedicalServices size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#f6f3f2]">Shinjuku Medical Center</p>
                        <p className="text-[10px] uppercase tracking-tighter text-[#c1c6d7]">1.2km away • 5 min drive</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" className="flex items-center justify-center gap-2 rounded-full border border-[#b7c8ff]/30 bg-[#adc6ff] py-2 text-[10px] font-bold uppercase tracking-wider text-[#00285c] transition-opacity hover:opacity-90">
                      <MdCall size={14} /> Call
                    </button>
                    <button type="button" className="flex items-center justify-center gap-2 rounded-full border border-[#414755]/30 py-2 text-[10px] font-bold uppercase tracking-wider text-[#c1c6d7] transition-colors hover:bg-white/5">
                      <MdDirections size={14} /> Navigate
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 rounded-[1rem] border border-white/5 bg-[#1c1b1b]/60 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-[#c1c6d7]">Connection</p>
                  <h4 className="text-xl font-bold text-[#f6f3f2]">Emergency Contacts</h4>
                </div>
                <MdContactPhone className="text-[#adc6ff]" size={24} />
              </div>
              <div className="space-y-3">
                {contactsList.map((contact) => (
                  <div key={contact.id} className="group flex items-center justify-between rounded-xl border border-[#414755]/5 bg-[#2a2a2a]/40 p-3 transition-colors hover:bg-[#2a2a2a]/60">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#adc6ff]/10 text-[#adc6ff]">
                        {contact.priority_order === 1 ? <MdFavorite size={24} /> : <MdPerson size={24} />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#f6f3f2]">{contact.name}</p>
                        <p className="text-[10px] uppercase tracking-tighter text-[#c1c6d7]">
                          {contact.phone_number} {contact.relationship ? `• ${contact.relationship}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteContact(contact.id)}
                        className="rounded-full p-2 text-red-400/80 hover:bg-white/5 hover:text-red-400 transition-colors"
                        title="Delete contact"
                      >
                        <MdDelete size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {showAddForm ? (
                <div className="space-y-3 rounded-xl border border-white/5 bg-[#2a2a2a]/40 p-4">
                  <input
                    type="text"
                    placeholder="Name"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="w-full bg-[#1b1b1b] border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Phone number"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="w-full bg-[#1b1b1b] border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Relationship (e.g. Mother, Friend)"
                    value={newContactRel}
                    onChange={(e) => setNewContactRel(e.target.value)}
                    className="w-full bg-[#1b1b1b] border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddContact}
                      className="flex-1 bg-[#adc6ff] text-[#00285c] rounded-full py-2 text-[10px] font-bold uppercase tracking-wider"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="flex-1 border border-white/10 hover:bg-white/5 rounded-full py-2 text-[10px] font-bold uppercase tracking-wider text-[#c1c6d7]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-[#414755]/30 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c1c6d7] transition-all hover:bg-white/5 hover:text-white"
                >
                  <MdAdd size={18} />
                  Add New Contact
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <div className="pointer-events-none fixed bottom-0 left-0 z-50 w-full bg-gradient-to-t from-[#131313] via-[#131313]/90 to-transparent p-6">
        <div className="pointer-events-auto mx-auto max-w-[1400px] flex flex-col items-center justify-center">
          <div className="relative w-[130px] h-[130px] flex items-center justify-center">
            {/* SVG Progress Ring */}
            <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90 pointer-events-none">
              <circle
                cx="65"
                cy="65"
                r="58"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="6"
                fill="transparent"
              />
              <circle
                cx="65"
                cy="65"
                r="58"
                stroke="#fe9400"
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 58}
                strokeDashoffset={2 * Math.PI * 58 * (1 - progress)}
                strokeLinecap="round"
                className="transition-all duration-75"
              />
            </svg>
            <button
              type="button"
              onPointerDown={start}
              onPointerUp={cancel}
              onPointerLeave={cancel}
              className="flex h-[106px] w-[106px] flex-col items-center justify-center rounded-full bg-[#fe9400] text-[#2d1600] shadow-[0_24px_60px_rgba(254,148,0,0.34)] transition-all active:scale-[0.96] select-none"
            >
              <MdEmergency className="text-[32px] animate-pulse" size={32} />
              <span className="text-[1.3rem] font-black tracking-[0.1em] mt-1">SOS</span>
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.32em] text-[#c1c6d7] opacity-80">Hold 3 seconds for silent alert</p>
        </div>
      </div>
    </div>
  )
}
