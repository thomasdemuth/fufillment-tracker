import { useCallback, useMemo, useState } from 'react'
import { MobileHeader } from '@/components/layout/MobileShell'
import { ShareButton } from '@/components/layout/ShareButton'
import { MobileFilters } from '@/components/filters/FilterSheet'
import { MapSheet } from '@/components/map/MapSheet'
import { useIsMobile } from '@/lib/useIsMobile'
import { useNavigate } from 'react-router'
import { LayoutList, Upload } from 'lucide-react'
import { useConfig, useFacets, useMapPoints, useMapStates, useStats } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { FilterBar } from '@/components/filters/FilterBar'
import { MapLegend } from '@/components/map/MapLegend'
import { MapModeToggle } from '@/components/map/MapModeToggle'
import { MapView } from '@/components/map/MapView'
import { Button } from '@/components/ui/button'
import { isReadOnly } from '@/api/client'
import { RefreshButton } from '@/components/shipment/RefreshButton'
import { ShipmentDrawer } from '@/components/shipment/ShipmentDrawer'
import { dataFilters, filtersToParams } from '@/lib/filters'
import { useFilters } from '@/lib/useFilters'
import { useIsDark, useUiStore } from '@/stores/uiStore'

export function MapPage() {
  const { filters, setFilters, reset, params, setParams } = useFilters()
  const navigate = useNavigate()
  const mode = useUiStore((s) => s.mapMode)
  const setMode = useUiStore((s) => s.setMapMode)
  const config = useConfig()
  const dark = useIsDark()
  const mobile = useIsMobile()
  const [legendOpen, setLegendOpen] = useState(false)
  const [problemsOnly, setProblemsOnly] = useState(false)
  const df = useMemo(() => {
    const base = dataFilters(filters)
    if (!problemsOnly) return base
    return { ...base, status: ['exception', 'returned'] }
  }, [filters, problemsOnly])
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

  const mapEl = config.data && (
    <MapView
      styleUrl={dark ? config.data.map_style_url_dark : config.data.map_style_url}
      mode={mode}
      points={points.data}
      states={states.data}
      selectedId={selected}
      controlsPosition={mobile ? 'bottom-right' : 'top-right'}
      onSelect={openShipment}
      onStateClick={(postal) => setFilters({ state: filters.state.includes(postal) ? filters.state.filter((s) => s !== postal) : [...filters.state, postal] })}
    />
  )

  if (mobile) {
    return (
      <>
        <MobileHeader title="Map" subtitle={stats.data ? `${total} placed${notPlaced ? ` · ${notPlaced} unplaced` : ''}` : undefined}>
          <RefreshButton filters={filters} />
        </MobileHeader>
        <MobileFilters filters={filters} setFilters={setFilters} reset={reset} facets={facets.data} chips={false} />
        <div className="relative min-h-0 flex-1">
          {mapEl}
          <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 flex items-start justify-between gap-2">
            <div className="pointer-events-auto max-w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <MapModeToggle mode={mode} onChange={setMode} problemsOnly={problemsOnly} onProblemsOnly={setProblemsOnly} />
            </div>
          </div>
          <button onClick={() => setLegendOpen((o) => !o)} className="absolute bottom-3 left-3 z-10 rounded-full border border-border bg-panel/95 px-3 py-1.5 text-[12px] font-medium text-text-2 shadow-card">
            {legendOpen ? 'Hide legend' : 'Legend'}
          </button>
          {legendOpen && (
            <div className="absolute bottom-12 left-3 z-10">
              <MapLegend mode={mode} counts={stats.data?.by_status} />
            </div>
          )}
          {total === 0 && !points.isFetching && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="rounded-card border border-border bg-panel/95 px-4 py-3 text-center text-[13px] shadow-pop">
                <div className="font-medium">Nothing to show yet</div>
                <div className="mt-0.5 text-[12px] text-muted">Upload a spreadsheet, or clear the filters.</div>
              </div>
            </div>
          )}
        </div>
        <MapSheet id={selected} onClose={() => openShipment(null)} />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Map" subtitle={stats.data ? `${total} placed${notPlaced ? ` · ${notPlaced} without a location` : ''}` : undefined}>
        <ShareButton label="Send to phone" />
        <RefreshButton filters={filters} />
        <Button variant="outline" size="sm" onClick={() => navigate(`/board?${filtersToParams(df)}`)}>
          <LayoutList className="h-3.5 w-3.5" /> Board view
        </Button>
        {!isReadOnly() && (
        <Button variant="outline" size="sm" onClick={() => navigate('/uploads/new')}>
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
        )}
      </PageHeader>
      <div className="border-b border-border bg-panel px-4 py-2">
        <FilterBar filters={filters} setFilters={setFilters} reset={reset} facets={facets.data} compact />
      </div>
      <div className="relative min-h-0 flex-1">
        {mapEl}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
          <div className="pointer-events-auto">
            <MapModeToggle mode={mode} onChange={setMode} problemsOnly={problemsOnly} onProblemsOnly={setProblemsOnly} />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-8 left-3 z-10">
          <div className="pointer-events-auto">
            <MapLegend mode={mode} counts={stats.data?.by_status} />
          </div>
        </div>
        {points.isFetching && <div className="absolute right-3 top-14 z-10 rounded-control border border-border bg-panel/95 px-2 py-1 text-[11px] text-muted shadow-card">Updating…</div>}
        {total === 0 && !points.isFetching && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="pointer-events-auto rounded-card border border-border bg-panel/95 px-5 py-4 text-center shadow-pop">
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
