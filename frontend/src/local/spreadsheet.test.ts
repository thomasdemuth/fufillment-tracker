import { detectHeaderRow, parseCsv, readWorkbook, tableFromRows } from './spreadsheet'

describe('spreadsheet', () => {
  it('parses csv with quotes and sniffs semicolons', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ])
    expect(parseCsv('a;b\r\n1;2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('detects a header row that is not the first row', () => {
    const rows = [['Export from shop', ''], ['Name', 'Tracking Number', 'ZIP'], ['Ann', '9400111', '78701']]
    expect(detectHeaderRow(rows)).toBe(1)
    const [headers, body] = tableFromRows(rows, 1)
    expect(headers).toEqual(['Name', 'Tracking Number', 'ZIP'])
    expect(body).toEqual([['Ann', '9400111', '78701']])
  })
  it('names blank and duplicate headers', () => {
    const [headers] = tableFromRows([['Name', '', 'Name'], ['a', 'b', 'c']], 0)
    expect(headers).toEqual(['Name', 'Column 2', 'Name (2)'])
  })
  it('reads an xlsx workbook via SheetJS', async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'Tracking', 'Ship date'], ['Ann', 9400111899223456789012, new Date(2026, 2, 1)]]), 'Orders')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const file = new File([buf], 'orders.xlsx')
    const parsed = await readWorkbook(file)
    expect(parsed.sheets.map((s) => s.name)).toEqual(['Orders'])
    expect(parsed.sheets[0].rows[0]).toEqual(['Name', 'Tracking', 'Ship date'])
    expect(parsed.sheets[0].rows[1][0]).toBe('Ann')
    expect(parsed.sheets[0].rows[1][2].startsWith('2026-03-01')).toBe(true)
  })
})
