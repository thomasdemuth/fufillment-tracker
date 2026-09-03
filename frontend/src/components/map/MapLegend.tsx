import { STATUS_ORDER, statusMeta } from '@/lib/status'
import type { MapMode } from '@/stores/uiStore'

export function MapLegend({ mode, counts }: { mode: MapMode; counts?: Record<string, number> }) {
  if (mode === 'heatmap') {
    return (
      <div className="rounded-lg border border-border bg-panel/95 px-3 py-2 text-[11px] shadow-md backdrop-blur">
        <div className="mb-1 font-medium">Density</div>
        <div className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.6), #facc15, #f97316, #dc2626)' }} />
        <div className="mt-0.5 flex justify-between gap-3 text-muted">
          <span>few</span>
          <span>many · exceptions weigh 2×</span>
        </div>
      </div>
    )
  }
  if (mode === 'states') {
    return (
      <div className="rounded-lg border border-border bg-panel/95 px-3 py-2 text-[11px] shadow-md backdrop-blur">
        <div className="mb-1 font-medium">Shipments per state</div>
        <div className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(148,163,184,0.15), rgba(45,212,191,0.5), rgba(15,118,110,0.9))' }} />
        <div className="mt-0.5 flex justify-between gap-3 text-muted">
          <span>0</span>
          <span>200+</span>
        </div>
        <div className="mt-1 text-muted">Click a state to filter.</div>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border bg-panel/95 px-3 py-2 text-[11px] shadow-md backdrop-blur">
      <div className="mb-1 font-medium">Status</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {STATUS_ORDER.map((s) => {
          const m = statusMeta(s)
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-white/70" style={{ backgroundColor: m.color }} />
              <span>{m.label}</span>
              {counts && <span className="ml-auto tabular-nums text-muted">{counts[s] ?? 0}</span>}
            </div>
          )
        })}
      </div>
      <div className="mt-1 text-muted">Clusters take the color of their most common status. A red ring means at least one exception inside.</div>
    </div>
  )
}
