import { applyFilters, applySort, daysInTransit, handleLocal } from './localServer'
import type { Snapshot, SnapshotShipment } from '@/lib/snapshot'

function ship(over: Partial<SnapshotShipment>): SnapshotShipment {
  return {
    id: 1,
    tracking_number: '9400111111111111111111',
    carrier: 'usps',
    carrier_confidence: 1,
    recipient_name: 'Ann Example',
    company: null,
    address1: '1 Main St',
    address2: null,
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    country: 'US',
    order_ref: 'ORD-1',
    ship_date: '2099-03-01',
    status: 'in_transit',
    status_raw: 'In transit',
    attention_flag: null,
    expected_delivery: null,
    delivered_at: null,
    last_event_at: '2099-03-02T10:00:00',
    last_event_desc: 'Departed',
    last_event_place: 'Dallas, TX',
    dest_lat: 30.27,
    dest_lng: -97.74,
    geocode_precision: 'zip',
    last_polled_at: '2099-03-02T12:00:00',
    poll_error_count: 0,
    poll_last_error: null,
    days_in_transit: null,
    tags: [],
    upload_ids: [1],
    carrier_url: 'https://tools.usps.com/x',
    email: null,
    phone: null,
    origin_postal_code: null,
    status_code: null,
    first_event_at: '2099-03-01T10:00:00',
    carrier_locked: false,
    geocode_source: 'zip',
    created_at: '2099-03-01T00:00:00',
    updated_at: '2099-03-01T00:00:00',
    events: [],
    notes: [],
    reasons: [],
    ...over,
  } as SnapshotShipment
}

const rows: SnapshotShipment[] = [
  ship({ id: 1 }),
  ship({ id: 2, status: 'delivered', delivered_at: '2099-03-04T11:00:00', state: 'CA', city: 'Fresno', recipient_name: 'Bob Zed', last_event_at: '2099-03-04T11:00:00', events: [
    { id: 1, event_at: '2099-03-01T09:00:00', event_at_raw: '', code: 'GX', description: 'Label', normalized_status: 'label_created', city: 'Memphis', state: 'TN', postal_code: '38118', country: 'US', lat: 35.1, lng: -90.0 },
    { id: 2, event_at: '2099-03-04T11:00:00', event_at_raw: '', code: '01', description: 'Delivered', normalized_status: 'delivered', city: 'Fresno', state: 'CA', postal_code: '93701', country: 'US', lat: 36.7, lng: -119.8 },
  ], dest_lat: 36.7, dest_lng: -119.8 }),
  ship({ id: 3, status: 'exception', reasons: ['exception', 'delivery_failed'], state: 'CA', city: 'Fresno', last_event_at: '2099-03-03T08:00:00', tags: [{ id: 1, name: 'VIP', color: '#000' }] }),
]
const snap: Snapshot = { format: 'fulfillment-tracker-snapshot', version: 1, exported_at: '2099-03-05T00:00:00Z', app_name: 'T', stuck_days: 7, map_style_url: 'x', map_style_url_dark: 'y', filters: {}, uploads: [{ id: 1, filename: 'a.xlsx', created_at: '2099-03-01', count: 3 }], shipments: rows }
const now = new Date('2099-03-06T00:00:00')

describe('localServer', () => {
  it('filters like the backend', () => {
    expect(applyFilters(rows, new URLSearchParams('status=delivered')).map((r) => r.id)).toEqual([2])
    expect(applyFilters(rows, new URLSearchParams('state=CA,TX')).length).toBe(3)
    expect(applyFilters(rows, new URLSearchParams('q=bob')).map((r) => r.id)).toEqual([2])
    expect(applyFilters(rows, new URLSearchParams('tag=VIP')).map((r) => r.id)).toEqual([3])
    expect(applyFilters(rows, new URLSearchParams('attention=1')).map((r) => r.id)).toEqual([3])
    expect(applyFilters(rows, new URLSearchParams('days_min=4'), now).map((r) => r.id).sort()).toEqual([1, 3])
  })
  it('sorts with nulls last and days computed', () => {
    expect(daysInTransit(rows[1], now)).toBe(3.5)
    expect(applySort(rows, 'recipient_name').map((r) => r.recipient_name)[0]).toBe('Ann Example')
    expect(applySort(rows, '-last_event_at').map((r) => r.id)).toEqual([2, 3, 1])
  })
  it('serves list, stats, detail, path and map', async () => {
    const get = async (p: string) => (await handleLocal(snap, 'GET', new URL(`http://x${p}`)).json()) as Record<string, unknown>
    const list = await get('/api/shipments?page_size=2')
    expect(list.total).toBe(3)
    expect((list.items as unknown[]).length).toBe(2)
    const stats = await get('/api/shipments/stats')
    expect(stats.total).toBe(3)
    expect((stats.by_status as Record<string, number>).delivered).toBe(1)
    expect(stats.attention).toBe(1)
    const d = await get('/api/shipments/2')
    expect(d.recipient_name).toBe('Bob Zed')
    const path = await get('/api/shipments/2/path.geojson')
    const kinds = (path.features as { properties: { kind?: string } }[]).map((f) => f.properties.kind).filter(Boolean)
    expect(kinds).toEqual(['origin', 'scan', 'destination'])
    const pts = await get('/api/map/points.geojson')
    expect((pts.features as unknown[]).length).toBe(3)
    const states = (await get('/api/map/states')) as Record<string, { total: number }>
    expect(states.CA.total).toBe(2)
    const att = (await get('/api/attention')) as unknown as { id: number }[]
    expect(att.map((a) => a.id)).toEqual([3])
  })
  it('rejects writes and unknown paths', async () => {
    expect(handleLocal(snap, 'POST', new URL('http://x/api/refresh')).status).toBe(405)
    expect(handleLocal(snap, 'GET', new URL('http://x/api/nope')).status).toBe(404)
  })
})
