import { supabase } from './supabaseClient'

export type TranslatorProfile = {
  user_id: string
  native_language: string
  target_language: string
  diet?: string
  budget?: string
  risk_tolerance?: string
  social_comfort?: string
  tone?: string
  created_at?: string
  updated_at?: string
}

export async function fetchTranslatorProfile(userId: string): Promise<TranslatorProfile | null> {
  const { data, error } = await supabase
    .from('translator_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function upsertTranslatorProfile(profile: TranslatorProfile): Promise<TranslatorProfile> {
  const { data, error } = await supabase
    .from('translator_profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) throw error
  return data
}
