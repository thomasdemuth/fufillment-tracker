/**
 * Offline geocoder for the browser: ZIP centroid, then city+state centroid, then state centroid.
 * The ZIP table (public/geo/us_zips.txt, ~1.5 MB, from the `zipcodes` package) is fetched from the
 * site's own origin the first time it is needed and kept in memory. No address ever leaves the browser.
 */
import { assetUrl } from '@/lib/server'

export type Precision = 'street' | 'zip' | 'city' | 'state' | 'none'
export interface GeoResult {
  lat: number
  lng: number
  precision: Precision
  source: string
}
export interface ZipHit {
  lat: number
  lng: number
  city: string
  state: string
}

interface Index {
  zips: Map<string, ZipHit>
  cities: Map<string, [number, number]>
  states: Map<string, [number, number]>
}

let index: Index | null = null
let loading: Promise<Index> | null = null

export function parseZipTable(text: string): Index {
  const zips = new Map<string, ZipHit>()
  const cityAcc = new Map<string, [number, number, number]>()
  const stateAcc = new Map<string, [number, number, number]>()
  for (const line of text.split('\n')) {
    if (!line) continue
    const [z, la, lo, city, state] = line.split('|')
    const lat = Number(la)
    const lng = Number(lo)
    if (!z || Number.isNaN(lat) || Number.isNaN(lng)) continue
    zips.set(z, { lat, lng, city, state })
    const ck = `${city.trim().toLowerCase()}|${state}`
    const c = cityAcc.get(ck) ?? [0, 0, 0]
    cityAcc.set(ck, [c[0] + lat, c[1] + lng, c[2] + 1])
    const s = stateAcc.get(state) ?? [0, 0, 0]
    stateAcc.set(state, [s[0] + lat, s[1] + lng, s[2] + 1])
  }
  const avg = (m: Map<string, [number, number, number]>) => new Map([...m].map(([k, [a, b, n]]) => [k, [a / n, b / n] as [number, number]]))
  return { zips, cities: avg(cityAcc), states: avg(stateAcc) }
}

/** For tests and for injecting a small table. */
export function setZipIndex(text: string | null) {
  index = text == null ? null : parseZipTable(text)
  loading = null
}

export async function loadZipIndex(): Promise<Index> {
  if (index) return index
  if (!loading) {
    loading = (async () => {
      const r = await fetch(assetUrl('geo/us_zips.txt'))
      if (!r.ok) throw new Error(`ZIP table unavailable (${r.status})`)
      index = parseZipTable(await r.text())
      return index
    })().catch((e) => {
      loading = null
      throw e
    })
  }
  return loading
}

export function zipLookup(zip5: string | null | undefined): ZipHit | null {
  if (!index || !zip5) return null
  return index.zips.get(zip5.slice(0, 5)) ?? null
}

export interface AddressQuery {
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

/** Requires loadZipIndex() to have completed. */
export function geocodeOffline(q: AddressQuery): GeoResult | null {
  if (!index) return null
  const zip5 = q.postal_code ? q.postal_code.slice(0, 5) : null
  if (zip5 && /^\d{5}$/.test(zip5)) {
    const hit = index.zips.get(zip5)
    if (hit) return { lat: hit.lat, lng: hit.lng, precision: 'zip', source: 'zip' }
  }
  if (q.city && q.state) {
    const c = index.cities.get(`${q.city.trim().toLowerCase()}|${q.state.toUpperCase()}`)
    if (c) return { lat: c[0], lng: c[1], precision: 'city', source: 'city_state' }
  }
  if (q.state) {
    const s = index.states.get(q.state.toUpperCase())
    if (s) return { lat: s[0], lng: s[1], precision: 'state', source: 'state' }
  }
  return null
}
