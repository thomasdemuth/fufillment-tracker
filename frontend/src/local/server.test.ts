/** End-to-end through the in-browser API: upload -> preview -> commit -> board/map -> refresh -> detail -> notes/tags -> export. */
import { LocalDb, emptyData } from './db'
import { setZipIndex } from './geocode'
import { localFetch } from './server'

const ZIPS = ['78701|30.2711|-97.7437|Austin|TX', '80202|39.7508|-104.9966|Denver|CO', '33101|25.7791|-80.1978|Miami|FL', '38118|35.0405|-89.9309|Memphis|TN', '60607|41.8747|-87.6512|Chicago|IL'].join('\n')

const CSV = ['Name,Tracking Number,Address,City,State,ZIP,Ship date', 'Ann Example,9400111899223456789012,1 Main St,Austin,TX,78701,2026-08-20', 'Bob Zed,794644790132,2 Elm St,Denver,CO,80202,2026-08-22', 'Cy Doe,,3 Oak St,Miami,FL,33101,', 'Dee Dup,9400111899223456789012,1 Main St,Austin,TX,78701,2026-08-20'].join('\n')

function mkDb(): LocalDb {
  return new LocalDb(emptyData(), async () => undefined)
}

async function call(f: typeof fetch, method: string, path: string, body?: unknown) {
  const init: RequestInit = { method }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) init.body = JSON.stringify(body)
  const res = await f(`http://localhost${path}`, init)
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
}

beforeAll(() => {
  setZipIndex(ZIPS)
  // jsdom's fetch is not used: the ZIP table is injected above, so loadZipIndex() resolves immediately.
})

describe('local server', () => {
  it('imports a csv, geocodes offline, refreshes with the mock carrier, and edits', async () => {
    const db = mkDb()
    const f = localFetch(db)

    const fd = new FormData()
    fd.append('file', new File([CSV], 'orders.csv', { type: 'text/csv' }))
    const up = await call(f, 'POST', '/api/uploads', fd)
    expect(up.status).toBe(201)
    expect(up.body.headers).toEqual(['Name', 'Tracking Number', 'Address', 'City', 'State', 'ZIP', 'Ship date'])
    expect(up.body.suggested_mapping.tracking_number).toBe('Tracking Number')
    expect(up.body.suggested_mapping.postal_code).toBe('ZIP')
    expect(up.body.row_count).toBe(4)
    expect(up.body.carrier_detection.usps).toBeGreaterThan(0)

    const re = await call(f, 'GET', `/api/uploads/${up.body.upload_id}/preview?header_row=0`)
    expect(re.status).toBe(200)

    const commit = await call(f, 'POST', `/api/uploads/${up.body.upload_id}/commit`, { sheet: up.body.sheet, header_row: 0, mapping: up.body.suggested_mapping, geocode_mode: 'offline', save_preset_as: 'My shop' })
    expect(commit.status).toBe(200)
    expect(commit.body.imported).toBe(2)
    expect(commit.body.duplicates).toBe(1)
    expect(commit.body.skipped).toBe(1)
    expect(commit.body.errors[0].error).toBe('missing tracking number')
    expect(commit.body.upload.status).toBe('committed')

    const presets = await call(f, 'GET', '/api/presets')
    expect(presets.body.map((p: { name: string }) => p.name)).toEqual(['My shop'])

    const list = await call(f, 'GET', '/api/shipments?sort=recipient_name')
    expect(list.body.total).toBe(2)
    const ann = list.body.items[0]
    expect(ann.recipient_name).toBe('Ann Example')
    expect(ann.carrier).toBe('usps')
    expect(ann.dest_lat).toBeCloseTo(30.2711)
    expect(ann.geocode_precision).toBe('zip')
    expect(ann.status).toBe('unknown')
    expect(ann.upload_ids).toEqual([up.body.upload_id])
    expect(list.body.items[1].carrier).toBe('fedex')

    const stats = await call(f, 'GET', '/api/shipments/stats')
    expect(stats.body.total).toBe(2)
    expect(stats.body.not_geocoded).toBe(0)
    const points = await call(f, 'GET', '/api/map/points.geojson')
    expect(points.body.features).toHaveLength(2)
    const uploads = await call(f, 'GET', '/api/uploads')
    expect(uploads.body[0].shipment_count).toBe(2)

    // refresh everything (mock carrier, runs in the background)
    const started = await call(f, 'POST', '/api/refresh', { all: true })
    expect(started.body.queued).toBe(2)
    let job = await call(f, 'GET', `/api/jobs/${started.body.job_id}`)
    for (let i = 0; i < 50 && job.body.status !== 'done'; i++) {
      await new Promise((r) => setTimeout(r, 30))
      job = await call(f, 'GET', `/api/jobs/${started.body.job_id}`)
    }
    expect(job.body.status).toBe('done')
    expect(job.body.done).toBe(2)
    const after = await call(f, 'GET', `/api/shipments/${ann.id}`)
    expect(after.body.last_polled_at).toBeTruthy()
    expect(after.body.status).not.toBe('unknown')
    expect(after.body.events.length).toBeGreaterThan(0)
    expect(after.body.uploads[0].row_number).toBe(2)
    const path = await call(f, 'GET', `/api/shipments/${ann.id}/path.geojson`)
    expect(path.body.type).toBe('FeatureCollection')

    // notes, tags, patch
    const noted = await call(f, 'POST', `/api/shipments/${ann.id}/notes`, { body: 'call customer' })
    expect(noted.status).toBe(201)
    expect(noted.body.notes[0].body).toBe('call customer')
    const tagged = await call(f, 'PUT', `/api/shipments/${ann.id}/tags`, { tags: ['VIP', 'gift'] })
    expect(tagged.body.tags.map((t: { name: string }) => t.name)).toEqual(['VIP', 'gift'])
    const tags = await call(f, 'GET', '/api/tags')
    expect(tags.body).toHaveLength(2)
    const patched = await call(f, 'PATCH', `/api/shipments/${ann.id}`, { postal_code: '33101', city: 'Miami', state: 'fl' })
    expect(patched.body.state).toBe('FL')
    expect(patched.body.dest_lat).toBeCloseTo(25.7791)
    const facets = await call(f, 'GET', '/api/shipments/facets')
    expect(facets.body.states).toEqual(['CO', 'FL'])

    // export + snapshot
    const csv = await f('http://localhost/api/export?format=csv')
    expect(csv.headers.get('content-disposition')).toContain('.csv')
    const text = await csv.text()
    expect(text.split('\r\n')[0]).toContain('Tracking number')
    expect(text).toContain('9400111899223456789012')
    const snap = await call(f, 'GET', '/api/snapshot?status=' + after.body.status)
    expect(snap.body.format).toBe('fulfillment-tracker-snapshot')
    expect(snap.body.shipments.length).toBeGreaterThan(0)
    expect(snap.body.shipments[0].reasons).toBeDefined()

    // privacy + wipe
    const priv = await call(f, 'GET', '/api/privacy/summary')
    expect(priv.body.shipments).toBe(2)
    expect(priv.body.egress).toEqual([])
    const bad = await call(f, 'POST', '/api/privacy/wipe', { token: 'nope', keep_settings: true })
    expect(bad.status).toBe(403)
    const wiped = await call(f, 'POST', '/api/privacy/wipe', { token: priv.body.wipe_token, keep_settings: true })
    expect(wiped.body.ok).toBe(true)
    expect((await call(f, 'GET', '/api/shipments')).body.total).toBe(0)
  })

  it('deleting an upload keeps shipments that another upload also contains', async () => {
    const db = mkDb()
    const f = localFetch(db)
    const load = async (name: string, csv: string) => {
      const fd = new FormData()
      fd.append('file', new File([csv], name))
      const up = await call(f, 'POST', '/api/uploads', fd)
      const c = await call(f, 'POST', `/api/uploads/${up.body.upload_id}/commit`, { sheet: up.body.sheet, header_row: 0, mapping: up.body.suggested_mapping })
      return c.body.upload.id as number
    }
    const a = await load('a.csv', 'Tracking,ZIP\n9400111899223456789012,78701\n794644790132,80202\n')
    const b = await load('b.csv', 'Tracking,ZIP\n9400111899223456789012,78701\n')
    expect((await call(f, 'GET', '/api/shipments')).body.total).toBe(2)
    expect((await call(f, 'DELETE', `/api/uploads/${a}`)).status).toBe(204)
    const left = await call(f, 'GET', '/api/shipments')
    expect(left.body.total).toBe(1)
    expect(left.body.items[0].upload_ids).toEqual([b])
  })

  it('reports settings, carriers and refuses live credentials', async () => {
    const f = localFetch(mkDb())
    expect((await call(f, 'GET', '/api/config')).body.carrier_mode).toBe('mock')
    const saved = await call(f, 'PUT', '/api/settings', { stuck_days: 3, origin_postal_code: '78701' })
    expect(saved.body.stuck_days).toBe(3)
    expect((await call(f, 'GET', '/api/config')).body.stuck_days).toBe(3)
    expect((await call(f, 'GET', '/api/settings/carriers')).body.map((c: { mode: string }) => c.mode)).toEqual(['mock', 'mock'])
    expect((await call(f, 'PUT', '/api/settings/carriers/usps', { mode: 'live' })).status).toBe(400)
    expect((await call(f, 'GET', '/api/nope')).status).toBe(404)
  })
})
