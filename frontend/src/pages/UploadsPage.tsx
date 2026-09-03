import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { FileSpreadsheet, Trash2, Upload } from 'lucide-react'
import { useDeleteUpload, useUploads } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { fmtBytes, fmtDate, fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

export function UploadsPage() {
  const navigate = useNavigate()
  const uploads = useUploads()
  const del = useDeleteUpload()

  const onDelete = async (id: number, filename: string) => {
    if (!confirm(`Delete "${filename}"?\n\nShipments that came only from this file will be removed. Shipments also present in other uploads are kept.`)) return
    try {
      await del.mutateAsync(id)
      toast.success('Upload deleted')
    } catch (e) {
      toast.error(String(e))
    }
  }

  return (
    <>
      <PageHeader title="Uploads" subtitle="Each spreadsheet you import. Duplicate tracking numbers across files are merged.">
        <Button size="sm" onClick={() => navigate('/uploads/new')}>
          <Upload className="h-3.5 w-3.5" /> Upload spreadsheet
        </Button>
      </PageHeader>
      <div className="flex-1 overflow-auto p-4">
        {uploads.data?.length === 0 && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-muted" />
            <h2 className="mt-3 text-base font-semibold">No spreadsheets yet</h2>
            <p className="mt-1 text-sm text-muted">Upload an .xlsx or .csv with names, addresses and tracking numbers. Column names are detected automatically and you confirm the mapping before anything is imported.</p>
            <Button className="mt-4" onClick={() => navigate('/uploads/new')}>
              <Upload className="h-4 w-4" /> Upload your first file
            </Button>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {uploads.data?.map((u) => (
            <Card key={u.id} className={cn('flex flex-col', u.status !== 'committed' && 'opacity-70')}>
              <div className="flex items-start justify-between gap-3 px-4 pt-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent" />
                    <span className="truncate font-medium" title={u.filename}>
                      {u.filename}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {fmtDate(u.created_at, true)} · {fmtRelative(u.created_at)} · {fmtBytes(u.size_bytes)}
                    {u.sheet_name ? ` · sheet "${u.sheet_name}"` : ''}
                  </div>
                </div>
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', u.status === 'committed' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600')}>
                  {u.status}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 px-4 py-3 text-center">
                <Stat label="Rows" value={u.row_count} />
                <Stat label="New" value={u.imported_count} />
                <Stat label="Merged" value={u.duplicate_count} title="Tracking numbers already present from another upload or repeated in this file" />
                <Stat label="Skipped" value={u.skipped_count} warn={u.skipped_count > 0} />
              </div>
              {u.errors && u.errors.length > 0 && (
                <details className="mx-4 mb-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px]">
                  <summary className="cursor-pointer text-amber-700 dark:text-amber-300">{u.errors.length} row problem{u.errors.length > 1 ? 's' : ''}</summary>
                  <ul className="mt-1 max-h-32 overflow-auto font-mono">
                    {(u.errors as { row: number; error: string }[]).map((e, i) => (
                      <li key={i}>
                        row {e.row}: {e.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-auto flex items-center justify-between border-t border-border px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => navigate(`/board?upload_id=${u.id}`)} disabled={u.status !== 'committed'}>
                  View {u.shipment_count} shipments
                </Button>
                <Button variant="ghost" size="sm" className="text-muted hover:text-red-600" onClick={() => onDelete(u.id, u.filename)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, warn, title }: { label: string; value: number; warn?: boolean; title?: string }) {
  return (
    <div title={title}>
      <div className={cn('text-lg font-semibold tabular-nums', warn && 'text-amber-600')}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}
