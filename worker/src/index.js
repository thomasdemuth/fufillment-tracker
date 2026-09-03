/**
 * Fulfillment Tracker relay: a tiny Cloudflare Worker that calls the USPS and FedEx tracking APIs on
 * behalf of the hosted UI. The browser cannot call the carriers directly (they do not allow
 * cross-origin requests), so this Worker holds your carrier credentials as secrets and forwards
 * tracking numbers only. Nothing is stored; every request is answered and forgotten.
 *
 * Secrets (npx wrangler secret put NAME, or the dashboard's Variables and Secrets):
 *   RELAY_TOKEN          required: a password of your choosing; the site sends it on every call
 *   USPS_CLIENT_ID       from developers.usps.com (app "Consumer Key")
 *   USPS_CLIENT_SECRET   from developers.usps.com (app "Consumer Secret")
 *   FEDEX_API_KEY        from developer.fedex.com (project "API Key")
 *   FEDEX_SECRET_KEY     from developer.fedex.com (project "Secret Key")
 * Variables: ALLOWED_ORIGINS ("*" or comma-separated origins), USPS_SANDBOX, FEDEX_SANDBOX ("true"/"false").
 *
 * Endpoints (all need `Authorization: Bearer <RELAY_TOKEN>`):
 *   GET  /              which carriers are configured
 *   GET  /usps/test     fetch an OAuth token with the USPS credentials
 *   GET  /fedex/test    fetch an OAuth token with the FedEx credentials
 *   POST /usps/track    {"numbers": [...]}  -> {"results": {number: {json} | {error: {kind, message}}}}
 *   POST /fedex/track   {"numbers": [...]}  -> {"batches": [{numbers, json} | {numbers, error}]}
 */

const USPS = { prod: 'https://apis.usps.com', sandbox: 'https://apis-tem.usps.com' }
const FEDEX = { prod: 'https://apis.fedex.com', sandbox: 'https://apis-sandbox.fedex.com' }

// OAuth tokens are cached per Worker isolate; they simply get fetched again after a cold start.
const tokens = { usps: null, fedex: null }

const isTrue = (v) => String(v ?? '').toLowerCase() === 'true'

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = String(env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const ok = allowed.includes('*') || allowed.includes(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } })
}

function configured(env) {
  return {
    usps: { configured: !!(env.USPS_CLIENT_ID && env.USPS_CLIENT_SECRET), sandbox: isTrue(env.USPS_SANDBOX) },
    fedex: { configured: !!(env.FEDEX_API_KEY && env.FEDEX_SECRET_KEY), sandbox: isTrue(env.FEDEX_SANDBOX) },
  }
}

class CarrierError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}

async function getToken(carrier, env, force = false) {
  const cached = tokens[carrier]
  if (!force && cached && cached.expiresAt - 120_000 > Date.now()) return cached.token
  let r
  if (carrier === 'usps') {
    const base = isTrue(env.USPS_SANDBOX) ? USPS.sandbox : USPS.prod
    r = await fetch(`${base}/oauth2/v3/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.USPS_CLIENT_ID, client_secret: env.USPS_CLIENT_SECRET }),
    })
  } else {
    const base = isTrue(env.FEDEX_SANDBOX) ? FEDEX.sandbox : FEDEX.prod
    const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: env.FEDEX_API_KEY, client_secret: env.FEDEX_SECRET_KEY })
    r = await fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form })
  }
  if ([400, 401, 403].includes(r.status)) {
    throw new CarrierError('auth', `${carrier.toUpperCase()} rejected the credentials (${r.status}): ${(await r.text()).slice(0, 200)}`)
  }
  if (!r.ok) throw new CarrierError('transient', `${carrier.toUpperCase()} token endpoint answered ${r.status}`)
  const j = await r.json()
  const expiresIn = Math.max(60, Number(j.expires_in || 3600))
  tokens[carrier] = { token: j.access_token, expiresAt: Date.now() + expiresIn * 1000 }
  return j.access_token
}

async function uspsTrack(number, env, retriedAuth = false) {
  const base = isTrue(env.USPS_SANDBOX) ? USPS.sandbox : USPS.prod
  const token = await getToken('usps', env)
  let r
  try {
    r = await fetch(`${base}/tracking/v3/tracking/${encodeURIComponent(number)}?expand=DETAIL`, { headers: { Authorization: `Bearer ${token}` } })
  } catch (e) {
    return { error: { kind: 'transient', message: `Could not reach USPS: ${e.message}` } }
  }
  if (r.status === 401 && !retriedAuth) {
    tokens.usps = null
    return uspsTrack(number, env, true)
  }
  if (r.status === 401 || r.status === 403) return { error: { kind: 'auth', message: `USPS authorization failed (${r.status}). Check that Tracking is enabled for your app.` } }
  if (r.status === 404) return { error: { kind: 'not_found', message: 'USPS has no record of this tracking number yet' } }
  if (r.status === 429) return { error: { kind: 'rate_limited', message: 'USPS rate limit reached; try again later' } }
  if (r.status >= 500) return { error: { kind: 'transient', message: `USPS server error ${r.status}` } }
  if (r.status === 400) return { error: { kind: 'invalid', message: `USPS rejected the tracking number: ${(await r.text()).slice(0, 120)}` } }
  if (!r.ok) return { error: { kind: 'transient', message: `USPS answered ${r.status}` } }
  try {
    return { json: await r.json() }
  } catch {
    return { error: { kind: 'transient', message: 'USPS returned an unreadable response' } }
  }
}

async function fedexTrack(numbers, env, retriedAuth = false) {
  const base = isTrue(env.FEDEX_SANDBOX) ? FEDEX.sandbox : FEDEX.prod
  const token = await getToken('fedex', env)
  let r
  try {
    r = await fetch(`${base}/track/v1/trackingnumbers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', 'X-locale': 'en_US' },
      body: JSON.stringify({ includeDetailedScans: true, trackingInfo: numbers.map((n) => ({ trackingNumberInfo: { trackingNumber: n } })) }),
    })
  } catch (e) {
    return { numbers, error: { kind: 'transient', message: `Could not reach FedEx: ${e.message}` } }
  }
  if (r.status === 401 && !retriedAuth) {
    tokens.fedex = null
    return fedexTrack(numbers, env, true)
  }
  if (r.status === 401 || r.status === 403) return { numbers, error: { kind: 'auth', message: `FedEx authorization failed (${r.status}). Check that the Track API is enabled.` } }
  if (r.status === 429) return { numbers, error: { kind: 'rate_limited', message: 'FedEx rate limit reached; try again later' } }
  if (r.status >= 500) return { numbers, error: { kind: 'transient', message: `FedEx server error ${r.status}` } }
  if (r.status >= 400) return { numbers, error: { kind: 'invalid', message: `FedEx error ${r.status}: ${(await r.text()).slice(0, 150)}` } }
  try {
    return { numbers, json: await r.json() }
  } catch {
    return { numbers, error: { kind: 'transient', message: 'FedEx returned an unreadable response' } }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    new Array(Math.min(limit, items.length)).fill(0).map(async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

function cleanNumbers(body) {
  const list = Array.isArray(body?.numbers) ? body.numbers : []
  return [...new Set(list.map((n) => String(n).replace(/[\s-]/g, '').toUpperCase()).filter((n) => /^[A-Z0-9]{6,40}$/.test(n)))].slice(0, 500)
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const reply = (body, status = 200) => json(body, status, cors)

    if (!env.RELAY_TOKEN) return reply({ error: 'The RELAY_TOKEN secret is not set on this Worker. See docs/LIVE-TRACKING.md.' }, 500)
    const auth = request.headers.get('Authorization') || ''
    if (auth !== `Bearer ${env.RELAY_TOKEN}`) return reply({ error: 'Wrong or missing relay token' }, 401)

    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const cfg = configured(env)

    if (path === '/' && request.method === 'GET') return reply({ ok: true, relay: 'fulfillment-tracker', version: 1, carriers: cfg })

    const m = /^\/(usps|fedex)\/(test|track)$/.exec(path)
    if (!m) return reply({ error: `Unknown endpoint ${path}` }, 404)
    const carrier = m[1]
    if (!cfg[carrier].configured) return reply({ ok: false, error: { kind: 'disabled', message: `${carrier.toUpperCase()} credentials are not set on the relay` } }, 200)

    if (m[2] === 'test') {
      try {
        await getToken(carrier, env, true)
        return reply({ ok: true, message: `Token OK from ${carrier === 'usps' ? (cfg.usps.sandbox ? USPS.sandbox : USPS.prod) : cfg.fedex.sandbox ? FEDEX.sandbox : FEDEX.prod}` })
      } catch (e) {
        return reply({ ok: false, message: e.message })
      }
    }

    if (request.method !== 'POST') return reply({ error: 'POST a JSON body {"numbers": [...]}' }, 405)
    let body
    try {
      body = await request.json()
    } catch {
      return reply({ error: 'Body must be JSON' }, 400)
    }
    const numbers = cleanNumbers(body)
    if (!numbers.length) return reply({ error: 'No tracking numbers given' }, 400)

    try {
      if (carrier === 'usps') {
        const res = await mapLimit(numbers, 4, (n) => uspsTrack(n, env))
        return reply({ results: Object.fromEntries(numbers.map((n, i) => [n, res[i]])) })
      }
      const batches = []
      for (let i = 0; i < numbers.length; i += 30) batches.push(await fedexTrack(numbers.slice(i, i + 30), env))
      return reply({ batches })
    } catch (e) {
      const kind = e instanceof CarrierError ? e.kind : 'transient'
      return reply({ ok: false, error: { kind, message: e.message } }, 200)
    }
  },
}
