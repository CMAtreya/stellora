import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

export interface PageContext {
  pageId: string                 // e.g. "trip-planner", "seven-pillars"
  pageSummary?: string           // 1-line summary for otherPagesSummary
  visibleEntities: {
    type: string                 // e.g. "activity", "destination"
    id: string
    summary: string              // short human-readable description
    fullData?: Record<string, any> // COMPLETE entity details
  }[]
  availableActions: string[]     // action types whitelisted on this page
  userFacingState: Record<string, any> // COMPLETE current state of the page's user-relevant data
  lastUpdated: number           // timestamp for staleness check
}

interface OraContextType {
  pageContext: PageContext | null
  setPageContext: (ctx: PageContext | null) => void
  updatePageContext: (ctx: Partial<PageContext>) => void
  getOtherPagesSummary: () => { pageId: string; summary: string }[]
}

let activePageIdRef: string | null = null

export function getActivePageId(): string | null {
  return activePageIdRef
}

const OraContext = createContext<OraContextType | undefined>(undefined)

const checkAndTruncateContext = (c: PageContext): PageContext => {
  try {
    const serialized = JSON.stringify(c)
    // 2000 tokens ≈ 8000 characters
    if (serialized.length > 8000) {
      console.warn(`[ORA PageContext Guard] Limit exceeded for page "${c.pageId}" (${serialized.length} chars). Truncating fullData of visible entities to preserve context window.`)
      return {
        ...c,
        visibleEntities: c.visibleEntities.map(entity => ({
          ...entity,
          fullData: undefined
        }))
      }
    }
  } catch (e) {
    console.error('[ORA PageContext Guard] Error serializing page context:', e)
  }
  return c
}

export function OraContextProvider({ children }: { children: React.ReactNode }) {
  const [pageContext, setPageContextState] = useState<PageContext | null>(null)
  const [pageContexts, setPageContexts] = useState<Record<string, PageContext>>({})
  const debounceTimerRef = useRef<any>(null)

  const setPageContext = useCallback((ctx: PageContext | null) => {
    if (!ctx) {
      setPageContextState(null)
      activePageIdRef = null
      return
    }

    const withTimestamp: PageContext = {
      ...ctx,
      lastUpdated: ctx.lastUpdated || Date.now()
    }
    const processed = checkAndTruncateContext(withTimestamp)
    activePageIdRef = processed.pageId
    setPageContextState(processed)
    setPageContexts((prev) => ({
      ...prev,
      [processed.pageId]: processed
    }))
  }, [])

  const updatePageContext = useCallback((updatedFields: Partial<PageContext>) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      setPageContextState((prev) => {
        if (!prev) return null
        const merged: PageContext = {
          ...prev,
          ...updatedFields,
          visibleEntities: updatedFields.visibleEntities !== undefined ? updatedFields.visibleEntities : prev.visibleEntities,
          availableActions: updatedFields.availableActions !== undefined ? updatedFields.availableActions : prev.availableActions,
          userFacingState: {
            ...prev.userFacingState,
            ...(updatedFields.userFacingState || {})
          },
          lastUpdated: Date.now()
        }

        const processed = checkAndTruncateContext(merged)

        setPageContexts((prevContexts) => ({
          ...prevContexts,
          [processed.pageId]: processed
        }))

        return processed
      })
    }, 500) // Debounce 500ms
  }, [])

  const getOtherPagesSummary = useCallback(() => {
    const activeId = activePageIdRef
    return Object.values(pageContexts)
      .filter((ctx) => ctx.pageId !== activeId)
      .map((ctx) => ({
        pageId: ctx.pageId,
        summary: ctx.pageSummary || `${ctx.pageId} page with ${ctx.visibleEntities.length} items`
      }))
  }, [pageContexts])

  return (
    <OraContext.Provider value={{ pageContext, setPageContext, updatePageContext, getOtherPagesSummary }}>
      {children}
    </OraContext.Provider>
  )
}

export function useOraPageContext() {
  const context = useContext(OraContext)
  if (!context) {
    throw new Error('useOraPageContext must be used within an OraContextProvider')
  }
  return context
}

