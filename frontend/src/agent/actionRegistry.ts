import { tripStore } from '../store/tripStore'
import { getActivePageId } from '../types/oraContext'

type ActionHandler = (params: Record<string, any>) => void | Promise<void>;

class ActionRegistry {
  private handlers: Map<string, ActionHandler> = new Map()

  constructor() {
    // 1. Static global router navigation (Touches: none / UI state routing)
    this.register('navigate', (params) => {
      if (params.path) {
        const event = new CustomEvent('ora-navigate', { detail: { path: params.path } })
        window.dispatchEvent(event)
      }
    })

    // 2. Update Itinerary Action (Touches slice: TripState.itinerary OR TripState.destination)
    this.register('update_itinerary', (params) => {
      const pageId = getActivePageId() || undefined
      if (params.items) {
        tripStore.logOraAction('update_itinerary', params, pageId)
        tripStore.setState((prev) => {
          const incomingItems = Array.isArray(params.items) ? params.items : []
          const grouped = new Map<number, any[]>()
          for (const item of incomingItems) {
            const d = Number(item.dayNumber || item.day || 1)
            const list = grouped.get(d) || []
            list.push({
              time: item.time || '10:00 AM',
              title: item.title || item.name || 'Planned stop',
              location: item.location || item.title || 'Planned stop',
              durationMinutes: item.durationMinutes || item.baseDurationMinutes || 60,
              lat: item.lat || 35.0116,
              lng: item.lng || 135.7681,
              description: item.description || ''
            })
            grouped.set(d, list)
          }

          const nextItinerary = [...prev.itinerary]
          const maxDay = Math.max(1, ...Array.from(grouped.keys()))
          while (nextItinerary.length < maxDay) {
            const nextDayNum = nextItinerary.length + 1
            const todayStr = new Date().toISOString().split('T')[0]
            nextItinerary.push({
              day: nextDayNum,
              date: todayStr,
              items: []
            })
          }

          for (const [dayNum, dayItems] of grouped.entries()) {
            nextItinerary[dayNum - 1] = {
              ...nextItinerary[dayNum - 1],
              day: dayNum,
              items: dayItems
            }
          }

          return { ...prev, itinerary: nextItinerary }
        })
      } else if (params.city) {
        tripStore.logOraAction('update_itinerary', params, pageId)
        tripStore.setState((prev) => ({
          ...prev,
          destination: params.city
        }))
      }
    })

    // 3. Add Activity Stop Action (Touches slice: TripState.itinerary)
    // 3. Add Activity Stop Action (Touches slice: TripState.itinerary)
    this.register('add_activity', (params) => {
      if (params.title) {
        const pageId = getActivePageId() || undefined
        tripStore.logOraAction('add_activity', params, pageId)
        
        const dayNumber = Number(params.dayNumber || params.day || tripStore.getState().activeDay || 1)
        const newItem = {
          time: params.time || '10:00 AM',
          title: params.title,
          location: params.location || params.title,
          durationMinutes: params.durationMinutes || 60,
          lat: params.lat || 35.0116,
          lng: params.lng || 135.7681,
          description: params.description || ''
        }
        
        tripStore.setState((prev) => {
          const nextItinerary = [...prev.itinerary]
          const targetIndex = dayNumber - 1
          
          while (nextItinerary.length <= targetIndex) {
            const nextDayNum = nextItinerary.length + 1
            const todayStr = new Date().toISOString().split('T')[0]
            nextItinerary.push({
              day: nextDayNum,
              date: todayStr,
              items: []
            })
          }
          
          const targetDay = nextItinerary[targetIndex]
          nextItinerary[targetIndex] = {
            ...targetDay,
            items: [...(targetDay.items || []), newItem]
          }
          return { ...prev, itinerary: nextItinerary }
        })
      }
    })

    // 4. Remove Activity Stop Action (Touches slice: TripState.itinerary)
    this.register('remove_activity', (params) => {
      if (params.title) {
        const pageId = getActivePageId() || undefined
        tripStore.logOraAction('remove_activity', params, pageId)
        const titleToCompare = params.title.toLowerCase().trim()
        const dayNumber = params.dayNumber || params.day
        
        tripStore.setState((prev) => {
          const nextItinerary = prev.itinerary.map((dayObj) => {
            if (dayNumber && Number(dayObj.day) !== Number(dayNumber)) {
              return dayObj
            }
            return {
              ...dayObj,
              items: (dayObj.items || []).filter((item) => {
                const itemTitle = (item.title || item.location || '').toLowerCase().trim()
                return itemTitle !== titleToCompare
              })
            }
          })
          return { ...prev, itinerary: nextItinerary }
        })
      }
    })

    // 5. Set Budget Action (Touches slice: TripState.budget)
    this.register('set_budget', (params) => {
      const pageId = getActivePageId() || undefined
      tripStore.logOraAction('set_budget', params, pageId)
      tripStore.setState((prev) => ({
        ...prev,
        budget: {
          amount: typeof params.amount === 'number' ? params.amount : (Number(params.amount) || prev.budget.amount),
          currency: params.currency || prev.budget.currency
        }
      }))
    })

    // 6. Add Destination / Set Destination Action (Touches slice: TripState.destination)
    this.register('add_destination', (params) => {
      if (params.destination) {
        const pageId = getActivePageId() || undefined
        tripStore.logOraAction('add_destination', params, pageId)
        tripStore.setState((prev) => ({
          ...prev,
          destination: params.destination
        }))
      }
    })

    // 7. Show Day Action (Touches slice: TripState.activeDay)
    this.register('show_day', (params) => {
      const pageId = getActivePageId() || undefined
      tripStore.logOraAction('show_day', params, pageId)
      if (typeof params.day === 'number') {
        tripStore.setState({ activeDay: params.day })
      } else if (params.day) {
        tripStore.setState({ activeDay: Number(params.day) || 1 })
      }
    })
  }

  register(type: string, handler: ActionHandler) {
    this.handlers.set(type, handler)
  }

  unregister(type: string) {
    this.handlers.delete(type)
  }

  async dispatch(type: string, params: Record<string, any>) {
    const handler = this.handlers.get(type)
    if (handler) {
      try {
        await handler(params)
      } catch (err) {
        console.error(`Failed to execute action ${type}:`, err)
      }
    } else {
      console.warn(`No handler registered for action type: ${type}`)
    }
  }
}

export const globalActionRegistry = new ActionRegistry()

