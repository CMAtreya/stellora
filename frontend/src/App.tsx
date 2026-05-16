import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthPage from './pages/Auth'
import TripArcHome from './pages/StelloraHome'
import StelloraAdjust from './pages/StelloraAdjust'
import StelloraInsights from './pages/StelloraInsights'
import StelloraFlow from './pages/StelloraFlow'
import StelloraFinalized from './pages/StelloraFinalized'
import StelloraStories from './pages/StelloraStories'
import MoodMapHome from './pages/MoodMapHome'
import MoodMapMood from './pages/MoodMapMood'
import MoodMapMap from './pages/MoodMapMap'
import MoodMapSurprise from './pages/MoodMapSurprise'
import TranslatorPage from './pages/Translator'
import LaunchPage from './pages/Launch'
import TripArcProfilePage from './pages/TripArcProfile'
import PrivateProfilePage from './pages/PrivateProfile'
import BucketlistPage from './pages/Bucketlist'
import TripArcLanding from './pages/TripArcLanding'
import SevenPillarsPage from './pages/SevenPillars'
import MemoriesPage from './pages/Memories'
import MemoriesAlbumPage from './pages/MemoriesAlbum'
import DirectionsPage from './pages/Directions'
import LandingPage from './pages/Landing'
import PreferencesPage from './pages/Preferences'
import TimelinePage from './pages/Timeline'
import LostAndFoundPage from './pages/LostAndFound'
import CuratePage from './pages/Curate'
import TimelineCuratePage from './pages/TimelineCuration'
import FullPageMapPage from './pages/FullPageMap'
import EmergencySOS from './components/EmergencySOS'
import BucketlistExplorePage from './pages/BucketlistExplore'

export default function App() {
  const location = useLocation()
  const hideSOS = location.pathname === '/' || location.pathname.startsWith('/auth')
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/home" element={<Navigate to="/launch" replace />} />
        <Route path="/triparc" element={<TripArcLanding />} />
        <Route path="/preferences" element={<PreferencesPage />} />
        <Route path="/triparc/preferences" element={<PreferencesPage />} />
        <Route path="/ontrip" element={<PreferencesPage />} />
        <Route path="/triparc/ontrip" element={<PreferencesPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/triparc/timeline-new" element={<TimelinePage />} />
        <Route path="/lostandfound" element={<LostAndFoundPage />} />
        <Route path="/triparc/lostandfound" element={<LostAndFoundPage />} />
        <Route path="/curate" element={<CuratePage />} />
        <Route path="/triparc/curate" element={<CuratePage />} />
        <Route path="/triparc/timeline/curate" element={<CuratePage />} />
        <Route path="/triparc/timeline-curation" element={<TimelineCuratePage />} />
        <Route path="/full-map" element={<FullPageMapPage />} />
        <Route path="/7pillars" element={<SevenPillarsPage />} />
        <Route path="/triparc/7pillars" element={<SevenPillarsPage />} />
        <Route path="/pretrip" element={<SevenPillarsPage />} />
        <Route path="/triparc/pretrip" element={<SevenPillarsPage />} />
        <Route path="/triparc/today" element={<TripArcHome />} />
        <Route path="/triparc/timeline" element={<Navigate to="/timeline" replace />} />
        <Route path="/triparc/adjust" element={<StelloraAdjust />} />
        <Route path="/triparc/insights" element={<StelloraInsights />} />
        <Route path="/triparc/flow" element={<StelloraFlow />} />
        <Route path="/triparc/finalized" element={<StelloraFinalized />} />
        <Route path="/triparc/stories" element={<StelloraStories />} />
        <Route path="/triparc/map" element={<Navigate to="/full-map" replace />} />
        <Route path="/bucketlist" element={<BucketlistPage />} />
        <Route path="/bucketlis" element={<BucketlistPage />} />
        <Route path="/bucketlist/explore/:city" element={<BucketlistExplorePage />} />
        <Route path="/triparc/memories" element={<MemoriesPage />} />
        <Route path="/triparc/memories/:albumId" element={<MemoriesAlbumPage />} />
        <Route path="/directions" element={<DirectionsPage />} />
        <Route path="/moodmap/explore" element={<MoodMapHome />} />
        <Route path="/moodmap/mood" element={<MoodMapMood />} />
        <Route path="/moodmap/map" element={<MoodMapMap />} />
        <Route path="/moodmap/surprise" element={<MoodMapSurprise />} />
        <Route path="/translator" element={<TranslatorPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/launch" element={<LaunchPage />} />
        <Route path="/profile" element={<TripArcProfilePage />} />
        <Route path="/triparc/profile" element={<TripArcProfilePage />} />
        <Route path="/private-profile" element={<PrivateProfilePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!hideSOS && <EmergencySOS />}
    </>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
      <div className="noise-overlay" />
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
        <div className="aurora-bg" />
      </div>
      <div className="relative z-10 space-y-4 text-center">
        <h1 className="text-4xl font-semibold">Page not found</h1>
        <p className="text-white/70">The page you&apos;re looking for does not exist.</p>
        <Link className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white" to="/">
          Go Home
        </Link>
      </div>
    </div>
  )
}
