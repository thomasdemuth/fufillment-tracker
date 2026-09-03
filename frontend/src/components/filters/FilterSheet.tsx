import { useEffect, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import type { Facets } from '@/api/queries'
import { FilterBar } from '@/components/filters/FilterBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { countActiveFilters, type Filters } from '@/lib/filters'
import { STATUS_ORDER, statusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'

/** Phone filter row: search, scrolling status chips, and a Filters button that opens the full filter set in a sheet. */
export function MobileFilters({ filters, setFilters, reset, facets, chips = true }: { filters: Filters; setFilters: (p: Partial<Filters>) => void; reset: () => void; facets?: Facets; chips?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(filters.q ?? '')
  useEffect(() => setQ(filters.q ?? ''), [filters.q])
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? '') !== q) setFilters({ q: q || undefined })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  const n = countActiveFilters(filters)
  return (
    <div className="shrink-0 border-b border-border bg-panel px-3 py-2">
      <div className="flex items-center gap-2">
        <Input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, tracking, order…" className="h-10 text-[15px]" inputMode="search" />
        <Button variant={n ? 'default' : 'outline'} size="icon" className="h-10 w-10 shrink-0" onClick={() => setOpen(true)} aria-label="Filters">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>
      {chips && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={filters.status.length === 0} onClick={() => setFilters({ status: [] })}>
            All
          </Chip>
          {STATUS_ORDER.map((s) => {
            const m = statusMeta(s)
            const active = filters.status.includes(s)
            return (
              <Chip key={s} active={active} onClick={() => setFilters({ status: active ? filters.status.filter((x) => x !== s) : [...filters.status, s] })}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--st-${m.token.replace('status-', '')})` }} />
                {m.short}
              </Chip>
            )
          })}
        </div>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters" height="auto">
        <FilterBar filters={filters} setFilters={setFilters} reset={reset} facets={facets} compact stacked />
        <div className="mt-4 flex gap-2">
          {n > 0 && (
            <Button variant="outline" className="h-11 flex-1" onClick={reset}>
              <X className="h-4 w-4" /> Clear all
            </Button>
          )}
          <Button className="h-11 flex-1" onClick={() => setOpen(false)}>
            Show results
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium', active ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-panel text-text-2')}>
      {children}
    </button>
  )
}
