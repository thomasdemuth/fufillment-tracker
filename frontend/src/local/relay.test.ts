/** Relay settings and a live refresh through a stubbed relay Worker. */
import fs from 'node:fs'
import path from 'node:path'
import { LocalDb, emptyData } from './db'
import { setZipIndex } from './geocode'
import { localFetch } from './server'

const FX = path.resolve(__dirname, '../../../backend/tests/fixtures')
const load = (rel: string) => JSON.parse(fs.readFileSync(path.join(FX, rel), 'utf8'))

async function call(f: typeof fetch, method: string, p: string, body?: unknown) {
  const init: RequestInit = { method }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) init.body = JSON.stringify(body)
  const res = await f(`http://localhost${p}`, init)
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

beforeAll(() => setZipIndex('78701|30.2711|-97.7437|Austin|TX\n33152|25.79|-80.29|Miami|FL'))

describe('tracking relay', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('stores the relay, reports live mode, and refreshes through it', async () => {
    const db = new LocalDb(emptyData(), async () => undefined)
    const f = localFetch(db)
    expect((await call(f, 'GET', '/api/config')).body.carrier_mode).toBe('mock')

    const bad = await call(f, 'PUT', '/api/settings/relay', { relay_url: 'ftp://x', relay_token: 't' })
    expect(bad.status).toBe(422)
    const saved = await call(f, 'PUT', '/api/settings/relay', { relay_url: 'my-relay.workers.dev/', relay_token: 'secret-1' })
    expect(saved.body.relay_url).toBe('https://my-relay.workers.dev')
    expect(saved.body.has_token).toBe(true)
    expect((await call(f, 'GET', '/api/config')).body.carrier_mode).toBe('live')
    expect((await call(f, 'GET', '/api/settings/carriers')).body[0]).toMatchObject({ mode: 'live', status: 'unconfigured' })

    const seen: { url: string; auth: string | null; body: unknown }[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      seen.push({ url, auth: new Headers(init?.headers).get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) : null })
      const j = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.endsWith('/')) return j({ ok: true, relay: 'fulfillment-tracker', carriers: { usps: { configured: true, sandbox: false }, fedex: { configured: false, sandbox: false } } })
      if (url.endsWith('/usps/test')) return j({ ok: true, message: 'Token OK from https://apis.usps.com' })
      if (url.endsWith('/usps/track')) {
        const numbers = (JSON.parse(String(init!.body)) as { numbers: string[] }).numbers
        const results: Record<string, unknown> = {}
        for (const n of numbers) results[n] = n === '9400111899223197428490' ? { json: load('usps/track_delivered.json') } : { error: { kind: 'not_found', message: 'USPS has no record of this tracking number yet' } }
        return j({ results })
      }
      if (url.endsWith('/fedex/track')) return j({ ok: false, error: { kind: 'disabled', message: 'FEDEX credentials are not set on the relay' } })
      return new Response('nope', { status: 404 })
    }) as typeof fetch

    const test = await call(f, 'POST', '/api/settings/relay/test')
    expect(test.status).toBe(200)
    expect(test.body.ok).toBe(true)
    expect(test.body.carriers.usps.ok).toBe(true)
    expect(test.body.carriers.fedex.configured).toBe(false)
    expect(seen[0].auth).toBe('Bearer secret-1')
    const carriers = await call(f, 'GET', '/api/settings/carriers')
    expect(carriers.body.map((c: { status: string }) => c.status)).toEqual(['ok', 'unconfigured'])

    const fd = new FormData()
    fd.append('file', new File(['Tracking,ZIP\n9400111899223197428490,78701\n9400111899223197428499,78701\n123456789012,33152\n'], 'a.csv'))
    const up = await call(f, 'POST', '/api/uploads', fd)
    await call(f, 'POST', `/api/uploads/${up.body.upload_id}/commit`, { sheet: up.body.sheet, header_row: 0, mapping: up.body.suggested_mapping })

    const started = await call(f, 'POST', '/api/refresh', { all: true })
    expect(started.body.queued).toBe(3)
    let job = await call(f, 'GET', `/api/jobs/${started.body.job_id}`)
    for (let i = 0; i < 50 && job.body.status !== 'done'; i++) {
      await new Promise((r) => setTimeout(r, 20))
      job = await call(f, 'GET', `/api/jobs/${started.body.job_id}`)
    }
    expect(job.body.status).toBe('done')
    expect(job.body.done).toBe(3)
    expect(job.body.updated).toBe(1)
    expect(job.body.errors).toBe(2) // fedex not configured + usps not_found (which still softens to "label created")
    const rows = (await call(f, 'GET', '/api/shipments?sort=tracking_number')).body.items
    const fedex = rows.find((r: { carrier: string }) => r.carrier === 'fedex')
    expect(fedex.poll_last_error).toContain('FEDEX credentials are not set')
    const delivered = rows.find((r: { tracking_number: string }) => r.tracking_number === '9400111899223197428490')
    expect(delivered.status).toBe('delivered')
    expect(delivered.delivered_at).toBe('2026-08-20T13:02:00')
    expect(delivered.last_event_place).toBe('AUSTIN, TX')
    const fresh = rows.find((r: { tracking_number: string }) => r.tracking_number === '9400111899223197428499')
    expect(fresh.status).toBe('label_created')
    expect(fresh.status_raw).toBe('Not yet in carrier system')
    // only tracking numbers went to the relay
    const trackCall = seen.find((s) => s.url.endsWith('/usps/track'))!
    expect(Object.keys(trackCall.body as object)).toEqual(['numbers'])

    const priv = await call(f, 'GET', '/api/privacy/summary')
    expect(priv.body.egress[0].host).toBe('my-relay.workers.dev')

    // clearing the address drops the token and returns to mock
    await call(f, 'PUT', '/api/settings/relay', { relay_url: '' })
    expect((await call(f, 'GET', '/api/settings/relay')).body.has_token).toBe(false)
    expect((await call(f, 'GET', '/api/config')).body.carrier_mode).toBe('mock')
  })
})
