import { AlertTriangle, Check, RotateCcw } from 'lucide-react'
import { format, isToday, isTomorrow } from 'date-fns'
import type { ShipmentDetail } from '@/api/queries'
import { fmtDate, fmtRelative, parseDate } from '@/lib/format'
import { statusMeta, type Status } from '@/lib/status'
import { cn } from '@/lib/utils'

export const STEPS: { key: Status; label: string }[] = [
  { key: 'label_created', label: 'Label created' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
]

export interface StepperModel {
  /** index of the furthest reached step (0-3), or -1 when nothing is known */
  reached: number
  /** whether the shipment is off the happy path */
  problem: 'exception' | 'returned' | null
  active: boolean
  /** ISO timestamps per step when known */
  times: (string | null)[]
  headline: string
  sub: string
}

type EventLike = { normalized_status: string; event_at: string | null }
type Input = Pick<ShipmentDetail, 'status' | 'status_raw' | 'expected_delivery' | 'delivered_at' | 'last_event_at' | 'last_event_desc' | 'last_event_place' | 'last_polled_at' | 'attention_flag'> & { events: EventLike[] }

export function deriveStepper(s: Input): StepperModel {
  const times: (string | null)[] = [null, null, null, null]
  let reached = -1
  const sorted = [...s.events].sort((a, b) => (a.event_at ?? '').localeCompare(b.event_at ?? ''))
  for (const e of sorted) {
    const step = statusMeta(e.normalized_status).step
    if (step == null) continue
    if (!times[step]) times[step] = e.event_at
    if (step > reached) reached = step
  }
  const own = statusMeta(s.status).step
  if (own != null && own > reached) reached = own
  if (s.status === 'delivered') {
    reached = 3
    times[3] = times[3] ?? s.delivered_at ?? null
  }
  const problem = s.status === 'exception' ? 'exception' : s.status === 'returned' ? 'returned' : null
  if (problem && reached < 0) reached = 1
  const active = !problem && s.status !== 'delivered' && s.status !== 'unknown'

  let headline: string
  const expected = parseDate(s.expected_delivery)
  if (s.status === 'delivered') headline = s.delivered_at ? `Delivered ${fmtDate(s.delivered_at, true)}` : 'Delivered'
  else if (s.status === 'exception') headline = s.attention_flag === 'pickup' ? 'Waiting for pickup' : 'Delivery problem'
  else if (s.status === 'returned') headline = 'Returning to sender'
  else if (s.status === 'unknown') headline = s.last_polled_at ? 'Status unknown' : 'Not checked yet'
  else if (s.status === 'out_for_delivery') headline = 'Out for delivery today'
  else if (expected) headline = isToday(expected) ? 'Arriving today' : isTomorrow(expected) ? 'Arriving tomorrow' : `Arriving ${format(expected, 'EEEE, MMM d')}`
  else if (s.status === 'label_created') headline = 'Label created, waiting for carrier pickup'
  else headline = 'On its way'

  let sub: string
  if (s.status === 'unknown' && !s.last_polled_at) sub = 'Click Refresh to fetch tracking from the carrier.'
  else if (s.last_event_desc) sub = `${s.last_event_desc}${s.last_event_place ? ` · ${s.last_event_place}` : ''}${s.last_event_at ? ` · ${fmtRelative(s.last_event_at)}` : ''}`
  else sub = s.status_raw ?? 'No tracking events yet.'
  return { reached, problem, active, times, headline, sub }
}

export function ProgressStepper({ shipment, actions }: { shipment: Input; actions?: React.ReactNode }) {
  const m = deriveStepper(shipment)
  const problemColor = 'var(--st-exception)'
  return (
    <div className="rounded-card border border-border bg-panel p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {m.problem && <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: problemColor }} />}
            {shipment.status === 'delivered' && <Check className="h-4 w-4 shrink-0 text-status-delivered" />}
            <h2 className={cn('text-[17px] font-semibold leading-tight tracking-[-0.01em]', m.problem && 'text-danger')}>{m.headline}</h2>
          </div>
          <p className="mt-1 text-[12.5px] text-text-2">{m.sub}</p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-[3px]" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={Math.max(0, m.reached + 1)} aria-label="Delivery progress">
        {STEPS.map((_, i) => {
          const done = i <= m.reached
          const current = i === m.reached
          const isProblem = !!m.problem && current
          const color = isProblem ? problemColor : shipment.status === 'delivered' ? 'var(--st-delivered)' : 'var(--accent)'
          return (
            <div key={i} className={cn('h-[6px] overflow-hidden bg-panel-2', i === 0 && 'rounded-l-full', i === 3 && 'rounded-r-full')}>
              {done && (
                <div
                  className={cn('h-full w-full animate-progress', current && m.active && 'animate-soft-pulse')}
                  style={{ backgroundColor: color, animationDelay: `${i * 90}ms` }}
                />
              )}
            </div>
          )
        })}
      </div>
      <ol className="mt-2 grid grid-cols-4 gap-[3px]">
        {STEPS.map((st, i) => {
          const done = i <= m.reached
          const current = i === m.reached
          const t = m.times[i]
          return (
            <li key={st.key} className={cn('min-w-0 text-[11.5px] leading-tight', current ? 'font-semibold text-text' : done ? 'text-text-2' : 'text-muted')}>
              <div className="flex items-center gap-1 truncate">
                {m.problem && current ? (
                  m.problem === 'returned' ? <RotateCcw className="h-3 w-3 shrink-0" style={{ color: problemColor }} /> : <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: problemColor }} />
                ) : null}
                <span className="truncate">{m.problem && current ? (m.problem === 'returned' ? 'Returned' : 'Exception') : st.label}</span>
              </div>
              {t && <div className="truncate text-[10.5px] font-normal text-muted">{fmtDate(t, true)}</div>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
