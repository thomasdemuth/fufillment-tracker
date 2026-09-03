import { clusterColorExpression, clusterProperties, pointLayer, statusColorExpression } from './mapLayers'
import { STATUS_ORDER } from './status'

describe('map layer builders', () => {
  it('creates one cluster counter per status plus hot', () => {
    const p = clusterProperties()
    for (const s of STATUS_ORDER) expect(p[s]).toBeDefined()
    expect(p.hot).toBeDefined()
  })
  it('status color expression is a match on s', () => {
    const e = statusColorExpression() as unknown[]
    expect(e[0]).toBe('match')
    expect(e[1]).toEqual(['get', 's'])
    expect(e.length).toBe(2 + STATUS_ORDER.length * 2 + 1)
  })
  it('cluster color is an argmax over statuses starting with exception', () => {
    const e = clusterColorExpression() as unknown[]
    expect(e[0]).toBe('case')
    expect(JSON.stringify(e[1])).toContain('"exception"')
  })
  it('point layer excludes clusters', () => {
    expect(pointLayer().filter).toEqual(['!', ['has', 'point_count']])
  })
})
