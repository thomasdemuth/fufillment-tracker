/** Apply carrier results to local shipments, plus attention reasons. Ports of tracking.py and attention.py. */
import type { LocalEvent, LocalShipment } from '@/local/db'
import { nowIso } from '@/local/db'
import { geocodeOffline } from '@/local/geocode'
import type { TrackError, TrackResult } from '@/local/mockCarrier'

export function dedupeKey(atRaw: string, code: string | null, city: string | null, desc: string): string {
  const key = [atRaw ?? '', code ?? '', (city ?? '').toLowerCase(), desc.trim().toLowerCase()].join('|')
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return `${(h >>> 0).toString(16)}:${key.length}`
}

function place(city: string | null, state: string | null): string | null {
  const parts = [city, state].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** Merge a TrackResult into the shipment. Returns true if anything changed. */
export function applyResult(s: LocalShipment, r: TrackResult, nextEventId: () => number): boolean {
  const keys = new Set(s.events.map((e) => e.dedupe_key))
  let changed = false
  for (const ev of r.events) {
    const key = dedupeKey(ev.at_raw, ev.code, ev.city, ev.description)
    if (keys.has(key)) continue
    keys.add(key)
    let lat: number | null = null
    let lng: number | null = null
    if (ev.postal_code || (ev.city && ev.state)) {
      const g = geocodeOffline({ city: ev.city, state: ev.state, postal_code: ev.postal_code })
      if (g) {
        lat = g.lat
        lng = g.lng
      }
    }
    const e: LocalEvent = {
      id: nextEventId(),
      event_at: ev.at,
      event_at_raw: ev.at_raw,
      code: ev.code,
      description: ev.description.slice(0, 500),
      normalized_status: ev.status,
      city: ev.city,
      state: ev.state,
      postal_code: ev.postal_code,
      country: ev.country,
      lat,
      lng,
      dedupe_key: key,
    }
    s.events.push(e)
    changed = true
  }
  s.events.sort((a, b) => (b.event_at ?? '').localeCompare(a.event_at ?? ''))

  const next: Partial<LocalShipment> = {
    status: r.status,
    status_raw: r.status_raw ? r.status_raw.slice(0, 255) : null,
    status_code: r.status_code,
    attention_flag: r.attention_flag,
    expected_delivery: r.expected_delivery,
    delivered_at: r.delivered_at,
    origin_postal_code: r.origin_postal_code || s.origin_postal_code,
  }
  if (r.events.length) {
    const sorted = [...r.events].sort((a, b) => a.at.localeCompare(b.at))
    const first = sorted[0]
    const latest = sorted[sorted.length - 1]
    next.last_event_at = latest.at
    next.last_event_desc = latest.description.slice(0, 500)
    next.last_event_place = place(latest.city, latest.state)
    next.first_event_at = first.at || s.first_event_at
    if (r.status === 'delivered' && !next.delivered_at) next.delivered_at = latest.at
  }
  for (const [k, v] of Object.entries(next)) {
    if ((s as unknown as Record<string, unknown>)[k] !== v) {
      ;(s as unknown as Record<string, unknown>)[k] = v
      changed = true
    }
  }
  if (s.carrier !== r.carrier || s.carrier_confidence < 1) {
    s.carrier = r.carrier
    s.carrier_confidence = 1
    changed = true
  }
  s.last_polled_at = nowIso()
  s.poll_error_count = 0
  s.poll_last_error = null
  if (changed) s.updated_at = s.last_polled_at
  return changed
}

export function applyError(s: LocalShipment, err: TrackError): void {
  s.last_polled_at = nowIso()
  if (err.kind === 'not_found') {
    const ageDays = s.ship_date ? Math.floor((Date.now() - new Date(`${s.ship_date}T00:00:00Z`).getTime()) / 86_400_000) : 0
    if ((s.status === 'unknown' || s.status === 'label_created') && ageDays <= 7) {
      s.status = 'label_created'
      s.status_raw = 'Not yet in carrier system'
      s.poll_last_error = null
      return
    }
  }
  s.poll_error_count = (s.poll_error_count || 0) + 1
  s.poll_last_error = `${err.kind}: ${err.message}`.slice(0, 500)
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000
}

/** Why a shipment needs a human look (mirrors backend attention_reasons). */
export function attentionReasons(s: LocalShipment, stuckDays = 7, now: Date = new Date()): string[] {
  const reasons: string[] = []
  if (s.status === 'exception') reasons.push('exception')
  if (s.status === 'returned') reasons.push('returned')
  if (s.attention_flag && !reasons.includes(s.attention_flag)) reasons.push(s.attention_flag)
  if ((s.poll_error_count || 0) >= 3) reasons.push('poll_errors')
  if (s.last_polled_at && ['label_created', 'in_transit', 'out_for_delivery', 'unknown'].includes(s.status)) {
    const anchor = s.last_event_at ? new Date(s.last_event_at) : s.ship_date ? new Date(`${s.ship_date}T00:00:00`) : new Date(s.created_at)
    const stale = Math.floor(daysBetween(anchor, now))
    if (stale >= stuckDays) reasons.push(s.status === 'label_created' ? 'stuck_pre_transit' : 'stuck_in_transit')
    const start = s.ship_date ?? s.first_event_at?.slice(0, 10) ?? null
    if (start && s.status !== 'delivered' && s.status !== 'returned' && Math.floor(daysBetween(new Date(`${start}T00:00:00`), now)) >= stuckDays * 2) {
      if (!reasons.includes('stuck_in_transit') && !reasons.includes('stuck_pre_transit')) reasons.push('stuck_in_transit')
    }
  }
  if (s.dest_lat == null) reasons.push('not_geocoded')
  return reasons
}
