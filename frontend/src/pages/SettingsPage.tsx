import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import {
  useCarrierSettings,
  useGeneralSettings,
  useGeocoderSettings,
  useSaveCarrier,
  useSaveGeneral,
  useSaveGeocoder,
  useTestCarrier,
  useTestGeocoder,
  type CarrierSettings,
} from '@/api/queries'
import { PageHeader, ThemeToggle } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label, Select } from '@/components/ui/input'
import { fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

type Tab = 'carriers' | 'geocoding' | 'general'

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('carriers')
  return (
    <>
      <PageHeader title="Settings" subtitle="Carrier credentials, geocoding, and app options. Secrets are encrypted on disk." />
      <div className="flex-1 overflow-auto p-5">
        <div className="mb-4 inline-flex rounded-control border border-border bg-panel p-0.5">
          {(['carriers', 'geocoding', 'general'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('rounded-md px-3 py-1.5 text-sm capitalize', tab === t ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text')}>
              {t}
            </button>
          ))}
        </div>
        <div className="max-w-3xl">
          {tab === 'carriers' && <CarriersTab />}
          {tab === 'geocoding' && <GeocodingTab />}
          {tab === 'general' && <GeneralTab />}
        </div>
      </div>
    </>
  )
}

const CARRIER_INFO = {
  usps: {
    label: 'USPS',
    url: 'https://developers.usps.com/',
    idLabel: 'Consumer key (client ID)',
    secretLabel: 'Consumer secret',
    help: 'Register at developers.usps.com, create an app, and add the "Tracking" API product to it. Approval for production tracking can take a few days; the test environment works immediately.',
  },
  fedex: {
    label: 'FedEx',
    url: 'https://developer.fedex.com/',
    idLabel: 'API key',
    secretLabel: 'Secret key',
    help: 'Register at developer.fedex.com, create a project with the "Track API", and copy the production or test credentials. The sandbox only returns data for FedEx test tracking numbers.',
  },
} as const

function CarriersTab() {
  const q = useCarrierSettings()
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Each carrier can run in <span className="font-medium text-text">mock</span> mode (fake data, no credentials, great for trying the app) or <span className="font-medium text-text">live</span> mode using your own free developer account. Only tracking numbers are sent to the carrier.
      </p>
      {q.data?.map((c) => <CarrierCard key={c.carrier} c={c} />)}
    </div>
  )
}

function CarrierCard({ c }: { c: CarrierSettings }) {
  const info = CARRIER_INFO[c.carrier as 'usps' | 'fedex']
  const save = useSaveCarrier()
  const test = useTestCarrier()
  const [mode, setMode] = useState(c.mode)
  const [sandbox, setSandbox] = useState(c.sandbox)
  const [clientId, setClientId] = useState(c.client_id ?? '')
  const [secret, setSecret] = useState('')
  const [enabled, setEnabled] = useState(c.enabled)
  useEffect(() => {
    setMode(c.mode)
    setSandbox(c.sandbox)
    setClientId(c.client_id ?? '')
    setEnabled(c.enabled)
  }, [c])

  const onSave = async () => {
    try {
      await save.mutateAsync({ carrier: c.carrier as 'usps' | 'fedex', body: { mode, sandbox, enabled, client_id: clientId, ...(secret ? { client_secret: secret } : {}) } })
      setSecret('')
      toast.success(`${info.label} settings saved`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const onTest = async () => {
    try {
      const r = await test.mutateAsync(c.carrier as 'usps' | 'fedex')
      r.ok ? toast.success(r.message) : toast.error(r.message)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const dirty = mode !== c.mode || sandbox !== c.sandbox || clientId !== (c.client_id ?? '') || secret !== '' || enabled !== c.enabled

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{info.label}</CardTitle>
          <StatusPill status={c.status} />
          {c.from_env && <span className="text-[11px] text-muted">credentials from environment (read-only)</span>}
        </div>
        <a href={info.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          Developer portal <ExternalLink className="h-3 w-3" />
        </a>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
          </label>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(['mock', 'live'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn('rounded px-2.5 py-1 text-xs capitalize', mode === m ? 'bg-accent text-accent-fg' : 'text-muted')} disabled={c.from_env}>
                {m}
              </button>
            ))}
          </div>
          <label className={cn('flex items-center gap-2', mode !== 'live' && 'opacity-50')}>
            <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} disabled={mode !== 'live'} /> Use test / sandbox environment
          </label>
        </div>
        {mode === 'live' && (
          <>
            <p className="text-xs text-muted">{info.help}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <Label>{info.idLabel}</Label>
                <Input value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={c.from_env} autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1">
                <Label>{info.secretLabel}</Label>
                <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={c.has_secret ? `saved (${c.client_secret_masked})` : 'paste secret'} disabled={c.from_env} autoComplete="new-password" />
              </label>
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted">
            {c.last_check_at ? (
              <span className="inline-flex items-center gap-1">
                {c.last_check_ok ? <CheckCircle2 className="h-3.5 w-3.5 text-status-delivered" /> : <XCircle className="h-3.5 w-3.5 text-danger" />}
                {c.last_check_message} · {fmtRelative(c.last_check_at)}
              </span>
            ) : (
              'Not tested yet'
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onTest} disabled={test.isPending || dirty}>
              {test.isPending ? 'Testing…' : 'Test credentials'}
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending || c.from_env}>
              Save
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok: 'bg-status-delivered/15 text-status-delivered',
    mock: 'bg-accent-soft text-accent',
    error: 'bg-danger-soft text-danger',
    unconfigured: 'bg-status-ofd/15 text-text',
    disabled: 'bg-panel-2 text-muted',
  }
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', map[status] ?? map.disabled)}>{status}</span>
}

function GeocodingTab() {
  const q = useGeocoderSettings()
  const save = useSaveGeocoder()
  const test = useTestGeocoder()
  const [provider, setProvider] = useState('nominatim')
  const [key, setKey] = useState('')
  const [email, setEmail] = useState('')
  useEffect(() => {
    if (q.data) {
      setProvider(q.data.provider)
      setEmail(q.data.nominatim_email ?? '')
    }
  }, [q.data])
  const onSave = async () => {
    try {
      await save.mutateAsync({ provider, nominatim_email: email, ...(key ? { api_key: key } : {}) })
      setKey('')
      toast.success('Geocoder settings saved')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Offline geocoding (default)</CardTitle>
          <span className="rounded-full bg-status-delivered/15 px-2 py-0.5 text-[11px] font-medium text-status-delivered">always on</span>
        </CardHeader>
        <CardBody className="text-sm text-muted">
          Every shipment is placed at the center of its ZIP code using a bundled database of US ZIP codes. Nothing leaves this machine. If a ZIP is missing, the city or state center is used instead. This is accurate enough for heatmaps and regional views.
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Street-level geocoding (opt-in per upload)</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-sm text-muted">When you choose "street-level" in the upload wizard, full addresses are sent to the provider below. Choose one you trust; results are cached so each address is sent once.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <Label>Provider</Label>
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="nominatim">OpenStreetMap Nominatim (free, 1 req/s, needs contact email)</option>
                <option value="geocodio">Geocodio (API key, generous free tier)</option>
                <option value="mapbox">Mapbox (access token)</option>
              </Select>
            </label>
            {provider === 'nominatim' ? (
              <label className="flex flex-col gap-1">
                <Label>Contact email (required by Nominatim's usage policy)</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
            ) : (
              <label className="flex flex-col gap-1">
                <Label>API key</Label>
                <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={q.data?.has_key ? `saved (${q.data.api_key_masked})` : 'paste key'} autoComplete="new-password" />
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const r = await test.mutateAsync()
                r.ok ? toast.success(r.message) : toast.error(r.message)
              }}
              disabled={test.isPending}
            >
              Test
            </Button>
            <Button size="sm" onClick={onSave} disabled={save.isPending}>
              Save
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function GeneralTab() {
  const q = useGeneralSettings()
  const save = useSaveGeneral()
  const [stuck, setStuck] = useState(7)
  const [origin, setOrigin] = useState('')
  const [style, setStyle] = useState('')
  const [styleDark, setStyleDark] = useState('')
  useEffect(() => {
    if (q.data) {
      setStuck(q.data.stuck_days ?? 7)
      setOrigin(q.data.origin_postal_code ?? '')
      setStyle(q.data.map_style_url ?? '')
      setStyleDark(q.data.map_style_url_dark ?? '')
    }
  }, [q.data])
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Attention rules</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <Label>Flag a shipment as stuck after this many days without a new scan</Label>
            <Input type="number" min={1} max={90} value={stuck} onChange={(e) => setStuck(Number(e.target.value))} className="w-32" />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Your origin ZIP (optional, used as the start of transit paths before the first scan)</Label>
            <Input value={origin} onChange={(e) => setOrigin(e.target.value)} className="w-40" placeholder="e.g. 90052" />
          </label>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Map & appearance</CardTitle>
          <ThemeToggle />
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <Label>Basemap style URL, light theme (empty = OpenFreeMap Positron; see README for a fully offline PMTiles setup)</Label>
            <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="https://tiles.openfreemap.org/styles/positron" />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Basemap style URL, dark theme (empty = OpenFreeMap Fiord)</Label>
            <Input value={styleDark} onChange={(e) => setStyleDark(e.target.value)} placeholder="https://tiles.openfreemap.org/styles/fiord" />
          </label>
        </CardBody>
      </Card>
      <div className="flex justify-end">
        <Button
          onClick={async () => {
            try {
              await save.mutateAsync({ stuck_days: stuck, origin_postal_code: origin || null, map_style_url: style || null, map_style_url_dark: styleDark || null })
              toast.success('Saved')
            } catch (e) {
              toast.error((e as Error).message)
            }
          }}
          disabled={save.isPending}
        >
          Save settings
        </Button>
      </div>
    </div>
  )
}
