import { toast } from 'sonner'
import { Globe, HardDrive, KeyRound, ShieldCheck, Trash2 } from 'lucide-react'
import { usePrivacySummary, useWipe } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { fmtBytes, fmtDate, fmtNumber } from '@/lib/format'

const PURPOSE: Record<string, string> = {
  carrier_usps: 'USPS tracking API',
  carrier_fedex: 'FedEx tracking API',
  geocoder: 'Street-level geocoding (opt-in)',
  tiles: 'Map tiles',
}

export function PrivacyPage() {
  const q = usePrivacySummary()
  const wipe = useWipe()
  const s = q.data
  const onWipe = async (keep: boolean) => {
    if (!s) return
    const word = prompt(`This permanently deletes ${s.shipments} shipments, ${s.uploads} uploads and all tracking history${keep ? '' : ', plus settings and credentials'}.\n\nType DELETE to confirm.`)
    if (word !== 'DELETE') return
    try {
      await wipe.mutateAsync({ token: s.wipe_token, keep_settings: keep })
      toast.success('All data wiped')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <>
      <PageHeader title="Privacy" subtitle="What is stored, where it lives, and exactly what leaves this machine." />
      <div className="flex-1 overflow-auto p-5">
        <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" /> What leaves this machine
              </CardTitle>
            </CardHeader>
            <CardBody className="text-sm">
              <ul className="flex flex-col gap-2">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>
                    <span className="font-medium">Tracking numbers</span> go directly to USPS and FedEx when you click Refresh (live mode only). Names and addresses are never included.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>
                    <span className="font-medium">Map tile requests</span> reveal only which area of the map you are looking at, to <span className="font-mono">{s?.tile_host}</span>. No shipment data is attached.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>
                    <span className="font-medium">Street addresses</span> are sent to the geocoder (<span className="font-mono">{s?.geocoder}</span>) only for uploads where you explicitly chose street-level geocoding.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                  <span>Nothing else. No analytics, no telemetry, no update checks, no third-party scripts or fonts.</span>
                </li>
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" /> Where your data lives
              </CardTitle>
            </CardHeader>
            <CardBody className="text-sm">
              <div className="mb-2 break-all font-mono text-xs text-muted">{s?.data_dir}</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Shipments" value={fmtNumber(s?.shipments)} />
                <Stat label="Tracking events" value={fmtNumber(s?.events)} />
                <Stat label="Uploads" value={fmtNumber(s?.uploads)} />
                <Stat label="Database" value={s ? fmtBytes(s.db_size_bytes) : '—'} />
                <Stat label="Raw files" value={s ? fmtBytes(s.uploads_size_bytes) : '—'} />
                <Stat label="Password" value={s?.auth_enabled ? 'on' : 'off'} />
              </div>
              <p className="mt-3 text-xs text-muted">Back up the data directory to keep everything; delete it to remove everything. Raw spreadsheets are kept so an upload can be re-parsed, and are deleted with it.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Secrets
              </CardTitle>
            </CardHeader>
            <CardBody className="text-sm">
              <table className="w-full text-xs">
                <tbody>
                  {s?.secrets.map((x) => (
                    <tr key={String(x.name)} className="border-b border-border last:border-0">
                      <td className="py-1.5 font-medium">{String(x.name)}</td>
                      <td className="py-1.5 text-right text-muted">{String(x.where)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4" /> Outbound request log
              </CardTitle>
              <span className="text-[11px] text-muted">hosts only, never payloads</span>
            </CardHeader>
            <CardBody className="text-sm">
              {s?.egress.length === 0 && <div className="text-xs text-muted">No outbound requests have been made by the server yet.</div>}
              {s && s.egress.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="pb-1 font-medium">Host</th>
                      <th className="pb-1 font-medium">Purpose</th>
                      <th className="pb-1 font-medium">Data sent</th>
                      <th className="pb-1 text-right font-medium">Requests</th>
                      <th className="pb-1 text-right font-medium">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.egress.map((e) => (
                      <tr key={`${e.host}-${e.purpose}`} className="border-t border-border">
                        <td className="py-1 font-mono">{String(e.host)}</td>
                        <td className="py-1">{PURPOSE[String(e.purpose)] ?? String(e.purpose)}</td>
                        <td className="py-1">{String(e.data_classes).replace('_', ' ')}</td>
                        <td className="py-1 text-right tabular-nums">{fmtNumber(Number(e.count))}</td>
                        <td className="py-1 text-right text-muted">{fmtDate(String(e.last_at), true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          <Card className="lg:col-span-2 border-red-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" /> Wipe all data
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted">Deletes every shipment, upload, event, note, tag and cached geocode from this machine. Cannot be undone.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onWipe(true)} disabled={wipe.isPending}>
                  Wipe data, keep settings
                </Button>
                <Button variant="danger" size="sm" onClick={() => onWipe(false)} disabled={wipe.isPending}>
                  Wipe everything
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panel-2 px-2 py-1.5">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  )
}
