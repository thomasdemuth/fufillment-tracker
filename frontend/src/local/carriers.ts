/** Carrier detection and aliases, ported from backend/app/carriers/detect.py and services/importer.py. */

export type Carrier = 'usps' | 'fedex' | 'unknown'
export type Status = 'label_created' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'returned' | 'unknown'

function uspsImpbCheckOk(num: string): boolean {
  if (num.length !== 22 || !/^\d+$/.test(num)) return false
  const body = num.slice(0, -1)
  const check = Number(num[num.length - 1])
  let total = 0
  const rev = [...body].reverse()
  for (let i = 0; i < rev.length; i++) {
    const d = Number(rev[i])
    total += i % 2 === 0 ? d * 3 : d
  }
  return (10 - (total % 10)) % 10 === check
}

const RULES: [RegExp, Carrier, number][] = [
  [/^[A-Z]{2}\d{9}US$/, 'usps', 1.0],
  [/^82\d{8}$/, 'usps', 0.9],
  [/^\d{12}$/, 'fedex', 0.95],
  [/^\d{15}$/, 'fedex', 0.95],
  [/^96\d{20}$/, 'fedex', 0.9],
  [/^\d{34}$/, 'fedex', 0.8],
]

export function detectCarrier(tracking: string | null | undefined): [Carrier, number] {
  if (!tracking) return ['unknown', 0]
  const t = tracking.replace(/[\s-]/g, '').toUpperCase()
  for (const [re, c, conf] of RULES) if (re.test(t)) return [c, conf]
  const digits = /^\d+$/.test(t)
  if (t.length === 22 && digits) {
    if (/^(92|93|94|95)/.test(t)) return ['usps', uspsImpbCheckOk(t) ? 1.0 : 0.85]
    return ['usps', 0.6]
  }
  if ([26, 30, 32, 34].includes(t.length) && digits && /^(420|92|93|94|95)/.test(t)) return ['usps', 0.9]
  if (t.length === 20 && digits) {
    if (/^(61|58|02)/.test(t)) return ['fedex', 0.55]
    return ['usps', 0.6]
  }
  return ['unknown', 0]
}

export function carrierLink(carrier: string, tracking: string): string | null {
  if (carrier === 'usps') return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`
  if (carrier === 'fedex') return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`
  return null
}

const CARRIER_ALIASES: [string, Carrier][] = [
  ['usps', 'usps'], ['us postal', 'usps'], ['postal', 'usps'], ['united states postal service', 'usps'], ['priority mail', 'usps'],
  ['first class', 'usps'], ['ground advantage', 'usps'], ['media mail', 'usps'],
  ['fedex', 'fedex'], ['fed ex', 'fedex'], ['federal express', 'fedex'], ['fedex ground', 'fedex'], ['fedex home', 'fedex'],
  ['fedex express', 'fedex'], ['smartpost', 'fedex'],
]

export function parseCarrier(value: string | null | undefined): Carrier | null {
  const v = value?.replace(/\s+/g, ' ').trim()
  if (!v) return null
  const low = v.toLowerCase()
  for (const [k, c] of CARRIER_ALIASES) if (k === low) return c
  for (const [k, c] of CARRIER_ALIASES) if (low.includes(k)) return c
  return null
}

const STATUS_ALIASES: [string, Status][] = [
  ['delivered', 'delivered'], ['out for delivery', 'out_for_delivery'], ['in transit', 'in_transit'], ['shipped', 'in_transit'],
  ['label created', 'label_created'], ['pre-shipment', 'label_created'], ['pending', 'label_created'], ['exception', 'exception'],
  ['returned', 'returned'], ['return to sender', 'returned'],
]

export function parseStatus(value: string | null | undefined): Status | null {
  const v = value?.replace(/\s+/g, ' ').trim()
  if (!v) return null
  const low = v.toLowerCase()
  for (const [k, s] of STATUS_ALIASES) if (low.includes(k)) return s
  return null
}
