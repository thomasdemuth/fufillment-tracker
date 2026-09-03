import { useEffect, useState } from 'react'
import { Filter, X } from 'lucide-react'
import type { Facets } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { countActiveFilters, type Filters } from '@/lib/filters'
import { STATUS_ORDER, statusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'

function MultiSelect({ label, values, options, onChange }: { label: string; values: string[]; options: { value: string; label: string }[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} className={cn(values.length && 'border-accent text-accent')}>
        {label}
        {values.length > 0 && <span className="rounded bg-accent-soft px-1 text-[10px]">{values.length}</span>}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-30 max-h-72 w-56 overflow-auto rounded-md border border-border bg-panel p-1 shadow-pop">
            {options.length === 0 && <div className="px-2 py-1.5 text-xs text-muted">No options</div>}
            {options.map((o) => {
              const checked = values.includes(o.value)
              return (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-panel-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange(checked ? values.filter((v) => v !== o.value) : [...values, o.value])}
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              )
            })}
            {values.length > 0 && (
              <button className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-muted hover:bg-panel-2" onClick={() => onChange([])}>
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function FilterBar({
  filters,
  setFilters,
  reset,
  facets,
  compact,
  stacked,
}: {
  filters: Filters
  setFilters: (p: Partial<Filters>) => void
  reset: () => void
  facets?: Facets
  compact?: boolean
  /** phones: vertical layout inside a sheet, no search field, 'more' always open */
  stacked?: boolean
}) {
  const [q, setQ] = useState(filters.q ?? '')
  useEffect(() => setQ(filters.q ?? ''), [filters.q])
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? '') !== q) setFilters({ q: q || undefined })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])
  const [more, setMore] = useState(!!stacked)
  const n = countActiveFilters(filters)

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('flex flex-wrap items-center gap-2', stacked && '[&>div]:w-full [&>div>button]:w-full [&>div>button]:justify-between [&>div>button]:h-10')}>
        {!stacked && (
        <Input
          id="global-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, tracking, order, city…  ( / )"
          className={compact ? 'w-56' : 'w-72'}
        />
        )}
        <MultiSelect
          label="Status"
          values={filters.status}
          options={STATUS_ORDER.map((s) => ({ value: s, label: statusMeta(s).label }))}
          onChange={(status) => setFilters({ status })}
        />
        <MultiSelect
          label="Carrier"
          values={filters.carrier}
          options={[{ value: 'usps', label: 'USPS' }, { value: 'fedex', label: 'FedEx' }, { value: 'unknown', label: 'Unknown' }]}
          onChange={(carrier) => setFilters({ carrier })}
        />
        <MultiSelect
          label="State"
          values={filters.state}
          options={(facets?.states ?? []).map((s) => ({ value: s, label: s }))}
          onChange={(state) => setFilters({ state })}
        />
        <MultiSelect
          label="Upload"
          values={filters.upload_id.map(String)}
          options={(facets?.uploads ?? []).map((u) => ({ value: String(u.id), label: `${u.filename} (${u.count})` }))}
          onChange={(v) => setFilters({ upload_id: v.map(Number) })}
        />
        {(facets?.tags?.length ?? 0) > 0 && (
          <MultiSelect label="Tag" values={filters.tag} options={(facets?.tags ?? []).map((t) => ({ value: t.name, label: t.name }))} onChange={(tag) => setFilters({ tag })} />
        )}
        {!stacked && (
        <Button variant={more ? 'secondary' : 'ghost'} size="sm" onClick={() => setMore((m) => !m)}>
          <Filter className="h-3.5 w-3.5" /> More
        </Button>
        )}
        {n > 0 && !stacked && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted">
            <X className="h-3.5 w-3.5" /> Clear {n}
          </Button>
        )}
      </div>
      {more && (
        <div className={cn('flex flex-wrap items-end gap-3 rounded-control border border-border bg-panel-2/60 p-2 text-xs', stacked && 'grid grid-cols-2 [&_input:not([type=checkbox])]:h-10 [&_select]:h-10 [&_input:not([type=checkbox])]:w-full [&_input[type=checkbox]]:h-5 [&_input[type=checkbox]]:w-5')}>
          <Field label="City">
            <Input value={filters.city ?? ''} onChange={(e) => setFilters({ city: e.target.value || undefined })} className="h-8 w-36" placeholder="contains…" />
          </Field>
          <Field label="Shipped from">
            <Input type="date" value={filters.ship_date_from ?? ''} onChange={(e) => setFilters({ ship_date_from: e.target.value || undefined })} className="h-8" />
          </Field>
          <Field label="Shipped to">
            <Input type="date" value={filters.ship_date_to ?? ''} onChange={(e) => setFilters({ ship_date_to: e.target.value || undefined })} className="h-8" />
          </Field>
          <Field label="Last event from">
            <Input type="date" value={filters.last_event_from ?? ''} onChange={(e) => setFilters({ last_event_from: e.target.value || undefined })} className="h-8" />
          </Field>
          <Field label="Days in transit ≥">
            <Input type="number" min={0} value={filters.days_min ?? ''} onChange={(e) => setFilters({ days_min: e.target.value === '' ? undefined : Number(e.target.value) })} className="h-8 w-20" />
          </Field>
          <Field label="≤">
            <Input type="number" min={0} value={filters.days_max ?? ''} onChange={(e) => setFilters({ days_max: e.target.value === '' ? undefined : Number(e.target.value) })} className="h-8 w-20" />
          </Field>
          <Field label="On map">
            <Select value={filters.geocoded === undefined ? '' : filters.geocoded ? '1' : '0'} onChange={(e) => setFilters({ geocoded: e.target.value === '' ? undefined : e.target.value === '1' })} className="h-8">
              <option value="">Any</option>
              <option value="1">Placed</option>
              <option value="0">Not placed</option>
            </Select>
          </Field>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!filters.attention} onChange={(e) => setFilters({ attention: e.target.checked || undefined })} />
            Needs attention
          </label>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
