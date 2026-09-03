/**
 * Live USPS / FedEx tracking from the browser, through the user's own relay Worker (worker/).
 * The relay holds the credentials and forwards tracking numbers; this module parses the carrier
 * responses exactly like backend/app/carriers/usps.py and fedex.py.
 */
import type { Status } from '@/local/carriers'
import type { NormalizedEvent, TrackError, TrackResult } from '@/local/mockCarrier'
import { FEDEX_CODE, USPS_EVENT_CODE, byKeywords, mapFedex, mapUsps } from '@/local/statusMap'

type Json = Record<string, unknown>
type ErrorKind = TrackError['kind'] | 'rate_limited'
export type LiveError = Omit<TrackError, 'kind'> & { kind: ErrorKind }
export type LiveResult = TrackResult | LiveError

const str = (v: unknown): string => (v == null ? '' : String(v))
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Carrier timestamps keep their wall-clock time and drop the zone, like the backend. */
export function parseDt(v: unknown): string | null {
  const s = str(v).trim()
  if (!s) return null
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(s)
  if (!m) return null
  const time = m[2] ? (m[2].length === 5 ? `${m[2]}:00` : m[2]) : '00:00:00'
  return `${m[1]}T${time}`
}
const parseDate = (v: unknown) => parseDt(v)?.slice(0, 10) ?? null

function err(number: string, kind: ErrorKind, message: string): LiveError {
  return { ok: false, tracking_number: number, kind, message }
}

// ---------------------------------------------------------------- USPS

export function parseUsps(number: string, j: Json): LiveResult {
  const error = j.error
  if (error && !arr(j.trackingEvents).length) {
    const msg = typeof error === 'object' && error ? str((error as Json).message) : str(error)
    return err(number, 'not_found', msg || 'USPS returned an error')
  }
  const events: NormalizedEvent[] = []
  for (const raw of arr(j.trackingEvents)) {
    const e = obj(raw)
    const code = str(e.eventCode || e.eventType).slice(0, 30) || null
    const desc = str(e.eventType || e.eventDescription || e.eventCode).trim() || 'Event'
    const status: Status = USPS_EVENT_CODE[code ?? ''] ?? byKeywords(desc) ?? mapUsps(null, code, desc)[0]
    const ts = str(e.eventTimestamp)
    const zip = str(e.eventZIP).trim() || null
    events.push({
      at: parseDt(ts) ?? '',
      at_raw: ts,
      code: code ?? '',
      description: desc,
      status,
      city: str(e.eventCity) || '',
      state: str(e.eventState) || '',
      postal_code: zip ? zip.slice(0, 10) : '',
      country: (str(e.eventCountry) || 'US').slice(0, 2),
    })
  }
  events.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  const latest = events[0]
  const [status, flag] = mapUsps(str(j.statusCategory) || null, latest?.code ?? null, str(j.status || j.statusSummary) || null)
  let deliveredAt: string | null = null
  if (status === 'delivered') deliveredAt = latest && latest.status === 'delivered' ? latest.at : (events.find((e) => e.status === 'delivered')?.at ?? null)
  const destZip = str(j.destinationZIP).slice(0, 10)
  const originZip = str(j.originZIP).slice(0, 10)
  return {
    ok: true,
    tracking_number: number,
    carrier: 'usps',
    status,
    status_raw: str(j.status || j.statusSummary || latest?.description || '').slice(0, 255),
    status_code: latest?.code ?? '',
    attention_flag: flag,
    expected_delivery: parseDate(j.expectedDeliveryTimeStamp || j.expectedDeliveryDate),
    delivered_at: deliveredAt,
    origin_postal_code: originZip,
    dest_postal_code: /^\d{5}/.exec(destZip)?.[0] ?? '',
    events,
  }
}

// ---------------------------------------------------------------- FedEx

function fedexOne(number: string, tr: Json): TrackResult {
  const lsd = obj(tr.latestStatusDetail)
  const events: NormalizedEvent[] = []
  for (const raw of arr(tr.scanEvents)) {
    const e = obj(raw)
    const code = str(e.derivedStatusCode || e.eventType).slice(0, 30) || null
    let desc = str(e.eventDescription || e.derivedStatus || 'Event').trim()
    if (e.exceptionDescription) desc = `${desc}: ${str(e.exceptionDescription)}`
    const status: Status = FEDEX_CODE[code ?? ''] ?? byKeywords(desc) ?? mapFedex(code, str(e.eventType) || null, desc)[0]
    const loc = obj(e.scanLocation)
    events.push({
      at: parseDt(e.date) ?? '',
      at_raw: str(e.date),
      code: code ?? '',
      description: desc,
      status,
      city: str(loc.city),
      state: str(loc.stateOrProvinceCode),
      postal_code: str(loc.postalCode).slice(0, 10),
      country: (str(loc.countryCode) || 'US').slice(0, 2),
    })
  }
  events.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  const latest = events[0]
  const [status, flag] = mapFedex(str(lsd.derivedCode) || null, str(lsd.code) || null, str(lsd.description || lsd.statusByLocale) || null)
  let expected: string | null = null
  let deliveredAt: string | null = null
  for (const raw of arr(tr.dateAndTimes)) {
    const dt = obj(raw)
    if (dt.type === 'ESTIMATED_DELIVERY' && !expected) expected = parseDate(dt.dateTime)
    if (dt.type === 'ACTUAL_DELIVERY') deliveredAt = parseDt(dt.dateTime)
  }
  const win = obj(obj(tr.estimatedDeliveryTimeWindow).window)
  if (!expected && (win.ends || win.begins)) expected = parseDate(win.ends || win.begins)
  if (status === 'delivered' && !deliveredAt && latest) deliveredAt = latest.at
  const origin = str(obj(obj(tr.shipperInformation).address).postalCode)
  const dest = str(obj(obj(tr.recipientInformation).address).postalCode)
  return {
    ok: true,
    tracking_number: number,
    carrier: 'fedex',
    status,
    status_raw: str(lsd.statusByLocale || lsd.description || latest?.description || '').slice(0, 255),
    status_code: str(lsd.derivedCode || lsd.code),
    attention_flag: flag,
    expected_delivery: expected,
    delivered_at: deliveredAt,
    origin_postal_code: origin.slice(0, 10),
    dest_postal_code: dest.slice(0, 10),
    events,
  }
}

export function parseFedex(requested: string[], j: Json): Record<string, LiveResult> {
  const out: Record<string, LiveResult> = {}
  for (const raw of arr(obj(j.output).completeTrackResults)) {
    const ctr = obj(raw)
    const number = str(ctr.trackingNumber)
    const results = arr(ctr.trackResults)
    if (!results.length) {
      out[number] = err(number, 'not_found', 'No tracking results')
      continue
    }
    const tr = obj(results[0])
    if (tr.error) {
      const e = obj(tr.error)
      const code = str(e.code)
      const kind: ErrorKind = code.includes('NOT.FOUND') || code.replace(/\./g, '').includes('NOTFOUND') ? 'not_found' : 'invalid'
      out[number] = err(number, kind, str(e.message) || code)
      continue
    }
    out[number] = fedexOne(number, tr)
  }
  for (const n of requested) out[n] ??= err(n, 'not_found', 'FedEx returned no result for this number')
  return out
}

// ---------------------------------------------------------------- relay client

export interface RelayConfig {
  url: string
  token: string
}
export interface RelayStatus {
  ok: boolean
  message: string
  carriers: Record<'usps' | 'fedex', { configured: boolean; sandbox: boolean; ok?: boolean; message?: string }>
}

export function normalizeRelayUrl(v: string): string {
  let s = v.trim().replace(/\/+$/, '')
  if (s && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`
  return s
}

async function relayCall(cfg: RelayConfig, path: string, body?: unknown): Promise<Json> {
  let r: Response
  try {
    r = await fetch(`${cfg.url}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      mode: 'cors',
    })
  } catch (e) {
    throw new Error(`Could not reach the relay at ${cfg.url}: ${(e as Error).message}. Check the address and that the Worker is deployed.`)
  }
  let j: Json = {}
  try {
    j = (await r.json()) as Json
  } catch {
    /* non-JSON */
  }
  if (r.status === 401) throw new Error('The relay rejected the token. Make sure it matches the RELAY_TOKEN secret on the Worker.')
  if (!r.ok) throw new Error(str(j.error) || `Relay answered ${r.status}`)
  return j
}

/** Health + a token check for each configured carrier. */
export async function testRelay(cfg: RelayConfig): Promise<RelayStatus> {
  const health = await relayCall(cfg, '/')
  if (health.relay !== 'fulfillment-tracker') throw new Error('That address answered, but it is not the Fulfillment Tracker relay Worker.')
  const carriers = obj(health.carriers) as RelayStatus['carriers']
  const out: RelayStatus = { ok: true, message: 'Relay reachable', carriers: { usps: { configured: false, sandbox: false }, fedex: { configured: false, sandbox: false } } }
  for (const c of ['usps', 'fedex'] as const) {
    const info = obj(carriers[c])
    out.carriers[c] = { configured: !!info.configured, sandbox: !!info.sandbox }
    if (!info.configured) {
      out.carriers[c].message = `${c.toUpperCase()} credentials are not set on the relay`
      continue
    }
    try {
      const t = await relayCall(cfg, `/${c}/test`)
      out.carriers[c].ok = !!t.ok
      out.carriers[c].message = str(t.message) || (t.ok ? 'OK' : 'Failed')
    } catch (e) {
      out.carriers[c].ok = false
      out.carriers[c].message = (e as Error).message
    }
  }
  if (!out.carriers.usps.configured && !out.carriers.fedex.configured) out.message = 'Relay reachable, but no carrier credentials are set on it yet'
  return out
}

/** Fetch live results for one carrier through the relay. Every number gets a result or an error. */
export async function relayTrack(cfg: RelayConfig, carrier: 'usps' | 'fedex', numbers: string[]): Promise<Record<string, LiveResult>> {
  const out: Record<string, LiveResult> = {}
  let j: Json
  try {
    j = await relayCall(cfg, `/${carrier}/track`, { numbers })
  } catch (e) {
    for (const n of numbers) out[n] = err(n, 'transient', (e as Error).message)
    return out
  }
  if (j.ok === false && j.error) {
    const e = obj(j.error)
    for (const n of numbers) out[n] = err(n, (str(e.kind) as ErrorKind) || 'transient', str(e.message) || 'Relay error')
    return out
  }
  if (carrier === 'usps') {
    const results = obj(j.results)
    for (const n of numbers) {
      const r = obj(results[n])
      if (r.error) {
        const e = obj(r.error)
        out[n] = err(n, (str(e.kind) as ErrorKind) || 'transient', str(e.message))
      } else if (r.json) out[n] = parseUsps(n, obj(r.json))
      else out[n] = err(n, 'transient', 'No answer from the relay for this number')
    }
    return out
  }
  for (const raw of arr(j.batches)) {
    const b = obj(raw)
    const nums = arr(b.numbers).map(str)
    if (b.error) {
      const e = obj(b.error)
      for (const n of nums) out[n] = err(n, (str(e.kind) as ErrorKind) || 'transient', str(e.message))
    } else Object.assign(out, parseFedex(nums, obj(b.json)))
  }
  for (const n of numbers) out[n] ??= err(n, 'transient', 'No answer from the relay for this number')
  return out
}
