import { STATUS_ORDER, statusMeta } from '@/lib/status'
import type { MapMode } from '@/stores/uiStore'
import { mapPalette } from '@/lib/mapLayers'
import { useIsDark } from '@/stores/uiStore'

function Swatch({ status }: { status: string }) {
  const m = statusMeta(status)
  const color = `var(--st-${m.token.replace('status-', '')})`
  if (m.marker === 'hollow') return <span className="h-2.5 w-2.5 rounded-full border-2 bg-panel" style={{ borderColor: color }} />
  if (m.marker === 'ring') return <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-text" style={{ backgroundColor: color }} />
  return <span className="h-2.5 w-2.5 rounded-full border border-panel" style={{ backgroundColor: color }} />
}

export function MapLegend({ mode, counts }: { mode: MapMode; counts?: Record<string, number> }) {
  const dark = useIsDark()
  const p = mapPalette(dark)
  const wrap = 'rounded-card border border-border bg-panel/95 px-3 py-2.5 text-[11px] shadow-pop backdrop-blur'
  if (mode === 'heatmap') {
    return (
      <div className={wrap}>
        <div className="mb-1.5 font-semibold text-text">Density</div>
        <div className="h-2 w-44 rounded-full" style={{ background: `linear-gradient(90deg, ${p.heat[1]}, ${p.heat[2]}, ${p.heat[3]})` }} />
        <div className="mt-1 flex justify-between gap-3 text-muted">
          <span>few</span>
          <span>many</span>
        </div>
        <div className="mt-1 text-muted">Exceptions and returns weigh double.</div>
      </div>
    )
  }
  if (mode === 'states') {
    return (
      <div className={wrap}>
        <div className="mb-1.5 font-semibold text-text">Shipments per state</div>
        <div className="h-2 w-44 rounded-full" style={{ background: `linear-gradient(90deg, ${p.accentRamp[0]}, ${p.accentRamp[2]}, ${p.accentRamp[4]})` }} />
        <div className="mt-1 flex justify-between gap-3 text-muted">
          <span>0</span>
          <span>200+</span>
        </div>
        <div className="mt-1 text-muted">Click a state to filter.</div>
      </div>
    )
  }
  return (
    <div className={wrap}>
      <div className="mb-1.5 font-semibold text-text">Status</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="flex items-center gap-1.5 text-text-2">
            <Swatch status={s} />
            <span>{statusMeta(s).label}</span>
            {counts && <span className="ml-auto tabular-nums text-muted">{counts[s] ?? 0}</span>}
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-muted">Clusters take their most common status; a red ring means a problem inside.</div>
    </div>
  )
}
