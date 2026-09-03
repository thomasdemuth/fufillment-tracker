import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dataFilters, filtersToParams, type Filters } from '@/lib/filters'

export function ExportButton({ filters }: { filters: Filters }) {
  const [open, setOpen] = useState(false)
  const go = (format: 'csv' | 'xlsx') => {
    const p = filtersToParams({ ...dataFilters(filters), sort: filters.sort })
    p.set('format', format)
    // Downloads are same-origin; no data leaves the machine.
    window.location.href = `/api/export?${p.toString()}`
    setOpen(false)
  }
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <Download className="h-3.5 w-3.5" /> Export
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-30 w-56 rounded-control border border-border bg-panel p-1 text-sm shadow-pop">
            <div className="px-2 py-1 text-[11px] text-muted">Exports the current filtered view</div>
            <button className="w-full rounded px-2 py-1.5 text-left hover:bg-panel-2" onClick={() => go('xlsx')}>
              Excel (.xlsx)
            </button>
            <button className="w-full rounded px-2 py-1.5 text-left hover:bg-panel-2" onClick={() => go('csv')}>
              CSV
            </button>
          </div>
        </>
      )}
    </div>
  )
}
