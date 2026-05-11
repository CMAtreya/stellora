import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Edit2,
  Globe2,
  Heart,
  Lock,
  MapPin,
  Navigation,
  Share2,
  Users,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import TripArcShell from '../components/TripArcShell'
import Modal from '../components/memories/Modal'
import {
  formatAlbumDateRange,
  getOwnPublicProfile,
  listAlbums,
  upsertOwnPublicProfile,
  type MemoryAlbum,
  type PublicProfile,
} from '../lib/memoriesApi'
import { supabase } from '../lib/supabaseClient'

const AVATAR_BUCKET = 'triparc-profiles'
const fallbackAvatar = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=500&q=80'

type EditForm = {
  displayName: string
  username: string
  bio: string
  homeBase: string
}

type TravelDNA = {
  archetypes: string[]
  dailyMovement: number
  energyProfile: number
  palate: string[]
  interests: string[]
  fitConnected: boolean
}

type WishlistPlace = {
  id: string
  name: string
  location: string
  photoUrl: string
  month: string
}

type AlbumWithCover = MemoryAlbum & {
  coverImage?: string
}

const archetypeOptions = [
  'Explorer',
  'Foodie',
  'Cultural',
  'Adventurer',
  'Nature Lover',
  'Night Owl',
  'Backpacker',
  'Luxury',
]

const palateOptions = [
  'Vegan',
  'Street Food',
  'Fusion',
  'Seafood',
  'Desserts',
  'Local Cuisine',
  'Fine Dining',
]

const interestOptions = [
  'Architecture',
  'Cafes',
  'History',
  'Art',
  'Hiking',
  'Museums',
  'Photography',
  'Shopping',
]

const defaultDNA: TravelDNA = {
  archetypes: ['Explorer', 'Foodie', 'Cultural'],
  dailyMovement: 0,
  energyProfile: 65,
  palate: ['Vegan', 'Street Food', 'Fusion'],
  interests: ['Architecture', 'Cafes', 'History'],
  fitConnected: false,
}

const mutuals = [
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80',
]

const voyageFriends = [
  {
    name: 'Leo Dubois',
    note: 'Met in Paris Expedition',
    image:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80',
  },
  {
    name: 'Amara Okafor',
    note: 'Met in Lagos Summit',
    image:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=160&q=80',
  },
  {
    name: 'Julian Voss',
    note: 'Met in Berlin Solo',
    image:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&q=80',
  },
  {
    name: 'Yuki Tanaka',
    note: 'Met in Osaka Trails',
    image:
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=160&q=80',
  },
]

export default function TripArcProfilePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [albums, setAlbums] = useState<AlbumWithCover[]>([])
  const [highlightMedia, setHighlightMedia] = useState<Array<{ id: string; media_url: string; caption: string | null }>>([])
  const [wishlistPlaces, setWishlistPlaces] = useState<WishlistPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [errorText, setErrorText] = useState('')
  const [successText, setSuccessText] = useState('')

  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({ displayName: '', username: '', bio: '', homeBase: '' })
  const [editSaving, setEditSaving] = useState(false)

  const [isEditingDNA, setIsEditingDNA] = useState(false)
  const [dnaSaving, setDnaSaving] = useState(false)
  const [travelDNA, setTravelDNA] = useState<TravelDNA>(defaultDNA)
  const [dnaDraft, setDnaDraft] = useState<TravelDNA>(defaultDNA)
  const [visibilitySaving, setVisibilitySaving] = useState<'profile' | 'albums' | null>(null)

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    setErrorText('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id

      const [profileRow, albumRows, mediaRows] = await Promise.all([
        getOwnPublicProfile(),
        listAlbums(),
        userId
          ? supabase
              .from('memories_media')
              .select('id,media_url,caption,is_favorite,created_at')
              .eq('user_id', userId)
              .order('is_favorite', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(12)
          : Promise.resolve({ data: [], error: null } as any),
      ])

      if ((mediaRows as any).error) {
        throw (mediaRows as any).error
      }

      setProfile(profileRow)
      setAlbums(albumRows)
      const mediaData = ((mediaRows as any).data ?? []) as Array<{ id: string; media_url: string; caption: string | null }>
      setHighlightMedia(mediaData)

      if (userId) {
        const stored = window.localStorage.getItem(`triparc.travelDNA.${userId}`)
        if (stored) {
          const parsed = JSON.parse(stored) as TravelDNA
          const next = {
            ...defaultDNA,
            ...parsed,
            archetypes: Array.isArray(parsed.archetypes) ? parsed.archetypes : defaultDNA.archetypes,
            palate: Array.isArray(parsed.palate) ? parsed.palate : defaultDNA.palate,
            interests: Array.isArray(parsed.interests) ? parsed.interests : defaultDNA.interests,
          }
          setTravelDNA(next)
          setDnaDraft(next)
        }
      }

      const wishlistData = await loadWishlistPreview()
      setWishlistPlaces(wishlistData)

      if (profileRow) {
        setEditForm({
          displayName: profileRow.display_name || '',
          username: profileRow.username || '',
          bio: profileRow.bio || '',
          homeBase: profileRow.home_base || '',
        })
      }
    } catch (err: any) {
      setErrorText(err?.message || 'Could not load profile.')
    } finally {
      setLoading(false)
    }
  }

  const loadWishlistPreview = async () => {
    try {
      const { data: lists, error: listErr } = await supabase
        .from('wishlists')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)

      if (listErr || !lists?.length) return []

      const { data: items, error: itemsErr } = await supabase
        .from('wishlist_items')
        .select('id,title,location,metadata,created_at')
        .eq('wishlist_id', lists[0].id)
        .order('created_at', { ascending: false })
        .limit(6)

      if (itemsErr) return []

      return (items ?? []).map((row: any, idx: number) => {
        const meta = (row.metadata ?? {}) as Record<string, any>
        return {
          id: String(row.id ?? idx),
          name: String(row.title ?? meta.name ?? 'Wishlist place'),
          location: String(row.location ?? meta.city ?? meta.vicinity ?? 'Wishlist'),
          photoUrl:
            String(meta.photoUrl ?? '').trim() ||
            `https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80`,
          month: String(meta.month ?? 'Coming soon'),
        } as WishlistPlace
      })
    } catch {
      return []
    }
  }

  const toggleInSet = (values: string[], value: string) => {
    if (values.includes(value)) return values.filter((v) => v !== value)
    return [...values, value]
  }

  const openEditDNA = () => {
    setDnaDraft(travelDNA)
    setIsEditingDNA(true)
  }

  const handleSaveDNA = async () => {
    setDnaSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) throw new Error('Please sign in again.')

      const normalized: TravelDNA = {
        ...dnaDraft,
        archetypes: dnaDraft.archetypes.slice(0, 6),
        palate: dnaDraft.palate.slice(0, 6),
        interests: dnaDraft.interests.slice(0, 6),
        dailyMovement: Math.max(0, Math.round(dnaDraft.dailyMovement || 0)),
        energyProfile: Math.max(0, Math.min(100, Math.round(dnaDraft.energyProfile || 0))),
      }

      window.localStorage.setItem(`triparc.travelDNA.${userId}`, JSON.stringify(normalized))
      setTravelDNA(normalized)
      setIsEditingDNA(false)
      setSuccessText('Travel DNA updated successfully.')
      setTimeout(() => setSuccessText(''), 3000)
    } catch (err: any) {
      setErrorText(err?.message || 'Could not save Travel DNA.')
    } finally {
      setDnaSaving(false)
    }
  }

  const handleConnectGoogleFit = async () => {
    const fitConnectUrl = 'https://support.google.com/fit/'
    window.open(fitConnectUrl, '_blank', 'noopener,noreferrer')
    setDnaDraft((prev) => ({ ...prev, fitConnected: true }))
    setSuccessText('Google Fit connection intent opened. Save Travel DNA to persist this state.')
    setTimeout(() => setSuccessText(''), 3000)
  }

  const handleSuggestMeetup = () => {
    setSuccessText('Meetup suggestion sent successfully.')
    setTimeout(() => setSuccessText(''), 3000)
  }

  const handleShareDNA = async () => {
    try {
      const slug = profile?.username || 'profile'
      const shareUrl = `${window.location.origin}/profile?u=${encodeURIComponent(slug)}`
      await navigator.clipboard.writeText(shareUrl)
      setSuccessText('Travel DNA profile link copied to clipboard.')
      setTimeout(() => setSuccessText(''), 3000)
    } catch {
      setErrorText('Could not copy link right now.')
    }
  }

  const handleFriendAction = (name: string) => {
    setSuccessText(`Opened ${name}'s profile.`)
    setTimeout(() => setSuccessText(''), 2500)
  }

  const handleViewSocialMap = () => {
    navigate('/triparc/map')
  }

  const handleVisibilityToggle = async (target: 'profile' | 'albums') => {
    setErrorText('')
    setSuccessText('')
    const prevProfile = profile

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) throw new Error('Please sign in again.')

      const nextProfilePublic = target === 'profile' ? !(profile?.is_profile_public ?? true) : (profile?.is_profile_public ?? true)
      const nextSharePrivate =
        target === 'albums' ? !(profile?.share_private_albums ?? false) : (profile?.share_private_albums ?? false)

      setProfile((current) => {
        if (!current) {
          return {
            user_id: userId,
            display_name: editForm.displayName.trim() || 'Traveler',
            username:
              editForm.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') ||
              `traveler_${userId.slice(0, 8)}`,
            bio: editForm.bio || null,
            home_base: editForm.homeBase || null,
            avatar_url: null,
            is_profile_public: nextProfilePublic,
            share_private_albums: nextSharePrivate,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        }

        return {
          ...current,
          is_profile_public: nextProfilePublic,
          share_private_albums: nextSharePrivate,
        }
      })

      setVisibilitySaving(target)

      const updated = await upsertOwnPublicProfile({
        displayName: editForm.displayName?.trim() || profile?.display_name || 'Traveler',
        username:
          editForm.username?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') ||
          profile?.username ||
          `traveler_${userId.slice(0, 8)}`,
        bio: editForm.bio || profile?.bio || '',
        homeBase: editForm.homeBase || profile?.home_base || '',
        avatarUrl: profile?.avatar_url || undefined,
        isProfilePublic: nextProfilePublic,
        sharePrivateAlbums: nextSharePrivate,
      })

      setProfile(updated)
      setSuccessText(
        target === 'profile'
          ? `Profile visibility set to ${updated.is_profile_public ? 'Public' : 'Private'}.`
          : `Album sharing set to ${updated.share_private_albums ? 'All' : 'Public Only'}.`,
      )
      setTimeout(() => setSuccessText(''), 3000)
    } catch (err: any) {
      setErrorText(err?.message || 'Could not update visibility settings.')
      setProfile(prevProfile)
    } finally {
      setVisibilitySaving(null)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    setErrorText('')
    setSuccessText('')

    try {
      const userId = (await supabase.auth.getSession()).data.session?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const fileName = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const storagePath = `${userId}/${fileName}`

      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath)
      const avatarUrl = urlData.publicUrl

      const updated = await upsertOwnPublicProfile({
        displayName: editForm.displayName?.trim() || profile?.display_name || 'Traveler',
        username:
          editForm.username?.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') ||
          profile?.username ||
          `traveler_${userId.slice(0, 8)}`,
        bio: editForm.bio || profile?.bio || '',
        homeBase: editForm.homeBase || profile?.home_base || '',
        avatarUrl: avatarUrl,
        isProfilePublic: profile?.is_profile_public ?? true,
        sharePrivateAlbums: profile?.share_private_albums ?? false,
      })

      setProfile(updated)
      setSuccessText('Profile image updated!')
      setTimeout(() => setSuccessText(''), 3000)
    } catch (err: any) {
      setErrorText(err?.message || 'Failed to upload avatar.')
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveProfile = async () => {
    const displayName = editForm.displayName.trim()
    const username = editForm.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')

    if (!displayName || !username) {
      setErrorText('Display name and username are required.')
      return
    }

    setEditSaving(true)
    setErrorText('')
    setSuccessText('')

    try {
      const updated = await upsertOwnPublicProfile({
        displayName,
        username,
        bio: editForm.bio,
        homeBase: editForm.homeBase,
        avatarUrl: profile?.avatar_url || undefined,
        isProfilePublic: profile?.is_profile_public ?? true,
        sharePrivateAlbums: profile?.share_private_albums ?? false,
      })

      setProfile(updated)
      setIsEditingProfile(false)
      setSuccessText('Profile updated!')
      setTimeout(() => setSuccessText(''), 3000)
    } catch (err: any) {
      setErrorText(err?.message || 'Failed to save profile.')
    } finally {
      setEditSaving(false)
    }
  }

  const stats = [
    { label: 'TRIPS', value: String(albums.length) },
    { label: 'DISTANCE', value: `${albums.length * 210}km` },
    { label: 'VOYAGE POINTS', value: '15.4k' },
    { label: 'CITIES', value: String(Math.max(albums.length * 2, 0)) },
  ]

  if (loading) {
    return (
      <TripArcShell mainClassName="max-w-7xl">
        <div className="flex items-center justify-center py-20">
          <p className="text-white/70">Loading your profile...</p>
        </div>
      </TripArcShell>
    )
  }

  return (
    <TripArcShell mainClassName="max-w-7xl pb-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(173,198,255,0.17),transparent_35%),radial-gradient(circle_at_85%_5%,rgba(255,188,124,0.14),transparent_32%),radial-gradient(circle_at_70%_80%,rgba(194,193,255,0.18),transparent_40%)]" />

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-20 space-y-8"
      >
        <header className="rounded-[2.2rem] border border-white/10 bg-gradient-to-br from-[#1a1a21] to-[#0f0f14] p-8 backdrop-blur-2xl shadow-2xl">
          <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
            {/* Avatar Section */}
            <div className="relative mx-auto lg:mx-0">
              <div className="group relative h-40 w-40 overflow-hidden rounded-full border-4 border-[#f2ca50]/40 shadow-[0_0_40px_rgba(242,202,80,0.3)]">
                <img
                  src={profile?.avatar_url || fallbackAvatar}
                  alt={profile?.display_name || 'Profile'}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 transition group-hover:opacity-100" />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute bottom-0 right-0 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#f2ca50] bg-[#f2ca50]/20 text-[#f2ca50] opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
                >
                  {uploadingAvatar ? <Sparkles size={18} className="animate-spin" /> : <Upload size={18} />}
                </button>

                {profile?.is_profile_public && (
                  <div className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f2ca50] bg-[#f2ca50]/20">
                    <CheckCircle2 size={18} className="text-[#f2ca50]" />
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
                aria-label="Upload profile image"
              />
            </div>

            {/* Profile Info Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h1 className="font-display text-5xl font-bold text-white">{profile?.display_name || 'Your Profile'}</h1>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 text-white/70">
                  <span className="text-lg font-medium">@{profile?.username || 'username'}</span>
                  <span className="w-1 h-1 bg-[#f2ca50]/60 rounded-full" />
                  {profile?.home_base && (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={16} className="text-[#f2ca50]" />
                        {profile.home_base}
                      </span>
                    </>
                  )}
                </div>

                <p className="max-w-2xl text-base leading-relaxed text-white/65">{profile?.bio || 'Share your travel story.'}</p>
                <p className="inline-flex items-center gap-2 text-sm text-white/60">
                  <CheckCircle2 size={15} className="text-[#adc6ff]" />
                  Elite Voyager · Level 42
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#dbe1ff]">
                    Aurora Member
                  </span>
                  <span className="rounded-full border border-[#adc6ff]/45 bg-[#adc6ff]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#b4c5ff]">
                    Bio-Sync Active
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#f2ca50]/40 bg-[#f2ca50]/10 px-5 py-2.5 text-sm font-semibold text-[#f2ca50] transition hover:border-[#f2ca50]/60 hover:bg-[#f2ca50]/15"
                >
                  <Edit2 size={16} />
                  Edit Profile
                </button>
                <button
                  onClick={handleShareDNA}
                  className="inline-flex items-center gap-2 rounded-full border border-[#adc6ff]/35 bg-[#2563eb]/30 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#2563eb]/45"
                >
                  <Share2 size={14} />
                  Share DNA
                </button>
              </div>
            </div>

            {/* Visibility Info */}
            <div className="flex flex-col gap-3">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="relative overflow-hidden rounded-[2rem] border border-[#f2ca50]/45 bg-gradient-to-br from-[#2b2822] via-[#1e1d1d] to-[#11131d] px-5 py-4 text-center"
              >
                <span className="pointer-events-none absolute -right-6 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-[#f2ca50]/20 blur-2xl" />
                <p className="text-xs uppercase tracking-[0.16em] text-[#f7d982]">Profile Status</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-lg font-bold text-white">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300/80 opacity-80" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  </span>
                  {profile?.is_profile_public ? (
                    <>
                      <Globe2 size={15} className="text-emerald-400" />
                      Public
                    </>
                  ) : (
                    <>
                      <Lock size={15} className="text-amber-300" />
                      Private
                    </>
                  )}
                </p>
                <motion.button
                  type="button"
                  onClick={() => handleVisibilityToggle('profile')}
                  disabled={visibilitySaving === 'profile'}
                  whileTap={{ scale: 0.98 }}
                  className="relative mx-auto mt-3 grid w-full max-w-[320px] grid-cols-2 items-center rounded-full bg-[#c8d2e8] p-1.5 text-sm font-bold text-[#394765] transition disabled:opacity-60"
                >
                  <span
                    className={`absolute top-1.5 h-[calc(100%-0.75rem)] w-[calc(50%-0.375rem)] rounded-full bg-white shadow-[0_10px_24px_-14px_rgba(26,26,38,0.95)] transition-transform duration-300 ${
                      profile?.is_profile_public ? 'translate-x-[calc(100%+0.25rem)]' : 'translate-x-0'
                    }`}
                  />
                  <span className={`relative z-10 flex items-center justify-center gap-2 px-3 py-2 ${!profile?.is_profile_public ? 'text-[#4c47b8]' : 'text-[#394765]'}`}>
                    <Lock size={16} />
                    Private
                  </span>
                  <span className={`relative z-10 flex items-center justify-center gap-2 px-3 py-2 ${profile?.is_profile_public ? 'text-[#4c47b8]' : 'text-[#394765]'}`}>
                    <Globe2 size={16} />
                    Public
                  </span>
                </motion.button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05 }}
                className="relative overflow-hidden rounded-[2rem] border border-[#f2ca50]/45 bg-gradient-to-br from-[#2b2822] via-[#1e1d1d] to-[#11131d] px-5 py-4 text-center"
              >
                <span className="pointer-events-none absolute -left-6 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full bg-[#adc6ff]/20 blur-2xl" />
                <p className="text-xs uppercase tracking-[0.16em] text-[#f7d982]">Album Sharing</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-lg font-bold text-white">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300/80 opacity-80" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  </span>
                  {profile?.share_private_albums ? (
                    <>
                      <Globe2 size={15} className="text-emerald-400" />
                      All
                    </>
                  ) : (
                    <>
                      <Lock size={15} className="text-amber-300" />
                      Public Only
                    </>
                  )}
                </p>
                <motion.button
                  type="button"
                  onClick={() => handleVisibilityToggle('albums')}
                  disabled={visibilitySaving === 'albums'}
                  whileTap={{ scale: 0.98 }}
                  className="relative mx-auto mt-3 grid w-full max-w-[320px] grid-cols-2 items-center rounded-full bg-[#c8d2e8] p-1.5 text-sm font-bold text-[#394765] transition disabled:opacity-60"
                >
                  <span
                    className={`absolute top-1.5 h-[calc(100%-0.75rem)] w-[calc(50%-0.375rem)] rounded-full bg-white shadow-[0_10px_24px_-14px_rgba(26,26,38,0.95)] transition-transform duration-300 ${
                      profile?.share_private_albums ? 'translate-x-[calc(100%+0.25rem)]' : 'translate-x-0'
                    }`}
                  />
                  <span className={`relative z-10 flex items-center justify-center gap-2 px-3 py-2 ${!profile?.share_private_albums ? 'text-[#4c47b8]' : 'text-[#394765]'}`}>
                    <Lock size={16} />
                    Private
                  </span>
                  <span className={`relative z-10 flex items-center justify-center gap-2 px-3 py-2 ${profile?.share_private_albums ? 'text-[#4c47b8]' : 'text-[#394765]'}`}>
                    <Globe2 size={16} />
                    Public
                  </span>
                </motion.button>
              </motion.div>
            </div>
          </div>
        </header>

        {/* Stats Section */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="glass-card rounded-2xl border border-white/10 p-6 text-center backdrop-blur-xl"
              style={{ background: 'rgba(28, 27, 27, 0.6)' }}
            >
              <p className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </section>

        {/* Messages */}
        {errorText && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {errorText}
          </motion.div>
        )}

        {successText && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          >
            {successText}
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-8">
            <section className="relative overflow-hidden rounded-3xl border border-[#adc6ff]/25 bg-gradient-to-br from-[#adc6ff]/10 to-transparent p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-[#fe9400] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#2d1600]">
                      Live overlap
                    </span>
                    <MapPin className="text-[#ffbc7c]" size={16} />
                  </div>
                  <h3 className="text-2xl font-bold text-white">You both are in Tokyo this week.</h3>
                  <p className="max-w-xl text-sm text-white/70">
                    Routes overlap near Shibuya tomorrow morning. Would you like to share a coffee or explore a local market together?
                  </p>
                </div>
                <button
                  onClick={handleSuggestMeetup}
                  className="hidden rounded-full bg-[#adc6ff] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#00285c] shadow-lg md:inline-flex"
                >
                  Suggest Meetup
                </button>
              </div>
              <button
                onClick={handleSuggestMeetup}
                className="mt-6 w-full rounded-full bg-[#adc6ff] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#00285c] shadow-lg md:hidden"
              >
                Suggest Meetup
              </button>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#121217]/75 p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🧬</span>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Travel DNA</h2>
                </div>
                <button
                  onClick={openEditDNA}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white"
                >
                  <Edit2 size={14} />
                  Edit DNA
                </button>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-6">
                  <div>
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">Archetype</p>
                    <div className="flex flex-wrap gap-2">
                      {travelDNA.archetypes.map((a) => (
                        <span key={a} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">Energy profile</p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#adc6ff] to-[#4b8eff]"
                        style={{ width: `${travelDNA.energyProfile}%` }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
                      <span>Relaxed</span>
                      <span>High intensity</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">Daily movement</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-white">{travelDNA.dailyMovement.toLocaleString()}</span>
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/55">Steps/day</span>
                    </div>
                    <p className="mt-2 text-xs text-white/60">
                      {travelDNA.fitConnected ? 'Google Fit connected' : 'Google Fit not connected'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">Palate</p>
                      <p className="text-sm text-white/80">{travelDNA.palate.join(', ') || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">Interests</p>
                      <p className="text-sm text-white/80">{travelDNA.interests.join(', ') || 'Not set'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🗺️</span>
                  <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Travel History</h2>
                </div>
                <button
                  onClick={() => navigate('/triparc/memories')}
                  className="text-xs font-bold uppercase tracking-[0.14em] text-[#adc6ff]"
                >
                  View all
                </button>
              </div>

              {!albums.length ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
                  No travel history yet.
                </div>
              ) : (
                <div className="flex snap-x gap-4 overflow-x-auto pb-2">
                  {albums.map((album) => (
                    <div key={album.id} className="min-w-[260px] snap-start">
                      <div className="relative h-60 overflow-hidden rounded-2xl border border-white/10">
                        <img
                          src={album.coverImage || fallbackAvatar}
                          alt={album.title}
                          className="h-full w-full object-cover transition duration-500 hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                        <div className="absolute bottom-3 left-3">
                          <h4 className="text-xl font-bold text-white">{album.title}</h4>
                          <p className="text-xs text-white/70">{formatAlbumDateRange(album.start_date, album.end_date)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-5">
              <div className="flex items-center gap-3 px-1">
                <Heart size={18} className="text-rose-300" />
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Memory Highlights</h2>
              </div>

              {!highlightMedia.length ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/60">
                  Add photos in Memories to see highlights here.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {highlightMedia.slice(0, 6).map((media, idx) => (
                    <div
                      key={media.id}
                      className={`group relative overflow-hidden rounded-2xl border border-white/10 ${idx === 1 ? 'row-span-2 aspect-[3/4]' : 'aspect-square'}`}
                    >
                      <img src={media.media_url} alt={media.caption || 'Memory highlight'} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                        <p className="px-3 text-center text-xs font-bold text-white">{media.caption || 'Travel memory'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>

          <aside className="space-y-8 lg:col-span-4">
            <section className="rounded-3xl border border-white/10 bg-[#1f1f23]/85 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Social Graph</h3>
                <span className="text-[10px] uppercase tracking-[0.14em] text-[#b4c5ff]">Tokyo Sector</span>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-2xl border border-[#2563eb]/20 bg-[#2563eb]/10 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#b4c5ff] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#b4c5ff]" />
                    </span>
                    <p className="text-sm font-bold text-[#b4c5ff]">Meetup Alert</p>
                  </div>
                  <p className="text-xs text-white/60">Live</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-sm font-semibold text-white">Marcus Thorne</p>
                  <p className="text-xs text-white/60">Colliding at Shibuya Sky</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-sm font-semibold text-white">Sarah Chen</p>
                  <p className="text-xs text-white/60">Arriving Tokyo in 2h</p>
                </div>
              </div>
              <button
                onClick={handleViewSocialMap}
                className="mt-5 w-full rounded-xl bg-white/10 py-3 text-sm font-bold text-white transition hover:bg-white/15"
              >
                View Social Map
              </button>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#121217]/75 p-6">
              <div className="mb-4 flex items-center gap-3">
                <Users size={18} className="text-[#adc6ff]" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">Mutual Connections</h3>
              </div>
              <div className="flex -space-x-3">
                {mutuals.map((src) => (
                  <img key={src} src={src} className="h-10 w-10 rounded-full border-2 border-[#1c1b1b] object-cover" alt="Mutual connection" />
                ))}
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#1c1b1b] bg-white/10 text-[10px] font-bold text-white">
                  +12
                </div>
              </div>
              <p className="mt-3 text-xs text-white/60">Leo, Sarah, and 12 others you know are connected with this profile.</p>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#121217]/75 p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Navigation size={18} className="text-[#adc6ff]" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">Wishlist Places</h3>
                </div>
                <button
                  onClick={() => navigate('/bucketlist')}
                  className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#adc6ff]"
                >
                  Open
                </button>
              </div>

              <div className="space-y-4">
                {wishlistPlaces.length === 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                    No saved places yet. Add destinations in Bucketlist to show them here.
                  </div>
                )}
                {wishlistPlaces.slice(0, 3).map((place) => (
                  <div key={place.id} className="group">
                    <div className="relative mb-3 h-32 overflow-hidden rounded-2xl border border-white/10">
                      <img src={place.photoUrl} alt={place.name} className="h-full w-full object-cover" />
                      <div className="absolute inset-0 bg-black/25" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() => navigate('/bucketlist')}
                          className="rounded-full border border-white/30 bg-white/20 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white"
                        >
                          View in Bucketlist
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-1">
                      <span className="font-semibold text-white">{place.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#adc6ff]">{place.month}</span>
                    </div>
                    <p className="px-1 text-xs text-white/60">{place.location}</p>
                  </div>
                ))}
              </div>
            </section>

          </aside>
        </div>

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">Voyage Friends</h2>
              <p className="mt-1 text-sm text-white/60">Explorers you've connected with on the road</p>
            </div>
            <button className="text-xs font-bold uppercase tracking-[0.14em] text-[#b4c5ff]">More</button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {voyageFriends.map((friend, idx) => (
              <div key={friend.name} className="rounded-2xl border border-white/10 bg-[#1f1f23]/70 p-5 text-center">
                <img src={friend.image} alt={friend.name} className="mx-auto mb-3 h-20 w-20 rounded-full border border-[#b4c5ff]/30 object-cover p-1" />
                <h4 className="text-lg font-bold text-white">{friend.name}</h4>
                <p className="mb-4 text-xs text-white/60">{friend.note}</p>
                <button
                  onClick={() => handleFriendAction(friend.name)}
                  className={`w-full rounded-lg py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${
                    idx === 2
                      ? 'border border-white/25 bg-transparent text-white hover:bg-white/10'
                      : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
                  }`}
                >
                  {idx === 2 ? 'Connect' : 'View Profile'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Trip History</h2>
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#1f1f23]/70">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-white/55">Destination</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-white/55">Duration</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.16em] text-white/55">Type</th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-[0.16em] text-white/55">Status</th>
                </tr>
              </thead>
              <tbody>
                {(albums.length ? albums.slice(0, 5) : [{ id: 'fallback', title: 'Kyoto Expedition', location: 'Japan', start_date: null, end_date: null } as any]).map((item, idx) => (
                  <tr key={item.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/5">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-white">{item.title}</p>
                      <p className="text-xs text-white/60">{item.location}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-white/70">{formatAlbumDateRange(item.start_date, item.end_date)}</td>
                    <td className="px-6 py-4">
                      <span className="rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#b4c5ff] bg-[#2563eb]/15 border border-[#2563eb]/25">
                        {idx % 2 === 0 ? 'Cultural' : 'Adventure'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                      {idx === 0 ? 'Active' : 'Completed'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </motion.section>

      {/* Edit Profile Modal */}
      <Modal open={isEditingProfile} title="Edit Your Profile" onClose={() => setIsEditingProfile(false)}>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-white/60">Display Name</span>
            <input
              value={editForm.displayName}
              onChange={(e) => setEditForm((prev) => ({ ...prev, displayName: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f2ca50]/45"
              placeholder="Your Full Name"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-white/60">Username</span>
            <input
              value={editForm.username}
              onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f2ca50]/45"
              placeholder="your_username"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-white/60">Home Base</span>
            <input
              value={editForm.homeBase}
              onChange={(e) => setEditForm((prev) => ({ ...prev, homeBase: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f2ca50]/45"
              placeholder="London, UK"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-white/60">Bio</span>
            <textarea
              rows={4}
              value={editForm.bio}
              onChange={(e) => setEditForm((prev) => ({ ...prev, bio: e.target.value }))}
              className="w-full resize-none rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-sm text-white outline-none transition focus:border-[#f2ca50]/45"
              placeholder="Tell your travel story..."
            />
          </label>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsEditingProfile(false)}
              className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={editSaving}
              className="rounded-full bg-gradient-to-br from-[#f2ca50] to-[#c7962f] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[#2f2404] transition hover:scale-[1.02] active:scale-95 disabled:opacity-70"
            >
              {editSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={isEditingDNA} title="Edit Travel DNA" onClose={() => setIsEditingDNA(false)} widthClassName="max-w-3xl">
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/60">Archetypes</p>
            <div className="flex flex-wrap gap-2">
              {archetypeOptions.map((option) => {
                const selected = dnaDraft.archetypes.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDnaDraft((prev) => ({ ...prev, archetypes: toggleInSet(prev.archetypes, option) }))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      selected ? 'border-[#adc6ff] bg-[#adc6ff]/20 text-[#dbe7ff]' : 'border-white/20 bg-white/10 text-white/80'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/60">Daily movement (steps/day)</span>
            <input
              type="number"
              min={0}
              value={dnaDraft.dailyMovement}
              onChange={(e) => setDnaDraft((prev) => ({ ...prev, dailyMovement: Number(e.target.value || 0) }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0e0e12] px-4 py-3 text-sm text-white outline-none transition focus:border-[#adc6ff]/45"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-white/60">Energy profile ({dnaDraft.energyProfile}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={dnaDraft.energyProfile}
              onChange={(e) => setDnaDraft((prev) => ({ ...prev, energyProfile: Number(e.target.value) }))}
              className="w-full"
            />
          </label>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/60">Palate</p>
            <div className="flex flex-wrap gap-2">
              {palateOptions.map((option) => {
                const selected = dnaDraft.palate.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDnaDraft((prev) => ({ ...prev, palate: toggleInSet(prev.palate, option) }))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      selected ? 'border-[#adc6ff] bg-[#adc6ff]/20 text-[#dbe7ff]' : 'border-white/20 bg-white/10 text-white/80'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-white/60">Interests</p>
            <div className="flex flex-wrap gap-2">
              {interestOptions.map((option) => {
                const selected = dnaDraft.interests.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDnaDraft((prev) => ({ ...prev, interests: toggleInSet(prev.interests, option) }))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      selected ? 'border-[#adc6ff] bg-[#adc6ff]/20 text-[#dbe7ff]' : 'border-white/20 bg-white/10 text-white/80'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Google Fit</p>
                <p className="text-xs text-white/60">Use Connect to open Google Fit support, then store your preference on this profile.</p>
              </div>
              <button
                type="button"
                onClick={handleConnectGoogleFit}
                className="rounded-full border border-[#adc6ff]/35 bg-[#adc6ff]/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#dbe7ff]"
              >
                {dnaDraft.fitConnected ? 'Connected' : 'Connect'}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsEditingDNA(false)}
              className="rounded-full border border-white/15 bg-white/5 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveDNA}
              disabled={dnaSaving}
              className="rounded-full bg-gradient-to-br from-[#adc6ff] to-[#4b8eff] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[#00285c] transition hover:scale-[1.02] active:scale-95 disabled:opacity-70"
            >
              {dnaSaving ? 'Saving...' : 'Save DNA'}
            </button>
          </div>
        </div>
      </Modal>
    </TripArcShell>
  )
}
