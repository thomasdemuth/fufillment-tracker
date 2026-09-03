/** Turn a mapped spreadsheet into shipments. Dedupes by tracking number across uploads. Port of importer.py. */
import { detectCarrier, parseCarrier, parseStatus, type Carrier } from '@/local/carriers'
import type { LocalDb, LocalShipment, LocalUpload } from '@/local/db'
import { nowIso } from '@/local/db'
import { clean, normalizeState, normalizeTracking, normalizeZip, parseDate, splitCityStateZip } from '@/local/normalize'

export interface ImportSummary {
  imported: number
  duplicates: number
  skipped: number
  errors: { row: number; error: string }[]
}

type Mapping = Record<string, string>

function get(row: string[], headers: string[], mapping: Mapping, field: string): string | null {
  const h = mapping[field]
  if (!h) return null
  const i = headers.indexOf(h)
  if (i < 0) return null
  return i < row.length ? row[i] : null
}

export interface RowFields {
  tracking_number: string | null
  carrier: Carrier
  carrier_confidence: number
  carrier_locked: boolean
  recipient_name: string | null
  company: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  email: string | null
  phone: string | null
  order_ref: string | null
  ship_date: string | null
  status_from_sheet: string | null
}

export function rowToFields(row: string[], headers: string[], mapping: Mapping, defaultCarrier: string | null): RowFields {
  const g = (f: string) => get(row, headers, mapping, f)
  const tracking = normalizeTracking(g('tracking_number'))
  let city = clean(g('city'))
  let state = normalizeState(g('state'))
  let postal = normalizeZip(g('postal_code'))
  if (mapping.city_state_zip) {
    const [c2, s2, z2] = splitCityStateZip(g('city_state_zip'))
    city = city || c2
    state = state || s2
    postal = postal || z2
  }
  const fromSheet = parseCarrier(g('carrier'))
  const [detected, detConf] = detectCarrier(tracking)
  let carrier: Carrier
  let conf = detConf
  let locked = false
  if (fromSheet) {
    carrier = fromSheet
    conf = 1
    locked = true
  } else if (detected !== 'unknown') carrier = detected
  else if (defaultCarrier === 'usps' || defaultCarrier === 'fedex') {
    carrier = defaultCarrier
    conf = 0.5
  } else carrier = 'unknown'
  return {
    tracking_number: tracking,
    carrier,
    carrier_confidence: conf,
    carrier_locked: locked,
    recipient_name: clean(g('recipient_name')),
    company: clean(g('company')),
    address1: clean(g('address1')),
    address2: clean(g('address2')),
    city,
    state,
    postal_code: postal,
    country: (clean(g('country')) ?? 'US').slice(0, 2).toUpperCase(),
    email: clean(g('email')),
    phone: clean(g('phone')),
    order_ref: clean(g('order_ref')),
    ship_date: parseDate(g('ship_date')),
    status_from_sheet: parseStatus(g('status')),
  }
}

const FILL_KEYS = ['recipient_name', 'company', 'address1', 'address2', 'city', 'state', 'postal_code', 'country', 'email', 'phone', 'order_ref', 'ship_date'] as const

export function importRows(db: LocalDb, upload: LocalUpload, headers: string[], rows: string[][], mapping: Mapping, defaultCarrier: string | null): ImportSummary {
  const summary: ImportSummary = { imported: 0, duplicates: 0, skipped: 0, errors: [] }
  const existing = new Map(db.data.shipments.map((s) => [s.tracking_number, s]))
  const seenInFile = new Set<string>()
  const now = nowIso()
  rows.forEach((row, idx) => {
    const rowNumber = upload.header_row + 2 + idx // 1-based spreadsheet row
    let f: RowFields
    try {
      f = rowToFields(row, headers, mapping, defaultCarrier)
    } catch (e) {
      summary.skipped++
      if (summary.errors.length < 50) summary.errors.push({ row: rowNumber, error: `parse error: ${(e as Error).message}` })
      return
    }
    const { tracking_number: tracking, status_from_sheet: statusFromSheet, ...fields } = f
    if (!tracking) {
      summary.skipped++
      if (summary.errors.length < 50) summary.errors.push({ row: rowNumber, error: 'missing tracking number' })
      return
    }
    if (seenInFile.has(tracking)) {
      summary.duplicates++
      return
    }
    seenInFile.add(tracking)
    let shipment = existing.get(tracking)
    if (shipment) {
      summary.duplicates++
      // Fill in blanks from the new file without overwriting existing data.
      for (const k of FILL_KEYS) {
        const v = fields[k]
        if (v && !shipment[k]) (shipment as unknown as Record<string, unknown>)[k] = v
      }
      if (fields.carrier_locked && !shipment.carrier_locked) {
        shipment.carrier = fields.carrier
        shipment.carrier_confidence = 1
        shipment.carrier_locked = true
      }
      shipment.updated_at = now
    } else {
      shipment = {
        id: db.nextId('shipment'),
        tracking_number: tracking,
        ...fields,
        status: statusFromSheet ?? 'unknown',
        status_raw: statusFromSheet ? 'from spreadsheet' : null,
        status_code: null,
        attention_flag: null,
        expected_delivery: null,
        delivered_at: null,
        first_event_at: null,
        last_event_at: null,
        last_event_desc: null,
        last_event_place: null,
        dest_lat: null,
        dest_lng: null,
        geocode_precision: 'none',
        geocode_source: null,
        origin_postal_code: null,
        last_polled_at: null,
        poll_error_count: 0,
        poll_last_error: null,
        created_at: now,
        updated_at: now,
        tag_ids: [],
        upload_refs: [],
        events: [],
        notes: [],
      } satisfies LocalShipment
      db.data.shipments.push(shipment)
      existing.set(tracking, shipment)
      summary.imported++
    }
    shipment.upload_refs.push({ upload_id: upload.id, row_number: rowNumber })
  })
  return summary
}
