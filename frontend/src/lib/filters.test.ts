import { countActiveFilters, filtersToParams, parseFilters } from './filters'

describe('filters', () => {
  it('round-trips through URL params', () => {
    const f = parseFilters(new URLSearchParams('status=delivered,in_transit&state=CA&q=smith&days_min=3&attention=1&page=2'))
    expect(f.status).toEqual(['delivered', 'in_transit'])
    expect(f.state).toEqual(['CA'])
    expect(f.q).toBe('smith')
    expect(f.days_min).toBe(3)
    expect(f.attention).toBe(true)
    expect(f.page).toBe(2)
    const p = filtersToParams(f)
    expect(p.get('status')).toBe('delivered,in_transit')
    expect(p.get('attention')).toBe('1')
    expect(p.has('carrier')).toBe(false)
  })

  it('counts active filters ignoring search and paging', () => {
    const f = parseFilters(new URLSearchParams('status=delivered&q=x&page=3&carrier=usps,fedex'))
    expect(countActiveFilters(f)).toBe(2)
  })

  it('falls back to empty filters on garbage', () => {
    const f = parseFilters(new URLSearchParams('page=abc'))
    expect(f.status).toEqual([])
  })
})
