import { useMemo } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import type { PresetOut, UploadPreview } from '@/api/queries'
import { Input, Label, Select } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { isLocal } from '@/api/client'

export type Mapping = Record<string, string>

export interface MappingState {
  sheet: string
  header_row: number
  mapping: Mapping
  default_carrier: string
  geocode_mode: 'offline' | 'online'
  preset_id: number | null
  save_preset_as: string
}

export function MappingStep({
  preview,
  state,
  onChange,
  presets,
  onReparse,
}: {
  preview: UploadPreview
  state: MappingState
  onChange: (patch: Partial<MappingState>) => void
  presets: PresetOut[]
  onReparse: (sheet: string, header_row: number) => void
}) {
  const headerToField = useMemo(() => {
    const m: Record<string, string> = {}
    for (const [f, h] of Object.entries(state.mapping)) m[h] = f
    return m
  }, [state.mapping])
  const fields = preview.fields as { key: string; label: string; required: boolean; hints: string[] }[]
  const missingTracking = !state.mapping.tracking_number
  const hasLocation = !!(state.mapping.postal_code || state.mapping.city_state_zip || (state.mapping.city && state.mapping.state))
  const det = preview.carrier_detection as Record<string, number>
  const ambiguous = (det.unknown ?? 0) + (det.low_confidence ?? 0)
  const needsCarrier = !state.mapping.carrier && ambiguous > 0

  const setField = (field: string, header: string) => {
    const next: Mapping = { ...state.mapping }
    // one header per field, one field per header
    for (const [f, h] of Object.entries(next)) if (h === header) delete next[f]
    if (header) next[field] = header
    else delete next[field]
    onChange({ mapping: next, preset_id: null })
  }

  const applyPreset = (id: string) => {
    if (!id) return onChange({ preset_id: null })
    const p = presets.find((x) => x.id === Number(id))
    if (!p) return
    const usable: Mapping = {}
    for (const [f, h] of Object.entries(p.mapping as Mapping)) if (preview.headers.includes(h)) usable[f] = h
    onChange({ mapping: usable, preset_id: p.id })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Sheet</Label>
            <Select value={state.sheet} onChange={(e) => onReparse(e.target.value, state.header_row)} className="mt-1 w-full">
              {preview.sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Header row</Label>
            <Input type="number" min={1} value={state.header_row + 1} onChange={(e) => onReparse(state.sheet, Math.max(0, Number(e.target.value) - 1))} className="mt-1" />
          </div>
        </div>
        {presets.length > 0 && (
          <div>
            <Label>Apply saved mapping</Label>
            <Select value={state.preset_id ?? ''} onChange={(e) => applyPreset(e.target.value)} className="mt-1 w-full">
              <option value="">— none —</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {preview.matched_preset_id && <div className="mt-1 text-[11px] text-status-delivered">A preset matching these headers was applied automatically.</div>}
          </div>
        )}
        <div className="rounded-control border border-border">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Columns</div>
          <div className="divide-y divide-border">
            {fields.map((f) => {
              const val = state.mapping[f.key] ?? ''
              return (
                <div key={f.key} className="flex items-center gap-2 px-3 py-1.5">
                  <div className="w-40 shrink-0 text-sm">
                    {f.label}
                    {f.required && <span className="text-danger"> *</span>}
                  </div>
                  <Select value={val} onChange={(e) => setField(f.key, e.target.value)} className={cn('h-8 flex-1 text-xs', val && 'border-accent/50')}>
                    <option value="">—</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                        {headerToField[h] && headerToField[h] !== f.key ? ` (used: ${headerToField[h]})` : ''}
                      </option>
                    ))}
                  </Select>
                </div>
              )
            })}
          </div>
        </div>
        {missingTracking && (
          <Note tone="error">
            <AlertTriangle className="h-4 w-4" /> Choose the column containing tracking numbers.
          </Note>
        )}
        {!hasLocation && !missingTracking && (
          <Note tone="warn">
            <AlertTriangle className="h-4 w-4" /> No ZIP or city/state column mapped. Shipments will import but won't appear on the map until a location is known.
          </Note>
        )}
        {needsCarrier && (
          <div>
            <Label>Default carrier for ambiguous tracking numbers ({ambiguous} in sample)</Label>
            <Select value={state.default_carrier} onChange={(e) => onChange({ default_carrier: e.target.value })} className="mt-1 w-full">
              <option value="">Leave unknown</option>
              <option value="usps">USPS</option>
              <option value="fedex">FedEx</option>
            </Select>
          </div>
        )}
        <div>
          <Label>Geocoding</Label>
          <div className="mt-1 flex flex-col gap-1.5 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" checked={state.geocode_mode === 'offline'} onChange={() => onChange({ geocode_mode: 'offline' })} className="mt-1" />
              <span>
                <span className="font-medium">Offline by ZIP</span> <span className="text-muted">(recommended)</span>
                <div className="text-[11px] text-muted">Points land at the ZIP-code center. Nothing leaves this machine.</div>
              </span>
            </label>
            {!isLocal() && (
            <label className="flex items-start gap-2">
              <input type="radio" checked={state.geocode_mode === 'online'} onChange={() => onChange({ geocode_mode: 'online' })} className="mt-1" />
              <span>
                <span className="font-medium">Street-level (online)</span>
                <div className="text-[11px] text-muted">Sends street addresses to the geocoder chosen in Settings. Exact pins.</div>
              </span>
            </label>
            )}
          </div>
        </div>
        <div>
          <Label>Save this mapping as a preset (optional)</Label>
          <Input value={state.save_preset_as} onChange={(e) => onChange({ save_preset_as: e.target.value })} placeholder="e.g. Shopify export" className="mt-1" />
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>
            Preview · first {preview.sample_rows.length} of {preview.row_count} rows
          </span>
          <span className="inline-flex items-center gap-1">
            <Check className="h-3 w-3 text-status-delivered" /> mapped columns are highlighted
          </span>
        </div>
        <div className="overflow-auto rounded-control border border-border">
          <table className="min-w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 bg-panel">
              <tr>
                {preview.headers.map((h) => {
                  const f = headerToField[h]
                  return (
                    <th key={h} className={cn('whitespace-nowrap border-b border-border px-2 py-1.5 text-left font-semibold', f ? 'bg-accent-soft text-accent' : 'text-muted')}>
                      <div>{h}</div>
                      {f && <div className="text-[10px] font-normal opacity-80">→ {fields.find((x) => x.key === f)?.label ?? f}</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {preview.sample_rows.map((r, i) => (
                <tr key={i} className="odd:bg-panel-2/40">
                  {preview.headers.map((h, j) => (
                    <td key={j} className={cn('max-w-[220px] truncate border-b border-border px-2 py-1', headerToField[h] && 'bg-accent-soft')} title={r[j]}>
                      {r[j]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Note({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', tone === 'error' ? 'border-danger/40 bg-danger-soft text-danger' : 'border-status-ofd/40 bg-status-ofd/5 text-text')}>
      {children}
    </div>
  )
}
