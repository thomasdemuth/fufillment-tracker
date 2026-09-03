import { z } from 'zod'

const list = z.preprocess((v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v ?? []), z.array(z.string()))
const numList = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').filter(Boolean).map(Number) : v ?? []),
  z.array(z.number()),
)
const optNum = z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().optional())
const optBool = z.preprocess((v) => (v === '1' || v === 'true' ? true : v === '0' || v === 'false' ? false : undefined), z.boolean().optional())

export const filterSchema = z.object({
  status: list.default([]),
  carrier: list.default([]),
  upload_id: numList.default([]),
  state: list.default([]),
  tag: list.default([]),
  city: z.string().optional(),
  q: z.string().optional(),
  ship_date_from: z.string().optional(),
  ship_date_to: z.string().optional(),
  last_event_from: z.string().optional(),
  last_event_to: z.string().optional(),
  days_min: optNum,
  days_max: optNum,
  attention: optBool,
  geocoded: optBool,
  sort: z.string().optional(),
  page: optNum,
  page_size: optNum,
})

export type Filters = z.infer<typeof filterSchema>

export const EMPTY_FILTERS: Filters = { status: [], carrier: [], upload_id: [], state: [], tag: [] }

export function parseFilters(params: URLSearchParams): Filters {
  const obj: Record<string, string> = {}
  params.forEach((v, k) => {
    obj[k] = v
  })
  const res = filterSchema.safeParse(obj)
  return res.success ? res.data : { ...EMPTY_FILTERS }
}

/** Serialize filters into URLSearchParams (omits empties). */
export function filtersToParams(f: Partial<Filters>): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','))
      continue
    }
    if (typeof v === 'boolean') {
      p.set(k, v ? '1' : '0')
      continue
    }
    p.set(k, String(v))
  }
  return p
}

/** Query object for the API (repeated params for arrays). */
export function filtersToQuery(f: Partial<Filters>): Record<string, string | number | boolean | string[] | number[]> {
  const q: Record<string, string | number | boolean | string[] | number[]> = {}
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    q[k] = v as string | number | boolean | string[] | number[]
  }
  return q
}

/** Only the data-filtering keys (no sort/pagination), for sharing across pages. */
export function dataFilters(f: Filters): Partial<Filters> {
  const { sort: _s, page: _p, page_size: _ps, ...rest } = f
  return rest
}

export function countActiveFilters(f: Filters): number {
  let n = 0
  for (const [k, v] of Object.entries(dataFilters(f))) {
    if (k === 'q') continue
    if (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '') n++
  }
  return n
}
