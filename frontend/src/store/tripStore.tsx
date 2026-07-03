import React, { useState, useEffect } from 'react'

export interface TimelineItem {
  time: string
  title: string
  location: string
  durationMinutes: number
  lat: number
  lng: number
  description?: string
  energy?: string
}

export interface ItineraryDay {
  day: number
  date: string
  items: TimelineItem[]
}

export interface TravelerInfo {
  id: string
  name: string
  role?: string
  preferences?: Record<string, any>
}

export interface ActivityLogEntry {
  action: string
  params: Record<string, any>
  timestamp: number
  sourcePageId?: string
  previousStateSnapshot: Partial<TripState>
}

export interface TripState {
  tripId: string
  destination: string
  dates: { start: string; end: string }
  budget: { amount: number; currency: string }
  itinerary: ItineraryDay[]
  travelers: TravelerInfo[]
  preferences: Record<string, any>
  activityLog: ActivityLogEntry[]
  activeDay?: number
}

type Listener = (state: TripState) => void

class TripStoreClass {
  private state: TripState
  private listeners = new Set<Listener>()

  constructor(initialState: TripState) {
    this.state = initialState
  }

  getState = () => this.state

  setState = (nextState: Partial<TripState> | ((state: TripState) => TripState)) => {
    this.state = typeof nextState === 'function'
      ? (nextState as Function)(this.state)
      : { ...this.state, ...nextState }
    
    // Trigger listeners
    this.listeners.forEach(listener => listener(this.state))
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  logOraAction = (actionName: string, params: Record<string, any>, sourcePageId?: string) => {
    // Record relevant previous state slices depending on action
    const previousSnapshot: Partial<TripState> = {}
    if (actionName === 'update_itinerary' || actionName === 'add_activity' || actionName === 'remove_activity') {
      previousSnapshot.itinerary = JSON.parse(JSON.stringify(this.state.itinerary))
    }
    if (actionName === 'set_budget') {
      previousSnapshot.budget = JSON.parse(JSON.stringify(this.state.budget))
    }
    if (actionName === 'add_destination' || actionName === 'update_itinerary') {
      previousSnapshot.destination = this.state.destination
    }

    const logEntry: ActivityLogEntry = {
      action: actionName,
      params,
      timestamp: Date.now(),
      sourcePageId,
      previousStateSnapshot: previousSnapshot
    }

    this.setState(prev => ({
      ...prev,
      activityLog: [...prev.activityLog, logEntry]
    }))
  }

  undoLastAction = () => {
    if (this.state.activityLog.length === 0) return

    const logCopy = [...this.state.activityLog]
    const lastAction = logCopy.pop()!

    console.log(`[TripStore] Undoing action: ${lastAction.action}`, lastAction.params)

    this.setState(prev => ({
      ...prev,
      ...lastAction.previousStateSnapshot,
      activityLog: logCopy
    }))
  }
}

// Initial state loader
const getInitialState = (): TripState => {
  let localDraft = null
  try {
    const raw = localStorage.getItem('triparc:journey:draft:v1')
    if (raw) localDraft = JSON.parse(raw)
  } catch (e) {}

  const items = localDraft?.items || []
  const destination = localDraft?.city || 'Kyoto'

  return {
    tripId: 'kyoto-trip-2026',
    destination,
    dates: { start: '2026-07-02', end: '2026-07-09' },
    budget: { amount: 3000, currency: 'USD' },
    itinerary: [
      {
        day: 1,
        date: '2026-07-02',
        items: items.length > 0 ? items : [
          {
            time: '08:00 AM',
            title: 'Arashiyama Grove',
            location: 'Arashiyama Bamboo Grove',
            durationMinutes: 90,
            lat: 35.0095,
            lng: 135.6670,
            description: 'Early walk through the bamboo paths before the crowds arrive.'
          },
          {
            time: '11:30 AM',
            title: 'Golden Pavilion',
            location: 'Kinkaku-ji',
            durationMinutes: 90,
            lat: 35.0394,
            lng: 135.7292,
            description: 'Exploring the Kinkaku-ji zen temple and the surrounding mirror pond.'
          },
          {
            time: '01:30 PM',
            title: 'Omen Noodles',
            location: 'Omen Noodles',
            durationMinutes: 60,
            lat: 35.0035,
            lng: 135.7788,
            description: 'Traditional udon set with seasonal Kyoto vegetables.'
          },
          {
            time: '04:00 PM',
            title: 'Nishiki Market',
            location: 'Nishiki Market',
            durationMinutes: 120,
            lat: 35.0045,
            lng: 135.7647,
            description: "Browsing local crafts and tasting 'Kyoto's Kitchen' specialties."
          }
        ]
      }
    ],
    travelers: [
      { id: 'user-1', name: 'John Doe', role: 'Organizer' }
    ],
    preferences: {
      pace: 'moderate',
      dietary: []
    },
    activityLog: [],
    activeDay: 1
  }
}

const tripStoreInstance = new TripStoreClass(getInitialState())

// Synchronize store updates back to local storage for backward compatibility!
tripStoreInstance.subscribe((state) => {
  try {
    localStorage.setItem('triparc:journey:draft:v1', JSON.stringify({
      city: state.destination,
      items: state.itinerary[0]?.items || []
    }))
  } catch (e) {}
})

export const tripStore = tripStoreInstance

export function useTripStore<S>(selector: (state: TripState) => S): S {
  const [slice, setSlice] = useState(() => selector(tripStore.getState()))

  useEffect(() => {
    return tripStore.subscribe((state) => {
      const nextSlice = selector(state)
      setSlice((prev) => {
        // Simple comparison of JSON representations
        if (JSON.stringify(prev) === JSON.stringify(nextSlice)) {
          return prev
        }
        return nextSlice
      })
    })
  }, [selector])

  return slice
}
