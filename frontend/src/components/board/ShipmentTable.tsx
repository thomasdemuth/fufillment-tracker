import { useMemo, useState } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type VisibilityState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, ExternalLink } from 'lucide-react'
import type { ShipmentRow } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { CarrierBadge, StatusBadge } from '@/components/ui/status-badge'
import { fmtDate, fmtDays, fmtRelative, placeLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

type SortState = { key: string; desc: boolean }

export function parseSort(sort?: string): SortState {
  const s = sort || '-last_event_at'
  return { key: s.replace(/^-/, ''), desc: s.startsWith('-') }
}

export function columns(): ColumnDef<ShipmentRow>[] {
  return [
    { id: 'status', accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: 'recipient_name',
      accessorKey: 'recipient_name',
      header: 'Recipient',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.recipient_name ?? '—'}</div>
          {row.original.company && <div className="truncate text-[11px] text-muted">{row.original.company}</div>}
        </div>
      ),
    },
    {
      id: 'city',
      accessorKey: 'city',
      header: 'Destination',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{placeLabel(row.original) || '—'}</div>
          <div className="truncate text-[11px] text-muted">{row.original.address1}</div>
        </div>
      ),
    },
    { id: 'state', accessorKey: 'state', header: 'ST', cell: ({ getValue }) => <span className="font-mono text-xs">{(getValue() as string) ?? '—'}</span> },
    {
      id: 'carrier',
      accessorKey: 'carrier',
      header: 'Carrier',
      cell: ({ row }) => <CarrierBadge carrier={row.original.carrier} confidence={row.original.carrier_confidence} />,
    },
    {
      id: 'tracking_number',
      accessorKey: 'tracking_number',
      header: 'Tracking',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 font-mono text-xs">
          {row.original.tracking_number}
          {row.original.carrier_url && (
            <a
              href={row.original.carrier_url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="text-muted hover:text-accent"
              title="Open on carrier site"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
      ),
    },
    { id: 'order_ref', accessorKey: 'order_ref', header: 'Order', cell: ({ getValue }) => <span className="text-xs">{(getValue() as string) ?? '—'}</span> },
    { id: 'ship_date', accessorKey: 'ship_date', header: 'Shipped', cell: ({ getValue }) => <span className="text-xs tabular-nums">{fmtDate(getValue() as string)}</span> },
    {
      id: 'last_event_at',
      accessorKey: 'last_event_at',
      header: 'Last event',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-xs">{row.original.last_event_desc ?? '—'}</div>
          <div className="truncate text-[11px] text-muted">
            {row.original.last_event_at ? fmtRelative(row.original.last_event_at) : ''}
            {row.original.last_event_place ? ` · ${row.original.last_event_place}` : ''}
          </div>
        </div>
      ),
    },
    { id: 'expected_delivery', accessorKey: 'expected_delivery', header: 'Expected', cell: ({ getValue }) => <span className="text-xs tabular-nums">{fmtDate(getValue() as string)}</span> },
    { id: 'delivered_at', accessorKey: 'delivered_at', header: 'Delivered', cell: ({ getValue }) => <span className="text-xs tabular-nums">{fmtDate(getValue() as string, true)}</span> },
    { id: 'days_in_transit', accessorKey: 'days_in_transit', header: 'Days', cell: ({ getValue }) => <span className="text-xs tabular-nums">{fmtDays(getValue() as number)}</span> },
    {
      id: 'tags',
      header: 'Tags',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.tags.map((t) => (
            <span key={t.id} className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${t.color}22`, color: t.color }}>
              {t.name}
            </span>
          ))}
        </div>
      ),
    },
  ]
}

const DEFAULT_HIDDEN: VisibilityState = { expected_delivery: false, delivered_at: false, state: false, order_ref: false }

export function ShipmentTable({
  rows,
  sort,
  onSort,
  onRowClick,
  selectedId,
  loading,
}: {
  rows: ShipmentRow[]
  sort?: string
  onSort: (s: string) => void
  onRowClick: (s: ShipmentRow) => void
  selectedId?: number | null
  loading?: boolean
}) {
  const cols = useMemo(() => columns(), [])
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    try {
      const raw = localStorage.getItem('ft.columns')
      return raw ? (JSON.parse(raw) as VisibilityState) : DEFAULT_HIDDEN
    } catch {
      return DEFAULT_HIDDEN
    }
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const table = useReactTable({
    data: rows,
    columns: cols,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: (u) => {
      setVisibility((prev) => {
        const next = typeof u === 'function' ? u(prev) : u
        try {
          localStorage.setItem('ft.columns', JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  })
  const s = parseSort(sort)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className={cn('min-h-0 flex-1 overflow-auto', loading && 'opacity-60')}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-[5] bg-panel">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const id = h.column.id
                  const sortable = h.column.columnDef.enableSorting !== false
                  const active = s.key === id
                  return (
                    <th
                      key={h.id}
                      className={cn('border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted', sortable && 'cursor-pointer select-none hover:text-text')}
                      onClick={() => sortable && onSort(active && !s.desc ? `-${id}` : id)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortable && (active ? s.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />)}
                      </span>
                    </th>
                  )
                })}
                <th className="relative w-8 border-b border-border px-1 py-1 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setPickerOpen((o) => !o)} title="Choose columns" className="h-6 px-1">
                    <Columns3 className="h-3.5 w-3.5" />
                  </Button>
                  {pickerOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
                      <div className="absolute right-0 top-8 z-30 w-48 rounded-md border border-border bg-panel p-1 text-left shadow-lg">
                        {table.getAllLeafColumns().map((c) => (
                          <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm font-normal normal-case tracking-normal text-text hover:bg-panel-2">
                            <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                            {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr
                key={r.id}
                data-shipment-id={r.original.id}
                onClick={() => onRowClick(r.original)}
                className={cn('cursor-pointer hover:bg-panel-2', selectedId === r.original.id && 'bg-accent/10')}
              >
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="max-w-[260px] border-b border-border px-3 py-1.5 align-middle">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
                <td className="border-b border-border" />
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={99} className="px-3 py-16 text-center text-muted">
                  No shipments match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
