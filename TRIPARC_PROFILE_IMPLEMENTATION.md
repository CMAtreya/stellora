# TripArc Public Profile & Album Privacy Implementation

## Overview
Implementation of user public profiles with album-level privacy controls in TripArc. After signup, users see a popup to configure their profile visibility and album sharing preferences. Each album can be toggled between public and private at any time.

## Architecture

### Database Schema
**New Tables:**
- `triparc_public_profiles` – Stores public profile metadata and visibility settings per user
- Updated `memories_albums` – Added `is_public` boolean field for per-album visibility control

**Key Fields:**
```
triparc_public_profiles:
  - user_id (PK, FK to auth.users)
  - display_name, username (unique), bio, home_base, avatar_url
  - is_profile_public: boolean (controls whether profile is discoverable)
  - share_private_albums: boolean (allows private albums to show publicly if true)
  - created_at, updated_at

memories_albums (modified):
  - is_public: boolean (default false; controls per-album visibility)
```

**RLS Policies:**
- Public profiles are readable by all if `is_profile_public = true`
- Users can see their own albums + public albums from public profiles
- If a profile has `share_private_albums = true`, all albums appear publicly (if profile is public)
- Otherwise, only `is_public = true` albums appear in public view

---

## Frontend Implementation

### 1. **Auth Page** (`src/pages/Auth.tsx`)
After user signs up, a localStorage flag `triparc.profileSetupPrompt` is set to trigger the profile setup modal.

### 2. **TripArc Nav Profile Button** (`src/components/TripArcNav.tsx`)
**Click Behavior:**
- On first signup: Opens profile setup modal automatically
- On subsequent visits: Checks profile completeness; opens setup modal if incomplete
- After setup is complete: Navigates to `/triparc/profile`

**Setup Modal Features:**
- Display name, username, bio, home base (text inputs)
- Profile visibility toggle (Public / Private)
- Album sharing rule toggle (Share private albums / Only public albums)
- **Album visibility list**: Shows all user's albums with Public/Private toggle buttons
  - ✅ Updates album visibility in real time
  - ✅ Optional: set all albums before saving profile

**Save Flow:**
- Validates display name + username (required)
- Calls `upsertOwnPublicProfile()` to create/update profile in Supabase
- Clears localStorage flag
- Navigates to `/triparc/profile`

### 3. **Memory Album Lists** (`src/pages/Memories.tsx`)
- Album cards now show visibility badge (Public / Private)
- Integrated into the existing album grid UI

### 4. **Memory Album Detail** (`src/pages/MemoriesAlbum.tsx`)
- Button to toggle album visibility (Public ↔ Private)
- Located in the stats sidebar, right above the Delete button
- Color-coded: green for public, gray for private

### 5. **Public Profile Page** (`src/pages/TripArcPublicProfile.tsx`)
New page accessible at `/triparc/profile` or `/profile`

**Displays:**
- Profile header: avatar, display name, username, home base, bio
- Profile visibility badges (Public/Private + Sharing rule)
- Stats: Trip count, distance estimate, public/total album counts
- Filtered album grid: Shows only albums user can see
  - If `share_private_albums = true`: all albums
  - Otherwise: `is_public = true` albums only
- Setup prompt if profile is incomplete

---

## API Changes (`src/lib/memoriesApi.ts`)

### New Types
```typescript
export type PublicProfile = {
  user_id, display_name, username, bio, home_base, avatar_url,
  is_profile_public, share_private_albums, created_at, updated_at
}

export type PublicProfileUpsertInput = {
  displayName?, username?, bio?, homeBase?, avatarUrl?,
  isProfilePublic, sharePrivateAlbums
}
```

### Updated MemoryAlbum Type
```typescript
export type MemoryAlbum = {
  ...
  is_public: boolean  // NEW
  ...
}
```

### New Functions
- `toggleAlbumVisibility(albumId, nextValue)` – Toggle album public/private
- `getOwnPublicProfile()` – Fetch current user's profile
- `upsertOwnPublicProfile(input)` – Create or update public profile
- Updated `listAlbums()` – Now includes `is_public` field
- Updated `createAlbum()` – Defaults `is_public = false`

---

## User Flow

### After Account Creation
1. ✅ Auth page sign-up completes
2. ✅ localStorage flag set: `triparc.profileSetupPrompt = '1'`
3. ✅ User navigated to `/launch`
4. ✅ Next TripArc click (Profile or any page requiring profile) triggers setup modal
5. ✅ User fills:
   - Display name & username
   - Optional: bio, home base
   - Visibility toggles (profile public, share private albums)
   - Album visibility toggles (one per album)
6. ✅ Save profile → flag cleared → navigate to `/triparc/profile`

### Ongoing Album Management
- **Memories Page**: Album cards show Public/Private badges
- **Album Detail**: "Public album" / "Private album" button toggles visibility instantly
- **Profile Setup Modal**: Can re-open anytime from Profile button; album list stays synced

### Public Profile Viewing
- Public profiles accessible at `/triparc/profile` (own profile auto-loads)
- RLS ensures unauthenticated or unrelated users only see public albums from users with `is_profile_public = true`

---

## Database Migration

Run the updated SQL file:
```sql
supabase_update_memories.sql
```

**Changes:**
1. Add `is_public` column to `memories_albums`
2. Create `triparc_public_profiles` table
3. Add indexes for `public_lookup` and profile visibility queries
4. Update RLS policies on both tables for public profile access

---

## Environment Notes

- Feature relies on Supabase Auth + Row-Level Security
- localStorage used for one-time signup detection (privacy-safe, client-side only)
- Public profiles are opt-in: users control visibility via toggles
- Album privacy is per-album, independent of profile visibility setting

---

## Testing Checklist

- [ ] Create account → profile setup modal appears
- [ ] Fill profile details → saves without errors
- [ ] Album visibility toggles in modal → album list updates
- [ ] Navigate to `/triparc/profile` → profile page loads
- [ ] Create new album in Memories → defaults to Private
- [ ] Toggle album to Public in album detail → badge updates
- [ ] Open album in Memories list → Public/Private badge displays
- [ ] Logout + login → profile already saved, no re-prompt
- [ ] Logout → login another account → new profile flow
- [ ] Profile with `share_private_albums = true` → all albums visible on profile page
- [ ] Profile with `share_private_albums = false` → only public albums visible

---

## Key Files Modified/Created

**Modified:**
- `frontend/src/lib/memoriesApi.ts` – New API functions & types
- `frontend/src/components/TripArcNav.tsx` – Profile modal & setup flow
- `frontend/src/pages/Auth.tsx` – localStorage flag on signup
- `frontend/src/pages/MemoriesAlbum.tsx` – Album visibility toggle
- `frontend/src/pages/Memories.tsx` – Pass isPublic to album cards
- `frontend/src/components/memories/AlbumCard.tsx` – Visibility badge
- `frontend/src/App.tsx` – Routes for public profile
- `supabase_update_memories.sql` – Schema & RLS updates

**Created:**
- `frontend/src/pages/TripArcPublicProfile.tsx` – Public profile page

---

## Next Steps (Optional Enhancements)

- [ ] Add profile image upload (avatar_url management)
- [ ] Search/discover public profiles by username
- [ ] Public profile URL shareable link generation
- [ ] Album comments/reactions from friends
- [ ] Follow/friend system
- [ ] Activity feed showing new albums from friends
- [ ] Bulk album privacy management UI
- [ ] Public profile customization (theme, layout)
