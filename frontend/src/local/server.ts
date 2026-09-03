/**
 * In-browser implementation of the read-write API over a LocalDb ("this browser" data mode).
 * Reads reuse the snapshot handlers (localServer.ts); writes mirror the FastAPI routes closely enough
 * that every page works unchanged. Carriers are the deterministic mock; geocoding is the offline ZIP table.
 */
import { apiPath, applyFilters, applySort, daysInTransit, handleRead, json, rowOut } from '@/api/localServer'
import type { Snapshot, SnapshotShipment } from '@/lib/snapshot'
import { carrierLink, detectCarrier } from '@/local/carriers'
import { DEFAULT_MAP_STYLE, DEFAULT_MAP_STYLE_DARK, LocalDb, nowIso, type LocalJob, type LocalPreset, type LocalShipment, type LocalUpload, type TagOut } from '@/local/db'
import { geocodeOffline, loadZipIndex } from '@/local/geocode'
import { importRows } from '@/local/importer'
import { ALL_FIELDS, FIELD_LABELS, FIELD_SYNONYMS, headerSignature, suggestMapping } from '@/local/mapping'
import { mockTrack, type TrackError, type TrackResult } from '@/local/mockCarrier'
import { normalizeRelayUrl, relayTrack, testRelay, type LiveResult, type RelayConfig } from '@/local/liveCarriers'
import { normalizeTracking } from '@/local/normalize'
import { detectHeaderRow, readWorkbook, sheetOf, tableFromRows, type Workbook } from '@/local/spreadsheet'
import { applyError, applyResult, attentionReasons } from '@/local/tracking'

export const APP_NAME = 'Fulfillment Tracker'
const TAG_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#64748b']
const WIPE_TOKEN = Math.random().toString(36).slice(2, 14)
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Raw workbooks of uploads that are not committed yet (kept in memory only). */
const pending = new Map<number, Workbook>()

// ---------------------------------------------------------------- views

function tagsOf(db: LocalDb, s: LocalShipment): TagOut[] {
  return s.tag_ids.map((id) => db.data.tags.find((t) => t.id === id)).filter((t): t is TagOut => !!t)
}

export function shipmentView(db: LocalDb, s: LocalShipment, now = new Date()): SnapshotShipment {
  const { tag_ids: _t, upload_refs, events, notes, ...rest } = s
  return {
    ...rest,
    tags: tagsOf(db, s),
    upload_ids: upload_refs.map((u) => u.upload_id),
    carrier_url: carrierLink(s.carrier, s.tracking_number),
    events: events.map(({ dedupe_key: _k, ...e }) => e),
    notes: [...notes].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    uploads: upload_refs.map((u) => ({ id: u.upload_id, filename: db.upload(u.upload_id)?.filename ?? `upload ${u.upload_id}`, row_number: u.row_number })),
    reasons: attentionReasons(s, db.data.settings.stuck_days, now),
  }
}

function committedUploads(db: LocalDb) {
  return db.data.uploads.filter((u) => u.status === 'committed').map((u) => ({ id: u.id, filename: u.filename, created_at: u.created_at, count: u.imported_count + u.duplicate_count }))
}

let cache: { version: number; snap: Snapshot; at: number } | null = null

/** Snapshot-shaped view of the database (cached per write version, refreshed every minute for time-based reasons). */
export function toSnapshot(db: LocalDb): Snapshot {
  const now = Date.now()
  if (cache && cache.version === db.version && now - cache.at < 60_000) return cache.snap
  const s = db.data.settings
  const snap: Snapshot = {
    format: 'fulfillment-tracker-snapshot',
    version: 1,
    exported_at: nowIso(),
    app_name: APP_NAME,
    stuck_days: s.stuck_days,
    map_style_url: s.map_style_url || DEFAULT_MAP_STYLE,
    map_style_url_dark: s.map_style_url_dark || DEFAULT_MAP_STYLE_DARK,
    filters: {},
    uploads: committedUploads(db),
    shipments: db.data.shipments.map((x) => shipmentView(db, x)),
  }
  cache = { version: db.version, snap, at: now }
  return snap
}

function uploadOut(db: LocalDb, u: LocalUpload) {
  return { ...u, shipment_count: db.data.shipments.filter((s) => s.upload_refs.some((r) => r.upload_id === u.id)).length }
}

function jobOut(j: LocalJob) {
  const { ids: _i, cancel_requested: _c, ...rest } = j
  return rest
}

// ---------------------------------------------------------------- request helpers

async function jsonBody(input: RequestInfo | URL, init?: RequestInit): Promise<Record<string, unknown>> {
  if (init?.body != null) {
    if (typeof init.body === 'string') return init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    if (init.body instanceof Blob) return JSON.parse(await init.body.text()) as Record<string, unknown>
  }
  if (input instanceof Request) {
    const t = await input.text()
    return t ? (JSON.parse(t) as Record<string, unknown>) : {}
  }
  return {}
}

async function formBody(input: RequestInfo | URL, init?: RequestInit): Promise<FormData | null> {
  if (init?.body instanceof FormData) return init.body
  if (input instanceof Request) return input.formData()
  return null
}

function notFound(what = 'Not found'): Response {
  return json({ detail: what }, 404)
}

// ---------------------------------------------------------------- uploads

function preview(db: LocalDb, u: LocalUpload, wb: Workbook, sheet: string | null, headerRow: number | null) {
  const sh = sheetOf(wb, sheet)
  const hr = headerRow == null ? detectHeaderRow(sh.rows) : Math.max(0, headerRow)
  const [headers, body] = tableFromRows(sh.rows, hr)
  const sample = body.slice(0, 50)
  let suggested = suggestMapping(headers, sample)
  const sig = headerSignature(headers)
  const preset = db.data.presets.find((p) => p.header_signature === sig)
  if (preset) {
    const kept = Object.fromEntries(Object.entries(preset.mapping).filter(([, h]) => headers.includes(h)))
    if (Object.keys(kept).length) suggested = kept
  }
  const detection: Record<string, number> = { usps: 0, fedex: 0, unknown: 0, low_confidence: 0 }
  const th = suggested.tracking_number
  if (th && headers.includes(th)) {
    const i = headers.indexOf(th)
    for (const r of sample) {
      const [c, conf] = detectCarrier(normalizeTracking(i < r.length ? r[i] : null))
      detection[c] = (detection[c] ?? 0) + 1
      if (c !== 'unknown' && conf < 0.7) detection.low_confidence++
    }
  }
  return {
    upload_id: u.id,
    filename: u.filename,
    sheets: wb.sheets.map((s) => s.name),
    sheet: sh.name,
    header_row: hr,
    headers,
    sample_rows: sample.slice(0, 20),
    row_count: body.length,
    suggested_mapping: suggested,
    matched_preset_id: preset?.id ?? null,
    fields: ALL_FIELDS.map((f) => ({ key: f, label: FIELD_LABELS[f] ?? f, required: f === 'tracking_number', hints: FIELD_SYNONYMS[f].slice(0, 4) })),
    carrier_detection: detection,
  }
}

async function createUpload(db: LocalDb, file: File | null): Promise<Response> {
  if (!file || !file.size) return json({ detail: 'Empty file' }, 400)
  if (file.size > MAX_UPLOAD_BYTES) return json({ detail: 'File too large (max 50 MB)' }, 413)
  const name = file.name.split(/[\\/]/).pop() || 'upload'
  let wb: Workbook
  try {
    wb = await readWorkbook(file)
  } catch (e) {
    return json({ detail: `Could not read spreadsheet: ${(e as Error).message}` }, 400)
  }
  const u: LocalUpload = {
    id: db.nextId('upload'),
    filename: name,
    size_bytes: file.size,
    created_at: nowIso(),
    committed_at: null,
    status: 'pending',
    sheet_name: null,
    header_row: 0,
    column_mapping: null,
    preset_id: null,
    geocode_mode: 'offline',
    default_carrier: null,
    row_count: 0,
    imported_count: 0,
    duplicate_count: 0,
    skipped_count: 0,
    errors: null,
  }
  const p = preview(db, u, wb, null, null)
  u.sheet_name = p.sheet
  u.header_row = p.header_row
  u.row_count = p.row_count
  db.data.uploads.push(u)
  pending.set(u.id, wb)
  db.touch()
  return json(p, 201)
}

async function geocodeShipments(ships: LocalShipment[], force = false): Promise<void> {
  try {
    await loadZipIndex()
  } catch (e) {
    console.warn('ZIP table unavailable; shipments stay unplaced', e)
    for (const s of ships) if (s.dest_lat == null) s.geocode_precision = 'none'
    return
  }
  for (const s of ships) {
    if (!force && s.dest_lat != null) continue
    const g = geocodeOffline({ city: s.city, state: s.state, postal_code: s.postal_code })
    if (g) {
      s.dest_lat = g.lat
      s.dest_lng = g.lng
      s.geocode_precision = g.precision
      s.geocode_source = g.source
    } else {
      s.dest_lat = s.dest_lng = null
      s.geocode_precision = 'none'
      s.geocode_source = null
    }
  }
}

async function commitUpload(db: LocalDb, u: LocalUpload, body: Record<string, unknown>): Promise<Response> {
  if (u.status === 'committed') return json({ detail: 'Upload already committed' }, 409)
  const wb = pending.get(u.id)
  if (!wb) return json({ detail: 'This upload is no longer in memory (the page was reloaded). Choose the file again.' }, 404)
  const mapping = (body.mapping ?? {}) as Record<string, string>
  if (!mapping.tracking_number) return json({ detail: 'A tracking number column is required' }, 422)
  const sh = sheetOf(wb, (body.sheet as string | null) ?? null)
  const headerRow = Number(body.header_row ?? 0)
  const [headers, rows] = tableFromRows(sh.rows, headerRow)
  const missing = Object.values(mapping).filter((h) => !headers.includes(h))
  if (missing.length) return json({ detail: `Mapped columns not found in sheet: ${JSON.stringify(missing)}` }, 422)

  u.sheet_name = sh.name
  u.header_row = headerRow
  u.column_mapping = mapping
  u.geocode_mode = (body.geocode_mode as string) || 'offline'
  u.default_carrier = (body.default_carrier as string | null) || null
  u.row_count = rows.length

  const saveAs = (body.save_preset_as as string | null)?.trim()
  if (saveAs) {
    let preset = db.data.presets.find((p) => p.name === saveAs)
    if (preset) {
      preset.mapping = mapping
      preset.header_signature = headerSignature(headers)
    } else {
      preset = { id: db.nextId('preset'), name: saveAs, mapping, header_signature: headerSignature(headers), created_at: nowIso(), last_used_at: null } satisfies LocalPreset
      db.data.presets.push(preset)
    }
    u.preset_id = preset.id
  } else if (body.preset_id) u.preset_id = Number(body.preset_id)
  if (u.preset_id) {
    const p = db.data.presets.find((x) => x.id === u.preset_id)
    if (p) p.last_used_at = nowIso()
  }

  const summary = importRows(db, u, headers, rows, mapping, u.default_carrier)
  u.imported_count = summary.imported
  u.duplicate_count = summary.duplicates
  u.skipped_count = summary.skipped
  u.errors = summary.errors.slice(0, 50)
  u.status = 'committed'
  u.committed_at = nowIso()
  pending.delete(u.id)
  const mine = db.data.shipments.filter((s) => s.upload_refs.some((r) => r.upload_id === u.id))
  await geocodeShipments(mine)
  db.touch()
  return json({ geocode_job_id: null, upload: uploadOut(db, u), imported: summary.imported, duplicates: summary.duplicates, skipped: summary.skipped, errors: summary.errors.slice(0, 50) })
}

function deleteUpload(db: LocalDb, u: LocalUpload): Response {
  db.data.shipments = db.data.shipments.filter((s) => {
    const mine = s.upload_refs.some((r) => r.upload_id === u.id)
    if (!mine) return true
    s.upload_refs = s.upload_refs.filter((r) => r.upload_id !== u.id)
    return s.upload_refs.length > 0 // shipments also present in another upload are kept
  })
  db.data.uploads = db.data.uploads.filter((x) => x.id !== u.id)
  pending.delete(u.id)
  db.touch()
  return new Response(null, { status: 204 })
}

// ---------------------------------------------------------------- tracking / jobs

const TERMINAL = new Set(['delivered', 'returned'])

function selectTargets(db: LocalDb, ids: number[] | null, includeTerminal: boolean): LocalShipment[] {
  return db.data.shipments
    .filter((s) => (s.carrier === 'usps' || s.carrier === 'fedex') && (ids == null || ids.includes(s.id)) && (includeTerminal || !TERMINAL.has(s.status)))
    .sort((a, b) => (a.last_polled_at ?? '').localeCompare(b.last_polled_at ?? ''))
}

function mockContext(ships: LocalShipment[]) {
  return {
    ship_dates: Object.fromEntries(ships.filter((s) => s.ship_date).map((s) => [s.tracking_number, s.ship_date])),
    dest_zips: Object.fromEntries(ships.filter((s) => s.postal_code).map((s) => [s.tracking_number, s.postal_code])),
  }
}

function relayConfig(db: LocalDb): RelayConfig | null {
  const s = db.data.settings
  return s.relay_url && s.relay_token ? { url: s.relay_url, token: s.relay_token } : null
}

type LiveCarrier = 'usps' | 'fedex'

/** Results for a group of shipments of one carrier: the relay (live) when configured, else the mock. */
async function trackGroup(db: LocalDb, carrier: LiveCarrier, ships: LocalShipment[]): Promise<Record<string, LiveResult>> {
  const numbers = ships.map((s) => s.tracking_number)
  const relay = relayConfig(db)
  if (relay) return relayTrack(relay, carrier, numbers)
  const ctx = mockContext(ships)
  return Object.fromEntries(numbers.map((n) => [n, mockTrack(n, carrier, ctx)]))
}

function asError(r: LiveResult): TrackError {
  return r as TrackError
}

async function refreshOne(db: LocalDb, s: LocalShipment): Promise<{ changed: boolean; error: string | null; kind: string | null }> {
  if (s.carrier !== 'usps' && s.carrier !== 'fedex') return { changed: false, error: 'No carrier assigned; set the carrier first.', kind: 'disabled' }
  await loadZipIndex().catch(() => undefined)
  const res = (await trackGroup(db, s.carrier, [s]))[s.tracking_number]
  if (res.ok) return { changed: applyResult(s, res as TrackResult, () => db.nextId('event')), error: null, kind: null }
  applyError(s, asError(res))
  return { changed: false, error: res.message, kind: res.kind }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runJob(db: LocalDb, job: LocalJob): Promise<void> {
  job.status = 'running'
  job.started_at = nowIso()
  db.touch()
  try {
    await loadZipIndex().catch(() => undefined)
    const ships = job.ids.map((id) => db.shipment(id)).filter((s): s is LocalShipment => !!s)
    const samples: string[] = []
    const live = !!relayConfig(db)
    const chunk = live ? 40 : 25
    for (const carrier of ['usps', 'fedex'] as const) {
      const group = ships.filter((s) => s.carrier === carrier)
      for (let i = 0; i < group.length; i += chunk) {
        if (job.cancel_requested) {
          job.status = 'cancelled'
          break
        }
        const part = group.slice(i, i + chunk)
        const results = await trackGroup(db, carrier, part)
        for (const s of part) {
          const res = results[s.tracking_number]
          if (res?.ok) {
            if (applyResult(s, res as TrackResult, () => db.nextId('event'))) job.updated++
          } else {
            applyError(s, res ? asError(res) : { ok: false, tracking_number: s.tracking_number, kind: 'transient', message: 'No result' })
            job.errors++
            if (samples.length < 10) samples.push(`${s.tracking_number}: ${res?.message ?? 'no result'}`)
          }
          job.done++
        }
        job.error_samples = samples
        db.touch()
        await sleep(live ? 0 : 40) // let the UI poll and show progress
      }
      if (job.status !== 'running') break
    }
    if (job.status === 'running') job.status = 'done'
  } catch (e) {
    job.status = 'failed'
    job.message = String((e as Error).message ?? e).slice(0, 500)
  }
  job.finished_at = nowIso()
  db.touch()
}

function startRefresh(db: LocalDb, body: Record<string, unknown>): Response {
  const running = db.data.jobs.find((j) => j.status === 'queued' || j.status === 'running')
  if (running) return json({ detail: `A refresh is already running (job ${running.id})` }, 409)
  let ids: number[] | null
  if (Array.isArray(body.shipment_ids) && body.shipment_ids.length) ids = (body.shipment_ids as number[]).map(Number)
  else if (body.filters && typeof body.filters === 'object') {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(body.filters as Record<string, unknown>)) {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue
      q.set(k, Array.isArray(v) ? v.join(',') : typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
    }
    ids = applyFilters(toSnapshot(db).shipments, q).map((s) => s.id)
  } else if (body.all) ids = null
  else return json({ detail: 'Provide all=true, shipment_ids or filters' }, 422)
  const targets = selectTargets(db, ids, !!body.include_terminal)
  if (!targets.length) return json({ job_id: null, queued: 0 })
  const job: LocalJob = {
    id: db.nextId('job'),
    kind: 'refresh',
    status: 'queued',
    total: targets.length,
    done: 0,
    updated: 0,
    errors: 0,
    message: null,
    error_samples: [],
    created_at: nowIso(),
    started_at: null,
    finished_at: null,
    ids: targets.map((s) => s.id),
    cancel_requested: false,
  }
  db.data.jobs.unshift(job)
  db.data.jobs = db.data.jobs.slice(0, 20)
  db.touch()
  void runJob(db, job)
  return json({ job_id: job.id, queued: targets.length })
}

// ---------------------------------------------------------------- shipments

const PATCHABLE = new Set(['carrier', 'recipient_name', 'company', 'address1', 'address2', 'city', 'state', 'postal_code', 'order_ref', 'ship_date', 'email', 'phone'])

async function patchShipment(db: LocalDb, s: LocalShipment, body: Record<string, unknown>): Promise<Response> {
  let addressChanged = false
  for (const [k, raw] of Object.entries(body)) {
    if (!PATCHABLE.has(k)) continue
    let v = raw as string | null
    if (k === 'carrier') {
      if (v !== 'usps' && v !== 'fedex' && v !== 'unknown') return json({ detail: 'carrier must be usps, fedex or unknown' }, 422)
      s.carrier = v
      s.carrier_confidence = 1
      s.carrier_locked = v !== 'unknown'
      continue
    }
    if (k === 'state' && v) v = v.toUpperCase().slice(0, 2)
    if (['address1', 'address2', 'city', 'state', 'postal_code'].includes(k)) addressChanged = true
    ;(s as unknown as Record<string, unknown>)[k] = v
  }
  if (addressChanged) await geocodeShipments([s], true)
  s.updated_at = nowIso()
  db.touch()
  return json(rowOut(shipmentView(db, s)))
}

function getOrCreateTag(db: LocalDb, name: string): TagOut | null {
  const n = name.trim().slice(0, 60)
  if (!n) return null
  let t = db.data.tags.find((x) => x.name === n)
  if (!t) {
    t = { id: db.nextId('tag'), name: n, color: TAG_COLORS[db.data.tags.length % TAG_COLORS.length] }
    db.data.tags.push(t)
  }
  return t
}

// ---------------------------------------------------------------- export / snapshot

const EXPORT_COLUMNS: [string, string][] = [
  ['tracking_number', 'Tracking number'], ['carrier', 'Carrier'], ['status', 'Status'], ['status_raw', 'Carrier status'], ['recipient_name', 'Recipient'],
  ['company', 'Company'], ['address1', 'Address 1'], ['address2', 'Address 2'], ['city', 'City'], ['state', 'State'], ['postal_code', 'ZIP'],
  ['order_ref', 'Order'], ['ship_date', 'Ship date'], ['expected_delivery', 'Expected delivery'], ['delivered_at', 'Delivered at'],
  ['last_event_at', 'Last event at'], ['last_event_desc', 'Last event'], ['last_event_place', 'Last event place'], ['days_in_transit', 'Days in transit'],
  ['tags', 'Tags'], ['carrier_url', 'Carrier link'], ['email', 'Email'], ['phone', 'Phone'],
]

function exportCell(r: SnapshotShipment, key: string): string | number | null {
  if (key === 'tags') return r.tags.map((t) => t.name).join(', ')
  if (key === 'days_in_transit') return daysInTransit(r)
  const v = (r as unknown as Record<string, unknown>)[key]
  if (v == null) return null
  if (typeof v === 'string') return v.replace('T', ' ')
  return v as string | number
}

function csvEscape(v: string | number | null): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function stamp(): string {
  return nowIso().replace(/[-:]/g, '').replace('T', '-').slice(0, 13)
}

async function exportRows(db: LocalDb, q: URLSearchParams): Promise<Response> {
  const format = q.get('format') || 'csv'
  const valid = EXPORT_COLUMNS.map(([c]) => c)
  const cols = (q.get('columns')?.split(',').filter((c) => valid.includes(c)) ?? []).length ? q.get('columns')!.split(',').filter((c) => valid.includes(c)) : valid
  const labels = Object.fromEntries(EXPORT_COLUMNS)
  const rows = applySort(applyFilters(toSnapshot(db).shipments, q), q.get('sort'))
  if (format === 'xlsx') {
    const XLSX = await import('xlsx')
    const aoa = [cols.map((c) => labels[c] ?? c), ...rows.map((r) => cols.map((c) => exportCell(r, c)))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Shipments')
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    return new Response(out, { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="shipments-${stamp()}.xlsx"` } })
  }
  if (format !== 'csv') return json({ detail: 'format must be csv or xlsx' }, 422)
  const lines = [cols.map((c) => csvEscape(labels[c] ?? c)).join(',')]
  for (const r of rows) lines.push(cols.map((c) => csvEscape(exportCell(r, c))).join(','))
  return new Response(`${lines.join('\r\n')}\r\n`, { status: 200, headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="shipments-${stamp()}.csv"` } })
}

function exportSnapshot(db: LocalDb, q: URLSearchParams): Response {
  const base = toSnapshot(db)
  const filters: Record<string, unknown> = {}
  q.forEach((v, k) => {
    if (v) filters[k] = v
  })
  const body: Snapshot = { ...base, exported_at: nowIso(), filters, shipments: applySort(applyFilters(base.shipments, q), '-last_event_at') }
  return json(body, 200, { 'content-disposition': `attachment; filename="shipments-${stamp()}.snapshot.json"` })
}

// ---------------------------------------------------------------- settings / privacy

function generalSettings(db: LocalDb) {
  const s = db.data.settings
  return { stuck_days: s.stuck_days, origin_postal_code: s.origin_postal_code, map_style_url: s.map_style_url, map_style_url_dark: s.map_style_url_dark, public_url: null, hosted_ui_url: null }
}

function carrierSettings(db: LocalDb) {
  const relay = relayConfig(db)
  const check = db.data.settings.relay_check
  return (['usps', 'fedex'] as const).map((carrier) => {
    const c = check?.carriers[carrier]
    const status = !relay ? 'mock' : !c ? 'unconfigured' : !c.configured ? 'unconfigured' : c.ok === false ? 'error' : 'ok'
    return {
      carrier,
      enabled: true,
      mode: relay ? 'live' : 'mock',
      sandbox: !!c?.sandbox,
      client_id: null,
      client_secret_masked: null,
      has_secret: !!c?.configured,
      from_env: false,
      status,
      last_check_at: check?.at ?? null,
      last_check_ok: c?.ok ?? null,
      last_check_message: c?.message ?? null,
    }
  })
}

function relaySettings(db: LocalDb) {
  const s = db.data.settings
  return { relay_url: s.relay_url, has_token: !!s.relay_token, token_masked: s.relay_token ? `${'•'.repeat(6)}${s.relay_token.slice(-2)}` : null, relay_check: s.relay_check }
}

async function runRelayTest(db: LocalDb): Promise<Response> {
  const relay = relayConfig(db)
  if (!relay) return json({ detail: 'Enter the relay address and token first.' }, 400)
  try {
    const r = await testRelay(relay)
    db.data.settings.relay_check = { at: nowIso(), ...r }
    db.touch()
    return json(db.data.settings.relay_check)
  } catch (e) {
    db.data.settings.relay_check = { at: nowIso(), ok: false, message: (e as Error).message, carriers: { usps: { configured: false, sandbox: false }, fedex: { configured: false, sandbox: false } } }
    db.touch()
    return json({ detail: (e as Error).message }, 400)
  }
}

const NEEDS_RELAY = 'In this browser, carrier credentials live on your tracking relay Worker, not here: set them with `wrangler secret put` (see docs/LIVE-TRACKING.md) and point Settings → Carriers at the relay.'

function privacySummary(db: LocalDb) {
  const d = db.data
  const style = d.settings.map_style_url || DEFAULT_MAP_STYLE
  let tileHost = 'local'
  try {
    tileHost = new URL(style).host || 'local'
  } catch {
    /* ignore */
  }
  return {
    data_dir: 'This browser only (IndexedDB on this device). Nothing is stored on a server, and nothing is sent to GitHub.',
    db_size_bytes: db.sizeBytes(),
    uploads_size_bytes: 0,
    shipments: d.shipments.length,
    uploads: d.uploads.length,
    events: d.shipments.reduce((n, s) => n + s.events.length, 0),
    secrets: [
      { name: 'USPS credentials', where: relayConfig(db) ? 'on your relay Worker (Cloudflare secrets)' : 'not set (mock carrier)' },
      { name: 'FedEx credentials', where: relayConfig(db) ? 'on your relay Worker (Cloudflare secrets)' : 'not set (mock carrier)' },
      { name: 'Relay token', where: d.settings.relay_token ? 'this browser (IndexedDB)' : 'not set' },
      { name: 'Geocoder API key', where: 'not needed (offline ZIP table)' },
    ],
    tile_host: tileHost,
    geocoder: 'offline ZIP table (in this browser)',
    auth_enabled: false,
    egress: d.settings.relay_url && d.settings.relay_check
      ? [{ host: new URL(d.settings.relay_url).host, purpose: 'relay', data_classes: 'tracking_number', count: 0, last_at: d.settings.relay_check.at }]
      : [],
    wipe_token: WIPE_TOKEN,
  }
}

// ---------------------------------------------------------------- router

async function handle(db: LocalDb, method: string, path: string, q: URLSearchParams, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let m: RegExpExecArray | null

  const carrierMode = relayConfig(db) ? 'live' : 'mock'
  if (path === '/api/config') {
    const s = db.data.settings
    return json({ app_name: APP_NAME, map_style_url: s.map_style_url || DEFAULT_MAP_STYLE, map_style_url_dark: s.map_style_url_dark || DEFAULT_MAP_STYLE_DARK, carrier_mode: carrierMode, auth_enabled: false, stuck_days: s.stuck_days })
  }
  if (path === '/api/health') return json({ ok: true, db: 'browser', carrier_mode: carrierMode, auth: false, refresh_running: db.data.jobs.some((j) => j.status === 'running'), carriers: { usps: carrierMode, fedex: carrierMode } })
  if (path === '/api/handoff') return json({ lan_url: null, public_url: null, hosted_ui_url: window.location.origin + (import.meta.env.BASE_URL || '/'), auth_required: false })
  if (path === '/api/auth/check') return json({ ok: true, auth: false })

  // uploads
  if (path === '/api/uploads' && method === 'GET') return json([...db.data.uploads].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).map((u) => uploadOut(db, u)))
  if (path === '/api/uploads' && method === 'POST') {
    const fd = await formBody(input, init)
    const f = fd?.get('file')
    return createUpload(db, f instanceof File ? f : null)
  }
  if ((m = /^\/api\/uploads\/(\d+)(\/preview|\/commit)?$/.exec(path))) {
    const u = db.upload(Number(m[1]))
    if (!u) return notFound('Upload not found')
    if (!m[2] && method === 'GET') return json(uploadOut(db, u))
    if (!m[2] && method === 'DELETE') return deleteUpload(db, u)
    if (m[2] === '/preview' && method === 'GET') {
      const wb = pending.get(u.id)
      if (!wb) return notFound('This upload is no longer in memory (the page was reloaded). Choose the file again.')
      const hr = q.get('header_row')
      return json(preview(db, u, wb, q.get('sheet'), hr == null || hr === '' ? null : Number(hr)))
    }
    if (m[2] === '/commit' && method === 'POST') return commitUpload(db, u, await jsonBody(input, init))
  }
  if (path === '/api/presets' && method === 'GET') return json(db.data.presets)
  if ((m = /^\/api\/presets\/(\d+)$/.exec(path)) && method === 'DELETE') {
    db.data.presets = db.data.presets.filter((p) => p.id !== Number(m![1]))
    db.touch()
    return new Response(null, { status: 204 })
  }

  // tags / notes
  if (path === '/api/tags' && method === 'GET') return json([...db.data.tags].sort((a, b) => a.name.localeCompare(b.name)))
  if ((m = /^\/api\/notes\/(\d+)$/.exec(path)) && method === 'DELETE') {
    const id = Number(m[1])
    for (const s of db.data.shipments) {
      const before = s.notes.length
      s.notes = s.notes.filter((n) => n.id !== id)
      if (s.notes.length !== before) {
        db.touch()
        return new Response(null, { status: 204 })
      }
    }
    return notFound('Note not found')
  }

  // shipments
  if ((m = /^\/api\/shipments\/(\d+)(\/path\.geojson|\/refresh|\/notes|\/tags)?$/.exec(path))) {
    const s = db.shipment(Number(m[1]))
    if (!s) return notFound('Shipment not found')
    const sub = m[2]
    if (!sub && method === 'GET') return json(rowOut(shipmentView(db, s)))
    if (!sub && method === 'PATCH') return patchShipment(db, s, await jsonBody(input, init))
    if (!sub && method === 'DELETE') {
      db.data.shipments = db.data.shipments.filter((x) => x.id !== s.id)
      db.touch()
      return new Response(null, { status: 204 })
    }
    if (sub === '/refresh' && method === 'POST') {
      const r = await refreshOne(db, s)
      db.touch()
      if (r.error && (r.kind === 'disabled' || r.kind === 'auth' || r.kind === 'invalid')) return json({ detail: r.error }, 400)
      return json(rowOut(shipmentView(db, s)))
    }
    if (sub === '/notes' && method === 'POST') {
      const body = String((await jsonBody(input, init)).body ?? '').trim()
      if (!body) return json({ detail: 'Note is empty' }, 422)
      const at = nowIso()
      s.notes.push({ id: db.nextId('note'), body, created_at: at, updated_at: at })
      db.touch()
      return json(rowOut(shipmentView(db, s)), 201)
    }
    if (sub === '/tags' && method === 'PUT') {
      const names = ((await jsonBody(input, init)).tags as string[] | undefined) ?? []
      const ids: number[] = []
      for (const n of names) {
        const t = getOrCreateTag(db, n)
        if (t && !ids.includes(t.id)) ids.push(t.id)
      }
      s.tag_ids = ids
      db.touch()
      return json(rowOut(shipmentView(db, s)))
    }
  }

  // refresh jobs
  if (path === '/api/refresh' && method === 'POST') return startRefresh(db, await jsonBody(input, init))
  if (path === '/api/jobs' && method === 'GET') return json(db.data.jobs.map(jobOut))
  if (path === '/api/jobs/current') return json(db.data.jobs.find((j) => j.status === 'queued' || j.status === 'running') ?? null)
  if ((m = /^\/api\/jobs\/(\d+)(\/cancel)?$/.exec(path))) {
    const j = db.data.jobs.find((x) => x.id === Number(m![1]))
    if (!j) return notFound('Job not found')
    if (m[2] && method === 'POST') {
      if (j.status === 'queued' || j.status === 'running') {
        j.cancel_requested = true
        if (j.status === 'queued') j.status = 'cancelled'
        db.touch()
      }
    }
    return json(jobOut(j))
  }

  // settings
  if (path === '/api/settings' && method === 'GET') return json(generalSettings(db))
  if (path === '/api/settings' && method === 'PUT') {
    const b = await jsonBody(input, init)
    const s = db.data.settings
    if (b.stuck_days != null && b.stuck_days !== '') s.stuck_days = Math.min(90, Math.max(1, Number(b.stuck_days) || 7))
    if ('origin_postal_code' in b) s.origin_postal_code = (b.origin_postal_code as string | null) || null
    if ('map_style_url' in b) s.map_style_url = (b.map_style_url as string | null) || null
    if ('map_style_url_dark' in b) s.map_style_url_dark = (b.map_style_url_dark as string | null) || null
    db.touch()
    return json(generalSettings(db))
  }
  if (path === '/api/settings/carriers' && method === 'GET') return json(carrierSettings(db))
  if ((m = /^\/api\/settings\/carriers\/(usps|fedex)(\/test)?$/.exec(path))) {
    if (m[2]) {
      if (!relayConfig(db)) return json({ ok: true, message: 'Mock carrier: generates fake tracking data, no credentials needed' })
      const r = await runRelayTest(db)
      if (!r.ok) return json({ ok: false, message: ((await r.json()) as { detail: string }).detail })
      const c = db.data.settings.relay_check?.carriers[m[1] as 'usps' | 'fedex']
      return json({ ok: !!c?.ok, message: c?.message ?? 'No result' })
    }
    return json({ detail: NEEDS_RELAY }, 400)
  }
  if (path === '/api/settings/relay' && method === 'GET') return json(relaySettings(db))
  if (path === '/api/settings/relay' && method === 'PUT') {
    const b = await jsonBody(input, init)
    const s = db.data.settings
    const url = normalizeRelayUrl(String(b.relay_url ?? ''))
    if (url && !/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url)) return json({ detail: 'The relay address must start with https://' }, 422)
    if (url !== s.relay_url) s.relay_check = null
    s.relay_url = url || null
    if (typeof b.relay_token === 'string') {
      s.relay_token = b.relay_token.trim() || null
      s.relay_check = null
    }
    if (!s.relay_url) s.relay_token = null
    db.touch()
    return json(relaySettings(db))
  }
  if (path === '/api/settings/relay/test' && method === 'POST') return runRelayTest(db)
  if (path === '/api/settings/geocoder' && method === 'GET') return json({ provider: 'nominatim', api_key_masked: null, has_key: false, nominatim_email: null })
  if (path === '/api/settings/geocoder' && method === 'PUT') return json({ detail: 'Street-level geocoding needs the app running on your own computer. This browser uses the offline ZIP table.' }, 400)
  if (path === '/api/settings/geocoder/test') return json({ ok: false, message: 'Online geocoding is not available in this browser; ZIP-level placement is always on.' })

  // privacy
  if (path === '/api/privacy/summary') return json(privacySummary(db))
  if (path === '/api/privacy/egress') return json([])
  if (path === '/api/privacy/wipe' && method === 'POST') {
    const b = await jsonBody(input, init)
    if (b.token !== WIPE_TOKEN) return json({ detail: 'Invalid confirmation token; reload the page and try again' }, 403)
    await db.wipe(b.keep_settings !== false)
    pending.clear()
    return json({ ok: true })
  }

  if (path === '/api/export' && method === 'GET') return exportRows(db, q)
  if (path === '/api/snapshot' && method === 'GET') return exportSnapshot(db, q)

  if (method === 'GET') return handleRead(toSnapshot(db), path, q) ?? notFound(`Not available in this browser: ${path}`)
  return json({ detail: `Not available in this browser: ${method} ${path}` }, 405)
}

/** fetch() replacement used by the API client while "this browser" data mode is active. */
export function localFetch(db: LocalDb): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url, window.location.origin)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    try {
      return await handle(db, method, apiPath(url), url.searchParams, input, init)
    } catch (e) {
      console.error(e)
      return json({ detail: (e as Error).message || String(e) }, 500)
    }
  }
}

/** Drop pending (uncommitted) workbooks, e.g. when leaving local mode. */
export function clearPendingUploads() {
  pending.clear()
}
