/**
 * Which server the UI talks to.
 *
 * - Self-hosted build (served by the backend itself): same origin, nothing to configure.
 * - Hosted build (Cloudflare Pages, VITE_HOSTED=1): the user's own server URL is stored in this browser.
 *   A handoff link can carry it as `?server=https://...` so a phone connects with one tap.
 *
 * Credentials (the APP_PASSWORD, sent as a bearer token) are also kept only in this browser.
 */

export const HOSTED = import.meta.env.VITE_HOSTED === '1'

const KEY_BASE = 'ft.server'
const KEY_TOKEN = 'ft.token'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function normalizeServerUrl(v: string): string {
  let s = v.trim().replace(/\/+$/, '')
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  return s
}

/** Consume `?server=` / `?token=` from the URL (handoff link) and store them. Returns true if anything was applied. */
export function applyHandoffParams(): boolean {
  if (typeof window === 'undefined') return false
  const url = new URL(window.location.href)
  const server = url.searchParams.get('server')
  const token = url.searchParams.get('token')
  if (!server && !token) return false
  if (server) write(KEY_BASE, normalizeServerUrl(server))
  if (token) write(KEY_TOKEN, token)
  url.searchParams.delete('server')
  url.searchParams.delete('token')
  window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash)
  return true
}

export function getServerUrl(): string {
  if (!HOSTED) return ''
  return read(KEY_BASE) ?? (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
}

/**
 * Where the data comes from:
 * - server: the backend (self-hosted build) or the server URL saved in this browser (hosted build)
 * - snapshot: a read-only file exported by "Send to phone" (or the bundled demo)
 * - local: the user's own data kept in this browser's IndexedDB (hosted build, no server needed)
 */
export type DataMode = 'server' | 'snapshot' | 'local'
const KEY_MODE = 'ft.mode'
export function getDataMode(): DataMode {
  const v = read(KEY_MODE)
  return v === 'snapshot' || v === 'local' ? v : 'server'
}
export function setDataMode(m: DataMode) {
  write(KEY_MODE, m === 'server' ? null : m)
}

export function setServerUrl(v: string | null) {
  write(KEY_BASE, v ? normalizeServerUrl(v) : null)
}

export function getToken(): string | null {
  return read(KEY_TOKEN)
}

export function setToken(v: string | null) {
  write(KEY_TOKEN, v)
}

/** Absolute URL for an API path, on whichever server is configured. */
export function apiUrl(path: string): string {
  const base = getServerUrl()
  return base ? `${base}${path}` : path
}

export function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

/** Static asset path (geo files, blank styles) always comes from the UI's own origin, under the build's base path. */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
