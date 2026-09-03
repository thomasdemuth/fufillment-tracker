import { clusterColorExpression, clusterProperties, mapPalette, pointLayer, statusColorExpression } from './mapLayers'
import { STATUS_ORDER } from './status'

describe('map layer builders', () => {
  const p = mapPalette(false)
  it('creates one cluster counter per status plus hot', () => {
    const c = clusterProperties()
    for (const s of STATUS_ORDER) expect(c[s]).toBeDefined()
    expect(c.hot).toBeDefined()
  })
  it('status color expression is a match on s', () => {
    const e = statusColorExpression(p) as unknown[]
    expect(e[0]).toBe('match')
    expect(e[1]).toEqual(['get', 's'])
    expect(e.length).toBe(2 + STATUS_ORDER.length * 2 + 1)
  })
  it('cluster color is an argmax case chain', () => {
    const e = clusterColorExpression(p) as unknown[]
    expect(e[0]).toBe('case')
  })
  it('point layer excludes clusters and draws returned hollow', () => {
    const l = pointLayer(p)
    expect(l.filter).toEqual(['!', ['has', 'point_count']])
    expect(JSON.stringify(l.paint)).toContain('returned')
  })
  it('dark palette differs from light', () => {
    expect(mapPalette(true).status.in_transit).not.toBe(p.status.in_transit)
  })
})
