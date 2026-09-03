import { useNavigate } from 'react-router'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAttention, useConfig, useFacets, type AttentionRow } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { FilterBar } from '@/components/filters/FilterBar'
import { ExportButton } from '@/components/board/ExportButton'
import { RefreshButton } from '@/components/shipment/RefreshButton'
import { ShipmentDrawer } from '@/components/shipment/ShipmentDrawer'
import { CarrierBadge, StatusBadge } from '@/components/ui/status-badge'
import { dataFilters } from '@/lib/filters'
import { fmtDays, fmtRelative, placeLabel } from '@/lib/format'
import { ATTENTION_REASONS } from '@/lib/status'
import { useFilters } from '@/lib/useFilters'
import { cn } from '@/lib/utils'

const GROUPS: { key: string; title: string; reasons: string[]; tone: string }[] = [
  { key: 'exceptions', title: 'Exceptions and returns', reasons: ['exception', 'returned', 'delivery_failed'], tone: 'text-danger' },
  { key: 'pickup', title: 'Waiting for pickup', reasons: ['pickup'], tone: 'text-status-ofd' },
  { key: 'stuck', title: 'No movement', reasons: ['stuck_pre_transit', 'stuck_in_transit'], tone: 'text-status-ofd' },
  { key: 'errors', title: 'Tracking errors', reasons: ['poll_errors'], tone: 'text-muted' },
  { key: 'geo', title: 'Not on the map', reasons: ['not_geocoded'], tone: 'text-muted' },
]

export function AttentionPage() {
  const { filters, setFilters, reset, params, setParams } = useFilters()
  const navigate = useNavigate()
  const q = useAttention(dataFilters(filters))
  const facets = useFacets()
  const config = useConfig()
  const selected = params.get('shipment') ? Number(params.get('shipment')) : null
  const open = (id: number | null) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (id) p.set('shipment', String(id))
        else p.delete('shipment')
        return p
      },
      { replace: true },
    )

  const rows = q.data ?? []
  const grouped = GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.reasons.some((x) => g.reasons.includes(x)) && !GROUPS.slice(0, GROUPS.indexOf(g)).some((prev) => r.reasons.some((x) => prev.reasons.includes(x)))) })).filter((g) => g.rows.length > 0)

  return (
    <>
      <PageHeader title="Needs attention" subtitle={`Exceptions, returns, pickups, and shipments with no scans for ${config.data?.stuck_days ?? 7}+ days`}>
        <ExportButton filters={{ ...filters, attention: true }} />
        <RefreshButton filters={filters} />
      </PageHeader>
      <div className="border-b border-border bg-panel px-4 py-2">
        <FilterBar filters={filters} setFilters={setFilters} reset={reset} facets={facets.data} compact />
      </div>
      <div className="flex-1 overflow-auto p-4">
        {q.data && rows.length === 0 && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-status-delivered" />
            <h2 className="mt-3 text-base font-semibold">All clear</h2>
            <p className="mt-1 text-sm text-muted">Nothing needs a look right now. Shipments appear here after a refresh flags an exception, a return, a pickup, or a long silence.</p>
          </div>
        )}
        <div className="flex flex-col gap-5">
          {grouped.map((g) => (
            <section key={g.key}>
              <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', g.tone)}>
                <AlertTriangle className="h-4 w-4" /> {g.title} <span className="rounded-full bg-panel-2 px-2 text-[11px] text-muted">{g.rows.length}</span>
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {g.rows.map((r) => (
                  <AttentionCard key={r.id} r={r} onClick={() => open(r.id)} active={selected === r.id} />
                ))}
              </div>
            </section>
          ))}
        </div>
        {rows.length > 0 && (
          <div className="mt-6 text-center text-xs text-muted">
            Adjust the "stuck after N days" rule in{' '}
            <button className="underline" onClick={() => navigate('/settings')}>
              Settings
            </button>
            .
          </div>
        )}
      </div>
      <ShipmentDrawer id={selected} onClose={() => open(null)} />
    </>
  )
}

function AttentionCard({ r, onClick, active }: { r: AttentionRow; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={cn('rounded-card border border-border bg-panel p-3 text-left shadow-card transition-colors hover:bg-panel-2', active && 'border-accent')}>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={r.status} />
        <CarrierBadge carrier={r.carrier} confidence={r.carrier_confidence} />
      </div>
      <div className="mt-2 truncate font-medium">{r.recipient_name ?? '—'}</div>
      <div className="truncate text-xs text-muted">{placeLabel(r)}</div>
      <div className="mt-2 truncate text-xs">{r.last_event_desc ?? r.status_raw ?? 'No status yet'}</div>
      <div className="text-[11px] text-muted">
        {r.last_event_at ? `${fmtRelative(r.last_event_at)}` : 'no events'} · {fmtDays(r.days_in_transit)} in transit
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {r.reasons.map((x) => (
          <span key={x} className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">
            {ATTENTION_REASONS[x] ?? x}
          </span>
        ))}
      </div>
    </button>
  )
}
