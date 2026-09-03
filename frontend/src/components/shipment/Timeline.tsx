import { statusMeta } from '@/lib/status'
import { fmtDate, fmtRelative } from '@/lib/format'

export interface EventRow {
  id: number
  event_at: string | null
  event_at_raw: string | null
  code: string | null
  description: string
  normalized_status: string
  city: string | null
  state: string | null
  postal_code: string | null
}

export function Timeline({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return <div className="rounded-control border border-dashed border-border-strong/60 px-3 py-6 text-center text-[12px] text-muted">No tracking events yet. Refresh to fetch the latest from the carrier.</div>
  }
  return (
    <ol className="relative ml-[5px] border-l border-border pl-4">
      {events.map((e, i) => {
        const m = statusMeta(e.normalized_status)
        const color = `var(--st-${m.token.replace('status-', '')})`
        const place = [e.city, e.state].filter(Boolean).join(', ')
        return (
          <li key={e.id} className="relative pb-4 last:pb-0">
            <span className="absolute -left-[21.5px] top-[5px] h-[9px] w-[9px] rounded-full border-2 border-panel" style={{ backgroundColor: color, boxShadow: i === 0 ? `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` : undefined }} />
            <div className="flex items-baseline justify-between gap-3">
              <div className={i === 0 ? 'text-[13px] font-medium text-text' : 'text-[13px] text-text-2'}>{e.description}</div>
              <div className="shrink-0 text-[11px] text-muted" title={e.event_at_raw ?? undefined}>
                {e.event_at ? fmtRelative(e.event_at) : e.event_at_raw}
              </div>
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              {e.event_at ? fmtDate(e.event_at, true) : ''}
              {place ? ` · ${place}` : ''}
              {e.postal_code ? ` ${e.postal_code}` : ''}
              {e.code ? ` · ${e.code}` : ''}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
