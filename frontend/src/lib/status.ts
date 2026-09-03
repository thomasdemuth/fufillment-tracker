export type Status =
  | 'label_created'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned'
  | 'unknown'

export const STATUS_ORDER: Status[] = [
  'exception',
  'out_for_delivery',
  'in_transit',
  'label_created',
  'delivered',
  'returned',
  'unknown',
]

/** Map marker treatment: the four chromatic hues are colorblind-validated; returned shares the
 *  "problem" hue and is drawn hollow, out-for-delivery gets an ink ring, neutrals are grey. */
export type MarkerStyle = 'solid' | 'ring' | 'hollow'

export interface StatusMeta {
  label: string
  short: string
  /** Tailwind token name, e.g. `status-transit` */
  token: string
  light: string
  dark: string
  marker: MarkerStyle
  /** 0-based step on the 4-step progress bar; null = off the happy path */
  step: number | null
}

export const STATUS_META: Record<Status, StatusMeta> = {
  label_created: { label: 'Label created', short: 'Label', token: 'status-label', light: '#8a8479', dark: '#9d9689', marker: 'solid', step: 0 },
  in_transit: { label: 'In transit', short: 'Transit', token: 'status-transit', light: '#3566c9', dark: '#5b8ae0', marker: 'solid', step: 1 },
  out_for_delivery: { label: 'Out for delivery', short: 'Out for delivery', token: 'status-ofd', light: '#d49a0a', dark: '#c99528', marker: 'ring', step: 2 },
  delivered: { label: 'Delivered', short: 'Delivered', token: 'status-delivered', light: '#0e8a7a', dark: '#2aa08f', marker: 'solid', step: 3 },
  exception: { label: 'Exception', short: 'Exception', token: 'status-exception', light: '#c8433a', dark: '#d65a50', marker: 'solid', step: null },
  returned: { label: 'Returned', short: 'Returned', token: 'status-returned', light: '#c8433a', dark: '#d65a50', marker: 'hollow', step: null },
  unknown: { label: 'Not checked', short: 'Unknown', token: 'status-unknown', light: '#aaa39a', dark: '#7d776e', marker: 'solid', step: null },
}

export function statusMeta(s: string | null | undefined): StatusMeta {
  return STATUS_META[(s as Status) in STATUS_META ? (s as Status) : 'unknown']
}

export function statusColor(s: string | null | undefined, dark: boolean): string {
  const m = statusMeta(s)
  return dark ? m.dark : m.light
}

export const CARRIER_META: Record<string, { label: string }> = {
  usps: { label: 'USPS' },
  fedex: { label: 'FedEx' },
  unknown: { label: 'Unknown' },
}

export function carrierLabel(c: string | null | undefined) {
  return CARRIER_META[c ?? 'unknown']?.label ?? c ?? 'Unknown'
}

export const ATTENTION_REASONS: Record<string, string> = {
  exception: 'Carrier reported an exception',
  returned: 'Returned to sender',
  pickup: 'Available for pickup',
  delivery_failed: 'Delivery attempt failed',
  stuck_pre_transit: 'Label created, no movement',
  stuck_in_transit: 'No scans for a while',
  poll_errors: 'Repeated tracking errors',
  not_geocoded: 'Address could not be placed on the map',
}
