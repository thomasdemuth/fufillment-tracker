import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeft, Check } from 'lucide-react'
import { useCommitUpload, usePresets, usePreview, useUploadFile, type CommitResult, type UploadPreview } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Dropzone } from '@/components/uploads/Dropzone'
import { MappingStep, type MappingState } from '@/components/uploads/MappingStep'
import { cn } from '@/lib/utils'
import { isLocal } from '@/api/client'

type Step = 'file' | 'map' | 'done'

export function UploadWizardPage() {
  const navigate = useNavigate()
  const upload = useUploadFile()
  const reparse = usePreview()
  const commit = useCommitUpload()
  const presets = usePresets()
  const [step, setStep] = useState<Step>('file')
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [state, setState] = useState<MappingState | null>(null)
  const [result, setResult] = useState<CommitResult | null>(null)

  const initState = (p: UploadPreview): MappingState => ({
    sheet: p.sheet,
    header_row: p.header_row,
    mapping: { ...(p.suggested_mapping as Record<string, string>) },
    default_carrier: '',
    geocode_mode: 'offline',
    preset_id: p.matched_preset_id ?? null,
    save_preset_as: '',
  })

  const onFile = async (f: File) => {
    try {
      const p = await upload.mutateAsync(f)
      setPreview(p)
      setState(initState(p))
      setStep('map')
    } catch (e) {
      toast.error(`Could not read file: ${(e as Error).message}`)
    }
  }

  const onReparse = async (sheet: string, header_row: number) => {
    if (!preview) return
    try {
      const p = await reparse.mutateAsync({ upload_id: preview.upload_id, sheet, header_row })
      setPreview(p)
      setState((s) => ({ ...(s ?? initState(p)), sheet: p.sheet, header_row: p.header_row, mapping: { ...(p.suggested_mapping as Record<string, string>) } }))
    } catch (e) {
      toast.error(String(e))
    }
  }

  const onCommit = async () => {
    if (!preview || !state) return
    try {
      const r = await commit.mutateAsync({
        upload_id: preview.upload_id,
        body: {
          sheet: state.sheet,
          header_row: state.header_row,
          mapping: state.mapping,
          geocode_mode: state.geocode_mode,
          default_carrier: state.default_carrier || null,
          preset_id: state.preset_id,
          save_preset_as: state.save_preset_as || null,
        },
      })
      setResult(r)
      setStep('done')
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`)
    }
  }

  return (
    <>
      <PageHeader title="Upload spreadsheet" subtitle="Step-by-step import. Nothing is saved until you confirm the column mapping.">
        <Button variant="ghost" size="sm" onClick={() => navigate('/uploads')}>
          <ArrowLeft className="h-3.5 w-3.5" /> Uploads
        </Button>
      </PageHeader>
      <div className="flex-1 overflow-auto p-5">
        <Steps step={step} />
        {step === 'file' && (
          <div className="mx-auto mt-6 max-w-2xl">
            <Dropzone onFile={onFile} busy={upload.isPending} />
          </div>
        )}
        {step === 'map' && preview && state && (
          <div className="mt-4">
            <MappingStep preview={preview} state={state} onChange={(p) => setState((s) => ({ ...s!, ...p }))} presets={presets.data ?? []} onReparse={onReparse} />
            <div className="mt-4 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep('file')}>
                <ArrowLeft className="h-4 w-4" /> Different file
              </Button>
              <Button onClick={onCommit} disabled={!state.mapping.tracking_number || commit.isPending}>
                {commit.isPending ? 'Importing…' : `Import ${preview.row_count} rows`}
              </Button>
            </div>
          </div>
        )}
        {step === 'done' && result && (
          <div className="mx-auto mt-8 max-w-lg rounded-card border border-border bg-panel p-6 text-center shadow-card">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-delivered/15 text-status-delivered">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="mt-3 text-lg font-semibold">Imported {result.upload.filename}</h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Big label="New shipments" value={result.imported} />
              <Big label="Merged duplicates" value={result.duplicates} />
              <Big label="Skipped rows" value={result.skipped} warn={result.skipped > 0} />
            </div>
            {result.errors.length > 0 && (
              <details className="mt-3 text-left text-xs">
                <summary className="cursor-pointer text-muted">Show skipped rows</summary>
                <ul className="mt-1 max-h-40 overflow-auto font-mono">
                  {(result.errors as { row: number; error: string }[]).map((e, i) => (
                    <li key={i}>
                      row {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="mt-4 text-sm text-muted">
              {isLocal()
                ? 'Click Refresh on the board to fill in statuses. In this browser they come from the built-in mock carrier (fake but realistic); live USPS/FedEx tracking needs the app on your own computer.'
                : 'Statuses are fetched when you click Refresh on the board (only tracking numbers are sent to the carrier).'}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => navigate(`/board?upload_id=${result.upload.id}`)}>
                View on board
              </Button>
              <Button onClick={() => navigate(`/map?upload_id=${result.upload.id}`)}>View on map</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep('file')
                  setPreview(null)
                  setResult(null)
                }}
              >
                Upload another
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Steps({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: 'file', label: 'Choose file' },
    { key: 'map', label: 'Map columns' },
    { key: 'done', label: 'Done' },
  ]
  const idx = items.findIndex((i) => i.key === step)
  return (
    <ol className="flex items-center gap-3 text-sm">
      {items.map((it, i) => (
        <li key={it.key} className="flex items-center gap-3">
          <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', i <= idx ? 'bg-accent text-accent-fg' : 'bg-panel-2 text-muted')}>{i + 1}</span>
          <span className={cn(i === idx ? 'font-medium' : 'text-muted')}>{it.label}</span>
          {i < items.length - 1 && <span className="h-px w-8 bg-border" />}
        </li>
      ))}
    </ol>
  )
}

function Big({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-control bg-panel-2 px-3 py-2">
      <div className={cn('text-2xl font-semibold tabular-nums', warn && 'text-status-ofd')}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}
