import type { Stats } from '@/api/queries'
import { STATUS_ORDER, statusMeta } from '@/lib/status'
import { fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export function StatTiles({
  stats,
  activeStatuses,
  onToggleStatus,
  onAttention,
}: {
  stats?: Stats
  activeStatuses: string[]
  onToggleStatus: (s: string) => void
  onAttention?: () => void
}) {
  const total = stats?.total ?? 0
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))' }}>
      <Tile label="Total" value={fmtNumber(total)} sub={stats ? `${stats.by_carrier.usps ?? 0} USPS · ${stats.by_carrier.fedex ?? 0} FedEx` : undefined} />
      {STATUS_ORDER.map((s) => {
        const n = stats?.by_status?.[s] ?? 0
        const m = statusMeta(s)
        const active = activeStatuses.includes(s)
        return (
          <button
            key={s}
            onClick={() => onToggleStatus(s)}
            className={cn(
              'group rounded-card border bg-panel px-3 py-2.5 text-left shadow-card transition-colors hover:bg-panel-2',
              active ? 'border-accent ring-1 ring-accent/40' : 'border-border',
            )}
            title={`Filter by ${m.label}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted group-hover:text-text-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--st-${m.token.replace('status-', '')})` }} />
              <span className="truncate">{m.label}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-text">{fmtNumber(n)}</span>
              {total > 0 && <span className="text-[11px] tabular-nums text-muted">{Math.round((n / total) * 100)}%</span>}
            </div>
          </button>
        )
      })}
      <Tile label="Needs attention" value={fmtNumber(stats?.attention ?? 0)} accent={(stats?.attention ?? 0) > 0 ? 'var(--danger)' : undefined} onClick={onAttention} />
      <Tile label="Avg transit" value={stats?.avg_days_in_transit != null ? `${stats.avg_days_in_transit}d` : '—'} sub={stats?.median_days_in_transit != null ? `median ${stats.median_days_in_transit}d` : 'delivered only'} />
    </div>
  )
}

function Tile({ label, value, sub, accent, onClick }: { label: string; value: string; sub?: string; accent?: string; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cn('rounded-card border border-border bg-panel px-3 py-2.5 text-left shadow-card', onClick && 'transition-colors hover:bg-panel-2')}>
      <div className="truncate text-[11px] font-medium text-muted">{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.02em]" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[11px] text-muted">{sub}</div>}
    </Comp>
  )
}
