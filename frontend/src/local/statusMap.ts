/** Carrier status vocabularies -> normalized status. Port of backend/app/services/status_map.py. */
import type { Status } from '@/local/carriers'

export const USPS_CATEGORY: Record<string, Status> = {
  'pre-shipment': 'label_created', preshipment: 'label_created', 'shipping label created': 'label_created',
  'in transit': 'in_transit', accepted: 'in_transit', 'moving through network': 'in_transit', 'arriving early': 'in_transit',
  'arriving late': 'in_transit', 'arriving on time': 'in_transit', 'out for delivery': 'out_for_delivery', delivered: 'delivered',
  'delivered to agent': 'delivered', 'available for pickup': 'in_transit', alert: 'exception', 'return to sender': 'returned', returned: 'returned',
}
const USPS_ATTENTION_CATEGORY: Record<string, string> = { 'available for pickup': 'pickup' }

export const USPS_EVENT_CODE: Record<string, Status> = {
  GX: 'label_created', MA: 'label_created', GS: 'label_created',
  '03': 'in_transit', '07': 'in_transit', '10': 'in_transit', T1: 'in_transit', TM: 'in_transit', SF: 'in_transit', PC: 'in_transit',
  AE: 'in_transit', AD: 'in_transit', A1: 'in_transit', NT: 'in_transit', EF: 'in_transit', OA: 'in_transit', L1: 'in_transit',
  OF: 'out_for_delivery', '59': 'out_for_delivery',
  '01': 'delivered', DX: 'delivered', DN: 'delivered', '17': 'delivered',
  '16': 'in_transit',
  '02': 'exception', '04': 'exception', '05': 'exception', '06': 'exception', '53': 'exception', '55': 'exception', '56': 'exception',
  H0: 'exception', '51': 'exception', '52': 'exception',
  '09': 'returned', '21': 'returned', '28': 'returned', '29': 'returned', '31': 'returned',
}
const USPS_ATTENTION_CODE: Record<string, string> = { '16': 'pickup', '02': 'delivery_failed', '55': 'delivery_failed', '53': 'delivery_failed' }

export const FEDEX_CODE: Record<string, Status> = {
  OC: 'label_created', IN: 'label_created',
  PU: 'in_transit', IT: 'in_transit', AR: 'in_transit', DP: 'in_transit', AF: 'in_transit', CD: 'in_transit', CC: 'in_transit', HL: 'in_transit',
  PF: 'in_transit', PM: 'in_transit', SP: 'in_transit', PX: 'in_transit', SE: 'exception', FD: 'in_transit', TR: 'in_transit',
  OD: 'out_for_delivery', DL: 'delivered',
  DE: 'exception', DY: 'exception', CA: 'exception', RR: 'exception',
  RS: 'returned', RG: 'returned', RP: 'returned',
}
const FEDEX_ATTENTION_CODE: Record<string, string> = { HL: 'pickup', DE: 'delivery_failed', RR: 'delivery_failed' }

const KEYWORDS: [RegExp, Status][] = [
  [/\bdelivered\b(?!.*\bnot\b)/i, 'delivered'],
  [/out for delivery/i, 'out_for_delivery'],
  [/return(ed|ing)? to (sender|shipper)|returned/i, 'returned'],
  [/label created|shipping label|awaiting item|pre-?shipment|shipment information sent/i, 'label_created'],
  [/notice left|undeliverable|refused|delay|alert|held|exception|damaged|unable|missed|attempt/i, 'exception'],
  [/available for pickup|pickup/i, 'in_transit'],
  [/in transit|arrived|departed|accepted|processed|picked up|on its way|moving/i, 'in_transit'],
]

export function byKeywords(text: string | null | undefined): Status | null {
  if (!text) return null
  for (const [re, s] of KEYWORDS) if (re.test(text)) return s
  return null
}

/** Returns [status, attention_flag]. */
export function mapUsps(category: string | null | undefined, latestCode: string | null | undefined, description: string | null | undefined): [Status, string | null] {
  const cat = (category ?? '').trim().toLowerCase()
  if (cat in USPS_CATEGORY) return [USPS_CATEGORY[cat], USPS_ATTENTION_CATEGORY[cat] ?? null]
  const code = (latestCode ?? '').trim().toUpperCase()
  if (code in USPS_EVENT_CODE) return [USPS_EVENT_CODE[code], USPS_ATTENTION_CODE[code] ?? null]
  for (const [key, status] of Object.entries(USPS_CATEGORY)) if (cat.includes(key)) return [status, USPS_ATTENTION_CATEGORY[key] ?? null]
  const kw = byKeywords(description) ?? byKeywords(category)
  if (kw) return [kw, null]
  return ['unknown', null]
}

export function mapFedex(derivedCode: string | null | undefined, code: string | null | undefined, description: string | null | undefined): [Status, string | null] {
  for (const c of [derivedCode, code]) {
    const u = (c ?? '').trim().toUpperCase()
    if (u in FEDEX_CODE) return [FEDEX_CODE[u], FEDEX_ATTENTION_CODE[u] ?? null]
  }
  const kw = byKeywords(description)
  if (kw) return [kw, null]
  return ['unknown', null]
}
