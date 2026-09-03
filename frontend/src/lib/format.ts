import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

export function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = parseISO(v)
  return isValid(d) ? d : null
}

export function fmtDate(v: string | null | undefined, withTime = false): string {
  const d = parseDate(v)
  if (!d) return '—'
  return format(d, withTime ? 'MMM d, yyyy h:mm a' : 'MMM d, yyyy')
}

export function fmtRelative(v: string | null | undefined): string {
  const d = parseDate(v)
  if (!d) return '—'
  return formatDistanceToNowStrict(d, { addSuffix: true })
}

export function fmtDays(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v < 1) return '<1d'
  return `${Math.round(v)}d`
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat().format(n)
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function placeLabel(s: { city?: string | null; state?: string | null; postal_code?: string | null }): string {
  const parts = [s.city, s.state].filter(Boolean)
  const base = parts.join(', ')
  return s.postal_code ? `${base} ${s.postal_code}`.trim() : base
}
