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
    <div className="flex flex-wrap gap-2">
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
              'group min-w-[104px] flex-1 rounded-xl border bg-panel px-3 py-2 text-left shadow-sm transition-colors hover:bg-panel-2',
              active ? 'border-current' : 'border-border',
            )}
            style={active ? { color: m.color } : undefined}
            title={`Filter by ${m.label}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted group-hover:text-text">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
              {m.label}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-xl font-semibold tabular-nums text-text">{fmtNumber(n)}</span>
              {total > 0 && <span className="text-[11px] text-muted">{Math.round((n / total) * 100)}%</span>}
            </div>
          </button>
        )
      })}
      <Tile
        label="Needs attention"
        value={fmtNumber(stats?.attention ?? 0)}
        accent={(stats?.attention ?? 0) > 0 ? '#ef4444' : undefined}
        onClick={onAttention}
      />
      <Tile label="Avg transit" value={stats?.avg_days_in_transit != null ? `${stats.avg_days_in_transit}d` : '—'} sub={stats?.median_days_in_transit != null ? `median ${stats.median_days_in_transit}d` : 'delivered only'} />
    </div>
  )
}

function Tile({ label, value, sub, accent, onClick }: { label: string; value: string; sub?: string; accent?: string; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cn('min-w-[104px] flex-1 rounded-xl border border-border bg-panel px-3 py-2 text-left shadow-sm', onClick && 'hover:bg-panel-2')}>
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </Comp>
  )
}
