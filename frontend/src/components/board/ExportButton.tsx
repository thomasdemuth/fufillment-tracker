import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dataFilters, filtersToParams, type Filters } from '@/lib/filters'
import { apiUrl, authHeaders, getToken } from '@/lib/server'

export function ExportButton({ filters }: { filters: Filters }) {
  const [open, setOpen] = useState(false)
  const go = (format: 'csv' | 'xlsx') => {
    const p = filtersToParams({ ...dataFilters(filters), sort: filters.sort })
    p.set('format', format)
    setOpen(false)
    const url = apiUrl(`/api/export?${p.toString()}`)
    if (!getToken()) {
      // plain navigation: the browser handles the download (same-origin or CORS with Content-Disposition)
      window.location.href = url
      return
    }
    // With a bearer token the download must go through fetch so the header is sent.
    void (async () => {
      const res = await fetch(url, { headers: authHeaders() })
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `shipments.${format}`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    })()
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
