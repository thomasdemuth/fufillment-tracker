import { ChevronRight } from 'lucide-react'
import type { ShipmentRow } from '@/api/queries'
import { CarrierBadge, StatusBadge } from '@/components/ui/status-badge'
import { fmtDays, fmtRelative, placeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Phone list: one tappable card per shipment. */
export function ShipmentCards({ rows, onOpen, loading }: { rows: ShipmentRow[]; onOpen: (s: ShipmentRow) => void; loading?: boolean }) {
  if (rows.length === 0 && !loading) return <div className="px-4 py-16 text-center text-[13px] text-muted">No shipments match these filters.</div>
  return (
    <ul className={cn('flex flex-col gap-2', loading && 'opacity-60')}>
      {rows.map((s) => (
        <li key={s.id}>
          <button onClick={() => onOpen(s)} className="flex w-full items-center gap-3 rounded-card border border-border bg-panel px-3 py-3 text-left shadow-card active:bg-panel-2" data-shipment-id={s.id}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={s.status} />
                <CarrierBadge carrier={s.carrier} confidence={s.carrier_confidence} />
                <span className="ml-auto text-[11px] tabular-nums text-muted">{fmtDays(s.days_in_transit)}</span>
              </div>
              <div className="mt-1.5 truncate text-[15px] font-medium">{s.recipient_name ?? '—'}</div>
              <div className="truncate text-[12px] text-muted">{placeLabel(s)}</div>
              <div className="mt-1 truncate text-[12px] text-text-2">
                {s.last_event_desc ?? 'No events yet'}
                {s.last_event_at ? <span className="text-muted"> · {fmtRelative(s.last_event_at)}</span> : null}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  )
}
