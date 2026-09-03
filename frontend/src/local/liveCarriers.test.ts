import fs from 'node:fs'
import path from 'node:path'
import { parseDt, parseFedex, parseUsps } from './liveCarriers'

const FX = path.resolve(__dirname, '../../../backend/tests/fixtures')
const load = (rel: string) => JSON.parse(fs.readFileSync(path.join(FX, rel), 'utf8'))

describe('live carrier parsing (same fixtures as the backend tests)', () => {
  it('keeps wall-clock time and drops the zone', () => {
    expect(parseDt('2026-08-19T14:22:00-04:00')).toBe('2026-08-19T14:22:00')
    expect(parseDt('2026-08-20T20:00:00Z')).toBe('2026-08-20T20:00:00')
    expect(parseDt('2026-08-20')).toBe('2026-08-20T00:00:00')
    expect(parseDt('nope')).toBeNull()
  })
  it('usps delivered', () => {
    const r = parseUsps('9400111899223197428490', load('usps/track_delivered.json'))
    if (!r.ok) throw new Error('expected a result')
    expect(r.status).toBe('delivered')
    expect(r.delivered_at).toBe('2026-08-20T13:02:00')
    expect(r.origin_postal_code).toBe('90052')
    expect(r.dest_postal_code).toBe('78701')
    expect(r.expected_delivery).toBe('2026-08-20')
    expect(r.events.slice(0, 3).map((e) => e.status)).toEqual(['delivered', 'out_for_delivery', 'in_transit'])
    expect(r.events[r.events.length - 1].status).toBe('label_created')
    expect(r.events[0].city).toBe('AUSTIN')
  })
  it('usps pickup flag', () => {
    const r = parseUsps('x', load('usps/track_pickup.json'))
    if (!r.ok) throw new Error('expected a result')
    expect(r.status).toBe('in_transit')
    expect(r.attention_flag).toBe('pickup')
    expect(r.events[1].status).toBe('exception')
  })
  it('fedex batch', () => {
    const out = parseFedex(['123456789012', '123456789013', '123456789014', '123456789015'], load('fedex/track_batch.json'))
    const d = out['123456789012']
    if (!d.ok) throw new Error('expected a result')
    expect(d.status).toBe('delivered')
    expect(d.delivered_at).toBe('2026-08-19T14:22:00')
    expect(d.origin_postal_code).toBe('38118')
    expect(d.dest_postal_code).toBe('33152')
    expect(d.events.map((e) => e.status)).toEqual(['delivered', 'out_for_delivery', 'in_transit', 'in_transit'])
    const e = out['123456789013']
    if (!e.ok) throw new Error('expected a result')
    expect(e.status).toBe('exception')
    expect(e.attention_flag).toBe('delivery_failed')
    expect(e.expected_delivery).toBe('2026-08-22')
    expect(e.events[0].description).toContain('Customer not available')
    expect(out['123456789014'].ok).toBe(false)
    expect((out['123456789014'] as { kind: string }).kind).toBe('not_found')
    expect((out['123456789015'] as { kind: string }).kind).toBe('not_found')
  })
})
