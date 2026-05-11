import { supabase } from './supabaseClient'
import type { MediaItem } from '../components/memories/MediaGrid'

const BUCKET = 'triparc-memories'

export type MemoryAlbum = {
  id: string
  user_id: string
  title: string
  location: string
  is_public: boolean
  start_date: string | null
  end_date: string | null
  description: string | null
  created_at: string
}

export type PublicProfile = {
  user_id: string
  display_name: string | null
  username: string | null
  bio: string | null
  home_base: string | null
  avatar_url: string | null
  is_profile_public: boolean
  share_private_albums: boolean
  created_at: string
  updated_at: string
}

type MemoryMediaRow = {
  id: string
  album_id: string
  user_id: string
  media_type: 'image' | 'video'
  media_url: string
  storage_path: string
  width: number | null
  height: number | null
  caption: string | null
  is_favorite: boolean
  created_at: string
}

export type AlbumCreateInput = {
  title: string
  location: string
  startDate?: string
  endDate?: string
  description?: string
}

export type PublicProfileUpsertInput = {
  displayName?: string
  username?: string
  bio?: string
  homeBase?: string
  avatarUrl?: string
  isProfilePublic: boolean
  sharePrivateAlbums: boolean
}

export async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const userId = data.session?.user?.id
  if (!userId) throw new Error('Please sign in to manage memories.')
  return userId
}

function toMediaItem(row: MemoryMediaRow): MediaItem {
  return {
    id: row.id,
    type: row.media_type,
    src: row.media_url,
    alt: row.caption || 'Memory media',
    width: row.width ?? (row.media_type === 'video' ? 1600 : 1100),
    height: row.height ?? (row.media_type === 'video' ? 900 : 1400),
    caption: row.caption ?? undefined,
    liked: row.is_favorite,
  }
}

export function formatAlbumDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return 'Dates coming soon'
  const start = new Date(startDate)
  const end = new Date(endDate)
  const format = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${format.format(start)} - ${format.format(end)}`
}

export async function listAlbums(searchText?: string) {
  const userId = await getCurrentUserId()
  let query = supabase
    .from('memories_albums')
    .select('id,user_id,title,location,is_public,start_date,end_date,description,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (searchText?.trim()) {
    query = query.or(`title.ilike.%${searchText.trim()}%,location.ilike.%${searchText.trim()}%`)
  }

  const { data: albums, error } = await query
  if (error) throw error

  const albumRows = (albums ?? []) as MemoryAlbum[]
  const albumIds = albumRows.map((a) => a.id)

  let coverByAlbum: Record<string, string> = {}
  if (albumIds.length) {
    const { data: mediaRows, error: mediaErr } = await supabase
      .from('memories_media')
      .select('album_id,media_url,created_at')
      .in('album_id', albumIds)
      .order('created_at', { ascending: false })

    if (mediaErr) throw mediaErr

    for (const row of mediaRows ?? []) {
      if (!coverByAlbum[row.album_id]) {
        coverByAlbum[row.album_id] = row.media_url
      }
    }
  }

  return albumRows.map((album) => ({ ...album, coverImage: coverByAlbum[album.id] ?? '' }))
}

export async function createAlbum(input: AlbumCreateInput) {
  const userId = await getCurrentUserId()

  const { data, error } = await supabase
    .from('memories_albums')
    .insert({
      user_id: userId,
      title: input.title,
      location: input.location,
      is_public: false,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      description: input.description || null,
    })
    .select('id,user_id,title,location,is_public,start_date,end_date,description,created_at')
    .single()

  if (error) throw error
  return data as MemoryAlbum
}

export async function deleteAlbum(albumId: string) {
  const userId = await getCurrentUserId()

  const { data: mediaRows, error: mediaErr } = await supabase
    .from('memories_media')
    .select('storage_path')
    .eq('album_id', albumId)
    .eq('user_id', userId)

  if (mediaErr) throw mediaErr

  const storagePaths = (mediaRows ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path))

  if (storagePaths.length) {
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove(storagePaths)
    if (storageErr) {
      console.warn('Failed to remove album storage objects', storageErr)
    }
  }

  const { error } = await supabase
    .from('memories_albums')
    .delete()
    .eq('id', albumId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function getAlbumById(albumId: string) {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('memories_albums')
    .select('id,user_id,title,location,is_public,start_date,end_date,description,created_at')
    .eq('id', albumId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as MemoryAlbum | null) ?? null
}

export async function listAlbumMedia(albumId: string) {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('memories_media')
    .select('id,album_id,user_id,media_type,media_url,storage_path,width,height,caption,is_favorite,created_at')
    .eq('album_id', albumId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as MemoryMediaRow[]).map(toMediaItem)
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function uploadMedia(albumId: string, files: File[]) {
  if (!files.length) return []

  const userId = await getCurrentUserId()
  const uploadedRows = await Promise.all(
    files.map(async (file) => {
      const type = file.type.startsWith('video') ? 'video' : 'image'
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${sanitizeFileName(file.name)}`
      const storagePath = `${userId}/${albumId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { cacheControl: '86400', upsert: false })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

      const { data: row, error: insertErr } = await supabase
        .from('memories_media')
        .insert({
          album_id: albumId,
          user_id: userId,
          media_type: type,
          media_url: urlData.publicUrl,
          storage_path: storagePath,
          width: type === 'video' ? 1600 : 1100,
          height: type === 'video' ? 900 : 1400,
          caption: null,
          is_favorite: false,
        })
        .select('id,album_id,user_id,media_type,media_url,storage_path,width,height,caption,is_favorite,created_at')
        .single()

      if (insertErr) throw insertErr
      return row as MemoryMediaRow
    }),
  )

  return uploadedRows.map(toMediaItem)
}

export async function deleteMedia(mediaId: string) {
  const userId = await getCurrentUserId()

  const { data: row, error: fetchErr } = await supabase
    .from('memories_media')
    .select('id,storage_path,user_id')
    .eq('id', mediaId)
    .eq('user_id', userId)
    .single()

  if (fetchErr) throw fetchErr

  const storagePath = row?.storage_path as string | undefined
  if (storagePath) {
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove([storagePath])
    if (storageErr) {
      console.warn('Failed to remove from storage', storageErr)
    }
  }

  const { error } = await supabase.from('memories_media').delete().eq('id', mediaId).eq('user_id', userId)
  if (error) throw error
}

export async function toggleMediaFavorite(mediaId: string, nextValue: boolean) {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('memories_media')
    .update({ is_favorite: nextValue })
    .eq('id', mediaId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function toggleAlbumVisibility(albumId: string, nextValue: boolean) {
  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('memories_albums')
    .update({ is_public: nextValue })
    .eq('id', albumId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function getOwnPublicProfile() {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('triparc_public_profiles')
    .select('user_id,display_name,username,bio,home_base,avatar_url,is_profile_public,share_private_albums,created_at,updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as PublicProfile | null) ?? null
}

export async function upsertOwnPublicProfile(input: PublicProfileUpsertInput) {
  const userId = await getCurrentUserId()
  const payload = {
    user_id: userId,
    display_name: input.displayName?.trim() || null,
    username: input.username?.trim() || null,
    bio: input.bio?.trim() || null,
    home_base: input.homeBase?.trim() || null,
    avatar_url: input.avatarUrl?.trim() || null,
    is_profile_public: input.isProfilePublic,
    share_private_albums: input.sharePrivateAlbums,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('triparc_public_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id,display_name,username,bio,home_base,avatar_url,is_profile_public,share_private_albums,created_at,updated_at')
    .single()

  if (error) throw error
  return data as PublicProfile
}
