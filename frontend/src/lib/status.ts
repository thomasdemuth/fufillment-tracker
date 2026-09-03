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

export const STATUS_META: Record<Status, { label: string; short: string; color: string; textOn: string }> = {
  label_created: { label: 'Label created', short: 'Label', color: '#94a3b8', textOn: '#0f172a' },
  in_transit: { label: 'In transit', short: 'Transit', color: '#3b82f6', textOn: '#ffffff' },
  out_for_delivery: { label: 'Out for delivery', short: 'Out for delivery', color: '#f59e0b', textOn: '#0f172a' },
  delivered: { label: 'Delivered', short: 'Delivered', color: '#10b981', textOn: '#062b27' },
  exception: { label: 'Exception', short: 'Exception', color: '#ef4444', textOn: '#ffffff' },
  returned: { label: 'Returned', short: 'Returned', color: '#a855f7', textOn: '#ffffff' },
  unknown: { label: 'Unknown', short: 'Unknown', color: '#64748b', textOn: '#ffffff' },
}

export function statusMeta(s: string | null | undefined) {
  return STATUS_META[(s as Status) in STATUS_META ? (s as Status) : 'unknown']
}

export const CARRIER_META: Record<string, { label: string; color: string }> = {
  usps: { label: 'USPS', color: '#1d4ed8' },
  fedex: { label: 'FedEx', color: '#7c3aed' },
  unknown: { label: 'Unknown', color: '#64748b' },
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
