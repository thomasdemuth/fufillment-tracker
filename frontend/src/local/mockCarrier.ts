/**
 * Deterministic fake carrier, ported from backend/app/carriers/mock.py. Each tracking number hashes to a
 * scenario and a route through real hub cities; events "appear" over time relative to the ship date so
 * repeated refreshes show progress, with no network access.
 */
import type { Carrier, Status } from '@/local/carriers'
import { zipLookup } from '@/local/geocode'
import { nowIso } from '@/local/db'

export interface NormalizedEvent {
  at: string
  at_raw: string
  code: string
  description: string
  status: Status
  city: string
  state: string
  postal_code: string
  country: string
}
export interface TrackResult {
  ok: true
  tracking_number: string
  carrier: Carrier
  status: Status
  status_raw: string
  status_code: string
  attention_flag: string | null
  expected_delivery: string | null
  delivered_at: string | null
  origin_postal_code: string
  dest_postal_code: string
  events: NormalizedEvent[]
}
export interface TrackError {
  ok: false
  tracking_number: string
  kind: 'transient' | 'not_found' | 'disabled' | 'auth' | 'invalid' | 'rate_limited'
  message: string
}

type Hub = [string, string, string]
const HUBS: Hub[] = [
  ['Los Angeles', 'CA', '90052'], ['San Francisco', 'CA', '94188'], ['Seattle', 'WA', '98108'], ['Denver', 'CO', '80217'],
  ['Phoenix', 'AZ', '85026'], ['Dallas', 'TX', '75260'], ['Houston', 'TX', '77201'], ['Chicago', 'IL', '60607'],
  ['Minneapolis', 'MN', '55401'], ['Kansas City', 'MO', '64121'], ['Atlanta', 'GA', '30304'], ['Miami', 'FL', '33152'],
  ['Charlotte', 'NC', '28228'], ['Memphis', 'TN', '38118'], ['Indianapolis', 'IN', '46241'], ['Columbus', 'OH', '43217'],
  ['Philadelphia', 'PA', '19104'], ['New York', 'NY', '10199'], ['Boston', 'MA', '02205'], ['Portland', 'OR', '97208'],
  ['Salt Lake City', 'UT', '84199'], ['Louisville', 'KY', '40231'], ['Nashville', 'TN', '37230'], ['Jacksonville', 'FL', '32099'],
]

type Scenario = 'normal' | 'fast' | 'delayed' | 'exception' | 'returned' | 'pretransit'
const SCENARIOS: Scenario[] = [
  ...new Array<Scenario>(62).fill('normal'),
  ...new Array<Scenario>(10).fill('fast'),
  ...new Array<Scenario>(10).fill('delayed'),
  ...new Array<Scenario>(8).fill('exception'),
  ...new Array<Scenario>(4).fill('returned'),
  ...new Array<Scenario>(6).fill('pretransit'),
]
const PACE: Record<Scenario, number> = { fast: 0.5, normal: 1.0, delayed: 1.8, exception: 1.3, returned: 1.2, pretransit: 1.0 }

/** Small seeded PRNG (mulberry32) so the same tracking number always gets the same story. */
class Rng {
  private s: number
  constructor(seed: string) {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
    this.s = h >>> 0
  }
  random(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  randint(a: number, b: number): number {
    return a + Math.floor(this.random() * (b - a + 1))
  }
  uniform(a: number, b: number): number {
    return a + this.random() * (b - a)
  }
  choice<T>(xs: T[]): T {
    return xs[Math.floor(this.random() * xs.length)]
  }
  sample<T>(xs: T[], k: number): T[] {
    const pool = [...xs]
    const out: T[] = []
    while (out.length < k && pool.length) out.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0])
    return out
  }
}

export interface MockContext {
  ship_dates?: Record<string, string | null | undefined>
  dest_zips?: Record<string, string | null | undefined>
  now?: Date
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3_600_000)
}

export function mockTrack(number: string, carrier: Carrier, ctx: MockContext = {}): TrackResult | TrackError {
  const usps = carrier === 'usps'
  const rng = new Rng(number)
  const scenario = rng.choice(SCENARIOS)
  const now = ctx.now ?? new Date()
  const shipDate = ctx.ship_dates?.[number] || nowIso(new Date(now.getTime() - rng.randint(1, 20) * 86_400_000)).slice(0, 10)
  const start = addHours(new Date(`${shipDate}T00:00:00Z`), rng.randint(9, 17))
  if (rng.random() < 0.02) return { ok: false, tracking_number: number, kind: 'transient', message: 'Mock: simulated temporary carrier outage (try again)' }

  const destZip = ctx.dest_zips?.[number] ?? null
  const dest = destZip ? zipLookup(destZip) : null
  const local: Hub = dest && destZip ? [dest.city, dest.state, destZip.slice(0, 5)] : ['Springfield', 'IL', '62701']
  const origin = rng.choice(HUBS)
  const hops = rng.sample(
    HUBS.filter((h) => h !== origin),
    rng.randint(1, 3),
  )
  const pace = PACE[scenario]

  type Step = [number, string, string, Status, Hub]
  const timeline: Step[] = [[0, 'GX', usps ? 'Shipping Label Created, USPS Awaiting Item' : 'Shipment information sent to FedEx', 'label_created', origin]]
  if (scenario !== 'pretransit') {
    let t = 6 * pace
    timeline.push([t, usps ? '03' : 'PU', usps ? 'Accepted at Origin Facility' : 'Picked up', 'in_transit', origin])
    t += 10 * pace
    timeline.push([t, usps ? '10' : 'DP', usps ? 'Departed Origin Facility' : 'Left FedEx origin facility', 'in_transit', origin])
    for (const hop of hops) {
      t += rng.uniform(14, 30) * pace
      timeline.push([t, usps ? 'T1' : 'AR', usps ? 'Arrived at Regional Facility' : 'Arrived at FedEx hub', 'in_transit', hop])
      t += rng.uniform(3, 9) * pace
      timeline.push([t, usps ? 'TM' : 'DP', usps ? 'Departed Regional Facility' : 'Departed FedEx hub', 'in_transit', hop])
    }
    t += rng.uniform(12, 24) * pace
    timeline.push([t, usps ? '07' : 'AR', usps ? 'Arrived at Post Office' : 'At local FedEx facility', 'in_transit', local])
    if (scenario === 'exception') {
      t += rng.uniform(4, 8)
      timeline.push([t, usps ? 'OF' : 'OD', 'Out for Delivery', 'out_for_delivery', local])
      t += rng.uniform(4, 8)
      timeline.push([t, usps ? '02' : 'DE', usps ? 'Notice Left (No Authorized Recipient Available)' : 'Delivery exception: customer not available', 'exception', local])
    } else if (scenario === 'returned') {
      t += rng.uniform(4, 8)
      timeline.push([t, usps ? '02' : 'DE', usps ? 'Undeliverable as Addressed' : 'Delivery exception: incorrect address', 'exception', local])
      t += rng.uniform(24, 72)
      timeline.push([t, usps ? '09' : 'RS', usps ? 'Return to Sender' : 'Returning package to shipper', 'returned', local])
    } else {
      t += rng.uniform(6, 14)
      timeline.push([t, usps ? 'OF' : 'OD', 'Out for Delivery', 'out_for_delivery', local])
      t += rng.uniform(3, 9)
      timeline.push([t, usps ? '01' : 'DL', usps ? 'Delivered, In/At Mailbox' : 'Delivered', 'delivered', local])
    }
  }

  const events: NormalizedEvent[] = []
  for (const [off, code, desc, status, [city, st, z]] of timeline) {
    const at = addHours(start, off)
    if (at > now) break
    const iso = nowIso(at)
    events.push({ at: iso, at_raw: iso, code, description: desc, status, city, state: st, postal_code: z, country: 'US' })
  }
  events.reverse()
  const latest = events[0]
  const status: Status = latest ? latest.status : 'label_created'
  const lastOff = timeline[timeline.length - 1][0]
  const expected = status !== 'delivered' && status !== 'returned' && scenario !== 'exception' && scenario !== 'returned' ? nowIso(addHours(start, lastOff)).slice(0, 10) : null
  return {
    ok: true,
    tracking_number: number,
    carrier,
    status,
    status_raw: latest ? latest.description : 'Label created',
    status_code: latest ? latest.code : 'GX',
    attention_flag: status === 'exception' ? 'delivery_failed' : null,
    expected_delivery: expected,
    delivered_at: latest && latest.status === 'delivered' ? latest.at : null,
    origin_postal_code: origin[2],
    dest_postal_code: local[2],
    events,
  }
}
