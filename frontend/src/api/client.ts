import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'
import { apiUrl, authHeaders, getServerUrl } from '@/lib/server'
import { getSnapshot } from '@/lib/snapshot'
import { snapshotFetch } from '@/api/localServer'
import { getLocalDb } from '@/local/state'
import { localFetch } from '@/local/server'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fires when the server answers 401 so the app can show the login screen. */
export const authEvents = new EventTarget()

const middleware: Middleware = {
  async onRequest({ request }) {
    for (const [k, v] of Object.entries(authHeaders())) request.headers.set(k, v)
    return request
  },
  async onResponse({ response }) {
    if (response.status === 401) authEvents.dispatchEvent(new Event('unauthorized'))
    return response
  },
}

/** The fetch() to use for the active data source: snapshot file, this browser's database, or the real network. */
export function dataFetch(): typeof fetch | null {
  const snap = getSnapshot()
  if (snap) return snapshotFetch(snap)
  const db = getLocalDb()
  if (db) return localFetch(db)
  return null
}

function makeClient() {
  const local = dataFetch()
  const c = local
    ? createClient<paths>({ baseUrl: window.location.origin, fetch: local })
    : createClient<paths>({ baseUrl: getServerUrl() || '/', credentials: getServerUrl() ? 'omit' : 'same-origin' })
  c.use(middleware)
  return c
}

/** Snapshot files cannot be changed. */
export function isReadOnly(): boolean {
  return getSnapshot() != null
}

/** Data lives in this browser (no server). */
export function isLocal(): boolean {
  return getSnapshot() == null && getLocalDb() != null
}

/**
 * fetch() for API calls made outside the typed client (file upload, downloads): routed to the snapshot /
 * browser database when one is active, otherwise to the configured server with the auth header.
 */
export async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const local = dataFetch()
  if (local) return local(new URL(path, window.location.origin).toString(), init)
  const headers = new Headers(init.headers)
  for (const [k, v] of Object.entries(authHeaders())) headers.set(k, v)
  const res = await fetch(apiUrl(path), { ...init, headers })
  if (res.status === 401) authEvents.dispatchEvent(new Event('unauthorized'))
  return res
}

let _api = makeClient()
export const api: ReturnType<typeof makeClient> = new Proxy({} as ReturnType<typeof makeClient>, {
  get(_t, prop) {
    return (_api as unknown as Record<PropertyKey, unknown>)[prop]
  },
})

/** Rebuild the client after the server URL changes (hosted mode). */
export function resetApiClient() {
  _api = makeClient()
}

export function errorMessage(err: unknown): string {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'detail' in err) {
    const d = (err as { detail: unknown }).detail
    if (typeof d === 'string') return d
    if (Array.isArray(d)) return d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String(x.msg) : String(x))).join('; ')
    return JSON.stringify(d)
  }
  if (err instanceof Error) return err.message
  return String(err)
}

/** Unwraps an openapi-fetch result, throwing on error so React Query handles it. */
export function unwrap<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.error !== undefined || !res.response.ok) {
    throw new ApiError(res.response.status, errorMessage(res.error))
  }
  return res.data as T
}
