import { useEffect, useState } from 'react'
import { useUiStore } from '@/stores/uiStore'

const QUERY = '(max-width: 767px)'

/** True when the phone layout should be used: below the md breakpoint, unless the user forced a layout. */
export function useIsMobile(): boolean {
  const layout = useUiStore((s) => s.layout)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  if (layout === 'desktop') return false
  if (layout === 'phone') return true
  return narrow
}
