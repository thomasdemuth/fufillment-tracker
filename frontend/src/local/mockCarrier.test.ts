import { setZipIndex } from './geocode'
import { mockTrack } from './mockCarrier'

beforeAll(() => setZipIndex('78701|30.2711|-97.7437|Austin|TX'))

describe('mock carrier', () => {
  it('is deterministic and advances with time', () => {
    const ctx = { ship_dates: { A1: '2026-01-01' }, dest_zips: { A1: '78701' } }
    const early = mockTrack('A1', 'usps', { ...ctx, now: new Date('2026-01-01T12:00:00Z') })
    const late = mockTrack('A1', 'usps', { ...ctx, now: new Date('2026-03-01T00:00:00Z') })
    const again = mockTrack('A1', 'usps', { ...ctx, now: new Date('2026-03-01T00:00:00Z') })
    expect(again).toEqual(late)
    if (early.ok && late.ok) {
      expect(late.events.length).toBeGreaterThanOrEqual(early.events.length)
      expect(['delivered', 'returned', 'exception', 'label_created']).toContain(late.status)
      expect(late.dest_postal_code).toBe('78701')
      expect(late.events[late.events.length - 1].code).toBe('GX')
    }
  })
  it('covers every scenario across many numbers', () => {
    const statuses = new Set<string>()
    for (let i = 0; i < 300; i++) {
      const r = mockTrack(`94001118992234567${String(i).padStart(5, '0')}`, i % 2 ? 'usps' : 'fedex', { ship_dates: {}, now: new Date('2026-06-01T00:00:00Z') })
      if (r.ok) statuses.add(r.status)
    }
    expect(statuses.has('delivered')).toBe(true)
    expect(statuses.has('exception')).toBe(true)
    expect(statuses.has('returned')).toBe(true)
  })
})
