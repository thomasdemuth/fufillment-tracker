import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { fmtNumber } from '@/lib/format'

export function Pagination({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-panel px-3 py-1.5 text-xs text-muted">
      <div>
        {fmtNumber(from)}–{fmtNumber(to)} of {fmtNumber(total)}
      </div>
      <div className="flex items-center gap-2">
        <Select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-7 text-xs">
          {[25, 50, 100, 250, 500].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </Select>
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
