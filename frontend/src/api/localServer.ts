/**
 * A tiny in-browser implementation of the read-only API, backed by a snapshot file.
 * Mirrors backend/app/services/query.py closely enough that the same pages work unchanged.
 */
import type { Snapshot, SnapshotShipment } from '@/lib/snapshot'
import { STATUS_ORDER } from '@/lib/status'

type Query = URLSearchParams


function list(q: Query, key: string): string[] {
  return q.getAll(key).flatMap((v) => v.split(',')).filter(Boolean)
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(((b.getTime() - a.getTime()) / 86_400_000) * 10) / 10
}

export function applyFilters(rows: SnapshotShipment[], q: Query, now = new Date()): SnapshotShipment[] {
  const status = list(q, 'status')
  const carrier = list(q, 'carrier')
  const state = list(q, 'state').map((s) => s.toUpperCase())
  const uploads = list(q, 'upload_id').map(Number)
  const tags = list(q, 'tag')
  const ids = list(q, 'ids').map(Number)
  const city = q.get('city')?.toLowerCase()
  const text = q.get('q')?.trim().toLowerCase()
  const sdf = q.get('ship_date_from')
  const sdt = q.get('ship_date_to')
  const lef = q.get('last_event_from')
  const let_ = q.get('last_event_to')
  const dmin = q.get('days_min')
  const dmax = q.get('days_max')
  const attention = q.get('attention')
  const geocoded = q.get('geocoded')
  return rows.filter((r) => {
    if (ids.length && !ids.includes(r.id)) return false
    if (status.length && !status.includes(r.status)) return false
    if (carrier.length && !carrier.includes(r.carrier)) return false
    if (state.length && !state.includes((r.state ?? '').toUpperCase())) return false
    if (uploads.length && !r.upload_ids.some((u) => uploads.includes(u))) return false
    if (tags.length && !r.tags.some((t) => tags.includes(t.name))) return false
    if (city && !(r.city ?? '').toLowerCase().includes(city)) return false
    if (sdf && (!r.ship_date || r.ship_date < sdf)) return false
    if (sdt && (!r.ship_date || r.ship_date > sdt)) return false
    if (lef && (!r.last_event_at || r.last_event_at.slice(0, 10) < lef)) return false
    if (let_ && (!r.last_event_at || r.last_event_at.slice(0, 10) > let_)) return false
    const d = daysInTransit(r, now)
    if (dmin !== null && dmin !== '' && (d == null || d < Number(dmin))) return false
    if (dmax !== null && dmax !== '' && (d == null || d > Number(dmax))) return false
    if (attention === 'true' || attention === '1') {
      if (!r.reasons.some((x) => x !== 'not_geocoded')) return false
    }
    if (geocoded === 'true' || geocoded === '1') {
      if (r.dest_lat == null) return false
    } else if (geocoded === 'false' || geocoded === '0') {
      if (r.dest_lat != null) return false
    }
    if (text) {
      const hay = [r.recipient_name, r.tracking_number, r.order_ref, r.city, r.company, r.address1, r.postal_code].map((x) => (x ?? '').toLowerCase())
      if (!hay.some((h) => h.includes(text))) return false
    }
    return true
  })
}

export function daysInTransit(r: SnapshotShipment, now = new Date()): number | null {
  const start = r.ship_date ?? r.first_event_at?.slice(0, 10)
  if (!start) return null
  const end = r.delivered_at ? new Date(r.delivered_at) : now
  return Math.max(0, daysBetween(new Date(start), end))
}

const SORT_KEYS = new Set(['id', 'tracking_number', 'carrier', 'recipient_name', 'city', 'state', 'postal_code', 'order_ref', 'ship_date', 'status', 'expected_delivery', 'delivered_at', 'last_event_at', 'last_polled_at', 'created_at', 'updated_at', 'days_in_transit'])

export function applySort(rows: SnapshotShipment[], sort: string | null): SnapshotShipment[] {
  const s = sort || '-last_event_at'
  const desc = s.startsWith('-')
  const key = s.replace(/^[-+]/, '')
  const k = SORT_KEYS.has(key) ? key : 'last_event_at'
  const val = (r: SnapshotShipment) => (k === 'days_in_transit' ? daysInTransit(r) : (r as unknown as Record<string, unknown>)[k])
  return [...rows].sort((a, b) => {
    const va = val(a)
    const vb = val(b)
    if (va == null && vb == null) return b.id - a.id
    if (va == null) return 1 // nulls last
    if (vb == null) return -1
    const c = va < vb ? -1 : va > vb ? 1 : 0
    return (desc ? -c : c) || b.id - a.id
  })
}

export function rowOut(r: SnapshotShipment) {
  return { ...r, days_in_transit: daysInTransit(r) }
}

function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function jitter(id: number): [number, number] {
  // deterministic small offset, like the backend
  let h = 2166136261
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const a = ((h >>> 0) % 1000) / 1000
  const b = (((h >>> 8) >>> 0) % 1000) / 1000
  return [(a - 0.5) * 0.008, (b - 0.5) * 0.008]
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

export function apiPath(url: URL): string {
  return url.pathname.replace(/^.*?\/api\//, '/api/')
}

export function handleLocal(snapshot: Snapshot, method: string, url: URL): Response {
  if (method !== 'GET') return json({ detail: 'This is a read-only snapshot. Open the app on your server to make changes.' }, 405)
  return handleRead(snapshot, apiPath(url), url.searchParams) ?? json({ detail: `Not available in a snapshot: ${apiPath(url)}` }, 404)
}

/** Read-only routes over a snapshot-shaped dataset. Returns null for routes it does not know. */
export function handleRead(snapshot: Snapshot, path: string, q: Query): Response | null {
  const all = snapshot.shipments

  if (path === '/api/config') {
    return json({ app_name: snapshot.app_name, map_style_url: snapshot.map_style_url, map_style_url_dark: snapshot.map_style_url_dark, carrier_mode: 'snapshot', auth_enabled: false, stuck_days: snapshot.stuck_days })
  }
  if (path === '/api/health') return json({ ok: true, db: 'snapshot', carrier_mode: 'snapshot', auth: false, refresh_running: false, carriers: {} })
  if (path === '/api/handoff') return json({ lan_url: null, public_url: null, hosted_ui_url: window.location.origin + (import.meta.env.BASE_URL || '/'), auth_required: false })
  if (path === '/api/auth/check') return json({ ok: true, auth: false })
  if (path === '/api/jobs/current') return json(null)
  if (path === '/api/jobs') return json([])
  if (path === '/api/tags') {
    const seen = new Map<number, unknown>()
    for (const r of all) for (const t of r.tags) seen.set(t.id, t)
    return json([...seen.values()])
  }
  if (path === '/api/uploads') return json(snapshot.uploads.map((u) => ({ ...u, status: 'committed', row_count: u.count, imported_count: u.count, duplicate_count: 0, skipped_count: 0, shipment_count: u.count, size_bytes: 0, header_row: 0, column_mapping: null, preset_id: null, geocode_mode: 'offline', default_carrier: null, errors: null, committed_at: u.created_at, sheet_name: null })))
  if (path === '/api/presets') return json([])
  if (path === '/api/settings/carriers') return json([])

  if (path === '/api/shipments') {
    const rows = applySort(applyFilters(all, q), q.get('sort'))
    const page = Math.max(1, Number(q.get('page') || 1))
    const size = Math.min(500, Math.max(1, Number(q.get('page_size') || 50)))
    return json({ items: rows.slice((page - 1) * size, page * size).map(rowOut), total: rows.length, page, page_size: size })
  }
  if (path === '/api/shipments/stats') {
    const rows = applyFilters(all, q)
    const by_status: Record<string, number> = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]))
    const by_carrier: Record<string, number> = {}
    const week = Date.now() - 7 * 86_400_000
    let delivered7 = 0
    const days: number[] = []
    let attention = 0
    let notGeo = 0
    for (const r of rows) {
      by_status[r.status] = (by_status[r.status] ?? 0) + 1
      by_carrier[r.carrier] = (by_carrier[r.carrier] ?? 0) + 1
      if (r.status === 'delivered' && r.delivered_at && new Date(r.delivered_at).getTime() >= week) delivered7++
      if (r.status === 'delivered') {
        const d = daysInTransit(r)
        if (d != null) days.push(d)
      }
      if (r.reasons.some((x) => x !== 'not_geocoded')) attention++
      if (r.dest_lat == null) notGeo++
    }
    const lastPolled = rows.map((r) => r.last_polled_at).filter(Boolean).sort().pop() ?? null
    return json({ total: rows.length, by_status, by_carrier, delivered_last_7d: delivered7, attention, avg_days_in_transit: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null, median_days_in_transit: median(days), not_geocoded: notGeo, last_polled_at: lastPolled })
  }
  if (path === '/api/shipments/facets') {
    const states = [...new Set(all.map((r) => r.state).filter(Boolean))].sort() as string[]
    const cities = [...new Set(all.map((r) => r.city).filter(Boolean))].sort().slice(0, 500) as string[]
    const carriers = [...new Set(all.map((r) => r.carrier))].sort()
    const tags = new Map<number, unknown>()
    for (const r of all) for (const t of r.tags) tags.set(t.id, t)
    return json({ states, cities, carriers, uploads: snapshot.uploads, tags: [...tags.values()], statuses: STATUS_ORDER })
  }
  const m = /^\/api\/shipments\/(\d+)(\/path\.geojson)?$/.exec(path)
  if (m) {
    const r = all.find((x) => x.id === Number(m[1]))
    if (!r) return json({ detail: 'Shipment not found' }, 404)
    if (!m[2]) {
      const uploads = (r.upload_ids ?? []).map((id) => ({ id, filename: snapshot.uploads.find((u) => u.id === id)?.filename ?? `upload ${id}`, row_number: 0 }))
      return json({ ...rowOut(r), uploads, events: r.events ?? [], notes: r.notes ?? [] })
    }
    return json(pathGeojson(r))
  }
  if (path === '/api/map/points.geojson') {
    const rows = applyFilters(all, q).filter((r) => r.dest_lat != null && r.dest_lng != null)
    return json({
      type: 'FeatureCollection',
      features: rows.map((r) => {
        const [dx, dy] = r.geocode_precision === 'street' ? [0, 0] : jitter(r.id)
        return { type: 'Feature', id: r.id, geometry: { type: 'Point', coordinates: [r.dest_lng! + dx, r.dest_lat! + dy] }, properties: { id: r.id, s: r.status, c: r.carrier, p: r.geocode_precision, n: r.recipient_name, pl: [r.city, r.state].filter(Boolean).join(', '), t: r.tracking_number, w: r.status === 'exception' || r.status === 'returned' ? 2 : 1 } }
      }),
    })
  }
  if (path === '/api/map/states') {
    const out: Record<string, { total: number; by_status: Record<string, number> }> = {}
    for (const r of applyFilters(all, q)) {
      if (!r.state) continue
      const e = (out[r.state] ??= { total: 0, by_status: Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) })
      e.total++
      e.by_status[r.status] = (e.by_status[r.status] ?? 0) + 1
    }
    return json(out)
  }
  if (path === '/api/attention') {
    const prio: Record<string, number> = { exception: 0, returned: 1, delivery_failed: 1, pickup: 2, poll_errors: 3, stuck_pre_transit: 4, stuck_in_transit: 4, not_geocoded: 9 }
    const rows = applySort(applyFilters(all, q), q.get('sort'))
      .filter((r) => r.reasons.length)
      .map(rowOut)
      .sort((a, b) => Math.min(...a.reasons.map((x) => prio[x] ?? 5)) - Math.min(...b.reasons.map((x) => prio[x] ?? 5)))
    return json(rows)
  }
  return null
}

export function pathGeojson(r: SnapshotShipment) {
  const features: unknown[] = []
  const coords: number[][] = []
  const events = [...r.events].filter((e) => e.lat != null && e.lng != null).sort((a, b) => (a.event_at ?? '').localeCompare(b.event_at ?? ''))
  let last: string | null = null
  let n = 0
  for (const e of events) {
    const key = `${e.lat!.toFixed(3)},${e.lng!.toFixed(3)}`
    if (key === last) continue
    last = key
    n++
    const label = [e.city, e.state].filter(Boolean).join(', ')
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { kind: n === 1 ? 'origin' : 'scan', n, label: label ? `${n}. ${label}` : String(n), description: e.description, at: e.event_at, s: e.normalized_status } })
    coords.push([e.lng!, e.lat!])
  }
  if (r.dest_lat != null && r.dest_lng != null) {
    const dest = [r.dest_lng, r.dest_lat]
    const delivered = r.status === 'delivered'
    const atDest = coords.length > 0 && Math.abs(coords[coords.length - 1][0] - dest[0]) < 0.01 && Math.abs(coords[coords.length - 1][1] - dest[1]) < 0.01
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: dest }, properties: { kind: 'destination', label: 'Destination' + (delivered ? ' (delivered)' : ''), s: r.status, description: [r.city, r.state, r.postal_code].filter(Boolean).join(', ') } })
    if (coords.length && !atDest) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [coords[coords.length - 1], dest] }, properties: { future: !delivered } })
  }
  if (coords.length >= 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { future: false } })
  return { type: 'FeatureCollection', features }
}

/** fetch() replacement used by the API client while a snapshot is open. */
export function snapshotFetch(snapshot: Snapshot): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url, window.location.origin)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    return handleLocal(snapshot, method, url)
  }
}
