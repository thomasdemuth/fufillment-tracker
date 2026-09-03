import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { filtersToParams, parseFilters, type Filters } from './filters'

/** Filters live in the URL so Map, Board and Attention share them and links are shareable. */
export function useFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseFilters(params), [params])
  const setFilters = useCallback(
    (patch: Partial<Filters> | ((f: Filters) => Partial<Filters>), opts?: { replace?: boolean }) => {
      setParams(
        (prev) => {
          const current = parseFilters(prev)
          const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) }
          // any data-filter change resets paging
          if (!('page' in (typeof patch === 'function' ? patch(current) : patch))) next.page = undefined
          const p = filtersToParams(next)
          // preserve non-filter params (e.g. ?shipment=)
          prev.forEach((v, k) => {
            if (!(k in next) && !p.has(k)) p.set(k, v)
          })
          return p
        },
        { replace: opts?.replace ?? true },
      )
    },
    [setParams],
  )
  const reset = useCallback(() => {
    setParams((prev) => {
      const p = new URLSearchParams()
      const keep = prev.get('shipment')
      if (keep) p.set('shipment', keep)
      return p
    })
  }, [setParams])
  return { filters, setFilters, reset, params, setParams }
}
