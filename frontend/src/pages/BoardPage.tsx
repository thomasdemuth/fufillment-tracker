import { useNavigate } from 'react-router'
import { Upload } from 'lucide-react'
import { useFacets, useShipments, useStats } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { MobileHeader } from '@/components/layout/MobileShell'
import { ShareButton } from '@/components/layout/ShareButton'
import { FilterBar } from '@/components/filters/FilterBar'
import { MobileFilters } from '@/components/filters/FilterSheet'
import { Pagination } from '@/components/board/Pagination'
import { ShipmentCards } from '@/components/board/ShipmentCards'
import { ShipmentTable } from '@/components/board/ShipmentTable'
import { StatTiles } from '@/components/board/StatTiles'
import { Button } from '@/components/ui/button'
import { dataFilters } from '@/lib/filters'
import { useFilters } from '@/lib/useFilters'
import { useIsMobile } from '@/lib/useIsMobile'
import { RefreshButton } from '@/components/shipment/RefreshButton'
import { ExportButton } from '@/components/board/ExportButton'
import { ShipmentDrawer } from '@/components/shipment/ShipmentDrawer'

export function BoardPage() {
  const { filters, setFilters, reset, params, setParams } = useFilters()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const page = filters.page ?? 1
  const pageSize = filters.page_size ?? (mobile ? 25 : 50)
  const shipments = useShipments({ ...filters, page, page_size: pageSize })
  const stats = useStats(dataFilters(filters))
  const facets = useFacets()
  const selected = params.get('shipment') ? Number(params.get('shipment')) : null

  const openShipment = (id: number | null) => {
    if (mobile && id) return navigate(`/shipments/${id}`)
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (id) p.set('shipment', String(id))
        else p.delete('shipment')
        return p
      },
      { replace: true },
    )
  }
  const toggleStatus = (s: string) => setFilters({ status: filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s] })

  if (mobile) {
    const total = shipments.data?.total ?? 0
    const pages = Math.max(1, Math.ceil(total / pageSize))
    return (
      <>
        <MobileHeader title="Board" subtitle={shipments.data ? `${total} shipments` : undefined}>
          <RefreshButton filters={filters} />
        </MobileHeader>
        <MobileFilters filters={filters} setFilters={setFilters} reset={reset} facets={facets.data} />
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="mb-3">
            <StatTiles stats={stats.data} activeStatuses={filters.status} onToggleStatus={toggleStatus} onAttention={() => navigate('/attention')} scroll />
          </div>
          <ShipmentCards rows={shipments.data?.items ?? []} onOpen={(s) => openShipment(s.id)} loading={shipments.isFetching} />
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilters({ page: page - 1 })}>
                Previous
              </Button>
              <span>
                {page} / {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setFilters({ page: page + 1 })}>
                Next
              </Button>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Status board" subtitle={shipments.data ? `${shipments.data.total} shipments` : undefined}>
        <ShareButton label="Send to phone" />
        <ExportButton filters={filters} />
        <RefreshButton filters={filters} />
        <Button variant="outline" size="sm" onClick={() => navigate('/uploads/new')}>
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <StatTiles stats={stats.data} activeStatuses={filters.status} onToggleStatus={toggleStatus} onAttention={() => navigate('/attention')} />
        <FilterBar filters={filters} setFilters={setFilters} reset={reset} facets={facets.data} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-panel shadow-card">
          <ShipmentTable
            rows={shipments.data?.items ?? []}
            sort={filters.sort}
            onSort={(sort) => setFilters({ sort })}
            onRowClick={(s) => openShipment(s.id)}
            selectedId={selected}
            loading={shipments.isFetching}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={shipments.data?.total ?? 0}
            onPage={(p) => setFilters({ page: p })}
            onPageSize={(n) => setFilters({ page_size: n, page: 1 })}
          />
        </div>
      </div>
      <ShipmentDrawer id={selected} onClose={() => openShipment(null)} />
    </>
  )
}
