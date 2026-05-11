import type { Mode } from '../types/mode'
import MoodMapNavbar from './MoodMapNavbar'
import TripArcNavbar from './StelloraNavbar'
import TranslatorNavbar from './TranslatorNavbar'

type Props = {
  mode: Mode
  status?: 'On track' | 'Behind' | 'Ahead'
  mood?: string
}

export default function Navbar({ mode, status, mood }: Props) {
  if (mode === 'triparc') {
    return <TripArcNavbar status={status} />
  }
  if (mode === 'translator') {
    return <TranslatorNavbar />
  }
  return <MoodMapNavbar mood={mood} />
}
