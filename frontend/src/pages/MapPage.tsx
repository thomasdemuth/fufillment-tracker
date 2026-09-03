import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { LayoutList, Upload } from 'lucide-react'
import { useConfig, useFacets, useMapPoints, useMapStates, useStats } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { FilterBar } from '@/components/filters/FilterBar'
import { MapLegend } from '@/components/map/MapLegend'
import { MapModeToggle } from '@/components/map/MapModeToggle'
import { MapView } from '@/components/map/MapView'
import { Button } from '@/components/ui/button'
import { RefreshButton } from '@/components/shipment/RefreshButton'
import { ShipmentDrawer } from '@/components/shipment/ShipmentDrawer'
import { dataFilters, filtersToParams } from '@/lib/filters'
import { useFilters } from '@/lib/useFilters'
import { useUiStore } from '@/stores/uiStore'

export function MapPage() {
  const { filters, setFilters, reset, params, setParams } = useFilters()
  const navigate = useNavigate()
  const mode = useUiStore((s) => s.mapMode)
  const setMode = useUiStore((s) => s.setMapMode)
  const config = useConfig()
  const df = dataFilters(filters)
  const points = useMapPoints(df)
  const states = useMapStates(df)
  const stats = useStats(df)
  const facets = useFacets()
  const selected = params.get('shipment') ? Number(params.get('shipment')) : null

  const openShipment = useCallback(
    (id: number | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (id) p.set('shipment', String(id))
          else p.delete('shipment')
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const total = points.data?.features.length ?? 0
  const notPlaced = stats.data?.not_geocoded ?? 0

  return (
    <>
      <PageHeader title="Map" subtitle={stats.data ? `${total} placed${notPlaced ? ` · ${notPlaced} without a location` : ''}` : undefined}>
        <RefreshButton filters={filters} />
        <Button variant="outline" size="sm" onClick={() => navigate(`/board?${filtersToParams(df)}`)}>
          <LayoutList className="h-3.5 w-3.5" /> Board view
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/uploads/new')}>
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
      </PageHeader>
      <div className="border-b border-border bg-panel px-4 py-2">
        <FilterBar filters={filters} setFilters={setFilters} reset={reset} facets={facets.data} compact />
      </div>
      <div className="relative min-h-0 flex-1">
        {config.data && (
          <MapView
            styleUrl={config.data.map_style_url}
            mode={mode}
            points={points.data}
            states={states.data}
            selectedId={selected}
            onSelect={openShipment}
            onStateClick={(postal) => setFilters({ state: filters.state.includes(postal) ? filters.state.filter((s) => s !== postal) : [...filters.state, postal] })}
          />
        )}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
          <div className="pointer-events-auto">
            <MapModeToggle mode={mode} onChange={setMode} />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-8 left-3 z-10">
          <div className="pointer-events-auto">
            <MapLegend mode={mode} counts={stats.data?.by_status} />
          </div>
        </div>
        {points.isFetching && <div className="absolute right-3 top-14 z-10 rounded bg-panel/90 px-2 py-1 text-[11px] text-muted shadow">Updating…</div>}
        {total === 0 && !points.isFetching && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="pointer-events-auto rounded-xl border border-border bg-panel/95 px-5 py-4 text-center shadow-lg">
              <div className="font-medium">Nothing to show yet</div>
              <div className="mt-1 text-xs text-muted">Upload a spreadsheet with ZIP codes, or clear the filters.</div>
            </div>
          </div>
        )}
      </div>
      <ShipmentDrawer id={selected} onClose={() => openShipment(null)} />
    </>
  )
}
