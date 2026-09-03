/**
 * Snapshot mode: the UI runs entirely from a file exported by the desktop app ("Send to phone").
 * No server, no network for data. The file is kept in IndexedDB so reopening the site keeps it.
 */
import type { components } from '@/api/schema'

export type SnapshotShipment = components['schemas']['ShipmentDetail'] & { reasons: string[] }
export interface Snapshot {
  format: 'fulfillment-tracker-snapshot'
  version: number
  exported_at: string
  app_name: string
  stuck_days: number
  map_style_url: string
  map_style_url_dark: string
  filters: Record<string, unknown>
  uploads: { id: number; filename: string; created_at: string; count: number }[]
  shipments: SnapshotShipment[]
}

const DB = 'ft-snapshot'
const STORE = 'kv'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveSnapshot(s: Snapshot): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(s, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as Snapshot) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* ignore */
  }
}

export function parseSnapshot(text: string): Snapshot {
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    throw new Error('That file is not a snapshot (not valid JSON).')
  }
  const s = j as Partial<Snapshot>
  if (!s || s.format !== 'fulfillment-tracker-snapshot' || !Array.isArray(s.shipments)) {
    throw new Error('That file is not a Fulfillment Tracker snapshot. Use “Send to phone” on the desktop app to create one.')
  }
  if ((s.version ?? 0) > 1) throw new Error('This snapshot was made by a newer version of the app.')
  return s as Snapshot
}

export async function readSnapshotFile(file: File): Promise<Snapshot> {
  return parseSnapshot(await file.text())
}

/** In-memory current snapshot (set by the gate). */
let current: Snapshot | null = null
export function getSnapshot(): Snapshot | null {
  return current
}
export function setCurrentSnapshot(s: Snapshot | null) {
  current = s
}
