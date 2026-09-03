import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { useIsDark } from '@/stores/uiStore'

export const BLANK_STYLE = '/geo/blank-style.json'
export const BLANK_STYLE_DARK = '/geo/blank-style-dark.json'

export interface BasemapState {
  style: string
  unavailable: boolean
  retry: () => void
  onError: (message: string) => void
}

/** Loads the configured basemap; if the style/tiles can't be fetched (offline, blocked host), falls back to a
 *  blank background so shipment data still renders, and retries when the browser comes back online. */
export function useBasemap(styleUrl: string): BasemapState {
  const dark = useIsDark()
  const blank = dark ? BLANK_STYLE_DARK : BLANK_STYLE
  const [style, setStyle] = useState(styleUrl)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    setStyle(styleUrl)
    setUnavailable(false)
  }, [styleUrl])
  useEffect(() => {
    if (unavailable) setStyle(blank)
  }, [blank, unavailable])
  const retry = useCallback(() => {
    setUnavailable(false)
    setStyle(blank)
    // force a re-mount of the style by toggling
    setTimeout(() => setStyle(styleUrl), 50)
  }, [styleUrl, blank])
  useEffect(() => {
    if (!unavailable) return
    const onOnline = () => retry()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [unavailable, retry])
  const onError = useCallback(
    (message: string) => {
      if (style === BLANK_STYLE || style === BLANK_STYLE_DARK) return
      if (/style|Failed to fetch|NetworkError|Load failed|403|404|ERR_/i.test(message)) {
        setUnavailable(true)
        setStyle(blank)
      }
    },
    [style, blank],
  )
  return { style, unavailable, retry, onError }
}

export function BasemapBanner({ state }: { state: BasemapState }) {
  if (!state.unavailable) return null
  return (
    <div className="pointer-events-auto absolute left-1/2 top-14 z-20 flex max-w-[min(92%,640px)] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-control border border-border bg-panel/95 px-3 py-1.5 text-[12px] text-text-2 shadow-pop backdrop-blur">
      <WifiOff className="h-3.5 w-3.5 shrink-0 text-muted" />
      <span className="hidden sm:inline">Basemap unavailable, showing your data on a blank background. Check your internet connection or set an offline style in Settings.</span>
      <span className="sm:hidden">Basemap offline · data only</span>
      <button onClick={state.retry} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </div>
  )
}
