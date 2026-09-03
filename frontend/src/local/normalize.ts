/** Field normalizers, ported from backend/app/services/normalize.py. */

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', GU: 'Guam', VI: 'Virgin Islands', AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
}
const STATE_BY_NAME = new Map(Object.entries(US_STATES).map(([k, v]) => [v.toLowerCase(), k]))

const ZIP_RE = /(\d{5})(?:-?(\d{4}))?/
const CITY_STATE_ZIP_RE = /^\s*([^,]+?)\s*,?\s+([A-Za-z]{2}|[A-Za-z .]{4,})\.?\s+(\d{5}(?:-\d{4})?)\s*$/

export function clean(s: string | null | undefined): string | null {
  if (s == null) return null
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t || null
}

export function normalizeTracking(s: string | null | undefined): string | null {
  if (!s) return null
  const t = String(s).replace(/[\s-]/g, '').toUpperCase()
  // Excel sometimes renders long numbers in scientific notation; nothing we can do but flag.
  if (t.includes('E+')) return null
  return t || null
}

export function normalizeState(s: string | null | undefined): string | null {
  const c = clean(s)
  if (!c) return null
  const u = c.toUpperCase().replace(/^\.+|\.+$/g, '')
  if (u in US_STATES) return u
  return STATE_BY_NAME.get(c.toLowerCase()) ?? null
}

export function normalizeZip(s: string | null | undefined): string | null {
  const c = clean(s)
  if (!c) return null
  let digits = c.replace(/\D/g, '')
  if (digits.length === 3 || digits.length === 4) digits = digits.padStart(5, '0') // leading zeros lost by Excel
  const m = ZIP_RE.exec(digits.length <= 9 ? digits : c)
  if (!m) return null
  return m[2] ? `${m[1]}-${m[2]}` : m[1]
}

/** 'Austin, TX 78701' -> ['Austin', 'TX', '78701'] */
export function splitCityStateZip(s: string | null | undefined): [string | null, string | null, string | null] {
  const c = clean(s)
  if (!c) return [null, null, null]
  const m = CITY_STATE_ZIP_RE.exec(c)
  if (m) return [clean(m[1]), normalizeState(m[2]), normalizeZip(m[3])]
  const parts = c.split(',').map((p) => p.trim())
  if (parts.length >= 2) {
    const rest = parts.slice(1).join(' ').split(/\s+/).filter(Boolean)
    const st = rest.length ? normalizeState(rest[0]) : null
    const z = rest.length > 1 ? normalizeZip(rest[rest.length - 1]) : null
    return [clean(parts[0]), st, z]
  }
  return [c, null, null]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Parse the date formats the backend accepts; returns 'YYYY-MM-DD' or null. */
export function parseDate(s: string | null | undefined): string | null {
  const c = clean(s)
  if (!c) return null
  let m: RegExpExecArray | null
  // ISO date / datetime: 2026-03-01, 2026-03-01 10:00:00, 2026-03-01T10:00:00
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(c))) return ymd(+m[1], +m[2], +m[3])
  if ((m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(c))) return ymd(+m[1], +m[2], +m[3])
  // US: 3/1/2026, 03/01/26, with optional time
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(c))) {
    let y = +m[3]
    if (m[3].length === 2) y += y < 69 ? 2000 : 1900
    return ymd(y, +m[1], +m[2])
  }
  // 01-Mar-2026
  if ((m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(c))) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1
    return mo ? ymd(+m[3], mo, +m[1]) : null
  }
  // Mar 1, 2026 / March 1, 2026
  if ((m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(c))) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1
    return mo ? ymd(+m[3], mo, +m[2]) : null
  }
  return null
}
