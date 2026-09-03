import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

/** True below the md breakpoint. The mobile and desktop layouts are separate trees, not just reflowed CSS. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}
