import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Route, Maximize2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import TripArcShell from '../components/TripArcShell'
import SmartAlert from '../components/triparc/SmartAlert'
import SuggestionCard from '../components/triparc/SuggestionCard'
import TimelineCard, { type TimelineItem } from '../components/triparc/TimelineCard'
import LeafletMap from '../components/LeafletMap'
import { resolveApiPath } from '../lib/apiClient'

function clampIndex(index: number, max: number) {
  return Math.max(0, Math.min(index, max))
}

function getColorForPercentage(percentage: number): { bg: string; border: string } {
  if (percentage < 40) return { bg: 'bg-emerald-500', border: 'border-emerald-500' }
  if (percentage < 70) return { bg: 'bg-amber-500', border: 'border-amber-500' }
  return { bg: 'bg-red-500', border: 'border-red-500' }
}

const fallbackTimeline: TimelineItem[] = [
  {
    id: 'cur-1',
    time: '09:00 AM',
    title: 'Old Town Heritage Walk',
    category: 'Heritage',
    duration: '90 min',
    description: 'A guided opening route through landmark streets and hidden courtyards.',
    status: 'completed',
  },
  {
    id: 'cur-2',
    time: '11:15 AM',
    title: 'Signature Brunch Stop',
    category: 'Food',
    duration: '75 min',
    description: 'Locally rated spot aligned to your dietary profile and low-wait window.',
    status: 'current',
  },
  {
    id: 'cur-3',
    time: '01:30 PM',
    title: 'Design District Pop-in',
    category: 'Shopping',
    duration: '80 min',
    description: 'Boutique loop with denser options grouped by walkability.',
    status: 'upcoming',
  },
]

type DestinationSuggestion = {
  image: string
  name: string
  category: string
  distance: string
  reason: string
}

const destinationSuggestions: Record<string, DestinationSuggestion[]> = {
  Bengaluru: [
    { image: 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=900&q=80', name: 'Bangalore Palace', category: 'Heritage', distance: '2.1 km away', reason: 'Iconic architecture and easy morning access.' },
    { image: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=80', name: 'Cubbon Park', category: 'Nature', distance: '1.4 km away', reason: 'Good low-crowd reset during mid-day.' },
    { image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', name: 'VV Puram Food Street', category: 'Food', distance: '3.0 km away', reason: 'High variety in one compact lane.' },
    { image: 'https://images.unsplash.com/photo-1569163139394-de4798aa62b7?auto=format&fit=crop&w=900&q=80', name: 'Commercial Street', category: 'Shopping', distance: '2.8 km away', reason: 'Dense shopping with quick transfers.' },
    { image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=80', name: 'ISKCON Temple', category: 'Spiritual', distance: '4.2 km away', reason: 'Quiet spiritual anchor for evening.' },
    { image: 'https://images.unsplash.com/photo-1518548419970-58e7e36f9a50?auto=format&fit=crop&w=900&q=80', name: 'Vidhana Soudha', category: 'Heritage', distance: '2.4 km away', reason: 'Stunning Neo-Dravidian architecture.' },
    { image: 'https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?auto=format&fit=crop&w=900&q=80', name: 'Lalbagh Botanical Garden', category: 'Nature', distance: '3.2 km away', reason: 'Vast green space with rare flora.' },
    { image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', name: 'Haleem at Nimmi', category: 'Food', distance: '2.9 km away', reason: 'Local signature slow-cooked meat dish.' },
    { image: 'https://images.unsplash.com/photo-1555529669-e69e7f0cf6e9?auto=format&fit=crop&w=900&q=80', name: 'Brigade Road Market', category: 'Shopping', distance: '2.2 km away', reason: 'Upscale retail and cafe zone.' },
    { image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80', name: 'Sri Chandramouleshwara Temple', category: 'Spiritual', distance: '3.6 km away', reason: 'Ancient heritage site with spiritual charm.' },
    { image: 'https://images.unsplash.com/photo-1516738901601-1e40f8a7fa6a?auto=format&fit=crop&w=900&q=80', name: 'Sankey Tank Walk', category: 'Nature', distance: '1.8 km away', reason: 'Serene water body with peaceful surroundings.' },
    { image: 'https://images.unsplash.com/photo-1626249965127-92539eb14f9d?auto=format&fit=crop&w=900&q=80', name: 'Tipu Sultan Fort', category: 'Heritage', distance: '3.8 km away', reason: 'Historical fort with museum exhibits.' },
  ],
  Mumbai: [
    { image: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=900&q=80', name: 'Gateway of India', category: 'Heritage', distance: '2.5 km away', reason: 'Strong landmark start with short loops nearby.' },
    { image: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=80', name: 'Marine Drive', category: 'Nature', distance: '1.1 km away', reason: 'Best for golden hour and low-effort walk.' },
    { image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', name: 'Mohammed Ali Road', category: 'Food', distance: '3.2 km away', reason: 'Popular local food pocket.' },
    { image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80', name: 'Colaba Causeway', category: 'Shopping', distance: '1.7 km away', reason: 'Street shopping concentrated in one strip.' },
    { image: 'https://images.unsplash.com/photo-1513236157202-b89fcf22db20?auto=format&fit=crop&w=900&q=80', name: 'Siddhivinayak Temple', category: 'Spiritual', distance: '4.0 km away', reason: 'High spiritual significance and quick stop.' },
    { image: 'https://images.unsplash.com/photo-1518548419970-58e7e36f9a50?auto=format&fit=crop&w=900&q=80', name: 'Taj Mahal Palace Hotel', category: 'Heritage', distance: '2.2 km away', reason: 'Iconic hotel architecture and history.' },
    { image: 'https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?auto=format&fit=crop&w=900&q=80', name: 'Hanging Gardens', category: 'Nature', distance: '2.8 km away', reason: 'Terraced gardens with city views.' },
    { image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', name: 'Vada Pav at Aarey', category: 'Food', distance: '4.1 km away', reason: 'Local street food favorite.' },
    { image: 'https://images.unsplash.com/photo-1555529669-e69e7f0cf6e9?auto=format&fit=crop&w=900&q=80', name: 'Linking Road', category: 'Shopping', distance: '2.0 km away', reason: 'Trendy fashion and lifestyle hub.' },
    { image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80', name: 'Haji Ali Dargah', category: 'Spiritual', distance: '3.3 km away', reason: 'Iconic mosque during tide times.' },
    { image: 'https://images.unsplash.com/photo-1516738901601-1e40f8a7fa6a?auto=format&fit=crop&w=900&q=80', name: 'Juhu Beach', category: 'Nature', distance: '5.2 km away', reason: 'Long stretch for evening walks.' },
    { image: 'https://images.unsplash.com/photo-1626249965127-92539eb14f9d?auto=format&fit=crop&w=900&q=80', name: 'Crawford Market', category: 'Heritage', distance: '1.9 km away', reason: 'Historic Victorian architecture market.' },
  ],
  Delhi: [
    { image: 'https://images.unsplash.com/photo-1518548419970-58e7e36f9a50?auto=format&fit=crop&w=900&q=80', name: 'Qutub Minar', category: 'Heritage', distance: '3.8 km away', reason: 'High-value historical stop.' },
    { image: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=80', name: 'Lodhi Garden', category: 'Nature', distance: '1.9 km away', reason: 'Relaxed pace with clean pathways.' },
    { image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', name: 'Chandni Chowk', category: 'Food', distance: '2.6 km away', reason: 'Dense old-city food options.' },
    { image: 'https://images.unsplash.com/photo-1569163139394-de4798aa62b7?auto=format&fit=crop&w=900&q=80', name: 'Khan Market', category: 'Shopping', distance: '2.3 km away', reason: 'Compact premium shopping zone.' },
    { image: 'https://images.unsplash.com/photo-1513236157202-b89fcf22db20?auto=format&fit=crop&w=900&q=80', name: 'Akshardham', category: 'Spiritual', distance: '5.2 km away', reason: 'Immersive spiritual and architectural experience.' },
    { image: 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=900&q=80', name: 'Red Fort', category: 'Heritage', distance: '2.1 km away', reason: 'Mughal fortress with grand scale.' },
    { image: 'https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?auto=format&fit=crop&w=900&q=80', name: 'Taj Mahal', category: 'Heritage', distance: '206 km away', reason: 'One-day Agra excursion from Delhi.' },
    { image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', name: 'Chole Bhature', category: 'Food', distance: '2.0 km away', reason: 'Delhi specialty breakfast.' },
    { image: 'https://images.unsplash.com/photo-1555529669-e69e7f0cf6e9?auto=format&fit=crop&w=900&q=80', name: 'CP Shopping', category: 'Shopping', distance: '1.5 km away', reason: 'Iconic circular shopping hub.' },
    { image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80', name: 'Jama Masjid', category: 'Spiritual', distance: '2.8 km away', reason: 'Largest mosque in India.' },
    { image: 'https://images.unsplash.com/photo-1516738901601-1e40f8a7fa6a?auto=format&fit=crop&w=900&q=80', name: 'Delhi Ridge Forest', category: 'Nature', distance: '4.0 km away', reason: 'Urban forest sanctuary.' },
    { image: 'https://images.unsplash.com/photo-1626249965127-92539eb14f9d?auto=format&fit=crop&w=900&q=80', name: 'India Gate', category: 'Heritage', distance: '1.2 km away', reason: 'Iconic war memorial.' },
  ],
  Chennai: [
    { image: 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=900&q=80', name: 'Fort St. George', category: 'Heritage', distance: '1.8 km away', reason: 'Foundational city landmark.' },
    { image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80', name: 'Marina Beach', category: 'Nature', distance: '0.8 km away', reason: 'Best for broad coastal walk.' },
    { image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', name: 'Mylapore Eateries', category: 'Food', distance: '2.5 km away', reason: 'Classic local taste circuit.' },
    { image: 'https://images.unsplash.com/photo-1569163139394-de4798aa62b7?auto=format&fit=crop&w=900&q=80', name: 'Pondy Bazaar', category: 'Shopping', distance: '2.1 km away', reason: 'High-density shopping lane.' },
    { image: 'https://images.unsplash.com/photo-1513236157202-b89fcf22db20?auto=format&fit=crop&w=900&q=80', name: 'Kapaleeshwarar Temple', category: 'Spiritual', distance: '3.4 km away', reason: 'Strong cultural and spiritual context.' },
    { image: 'https://images.unsplash.com/photo-1518548419970-58e7e36f9a50?auto=format&fit=crop&w=900&q=80', name: 'San Thome Cathedral', category: 'Heritage', distance: '2.9 km away', reason: 'Portuguese colonial church.' },
    { image: 'https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?auto=format&fit=crop&w=900&q=80', name: 'Arignar Anna Zoological Park', category: 'Nature', distance: '6.5 km away', reason: 'Large wildlife sanctuary.' },
    { image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', name: 'Dosa at Appachis', category: 'Food', distance: '2.2 km away', reason: 'Authentic South Indian breakfast.' },
    { image: 'https://images.unsplash.com/photo-1555529669-e69e7f0cf6e9?auto=format&fit=crop&w=900&q=80', name: 'T Nagar Shopping', category: 'Shopping', distance: '1.6 km away', reason: 'Traditional shopping district.' },
    { image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80', name: 'Parthasarathy Temple', category: 'Spiritual', distance: '2.8 km away', reason: 'Ancient Divya Desam shrine.' },
    { image: 'https://images.unsplash.com/photo-1516738901601-1e40f8a7fa6a?auto=format&fit=crop&w=900&q=80', name: 'Besant Nagar Beach', category: 'Nature', distance: '3.1 km away', reason: 'Calm coastal stretch.' },
    { image: 'https://images.unsplash.com/photo-1626249965127-92539eb14f9d?auto=format&fit=crop&w=900&q=80', name: 'Government Museum', category: 'Heritage', distance: '2.0 km away', reason: 'Indian art and prehistoric artifacts.' },
  ],
  Hyderabad: [
    { image: 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=900&q=80', name: 'Charminar', category: 'Heritage', distance: '2.2 km away', reason: 'Central old-city anchor.' },
    { image: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=80', name: 'Durgam Cheruvu', category: 'Nature', distance: '3.5 km away', reason: 'Good sunset and waterfront break.' },
    { image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', name: 'Shah Ghouse', category: 'Food', distance: '1.6 km away', reason: 'Well-known local flavor stop.' },
    { image: 'https://images.unsplash.com/photo-1569163139394-de4798aa62b7?auto=format&fit=crop&w=900&q=80', name: 'Laad Bazaar', category: 'Shopping', distance: '1.9 km away', reason: 'Traditional market with close-range walk.' },
    { image: 'https://images.unsplash.com/photo-1513236157202-b89fcf22db20?auto=format&fit=crop&w=900&q=80', name: 'Birla Mandir', category: 'Spiritual', distance: '4.1 km away', reason: 'Calm spiritual high-point.' },
    { image: 'https://images.unsplash.com/photo-1518548419970-58e7e36f9a50?auto=format&fit=crop&w=900&q=80', name: 'Golconda Fort', category: 'Heritage', distance: '5.0 km away', reason: 'Ancient fort with ruby mines history.' },
    { image: 'https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?auto=format&fit=crop&w=900&q=80', name: 'Hussain Sagar Lake', category: 'Nature', distance: '2.0 km away', reason: 'Urban lake with Buddha statue.' },
    { image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', name: 'Biryani at Paradise', category: 'Food', distance: '2.4 km away', reason: 'Famous Hyderabadi biryani.' },
    { image: 'https://images.unsplash.com/photo-1555529669-e69e7f0cf6e9?auto=format&fit=crop&w=900&q=80', name: 'Banjara Hills', category: 'Shopping', distance: '3.2 km away', reason: 'Upmarket retail and dining.' },
    { image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80', name: 'Mecca Masjid', category: 'Spiritual', distance: '2.5 km away', reason: 'Historic mosque near Charminar.' },
    { image: 'https://images.unsplash.com/photo-1516738901601-1e40f8a7fa6a?auto=format&fit=crop&w=900&q=80', name: 'Osman Sagar Dam', category: 'Nature', distance: '6.0 km away', reason: 'Water reservoir with scenic views.' },
    { image: 'https://images.unsplash.com/photo-1626249965127-92539eb14f9d?auto=format&fit=crop&w=900&q=80', name: 'Falaknuma Palace', category: 'Heritage', distance: '3.8 km away', reason: 'Palatial heritage hotel.' },
  ],
  Pune: [
    { image: 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=900&q=80', name: 'Shaniwar Wada', category: 'Heritage', distance: '1.5 km away', reason: 'Core historical attraction.' },
    { image: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=80', name: 'Pashan Lake', category: 'Nature', distance: '2.8 km away', reason: 'Lower-noise nature pocket.' },
    { image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', name: 'FC Road Food Lane', category: 'Food', distance: '2.4 km away', reason: 'Quick multi-option food cluster.' },
    { image: 'https://images.unsplash.com/photo-1569163139394-de4798aa62b7?auto=format&fit=crop&w=900&q=80', name: 'Phoenix Marketcity', category: 'Shopping', distance: '4.5 km away', reason: 'All-in-one shopping stop.' },
    { image: 'https://images.unsplash.com/photo-1513236157202-b89fcf22db20?auto=format&fit=crop&w=900&q=80', name: 'Dagdusheth Temple', category: 'Spiritual', distance: '1.7 km away', reason: 'Well-connected spiritual destination.' },
    { image: 'https://images.unsplash.com/photo-1518548419970-58e7e36f9a50?auto=format&fit=crop&w=900&q=80', name: 'Aga Khan Palace', category: 'Heritage', distance: '3.2 km away', reason: 'Gandhi-era historic monument.' },
    { image: 'https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?auto=format&fit=crop&w=900&q=80', name: 'Khadakwasla Dam', category: 'Nature', distance: '5.5 km away', reason: 'Scenic water body with viewpoint.' },
    { image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', name: 'Modak at Vibhavari', category: 'Food', distance: '1.9 km away', reason: 'Traditional sweet speciality.' },
    { image: 'https://images.unsplash.com/photo-1555529669-e69e7f0cf6e9?auto=format&fit=crop&w=900&q=80', name: 'MG Road', category: 'Shopping', distance: '1.8 km away', reason: 'Pedestrianized shopping street.' },
    { image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80', name: 'Parvati Hill Temple', category: 'Spiritual', distance: '2.1 km away', reason: 'Hilltop temple with city views.' },
    { image: 'https://images.unsplash.com/photo-1516738901601-1e40f8a7fa6a?auto=format&fit=crop&w=900&q=80', name: 'Mula-Mutha Riverside Walk', category: 'Nature', distance: '1.2 km away', reason: 'Restored riverside promenade.' },
    { image: 'https://images.unsplash.com/photo-1626249965127-92539eb14f9d?auto=format&fit=crop&w=900&q=80', name: 'Rajiv Gandhi Zoological Park', category: 'Heritage', distance: '6.0 km away', reason: 'Major wildlife park.' },
  ],
  Kochi: [
    { image: 'https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=900&q=80', name: 'Fort Kochi', category: 'Heritage', distance: '2.0 km away', reason: 'Strong heritage walk area.' },
    { image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80', name: 'Cherai Beach', category: 'Nature', distance: '1.2 km away', reason: 'Open coastal reset with easy pacing.' },
    { image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80', name: 'Mattancherry Cafes', category: 'Food', distance: '1.5 km away', reason: 'Local coastal food variety.' },
    { image: 'https://images.unsplash.com/photo-1569163139394-de4798aa62b7?auto=format&fit=crop&w=900&q=80', name: 'Broadway Market', category: 'Shopping', distance: '1.8 km away', reason: 'Traditional shopping route.' },
    { image: 'https://images.unsplash.com/photo-1513236157202-b89fcf22db20?auto=format&fit=crop&w=900&q=80', name: 'Chottanikkara Temple', category: 'Spiritual', distance: '3.6 km away', reason: 'Popular devotional destination.' },
    { image: 'https://images.unsplash.com/photo-1518548419970-58e7e36f9a50?auto=format&fit=crop&w=900&q=80', name: 'St. Francis Church', category: 'Heritage', distance: '2.2 km away', reason: 'Oldest European church in India.' },
    { image: 'https://images.unsplash.com/photo-1469022563149-aa64dbd37dae?auto=format&fit=crop&w=900&q=80', name: 'Vembanad Lake', category: 'Nature', distance: '4.0 km away', reason: 'Largest backwater system.' },
    { image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80', name: 'Appam at local cafes', category: 'Food', distance: '1.6 km away', reason: 'Kerala specialty crepes.' },
    { image: 'https://images.unsplash.com/photo-1555529669-e69e7f0cf6e9?auto=format&fit=crop&w=900&q=80', name: 'Jew Town', category: 'Shopping', distance: '2.5 km away', reason: 'Spice and antique district.' },
    { image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80', name: 'Paradesi Synagogue', category: 'Spiritual', distance: '2.6 km away', reason: 'Historic synagogue with tile floors.' },
    { image: 'https://images.unsplash.com/photo-1516738901601-1e40f8a7fa6a?auto=format&fit=crop&w=900&q=80', name: 'Chinese Fishing Nets', category: 'Nature', distance: '1.9 km away', reason: 'Iconic cantilevered fishing structures.' },
    { image: 'https://images.unsplash.com/photo-1626249965127-92539eb14f9d?auto=format&fit=crop&w=900&q=80', name: 'Mattancherry Palace', category: 'Heritage', distance: '2.4 km away', reason: 'Dutch palace with murals.' },
  ],
}

function parseClockToMinutes(value?: string): number | null {
  if (!value || !value.includes(':')) return null
  const [h, m] = value.split(':').map((v) => Number(v))
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function toClockLabel(totalMinutes: number): string {
  const mins = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(mins / 60)
  const mm = mins % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`
}

function buildSmartInitialItems(
  selectedPlaces: DestinationSuggestion[],
  windowFrom?: string,
  windowTo?: string,
): TimelineItem[] {
  if (!selectedPlaces.length) return []

  const from = parseClockToMinutes(windowFrom) ?? 9 * 60
  const toRaw = parseClockToMinutes(windowTo) ?? 20 * 60
  const to = toRaw <= from ? toRaw + 24 * 60 : toRaw
  const totalWindow = Math.max(120, to - from)
  const slotMinutes = Math.max(50, Math.min(130, Math.floor(totalWindow / selectedPlaces.length)))

  return selectedPlaces.map((place, idx) => {
    const start = from + idx * slotMinutes
    const end = Math.min(start + slotMinutes, to)
    const status: TimelineItem['status'] = idx === 0 ? 'current' : 'upcoming'
    return {
      id: `auto-${idx}-${place.name}`,
      time: `${toClockLabel(start)} - ${toClockLabel(end)}`,
      title: place.name,
      category: place.category || 'Suggested',
      duration: `${Math.max(30, end - start)} min`,
      description: place.reason || 'Auto-mapped from selected places in Plan.',
      status,
    }
  })
}

type DayBalanceSectionProps = {
  items: TimelineItem[]
}

function DayBalanceSection({ items }: DayBalanceSectionProps) {
  const totalStops = items.length

  // Get walking tolerance from localStorage (default: 15 km/day)
  const walkingTolerance = useMemo(() => {
    const stored = localStorage.getItem('stellora_walking_tolerance')
    return stored ? Number(stored) : 15
  }, [])

  // Estimate walking distance: ~1.5km per stop + 1.5km base for city exploration
  const estimatedWalkingDistance = 1.5 + totalStops * 1.5

  // Walking load: percentage of tolerance used
  const walkingLoad = clampIndex(Math.round((estimatedWalkingDistance / walkingTolerance) * 100), 100)
  const activityDensity = clampIndex(56 + totalStops * 6, 96)
  const restBalance = clampIndex(82 - totalStops * 9, 92)

  return (
    <section className="mt-8">
      <div className="rounded-3xl bg-white/5 border border-white/10 p-6">
        <h2 className="mb-6 text-sm font-bold uppercase tracking-[0.2em] text-white/70">Day Balance</h2>
        <div className="space-y-6">
          <div>
            <div className={`relative h-10 overflow-hidden rounded-full border border-opacity-30 bg-white/10 px-3 ${getColorForPercentage(walkingLoad).border}`}>
              <div
                className={`absolute inset-y-1 left-1 rounded-full transition-all duration-500 ${getColorForPercentage(walkingLoad).bg}`}
                style={{ width: `${Math.max(8, walkingLoad)}%`, opacity: 0.7 }}
              />
              <div className="relative z-10 flex h-full items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Walking Load</span>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white">{walkingLoad}%</span>
              </div>
            </div>
          </div>
          <div>
            <div className={`relative h-10 overflow-hidden rounded-full border border-opacity-30 bg-white/10 px-3 ${getColorForPercentage(activityDensity).border}`}>
              <div
                className={`absolute inset-y-1 left-1 rounded-full transition-all duration-500 ${getColorForPercentage(activityDensity).bg}`}
                style={{ width: `${Math.max(8, activityDensity)}%`, opacity: 0.7 }}
              />
              <div className="relative z-10 flex h-full items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Activity Density</span>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white">{activityDensity}%</span>
              </div>
            </div>
          </div>
          <div>
            <div className={`relative h-10 overflow-hidden rounded-full border border-opacity-30 bg-white/10 px-3 ${getColorForPercentage(restBalance).border}`}>
              <div
                className={`absolute inset-y-1 left-1 rounded-full transition-all duration-500 ${getColorForPercentage(restBalance).bg}`}
                style={{ width: `${Math.max(8, restBalance)}%`, opacity: 0.7 }}
              />
              <div className="relative z-10 flex h-full items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Rest Balance</span>
                <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold text-white">{restBalance}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function TimelineCuration() {
  const location = useLocation()
  const navigate = useNavigate()
  const destination = (location.state as { destination?: string } | undefined)?.destination || 'Your destination'
  const selectedPlaceDetails = destinationSuggestions[destination] || []
  const travelWindow = (location.state as { travelWindow?: { from?: string; to?: string } } | undefined)?.travelWindow
  const smartSeedItems = buildSmartInitialItems(selectedPlaceDetails, travelWindow?.from, travelWindow?.to)
  // Prefer explicit items passed via navigation (e.g., from Curate). Fallback to smartSeedItems, then fallbackTimeline.
  const sourceItems = ((location.state as { items?: TimelineItem[] } | undefined)?.items) || (smartSeedItems.length ? smartSeedItems : fallbackTimeline)

  const initialItems = sourceItems.map((item, idx) => ({
    ...item,
    status: item.status || (idx === 0 ? 'completed' : idx === 1 ? 'current' : 'upcoming'),
  }))

  const [items, setItems] = useState<TimelineItem[]>(initialItems)
  const [totalDistanceKm, setTotalDistanceKm] = useState<number | null>(null)
  const [legDistancesKm, setLegDistancesKm] = useState<number[]>([])
  const [routePoints, setRoutePoints] = useState<Array<[number, number]>>([])
  const [mapMarkers, setMapMarkers] = useState<Array<{ lat: number; lng: number; title?: string }>>([])
  const [expandedId, setExpandedId] = useState<string | null>(initialItems[1]?.id ?? null)
  const [alerts, setAlerts] = useState([
    { id: 'a1', text: 'Too much walking in the afternoon block - want to optimize?' },
    { id: 'a2', text: 'One stop is far from current route - replace with a closer option?' },
  ])
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const totalDuration = useMemo(() => `${items.length} stops planned`, [items.length])

  // Compute OSRM route distances whenever items change
  useEffect(() => {
    let active = true

    const computeDistances = async () => {
      if (!items.length) {
        if (active) {
          setTotalDistanceKm(null)
          setLegDistancesKm([])
        }
        return
      }

      // gather coordinates for items (try item.lat/item.lng or fetch details)
      const coords: Array<{ lat: number; lng: number; title?: string }> = []
      for (const it of items) {
        const place = it as TimelineItem & { lat?: number; lng?: number }
        if (place.lat != null && place.lng != null) {
          coords.push({ lat: place.lat, lng: place.lng, title: place.title })
          continue
        }

        try {
          const q = encodeURIComponent(it.title || '')
          const cityParam = encodeURIComponent(destination || '')
          const res = await fetch(resolveApiPath(`/api/places/details?query=${q}&city=${cityParam}`))
          if (!res.ok) throw new Error('no details')
          const data = await res.json()
          const d = data.details || {}
          if (d.lat != null && d.lng != null) {
            coords.push({ lat: d.lat, lng: d.lng, title: it.title })
            continue
          }
        } catch {
          // ignore, we'll skip this item
        }
      }

      if (coords.length < 2) {
        if (active) {
          setTotalDistanceKm(null)
          setLegDistancesKm([])
        }
        return
      }

      // Build coordinate string for OSRM: lon,lat;lon,lat;...
      // Start at first item and visit in order. Append first to return to start (recurring loop).
      const coordPairs = coords.map((c) => `${c.lng},${c.lat}`)
      // append first to return
      coordPairs.push(coordPairs[0])
      const coordStr = coordPairs.join(';')
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`OSRM ${resp.status}`)
        const body = await resp.json()
        const route = body.routes && body.routes[0]
        if (!route) throw new Error('no route')
        const totalMeters = route.distance as number
        const legs: number[] = (route.legs || []).map((l: any) => Number(l.distance || 0))

        // extract geojson geometry to draw on map (coordinates are [lon, lat])
        const geom: Array<[number, number]> = []
        if (route.geometry && route.geometry.coordinates) {
          for (const coord of route.geometry.coordinates) {
            geom.push([coord[1], coord[0]])
          }
        }

        if (active) {
          setTotalDistanceKm(Math.round((totalMeters / 1000) * 10) / 10)
          setLegDistancesKm(legs.map((m) => Math.round((m / 1000) * 10) / 10))
          setRoutePoints(geom)
          setMapMarkers(coords.map((c) => ({ lat: c.lat, lng: c.lng, title: c.title })))
        }
      } catch (err) {
        if (active) {
          setTotalDistanceKm(null)
          setLegDistancesKm([])
          setRoutePoints([])
          setMapMarkers([])
        }
      }
    }

    void computeDistances()

    return () => {
      active = false
    }
  }, [items, destination])

  const reorder = (fromId: string, toId: string) => {
    const fromIndex = items.findIndex((item) => item.id === fromId)
    const toIndex = items.findIndex((item) => item.id === toId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const next = [...items]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setItems(next)
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  const replaceItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, title: 'AI Replaced Premium Stop', description: 'Route-optimized replacement with lower crowd pressure.' }
          : item,
      ),
    )
  }

  const bumpTime = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, time: `${item.time} +15m` } : item)))
  }

  const addSuggestion = (name: string) => {
    setItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        time: '04:30 PM',
        title: name,
        category: 'Suggested',
        duration: '60 min',
        description: 'Added from Recommended Nearby.',
        status: 'upcoming',
      },
    ])
  }

  const openFullPageMap = () => {
    navigate('/full-map', {
      state: {
        items,
        destination,
        mapMarkers,
        routePoints,
      },
    })
  }

  return (
    <TripArcShell mainClassName="max-w-7xl">
      <section className="mb-7">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">Timeline Editor</p>
        <h1 className="mt-2 font-display text-5xl font-semibold text-white">Curate Your Journey</h1>
        <p className="mt-2 text-white/65">Customize your day for {destination}</p>
        {travelWindow?.from && travelWindow?.to && (
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#f7d982]">Travel window: {travelWindow.from} - {travelWindow.to}</p>
        )}
        <div className="mt-4 flex items-center gap-6">
          <div className="flex flex-col">
            <span className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">POIs</span>
            <span className="text-sm font-bold text-white">{items.length} Units</span>
          </div>
          <div className="flex flex-col">
            <span className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">Route Distance</span>
            <span className="text-sm font-bold text-white">{totalDistanceKm != null ? `${totalDistanceKm} km` : '—'}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-[1.45fr_0.95fr]">
        <section className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2"><Route size={14} /> {totalDuration}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em]">Drag to reorder</span>
            </div>
          </div>

          <div className="hidden space-y-3 md:block">
            {items.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <TimelineCard
                  item={item}
                  expanded={expandedId === item.id}
                  onToggleExpand={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                  onRemove={() => removeItem(item.id)}
                  onReplace={() => replaceItem(item.id)}
                  onEditTime={() => bumpTime(item.id)}
                  onDragStart={() => setDraggedId(item.id)}
                  onDragOver={() => undefined}
                  onDrop={() => {
                    if (!draggedId) return
                    reorder(draggedId, item.id)
                    setDraggedId(null)
                  }}
                />
              </motion.div>
            ))}
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 md:hidden">
            {items.map((item) => (
              <div key={item.id} className="min-w-[88%] snap-center">
                <TimelineCard
                  item={item}
                  expanded={expandedId === item.id}
                  onToggleExpand={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                  onRemove={() => removeItem(item.id)}
                  onReplace={() => replaceItem(item.id)}
                  onEditTime={() => bumpTime(item.id)}
                  onDragStart={() => undefined}
                  onDragOver={() => undefined}
                  onDrop={() => undefined}
                />
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-[#111116]/85 p-4 backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60">Recommended Nearby</h2>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f7d982]">{selectedPlaceDetails.length} places</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {selectedPlaceDetails.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.name}
                  image={suggestion.image}
                  name={suggestion.name}
                  distance={suggestion.distance}
                  reason={suggestion.reason}
                  onAdd={() => addSuggestion(suggestion.name)}
                />
              ))}
            </div>
          </div>

          <div className="group relative h-72 overflow-hidden rounded-3xl border border-white/10 bg-[#05070a] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.35)] cursor-pointer transition-all hover:border-white/20 hover:shadow-[0_24px_120px_rgba(6,182,212,0.15)]" onClick={() => navigate('/ontrip')}>
            {/* Map Background */}
            <div className="absolute inset-0 z-0">
              <LeafletMap markers={mapMarkers} route={routePoints} />
            </div>

            {/* Gradient Overlays */}
            <div className="absolute inset-0 z-[5] bg-gradient-to-t from-black/70 via-black/20 to-black/10 pointer-events-none" />
            <div className="absolute inset-0 z-[6] bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,0.18),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(247,217,130,0.10),transparent_30%)] pointer-events-none" />

            {/* Content Overlay */}
            <div className="relative z-10 flex h-full flex-col justify-between p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase tracking-[0.3em] text-[#06B6D4]">nav scan / active</p>
                  <h4 className="text-xl font-black tracking-tight text-white">{destination}</h4>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-black/60 transition-colors" onClick={(e) => e.stopPropagation()}>
                    <span className="material-symbols-outlined text-[20px]">my_location</span>
                  </button>
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-black/60 transition-colors" onClick={(e) => e.stopPropagation()}>
                    <span className="material-symbols-outlined text-[20px]">layers</span>
                  </button>
                  <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-[#06B6D4]/30 transition-colors opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); navigate('/ontrip'); }}>
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-6">
                  <div className="flex flex-col">
                    <span className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">POIs</span>
                    <span className="text-sm font-bold text-white">{items.length} Units</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-white/30">Optim</span>
                    <span className="text-sm font-bold text-[#06B6D4]">{totalDistanceKm != null ? `${Math.max(0, 100 - Math.min(100, totalDistanceKm))}%` : '—'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#06B6D4] animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white">Live</span>
                </div>
              </div>
            </div>

            {/* Distance Badge */}
            {legDistancesKm.length > 0 && (
              <div className="absolute bottom-3 left-6 z-20 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 backdrop-blur-md">
                Legs: {legDistancesKm.join(' km • ')} km
              </div>
            )}
          </div>
        </aside>
      </div>

      {alerts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 grid w-[min(380px,92vw)] gap-3">
          {alerts.map((alert) => (
            <SmartAlert
              key={alert.id}
              text={alert.text}
              onAccept={() => setAlerts((prev) => prev.filter((item) => item.id !== alert.id))}
              onModify={() => setAlerts((prev) => prev.filter((item) => item.id !== alert.id))}
              onDismiss={() => setAlerts((prev) => prev.filter((item) => item.id !== alert.id))}
            />
          ))}
        </div>
      )}

      <DayBalanceSection items={items} />
    </TripArcShell>
  )
}
