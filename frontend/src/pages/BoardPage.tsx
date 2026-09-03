import { useNavigate } from 'react-router'
import { Upload } from 'lucide-react'
import { useFacets, useShipments, useStats } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { FilterBar } from '@/components/filters/FilterBar'
import { Pagination } from '@/components/board/Pagination'
import { ShipmentTable } from '@/components/board/ShipmentTable'
import { StatTiles } from '@/components/board/StatTiles'
import { Button } from '@/components/ui/button'
import { dataFilters } from '@/lib/filters'
import { useFilters } from '@/lib/useFilters'
import { RefreshButton } from '@/components/shipment/RefreshButton'
import { ExportButton } from '@/components/board/ExportButton'
import { ShipmentDrawer } from '@/components/shipment/ShipmentDrawer'

export function BoardPage() {
  const { filters, setFilters, reset, params, setParams } = useFilters()
  const navigate = useNavigate()
  const page = filters.page ?? 1
  const pageSize = filters.page_size ?? 50
  const shipments = useShipments({ ...filters, page, page_size: pageSize })
  const stats = useStats(dataFilters(filters))
  const facets = useFacets()
  const selected = params.get('shipment') ? Number(params.get('shipment')) : null

  const openShipment = (id: number | null) => {
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

  return (
    <>
      <PageHeader title="Status board" subtitle={shipments.data ? `${shipments.data.total} shipments` : undefined}>
        <ExportButton filters={filters} />
        <RefreshButton filters={filters} />
        <Button variant="outline" size="sm" onClick={() => navigate('/uploads/new')}>
          <Upload className="h-3.5 w-3.5" /> Upload
        </Button>
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <StatTiles
          stats={stats.data}
          activeStatuses={filters.status}
          onToggleStatus={(s) => setFilters({ status: filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s] })}
          onAttention={() => navigate('/attention')}
        />
        <FilterBar filters={filters} setFilters={setFilters} reset={reset} facets={facets.data} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
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
