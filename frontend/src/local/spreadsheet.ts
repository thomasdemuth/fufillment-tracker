/**
 * Read xlsx/xls/ods/csv/tsv files into rows of strings, with header-row detection.
 * Ported from backend/app/services/spreadsheet.py; binary formats go through SheetJS, text formats
 * through a small CSV parser with delimiter sniffing. Everything runs in the browser.
 */

export interface Sheet {
  name: string
  rows: string[][]
}
export interface Workbook {
  sheets: Sheet[]
}

export const SPREADSHEET_EXTS = new Set(['.xlsx', '.xlsm', '.xls', '.xlsb', '.ods'])
export const TEXT_EXTS = new Set(['.csv', '.tsv', '.txt'])

export function extOf(name: string): string {
  const m = /\.[^.]+$/.exec(name)
  return m ? m[0].toLowerCase() : ''
}

export function sheetOf(wb: Workbook, name: string | null | undefined): Sheet {
  if (name) for (const s of wb.sheets) if (s.name === name) return s
  return wb.sheets[0]
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function cellToStr(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v)
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`
  }
  return String(v).trim()
}

function sniffDelimiter(sample: string): string {
  const cands = [',', ';', '\t', '|']
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
  let best = ','
  let bestScore = -1
  for (const d of cands) {
    const counts = lines.map((l) => l.split(d).length - 1)
    if (!counts.length || counts[0] === 0) continue
    const consistent = counts.every((c) => c === counts[0]) ? 2 : 1
    const score = counts[0] * consistent
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/** RFC 4180-ish CSV parser (quotes, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const d = delimiter ?? sniffDelimiter(text.slice(0, 8192))
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === d) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell.length || row.length) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows
}

function trimEmptyTail(rows: string[][]): string[][] {
  while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop()
  return rows
}

export async function readWorkbook(file: File): Promise<Workbook> {
  const ext = extOf(file.name)
  const stem = file.name.replace(/\.[^.]+$/, '') || 'Sheet1'
  if (TEXT_EXTS.has(ext) || !SPREADSHEET_EXTS.has(ext)) {
    const text = new TextDecoder('utf-8').decode(await file.arrayBuffer())
    return { sheets: [{ name: stem, rows: parseCsv(text) }] }
  }
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, raw: true })
  const sheets: Sheet[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const raw = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as unknown[][]) : []
    sheets.push({ name, rows: trimEmptyTail(raw.map((r) => r.map(cellToStr))) })
  }
  if (!sheets.length) sheets.push({ name: 'Sheet1', rows: [] })
  return { sheets }
}

const HEADER_HINTS = ['name', 'address', 'city', 'state', 'zip', 'postal', 'tracking', 'carrier', 'email', 'phone', 'order', 'ship', 'company', 'street', 'recipient', 'customer']

/** Index of the most header-like row within the first `maxScan` rows. */
export function detectHeaderRow(rows: string[][], maxScan = 15): number {
  let bestIdx = 0
  let bestScore = -1
  rows.slice(0, maxScan).forEach((row, i) => {
    const cells = row.filter(Boolean)
    if (cells.length < 2) return
    const lower = cells.map((c) => c.toLowerCase())
    const hintHits = lower.filter((c) => HEADER_HINTS.some((h) => c.includes(h))).length
    const nonNumeric = cells.filter((c) => !/^\d+$/.test(c.replace('.', '').replace('-', ''))).length
    const unique = new Set(lower).size === lower.length
    const score = hintHits * 3 + (nonNumeric / cells.length) * 2 + (unique ? 1 : 0) + cells.length * 0.05
    if (score > bestScore) {
      bestIdx = i
      bestScore = score
    }
  })
  return bestIdx
}

export function tableFromRows(rows: string[][], headerRow: number): [string[], string[][]] {
  if (!rows.length) return [[], []]
  const header = headerRow < rows.length ? rows[headerRow] : []
  const rest = rows.slice(headerRow + 1)
  const width = Math.max(header.length, ...rest.map((r) => r.length), 0)
  const headers = [...header, ...new Array<string>(Math.max(0, width - header.length)).fill('')].map((h, i) => (h || `Column ${i + 1}`).trim())
  const seen = new Map<string, number>()
  headers.forEach((h, i) => {
    const n = seen.get(h)
    if (n) {
      seen.set(h, n + 1)
      headers[i] = `${h} (${n + 1})`
    } else seen.set(h, 1)
  })
  const body: string[][] = []
  for (const r of rest) {
    const full = [...r, ...new Array<string>(Math.max(0, width - r.length)).fill('')]
    if (full.some(Boolean)) body.push(full.slice(0, width))
  }
  return [headers, body]
}
