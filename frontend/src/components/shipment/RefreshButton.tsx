import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { useJob, useStartRefresh, useInvalidateAll } from '@/api/queries'
import { isReadOnly } from '@/api/client'
import { Button } from '@/components/ui/button'
import { dataFilters, type Filters } from '@/lib/filters'
import { cn } from '@/lib/utils'

/** Header button: refresh active shipments (respecting the current filters) with live job progress. */
export function RefreshButton({ filters }: { filters: Filters }) {
  const readOnly = isReadOnly()
  const start = useStartRefresh()
  const [jobId, setJobId] = useState<number | null>(() => {
    try {
      const v = sessionStorage.getItem('ft.refreshJob')
      return v ? Number(v) : null
    } catch {
      return null
    }
  })
  const [open, setOpen] = useState(false)
  const [includeTerminal, setIncludeTerminal] = useState(false)
  const job = useJob(jobId)
  const invalidate = useInvalidateAll()
  const running = job.data && (job.data.status === 'queued' || job.data.status === 'running')

  useEffect(() => {
    if (!job.data) return
    if (job.data.status === 'done' || job.data.status === 'failed' || job.data.status === 'cancelled') {
      try {
        sessionStorage.removeItem('ft.refreshJob')
      } catch {
        /* ignore */
      }
      if (jobId) {
        const j = job.data
        if (j.status === 'done') toast.success(`Refreshed ${j.done} shipments · ${j.updated} updated${j.errors ? ` · ${j.errors} errors` : ''}`)
        else toast.error(`Refresh ${j.status}: ${j.message ?? ''}`)
        invalidate()
        setJobId(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.data?.status])

  const go = async (all: boolean) => {
    setOpen(false)
    try {
      const body = all ? { all: true, include_terminal: includeTerminal } : { all: false, filters: dataFilters(filters) as Record<string, unknown>, include_terminal: includeTerminal }
      const r = await start.mutateAsync(body)
      if (r.queued === 0) {
        toast.info('Nothing to refresh (all shipments already delivered, or no carrier assigned).')
        return
      }
      try {
        sessionStorage.setItem('ft.refreshJob', String(r.job_id))
      } catch {
        /* ignore */
      }
      setJobId(r.job_id)
    } catch (e) {
      toast.error(`Could not start refresh: ${(e as Error).message}`)
    }
  }

  const hasFilters = Object.values(dataFilters(filters)).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''))
  const pct = job.data && job.data.total > 0 ? Math.round((job.data.done / job.data.total) * 100) : 0
  if (readOnly) return null

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => (running ? setOpen((o) => !o) : setOpen((o) => !o))} className={cn(running && 'border-accent text-accent')}>
        <RefreshCw className={cn('h-3.5 w-3.5', running && 'animate-spin')} />
        {running ? `Refreshing ${job.data!.done}/${job.data!.total}` : 'Refresh'}
      </Button>
      {running && (
        <div className="absolute -bottom-1 left-0 right-0 h-0.5 overflow-hidden rounded bg-border">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-30 w-72 rounded-control border border-border bg-panel p-3 text-sm shadow-pop">
            <div className="mb-2 text-xs text-muted">Fetches the latest status from USPS/FedEx. Only tracking numbers are sent. Delivered and returned shipments are skipped unless included.</div>
            <label className="mb-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={includeTerminal} onChange={(e) => setIncludeTerminal(e.target.checked)} /> Include delivered / returned
            </label>
            {running ? (
              <div className="text-xs">
                In progress: {job.data!.done}/{job.data!.total} · {job.data!.updated} updated · {job.data!.errors} errors
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {hasFilters && (
                  <Button size="sm" onClick={() => go(false)}>
                    Refresh filtered shipments
                  </Button>
                )}
                <Button size="sm" variant={hasFilters ? 'outline' : 'default'} onClick={() => go(true)}>
                  Refresh all active shipments
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
