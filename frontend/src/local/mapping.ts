/** Header -> field mapping, ported from backend/app/services/mapping.py (fuzzy matching re-implemented). */

export const FIELD_SYNONYMS: Record<string, string[]> = {
  tracking_number: ['tracking', 'tracking number', 'tracking no', 'tracking #', 'trackingnumber', 'track', 'tracking id', 'shipment id', 'label'],
  carrier: ['carrier', 'shipping carrier', 'shipper', 'service', 'shipping method', 'courier'],
  recipient_name: ['name', 'recipient', 'recipient name', 'customer', 'customer name', 'full name', 'ship to', 'ship to name', 'contact', 'attention', 'buyer'],
  company: ['company', 'organization', 'business', 'org'],
  address1: ['address', 'address 1', 'address1', 'street', 'street address', 'address line 1', 'ship to address', 'shipping address', 'addr1', 'line 1'],
  address2: ['address 2', 'address2', 'address line 2', 'apt', 'suite', 'unit', 'addr2', 'line 2'],
  city: ['city', 'town', 'ship to city'],
  state: ['state', 'province', 'region', 'st', 'state province', 'ship to state'],
  postal_code: ['zip', 'zip code', 'zipcode', 'postal', 'postal code', 'postcode', 'ship to zip'],
  city_state_zip: ['city state zip', 'city, state zip', 'city/state/zip', 'csz', 'locality'],
  country: ['country', 'country code'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'telephone', 'phone number', 'mobile'],
  order_ref: ['order', 'order number', 'order #', 'order id', 'reference', 'ref', 'po', 'invoice', 'sku'],
  ship_date: ['ship date', 'shipped', 'shipped date', 'date shipped', 'date', 'sent', 'ship on'],
  status: ['status', 'delivery status', 'shipment status'],
}
export const ALL_FIELDS = Object.keys(FIELD_SYNONYMS)

export const FIELD_LABELS: Record<string, string> = {
  tracking_number: 'Tracking number',
  carrier: 'Carrier',
  recipient_name: 'Recipient name',
  company: 'Company',
  address1: 'Address line 1',
  address2: 'Address line 2',
  city: 'City',
  state: 'State',
  postal_code: 'ZIP / postal code',
  city_state_zip: "Combined 'City, ST ZIP'",
  country: 'Country',
  email: 'Email',
  phone: 'Phone',
  order_ref: 'Order / reference',
  ship_date: 'Ship date',
  status: 'Status (from sheet)',
}

export function normHeader(s: string): string {
  let h = s.toLowerCase().trim()
  h = h.replace(/[_\-/]+/g, ' ')
  h = h.replace(/[^a-z0-9#, ]+/g, '')
  return h.replace(/\s+/g, ' ').trim()
}

/** Longest common subsequence length (for an Indel-based similarity like rapidfuzz.fuzz.ratio). */
function lcs(a: string, b: string): number {
  if (!a.length || !b.length) return 0
  let prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    prev = cur
  }
  return prev[b.length]
}

/** 0..100, same definition as rapidfuzz.fuzz.ratio (normalized Indel similarity). */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 100
  if (!a.length || !b.length) return 0
  return (200 * lcs(a, b)) / (a.length + b.length)
}

/** rapidfuzz.fuzz.token_set_ratio */
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean))
  const tb = new Set(b.split(/\s+/).filter(Boolean))
  const inter = [...ta].filter((t) => tb.has(t)).sort()
  const da = [...ta].filter((t) => !tb.has(t)).sort()
  const db = [...tb].filter((t) => !ta.has(t)).sort()
  const t0 = inter.join(' ')
  const t1 = [...inter, ...da].join(' ')
  const t2 = [...inter, ...db].join(' ')
  if (inter.length && (!da.length || !db.length)) return 100
  return Math.max(ratio(t0, t1), ratio(t0, t2), ratio(t1, t2))
}

export function scoreHeader(header: string, field: string): number {
  const h = normHeader(header)
  if (!h) return 0
  let best = 0
  const words = h.split(' ')
  for (const syn of FIELD_SYNONYMS[field]) {
    if (h === syn) return 1
    best = Math.max(best, (tokenSetRatio(h, syn) / 100) * 0.9)
    if (words.includes(syn)) best = Math.max(best, 0.85)
  }
  return best
}

/** {field: header} for the best confident matches. One header per field, one field per header. */
export function suggestMapping(headers: string[], sampleRows?: string[][]): Record<string, string> {
  const candidates: [number, string, string][] = []
  for (const h of headers) {
    for (const f of ALL_FIELDS) {
      const s = scoreHeader(h, f)
      if (s >= 0.6) candidates.push([s, f, h])
    }
  }
  // Python sorts tuples descending: score, then field name, then header.
  candidates.sort((x, y) => y[0] - x[0] || (y[1] < x[1] ? -1 : y[1] > x[1] ? 1 : 0) || (y[2] < x[2] ? -1 : y[2] > x[2] ? 1 : 0))
  const mapping: Record<string, string> = {}
  const used = new Set<string>()
  for (const [, f, h] of candidates) {
    if (f in mapping || used.has(h)) continue
    mapping[f] = h
    used.add(h)
  }
  const sample = (sampleRows ?? []).slice(0, 30)

  // Content-based fallback for the tracking column if headers were unhelpful.
  if (!('tracking_number' in mapping) && sample.length) {
    let bestH: string | null = null
    let bestHits = 0
    headers.forEach((h, i) => {
      let hits = 0
      for (const r of sample) {
        const v = (r[i] ?? '').replace(/[\s-]/g, '')
        if (v.length >= 10 && v.length <= 34 && /^[A-Z0-9]+$/.test(v.toUpperCase()) && (v.match(/\d/g) ?? []).length >= 8) hits++
      }
      if (hits > bestHits) {
        bestH = h
        bestHits = hits
      }
    })
    if (bestH && bestHits >= Math.max(2, Math.floor(sample.length / 2))) {
      for (const [f, h] of Object.entries(mapping)) if (h === bestH) delete mapping[f]
      mapping.tracking_number = bestH
    }
  }

  // A combined "City, ST ZIP" column detected by content.
  if (!('city' in mapping) && !('city_state_zip' in mapping) && sample.length) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]
      if (used.has(h)) continue
      const hits = sample.filter((r) => i < r.length && /,\s*[A-Za-z]{2}\.?\s+\d{5}/.test(r[i])).length
      if (hits >= Math.max(2, Math.floor(sample.length / 2))) {
        mapping.city_state_zip = h
        break
      }
    }
  }
  return mapping
}

/** Stable fingerprint of a header set (used to match saved presets). */
export function headerSignature(headers: string[]): string {
  const key = headers.filter(Boolean).map(normHeader).sort().join('|')
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  let h2 = 5381
  for (let i = 0; i < key.length; i++) h2 = (Math.imul(h2, 33) ^ key.charCodeAt(i)) >>> 0
  return `${(h >>> 0).toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}
