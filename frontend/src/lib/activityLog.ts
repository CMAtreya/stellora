import { supabase } from './supabaseClient'

type Meta = Record<string, any> | null | undefined

export async function logActivity(action: string, context: string, entityId?: string | null, meta?: Meta) {
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    await supabase.from('user_activity_log').insert({ action, context, entity_id: entityId ?? null, meta: meta ?? null })
  } catch (err) {
    console.warn('activity log failed', err)
  }
}

export async function logTelemetry(event: string, payload?: Meta) {
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    await supabase.from('user_telemetry').insert({ event, payload: payload ?? null })
  } catch (err) {
    console.warn('telemetry log failed', err)
  }
}
