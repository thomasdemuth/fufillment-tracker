import { normalizeState, normalizeTracking, normalizeZip, parseDate, splitCityStateZip } from './normalize'

describe('normalize', () => {
  it('tracking numbers', () => {
    expect(normalizeTracking(' 9400 1111-2222 ')).toBe('940011112222')
    expect(normalizeTracking('9.4E+21')).toBeNull()
    expect(normalizeTracking('')).toBeNull()
  })
  it('states', () => {
    expect(normalizeState('tx')).toBe('TX')
    expect(normalizeState('Texas')).toBe('TX')
    expect(normalizeState('Tex.')).toBeNull()
  })
  it('zips', () => {
    expect(normalizeZip('78701')).toBe('78701')
    expect(normalizeZip('787011234')).toBe('78701-1234')
    expect(normalizeZip('2101')).toBe('02101')
    expect(normalizeZip('abc')).toBeNull()
  })
  it('combined city/state/zip', () => {
    expect(splitCityStateZip('Austin, TX 78701')).toEqual(['Austin', 'TX', '78701'])
    expect(splitCityStateZip('Austin TX 78701')).toEqual(['Austin', 'TX', '78701'])
    expect(splitCityStateZip('Austin, Texas')).toEqual(['Austin', 'TX', null])
  })
  it('dates', () => {
    expect(parseDate('2026-03-01')).toBe('2026-03-01')
    expect(parseDate('3/1/2026')).toBe('2026-03-01')
    expect(parseDate('03/01/26')).toBe('2026-03-01')
    expect(parseDate('2026-03-01 10:00:00')).toBe('2026-03-01')
    expect(parseDate('Mar 1, 2026')).toBe('2026-03-01')
    expect(parseDate('01-Mar-2026')).toBe('2026-03-01')
    expect(parseDate('yesterday')).toBeNull()
  })
})
