import { useEffect, useRef, useState, useMemo } from 'react'
import { ArrowDown, ArrowUp, Circle, ShieldAlert, AlertTriangle, Trash2, Plus, Video, Share2 } from 'lucide-react'
import SOSHeader from '../components/SOSHeader'
import SOSLiveBanner from '../components/SOSLiveBanner'
import SOSStatusPanel from '../components/SOSStatusPanel'
import SOSControls from '../components/SOSControls'
import { useSOSMediaSession } from '../hooks/useSOSMediaSession'
import { useGroup } from '../hooks/useGroup'
import { resolveApiPath } from '../lib/apiClient'
import { getLocalClips, deleteLocalClip } from '../lib/indexedDb'

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // metres
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return Math.round(R * c)
}

export default function SOS() {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null)
  
  // Local clips state
  const [archiveClearedAt, setArchiveClearedAt] = useState<number>(() => {
    try {
      const val = localStorage.getItem('triparc:sos:archive_cleared_at')
      return val ? parseInt(val, 10) : 0
    } catch {
      return 0
    }
  })

  const [hiddenClipIds, setHiddenClipIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('triparc:sos:hidden_clips')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  const [localClips, setLocalClips] = useState<Array<{ id: string; url: string; timestamp: number }>>([])

  // Emergency contact add-form states
  const [showAddForm, setShowAddForm] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactRel, setNewContactRel] = useState('')

  const sosMediaSession = useSOSMediaSession({
    onClipUploaded: (clipUrl) => {
      console.log('Automated 10s Clip uploaded:', clipUrl)
      // Prepend domain if relative
      let fullUrl = clipUrl
      if (fullUrl.startsWith('/')) {
        fullUrl = window.location.origin + fullUrl
      }
      void dispatchWhatsAppAlerts(fullUrl)
    }
  })
  const liveVideoRef = useRef<HTMLVideoElement | null>(null)

  // Contacts and group state
  const [contactsList, setContactsList] = useState<any[]>([])
  const [memberHistory, setMemberHistory] = useState<Record<string, { lat: number; lng: number; dist: number }>>({})
  const [nearbyAlerted, setNearbyAlerted] = useState<Array<{ name: string; distance: string; statusText: string; direction: 'toward' | 'away' | 'stationary' }>>([])

  const storedGroupId = typeof window !== 'undefined' ? window.localStorage.getItem('triparc:group_id') || undefined : undefined
  const { members } = useGroup(storedGroupId)

  useEffect(() => {
    document.title = 'TripArc SOS Active'
    document.documentElement.classList.add('dark')
    void fetchContacts()
    return () => { document.documentElement.classList.remove('dark') }
  }, [])

  // Geolocation tracking
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    let watchId: number | null = null
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        },
        () => {
          setCurrentLocation(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      ) as unknown as number
    } catch {
      setCurrentLocation(null)
    }

    return () => {
      try {
        if (watchId != null && navigator.geolocation.clearWatch) navigator.geolocation.clearWatch(watchId)
      } catch {}
    }
  }, [])

  // Live video feed binding
  useEffect(() => {
    const videoEl = liveVideoRef.current
    const stream = sosMediaSession.mediaStream
    if (videoEl) {
      if (!stream) {
        videoEl.srcObject = null
      } else {
        videoEl.srcObject = stream
        videoEl.muted = true
        void videoEl.play().catch(() => {})
      }
    }
  }, [sosMediaSession.mediaStream])

  // Destination and emergency numbers lookup
  const emergencyNumbers = useMemo(() => {
    try {
      const rawDraft = localStorage.getItem('triparc:seven-pillars:draft:v1')
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft)
        const destinations = parsed?.destinations || []
        if (destinations.length > 0) {
          const firstDest = destinations[0].location.toLowerCase()
          if (firstDest.includes('japan') || firstDest.includes('tokyo') || firstDest.includes('kyoto') || firstDest.includes('osaka')) {
            return { police: '110', ambulance: '119', label: 'Japan' }
          }
          if (firstDest.includes('india') || firstDest.includes('delhi') || firstDest.includes('mumbai') || firstDest.includes('bangalore') || firstDest.includes('pune') || firstDest.includes('kerala')) {
            return { police: '112', ambulance: '112', label: 'India' }
          }
          if (firstDest.includes('us') || firstDest.includes('usa') || firstDest.includes('united states') || firstDest.includes('new york') || firstDest.includes('california')) {
            return { police: '911', ambulance: '911', label: 'United States' }
          }
          if (firstDest.includes('uk') || firstDest.includes('london') || firstDest.includes('united kingdom')) {
            return { police: '999', ambulance: '999', label: 'United Kingdom' }
          }
        }
      }
    } catch (e) {
      console.error('Error reading destination for emergency numbers:', e)
    }
    return { police: '112', ambulance: '112', label: 'India (Default)' }
  }, [])

  // Fetch registered emergency contacts
  const fetchContacts = async () => {
    try {
      const res = await fetch(resolveApiPath('/api/sos/contacts'))
      if (res.ok) {
        const data = await res.json()
        setContactsList(data)
        return data
      }
    } catch (err) {
      console.error('Failed to fetch emergency contacts:', err)
    }
    return []
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
        await fetchContacts()
        setShowAddForm(false)
        setNewContactName('')
        setNewContactPhone('')
        setNewContactRel('')
      }
    } catch (err) {
      console.error('Failed to add contact:', err)
    }
  }

  const handleDeleteContact = async (id: string) => {
    try {
      const res = await fetch(resolveApiPath(`/api/sos/contacts/${id}`), {
        method: 'DELETE'
      })
      if (res.ok) {
        await fetchContacts()
      }
    } catch (err) {
      console.error('Failed to delete contact:', err)
    }
  }

  // Load and sync local IndexedDB clips
  useEffect(() => {
    let active = true
    const loadClips = async () => {
      const clips = await getLocalClips()
      if (!active) return
      // Create local URLs for blobs
      const mapped = clips.map((c) => ({
        id: c.id,
        url: URL.createObjectURL(c.blob),
        timestamp: c.timestamp,
      }))
      // Filter out hidden clips and clips before archiveClearedAt
      const filtered = mapped.filter((c) => !hiddenClipIds.includes(c.id) && c.timestamp > archiveClearedAt)
      // Sort newest first
      const sorted = filtered.sort((a, b) => b.timestamp - a.timestamp)
      setLocalClips(sorted)
    }
    void loadClips()
    return () => {
      active = false
      localClips.forEach((c) => {
        try {
          URL.revokeObjectURL(c.url)
        } catch {}
      })
    }
  }, [sosMediaSession.uploadCount, sosMediaSession.backupSizeMb, archiveClearedAt, hiddenClipIds])

  const handleDeleteLocalClip = async (id: string) => {
    if (window.confirm("Are you sure you want to remove this clip from the screen? The video file will remain stored locally.")) {
      const nextHidden = [...hiddenClipIds, id]
      setHiddenClipIds(nextHidden)
      localStorage.setItem('triparc:sos:hidden_clips', JSON.stringify(nextHidden))
    }
  }

  const handleClearLocalArchive = async () => {
    if (window.confirm("Are you sure you want to clear all clips from the website frontend? All recordings remain stored locally in your browser's database and PC Videos folder.")) {
      const now = Date.now()
      setArchiveClearedAt(now)
      localStorage.setItem('triparc:sos:archive_cleared_at', String(now))
    }
  }

  // Dispatch WhatsApp Alerts
  const dispatchWhatsAppAlerts = async (latestClipUrl?: string) => {
    try {
      const contacts = await fetchContacts()
      // Sort by priority order
      contacts.sort((a: any, b: any) => (a.priority_order || 0) - (b.priority_order || 0))

      const trackingUrl = `${window.location.origin}/track/${sosMediaSession.sessionId}`
      let message = `EMERGENCY! I need help. Track my live location & video clips here: ${trackingUrl}`
      if (latestClipUrl) {
        message += `\nLatest video evidence: ${latestClipUrl}`
      }

      if (contacts.length === 0) {
        // Fallback generic share sheet
        if (navigator.share) {
          try {
            await navigator.share({ text: message })
          } catch {}
        }
        return
      }

      // Open wa.me link for each contact (staggered to handle browser tab blocking)
      contacts.forEach((c: any, index: number) => {
        const cleanPhone = c.phone_number.replace(/[^\d+]/g, '')
        const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
        setTimeout(() => {
          window.open(waLink, '_blank')
        }, index * 800)
      })

      sosMediaSession.addCompletedStep('contacts')
    } catch (err) {
      console.error('Failed to dispatch WhatsApp alerts:', err)
    }
  }

  // Trigger WhatsApp dispatch once session ID is populated
  const dispatchedRef = useRef(false)
  useEffect(() => {
    if (sosMediaSession.sessionId && !dispatchedRef.current) {
      dispatchedRef.current = true
      void dispatchWhatsAppAlerts()
    }
  }, [sosMediaSession.sessionId])

  // Get the latest clip URL from backend tracking endpoint
  const getLatestClipUrl = async () => {
    try {
      const res = await fetch(resolveApiPath(`/api/sos/track/${sosMediaSession.sessionId}`))
      if (res.ok) {
        const data = await res.json()
        const clips = data.clips || []
        if (clips.length > 0) {
          return clips[clips.length - 1].clip_url
        }
      }
    } catch (e) {
      console.error(e)
    }
    return undefined
  }

  // Handle Share Again click
  const handleShareAgain = async () => {
    const latestClipUrl = await getLatestClipUrl()
    void dispatchWhatsAppAlerts(latestClipUrl)
  }

  // Manual Share Evidence handler (Copies to clipboard or opens share sheet)
  const shareEvidence = async () => {
    const trackingUrl = `${window.location.origin}/track/${sosMediaSession.sessionId}`
    const payload = `EMERGENCY! I need help. Follow my live location & recorded clips here: ${trackingUrl}`
    if (navigator.share) {
      try {
        await navigator.share({ text: payload })
        return
      } catch (e) {}
    }
    try {
      await navigator.clipboard.writeText(payload)
      alert('Live tracking link copied to clipboard!')
    } catch {
      alert('Unable to copy/share.')
    }
  }

  // Proximity/Nearby Connections calculations
  useEffect(() => {
    if (!currentLocation || !members || !members.length) return

    setMemberHistory((prev) => {
      const next = { ...prev }
      const alertedList: typeof nearbyAlerted = []

      members.forEach((m) => {
        const selfUserId = window.localStorage.getItem('triparc:user_id') || ''
        if (m.user_id === selfUserId) return
        if (m.live_lat == null || m.live_lng == null) return

        const currentDist = haversineDistance(
          currentLocation.lat,
          currentLocation.lng,
          m.live_lat,
          m.live_lng
        )

        // Filter within a 5km radius
        if (currentDist > 5000) return

        const prevData = prev[m.user_id]
        let direction: 'toward' | 'away' | 'stationary' = 'stationary'
        let speed = 0

        if (prevData) {
          const distDiff = prevData.dist - currentDist
          if (distDiff > 1) {
            direction = 'toward'
            speed = Math.min(15, Math.round(distDiff * 1.5))
          } else if (distDiff < -1) {
            direction = 'away'
            speed = Math.min(15, Math.round(Math.abs(distDiff) * 1.5))
          }
        }

        next[m.user_id] = { lat: m.live_lat, lng: m.live_lng, dist: currentDist }

        const distanceLabel = currentDist < 1000 ? `${currentDist}m away` : `${(currentDist / 1000).toFixed(1)}km away`
        const statusText = direction === 'stationary'
          ? 'Stationary'
          : `${speed} km/h • ${direction === 'toward' ? 'Toward you' : 'Away from you'}`

        alertedList.push({
          name: m.display_name || m.user_id,
          distance: distanceLabel,
          statusText,
          direction,
        })
      })

      // Sort by closest distance
      alertedList.sort((a, b) => {
        const distA = parseFloat(a.distance) * (a.distance.includes('km') ? 1000 : 1)
        const distB = parseFloat(b.distance) * (b.distance.includes('km') ? 1000 : 1)
        return distA - distB
      })

      setNearbyAlerted(alertedList)
      return next
    })
  }, [members, currentLocation])

  return (
    <div className="min-h-screen bg-[#0b0b11] text-[#f1eced] selection:bg-[#ffb4ab]/30 relative overflow-hidden font-[Manrope]">
      <div
        className="aurora-bg"
        style={{
          position: 'fixed',
          background: 'radial-gradient(circle at 50% 18%, rgba(110, 20, 36, 0.34) 0%, rgba(11, 11, 17, 0) 46%), radial-gradient(circle at 72% 60%, rgba(24, 76, 145, 0.12) 0%, rgba(11, 11, 17, 0) 36%)',
          inset: 0,
          pointerEvents: 'none',
        }}
      />
      <SOSHeader />
      <main className="pt-20 pb-32 px-4 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        <section className="lg:col-span-8 flex flex-col gap-6">
          <SOSLiveBanner
            noiseLevelDb={sosMediaSession.noiseLevelDb}
            estimatedRoomDbSPL={sosMediaSession.estimatedRoomDbSPL}
            isCalibrating={sosMediaSession.isCalibrating}
            highDecibelAlert={sosMediaSession.highDecibelAlert}
            onCalibrate={sosMediaSession.calibrateLoudness}
          />
          {sosMediaSession.highDecibelAlert && (
            <div className="rounded-[1.1rem] border border-red-400/20 bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-100 shadow-[0_18px_45px_rgba(0,0,0,0.18)] flex items-center gap-2">
              <AlertTriangle className="text-red-400 animate-bounce" size={20} />
              High decibel alert: the microphone is detecting screaming or a very loud sound right now.
            </div>
          )}


          {/* Local Evidence Archive Panel */}
          <div className="bg-[#1b171d] rounded-xl p-6 shadow-xl border border-white/5 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Video className="text-[#ff9494] animate-pulse" size={20} />
                <h3 className="text-sm font-black uppercase tracking-[0.22em] text-[#cec7ce]">Local Evidence Archive</h3>
              </div>
              {localClips.length > 0 && (
                <button
                  onClick={handleClearLocalArchive}
                  className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-wider border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all"
                >
                  Clear Archive
                </button>
              )}
            </div>

            <p className="text-xs text-[#cec7ce]/80 leading-relaxed">
              Recorded clips are stored locally in your browser's database and on your PC at <code className="text-[#ffb4ab] bg-white/5 px-1 py-0.5 rounded">C:\Users\CHINMAYA M\Videos</code>. Clearing the archive hides them from the frontend UI while keeping files stored locally.
            </p>

            {localClips.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                <Video className="text-white/20 mb-2" size={32} />
                <p className="text-xs text-white/40 italic">Waiting for the first 10-second clip to record...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[320px] overflow-y-auto pr-1">
                {localClips.map((clip, index) => {
                  const dateStr = new Date(clip.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
                  return (
                    <div key={clip.id} className="bg-[#0b0b0d] border border-white/5 rounded-xl p-3 flex flex-col gap-3 group relative hover:border-white/10 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-white">Evidence Clip #{index + 1}</p>
                          <p className="text-[10px] text-[#cec7ce]/60 mt-0.5">Recorded at {dateStr}</p>
                        </div>
                        <button
                          onClick={() => handleDeleteLocalClip(clip.id)}
                          className="text-red-400/80 hover:text-red-400 transition-colors p-1"
                          title="Delete clip"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="aspect-video w-full rounded-lg overflow-hidden bg-black/40 border border-white/5 relative flex items-center justify-center">
                        <video src={clip.url} className="w-full h-full object-cover" controls playsInline />
                      </div>

                      <button
                        onClick={async () => {
                          let clipUrl = clip.url
                          try {
                            const latestClipUrl = await getLatestClipUrl()
                            if (latestClipUrl) {
                              clipUrl = latestClipUrl
                            }
                          } catch {}

                          void dispatchWhatsAppAlerts(clipUrl.startsWith('/') ? window.location.origin + clipUrl : clipUrl)
                        }}
                        className="w-full bg-[#25d366]/10 hover:bg-[#25d366]/20 text-[#25d366] rounded-lg py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border border-[#25d366]/20 flex items-center justify-center gap-1.5"
                      >
                        <Share2 size={12} />
                        Send clip via WhatsApp
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-4 flex flex-col gap-6">
          <SOSStatusPanel completedSteps={sosMediaSession.completedSteps} />

          <div className="bg-[#1b171d] rounded-xl p-6 shadow-xl flex-1 border border-white/5 flex flex-col justify-between gap-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-[#c9c2cb]">Access &amp; Monitoring</h3>
            
            <div className="space-y-6 flex-1">
              {/* Emergency Contacts */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold text-[#9fbbff] uppercase tracking-[0.22em] drop-shadow-[0_0_10px_rgba(159,187,255,0.18)]">Emergency Contacts</p>
                  {!showAddForm && (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="text-[9px] font-bold uppercase tracking-wider text-[#9fbbff] bg-[#9fbbff]/10 hover:bg-[#9fbbff]/15 px-2 py-1 rounded border border-[#9fbbff]/20 flex items-center gap-1 transition-all"
                    >
                      <Plus size={10} /> Add
                    </button>
                  )}
                </div>

                {contactsList.length === 0 ? (
                  <p className="text-xs text-[#c8c2cb]/60 italic">No contacts registered.</p>
                ) : (
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {contactsList.map((contact) => (
                      <div key={contact.id} className="flex justify-between items-center bg-[#0b0b0d] px-3 py-2 rounded-xl border border-white/5 group hover:border-white/10 transition-colors">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{contact.name}</p>
                          <p className="text-[9px] text-[#c8c2cb]/80 font-mono truncate">{contact.phone_number} {contact.relationship ? `• ${contact.relationship}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            onClick={() => handleDeleteContact(contact.id)}
                            className="text-red-400/80 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors"
                            title="Delete contact"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showAddForm && (
                  <div className="space-y-2 bg-[#0b0b0d] border border-white/5 rounded-xl p-3 shadow-inner">
                    <p className="text-[9px] font-bold text-white uppercase tracking-wider">New Emergency Contact</p>
                    <input
                      type="text"
                      placeholder="Name"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      className="w-full bg-[#1b171d] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#9fbbff]/30"
                    />
                    <input
                      type="text"
                      placeholder="Phone number"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      className="w-full bg-[#1b171d] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#9fbbff]/30"
                    />
                    <input
                      type="text"
                      placeholder="Relationship (e.g. Mom, Friend)"
                      value={newContactRel}
                      onChange={(e) => setNewContactRel(e.target.value)}
                      className="w-full bg-[#1b171d] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#9fbbff]/30"
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleAddContact}
                        disabled={!newContactName.trim() || !newContactPhone.trim()}
                        className="flex-1 bg-[#9fbbff] hover:bg-[#b5cdff] disabled:opacity-50 disabled:hover:bg-[#9fbbff] text-[#00285c] rounded-lg py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false)
                          setNewContactName('')
                          setNewContactPhone('')
                          setNewContactRel('')
                        }}
                        className="flex-1 border border-white/10 hover:bg-white/5 rounded-lg py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#c8c2cb] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Evidence Shared (Authorities panel relabeled) */}
              <div>
                <p className="text-[10px] font-bold text-[#ffb31a] uppercase mb-3 tracking-[0.22em] drop-shadow-[0_0_10px_rgba(255,179,26,0.16)]">Evidence ready to share</p>
                <div className="flex items-center gap-3 bg-[#0b0b0d] p-3 rounded-[1.2rem] border border-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                  <ShieldAlert className="text-[#ffb31a] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#f7f1f0] tracking-[0.06em] truncate">Emergency Tracking &amp; Clips</p>
                    <p className="text-[9px] text-[#c6c1c9] tracking-[0.1em] mt-0.5">Ready to share with authorities or contacts</p>
                  </div>
                  <button
                    onClick={shareEvidence}
                    className="bg-[#ffb31a]/10 hover:bg-[#ffb31a]/20 text-[#ffb31a] rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border border-[#ffb31a]/20 flex-shrink-0"
                  >
                    Share
                  </button>
                </div>
              </div>

              {/* Nearby Connections */}
              <div>
                <p className="text-[10px] font-bold text-[#c5c0c8] uppercase mb-3 tracking-[0.22em]">Nearby Connections (Alerted)</p>
                {nearbyAlerted.length === 0 ? (
                  <p className="text-xs text-[#c8c2cb]/60 italic">No group members nearby.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {nearbyAlerted.map((m, idx) => (
                      <div key={idx} className="bg-[#0b0b0d] p-2 rounded-[1.1rem] text-center border border-white/5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] flex flex-col justify-between min-h-[72px]">
                        <p className="text-xs font-bold text-[#f4eff0] truncate">{m.name}</p>
                        <p className="text-[9px] text-[#bdb7c1] font-mono">{m.distance}</p>
                        <div className="mt-1 flex items-center justify-center gap-1">
                          {m.direction === 'toward' ? (
                            <ArrowDown className="text-[10px] text-[#adc6ff] animate-bounce" />
                          ) : m.direction === 'away' ? (
                            <ArrowUp className="text-[10px] text-[#f7b7b0] animate-bounce" />
                          ) : (
                            <Circle className="text-[8px] text-[#c2bcc4]" />
                          )}
                          <p className="text-[8px] font-bold text-[#adc6ff] uppercase tracking-[0.12em] truncate">{m.statusText}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Destination emergency number panel */}
            <div className="bg-[#1b171d]/85 rounded-[1.25rem] border border-white/5 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] mt-auto">
              <div className="flex justify-between items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[8px] uppercase tracking-widest text-[#cec7ce]/60 font-black">Active Trip Region</p>
                  <p className="text-xs font-bold text-white mt-0.5 truncate">{emergencyNumbers.label}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <span className="text-[9px] bg-red-500/10 text-red-400 font-bold px-1.5 py-1 rounded border border-red-500/15 uppercase font-mono">
                    POLICE: {emergencyNumbers.police}
                  </span>
                  <span className="text-[9px] bg-red-500/10 text-red-400 font-bold px-1.5 py-1 rounded border border-red-500/15 uppercase font-mono">
                    AMB: {emergencyNumbers.ambulance}
                  </span>
                </div>
              </div>
            </div>

            {/* Local IndexedDB storage backup size warning */}
            {sosMediaSession.backupSizeMb > 0 && (
              <div className="bg-[#1b171d]/60 border border-white/5 rounded-xl p-3 flex justify-between items-center text-xs">
                <span className="text-[#cec7ce]/80 uppercase tracking-wider font-bold text-[8px]">Local Backup Size</span>
                <span className={`font-mono font-bold text-[10px] ${sosMediaSession.backupSizeMb > 50 ? 'text-red-400' : 'text-[#a7c4ff]'}`}>
                  {sosMediaSession.backupSizeMb.toFixed(2)} MB {sosMediaSession.backupSizeMb > 50 && '• WARNING limit exceeded'}
                </span>
              </div>
            )}
          </div>
        </section>
      </main>

      <SOSControls
        isPaused={sosMediaSession.isPaused}
        sessionId={sosMediaSession.sessionId}
        toggleCamera={sosMediaSession.toggleCamera}
        toggleRecording={sosMediaSession.toggleRecording}
        endSession={sosMediaSession.endSession}
        error={sosMediaSession.error}
        policeNumber={emergencyNumbers.police}
        ambulanceNumber={emergencyNumbers.ambulance}
        onShareAgain={handleShareAgain}
      />
    </div>
  )
}
