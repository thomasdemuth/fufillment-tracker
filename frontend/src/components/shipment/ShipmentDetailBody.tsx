import { useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, MapPin, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useConfig, useDeleteShipment, usePatchShipment, useRefreshShipment, useShipmentPath, type ShipmentDetail } from '@/api/queries'
import { TransitPathMap } from '@/components/map/TransitPathMap'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { CarrierBadge, StatusBadge } from '@/components/ui/status-badge'
import { Timeline } from '@/components/shipment/Timeline'
import { ProgressStepper } from '@/components/shipment/ProgressStepper'
import { SectionLabel } from '@/components/ui/card'
import { NotesPanel } from '@/components/shipment/NotesPanel'
import { TagPicker } from '@/components/shipment/TagPicker'
import { fmtDate, fmtDays } from '@/lib/format'
import { useIsDark } from '@/stores/uiStore'

export function ShipmentDetailBody({ s, onDeleted, mobile = false }: { s: ShipmentDetail; onDeleted?: () => void; mobile?: boolean }) {
  const config = useConfig()
  const dark = useIsDark()
  const path = useShipmentPath(s.id)
  const refresh = useRefreshShipment()
  const patch = usePatchShipment()
  const del = useDeleteShipment()
  const [editing, setEditing] = useState(false)

  const onRefresh = async () => {
    try {
      const r = await refresh.mutateAsync(s.id)
      if (r.poll_last_error) toast.warning(r.poll_last_error)
      else toast.success('Tracking updated')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const onDelete = async () => {
    if (!confirm('Delete this shipment? Notes and tracking history are removed too.')) return
    await del.mutateAsync(s.id)
    toast.success('Shipment deleted')
    onDeleted?.()
  }

  return (
    <div className="flex flex-col gap-5">
      <ProgressStepper
        shipment={s}
        actions={
          mobile ? null : (
          <>
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={refresh.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            {s.carrier_url && (
              <Button size="sm" onClick={() => window.open(s.carrier_url!, '_blank', 'noopener')}>
                <ExternalLink className="h-3.5 w-3.5" /> {s.carrier === 'usps' ? 'USPS' : 'FedEx'}
              </Button>
            )}
          </>
          )
        }
      />
      {s.poll_last_error && <div className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger">{s.poll_last_error}</div>}

      {/* key facts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-card border border-border bg-panel-2/50 p-3 text-[12px] sm:grid-cols-4">
        <Fact label="Status" value={<StatusBadge status={s.status} />} />
        <Fact label="Tracking" className="col-span-2 sm:col-span-1" value={<span className="flex min-w-0 items-center gap-1.5"><CarrierBadge carrier={s.carrier} confidence={s.carrier_confidence} /><span className="select-all truncate font-mono text-[11.5px]" title={s.tracking_number}>{s.tracking_number}</span></span>} />
        <Fact label="Order" value={s.order_ref ?? '—'} />
        <Fact label="Shipped" value={fmtDate(s.ship_date)} />
        <Fact label="Days in transit" value={fmtDays(s.days_in_transit)} />
        <Fact label="Expected" value={fmtDate(s.expected_delivery)} />
        <Fact label="Origin ZIP" value={s.origin_postal_code ?? '—'} />
        <Fact label="Map placement" value={s.geocode_precision === 'none' ? 'not placed' : `${s.geocode_precision} level`} />
      </div>

      {/* recipient */}
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <SectionLabel>Recipient</SectionLabel>
          <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
            <Pencil className="h-3.5 w-3.5" /> {editing ? 'Cancel' : 'Edit'}
          </Button>
        </div>
        {editing ? (
          <EditForm s={s} onSave={async (body) => {
            try {
              await patch.mutateAsync({ id: s.id, body })
              toast.success('Saved')
              setEditing(false)
            } catch (e) {
              toast.error((e as Error).message)
            }
          }} />
        ) : (
          <div className="text-sm">
            <div className="font-medium">{s.recipient_name ?? '—'}</div>
            {s.company && <div className="text-muted">{s.company}</div>}
            <div className="mt-1 text-muted">
              {s.address1}
              {s.address2 ? `, ${s.address2}` : ''}
              <br />
              {[s.city, s.state].filter(Boolean).join(', ')} {s.postal_code}
            </div>
            {(s.email || s.phone) && (
              <div className="mt-1 text-xs text-muted">
                {s.email}
                {s.email && s.phone ? ' · ' : ''}
                {s.phone}
              </div>
            )}
          </div>
        )}
      </section>

      <TagPicker shipment={s} />

      {/* map */}
      <section>
        <SectionLabel className="mb-1.5 flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> Transit path
        </SectionLabel>
        {config.data && <TransitPathMap styleUrl={dark ? config.data.map_style_url_dark : config.data.map_style_url} path={path.data} height={mobile ? 220 : 260} />}
        <div className="mt-1 text-[11px] text-muted">Scan locations are placed at city/ZIP centers. Dashed line = remaining leg to the destination.</div>
      </section>

      <section>
        <SectionLabel className="mb-2">History</SectionLabel>
        <Timeline events={s.events} />
      </section>

      <NotesPanel shipment={s} />

      <section className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted">
        <div>
          From {s.uploads.map((u) => `${u.filename} (row ${u.row_number})`).join(', ') || 'manual entry'}
        </div>
        <Button variant="ghost" size="sm" className="text-muted hover:text-danger" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </section>
    </div>
  )
}

function Fact({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className="mt-0.5 truncate text-text">{value}</div>
    </div>
  )
}

function EditForm({ s, onSave }: { s: ShipmentDetail; onSave: (b: Record<string, string | null>) => void }) {
  const [f, setF] = useState({
    recipient_name: s.recipient_name ?? '',
    company: s.company ?? '',
    address1: s.address1 ?? '',
    address2: s.address2 ?? '',
    city: s.city ?? '',
    state: s.state ?? '',
    postal_code: s.postal_code ?? '',
    order_ref: s.order_ref ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    carrier: s.carrier,
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form
      className="grid grid-cols-2 gap-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault()
        const body: Record<string, string | null> = {}
        for (const [k, v] of Object.entries(f)) body[k] = v === '' ? null : v
        onSave(body)
      }}
    >
      <L label="Name"><Input value={f.recipient_name} onChange={set('recipient_name')} className="h-8" /></L>
      <L label="Company"><Input value={f.company} onChange={set('company')} className="h-8" /></L>
      <L label="Address 1" wide><Input value={f.address1} onChange={set('address1')} className="h-8" /></L>
      <L label="Address 2" wide><Input value={f.address2} onChange={set('address2')} className="h-8" /></L>
      <L label="City"><Input value={f.city} onChange={set('city')} className="h-8" /></L>
      <div className="grid grid-cols-2 gap-2">
        <L label="State"><Input value={f.state} onChange={set('state')} className="h-8" maxLength={2} /></L>
        <L label="ZIP"><Input value={f.postal_code} onChange={set('postal_code')} className="h-8" /></L>
      </div>
      <L label="Order"><Input value={f.order_ref} onChange={set('order_ref')} className="h-8" /></L>
      <L label="Carrier">
        <Select value={f.carrier} onChange={set('carrier')} className="h-8 w-full">
          <option value="usps">USPS</option>
          <option value="fedex">FedEx</option>
          <option value="unknown">Unknown</option>
        </Select>
      </L>
      <L label="Email"><Input value={f.email} onChange={set('email')} className="h-8" /></L>
      <L label="Phone"><Input value={f.phone} onChange={set('phone')} className="h-8" /></L>
      <div className="col-span-2 flex justify-end">
        <Button size="sm" type="submit">Save changes</Button>
      </div>
    </form>
  )
}

function L({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <Label>{label}</Label>
      {children}
    </label>
  )
}
