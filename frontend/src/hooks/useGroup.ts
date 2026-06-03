import { useEffect, useRef, useState } from 'react'
import { resolveApiPath } from '../lib/apiClient'

type Member = {
  user_id: string
  display_name?: string
  live_lat?: number | null
  live_lng?: number | null
  accuracy?: number | null
  last_updated?: string | null
  is_lost?: boolean
}

export function useGroup(groupId?: string) {
  const [members, setMembers] = useState<Member[]>([])
  const [hostId, setHostId] = useState<string | null>(null)
  const watchRef = useRef<number | null>(null)
  const pollRef = useRef<number | null>(null)
  const supabaseRef = useRef<any>(null)

  useEffect(() => {
    if (!groupId) return

    let cancelled = false

    const fetchMembers = async () => {
      try {
        const res = await fetch(resolveApiPath(`/api/groups/live-members?group_id=${encodeURIComponent(groupId)}`))
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setMembers(Array.isArray(data.members) ? data.members : [])
        setHostId(data.host_id || null)
      } catch (err) {
        // ignore
      }
    }

    // Try to use Supabase realtime if configured via Vite env: VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
    const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL
    const SUPABASE_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY

    let unsub: (() => void) | null = null

    const setupRealtime = async () => {
      if (!SUPABASE_URL || !SUPABASE_KEY) return false
      try {
        const mod = await import('@supabase/supabase-js')
        const { createClient } = mod
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
        supabaseRef.current = supabase

        // initial fetch
        await fetchMembers()

        // subscribe to changes on `group_members` table for this group
        const channel = supabase.channel(`group-members-${groupId}`)
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, (payload: any) => {
          // refresh members on any change
          fetchMembers()
        })
        await channel.subscribe()

        unsub = async () => {
          try {
            await channel.unsubscribe()
          } catch (e) {}
        }
        return true
      } catch (err) {
        // supabase not available or failed to subscribe — fallback to polling
        return false
      }
    }

    ;(async () => {
      const realtimeOk = await setupRealtime()
      if (!realtimeOk) {
        fetchMembers()
        pollRef.current = window.setInterval(fetchMembers, 5000)
      }
    })()

    return () => {
      cancelled = true
      if (pollRef.current) window.clearInterval(pollRef.current)
      if (unsub) unsub()
    }
  }, [groupId])

  useEffect(() => {
    // optionally start geolocation sharing for the current user if a groupId exists
    if (!groupId) return
    if (!('geolocation' in navigator)) return

    let watchId: number | null = null
    try {
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            let batteryLevel: number | undefined = undefined
            try {
              if ('getBattery' in navigator) {
                const battery = await (navigator as any).getBattery()
                batteryLevel = Math.round(battery.level * 100)
              }
            } catch (e) {}

            // Consistent mock battery level (50-95%) for local testing based on user_id hash
            if (batteryLevel === undefined) {
              const uId = window.localStorage.getItem('triparc:user_id') || 'guest'
              let hash = 0
              for (let i = 0; i < uId.length; i++) hash += uId.charCodeAt(i)
              batteryLevel = 50 + (hash % 45)
            }

            const speedKmh = pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : 0

            const body = {
              group_id: groupId,
              user_id: window.localStorage.getItem('triparc:user_id') || undefined,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              battery: batteryLevel,
              speed: speedKmh,
            }
            await fetch(resolveApiPath('/api/groups/update-location'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          } catch (err) {
            // ignore
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 },
      ) as unknown as number
    } catch (err) {
      // ignore
    }

    return () => {
      try {
        if (watchId != null && navigator.geolocation.clearWatch) navigator.geolocation.clearWatch(watchId)
      } catch (e) {}
    }
  }, [groupId])

  return { members, hostId }
}

export async function createGroup() {
  const userId = typeof window !== 'undefined' ? window.localStorage.getItem('triparc:user_id') : null
  const res = await fetch(resolveApiPath('/api/groups/create'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Trip Group', created_by: userId }) })
  return res.json()
}

export async function joinGroup(code: string, displayName = 'You') {
  const userId = typeof window !== 'undefined' ? window.localStorage.getItem('triparc:user_id') : null
  const res = await fetch(resolveApiPath('/api/groups/join'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      group_code: code,
      display_name: displayName,
      user_id: userId || undefined
    })
  })
  return res.json()
}
