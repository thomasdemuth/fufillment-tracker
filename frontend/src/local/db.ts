/**
 * "This browser" data mode: a small read-write database kept in IndexedDB, so the hosted site can hold
 * the user's own shipments without any server. Nothing here is ever sent anywhere; the GitHub Pages
 * build only serves static files.
 */
import type { components } from '@/api/schema'

export type EventOut = components['schemas']['EventOut']
export type NoteOut = components['schemas']['NoteOut']
export type TagOut = components['schemas']['TagOut']
export type JobOut = components['schemas']['JobOut']

export interface LocalEvent extends EventOut {
  dedupe_key: string
}

export interface LocalShipment {
  id: number
  tracking_number: string
  carrier: string
  carrier_confidence: number
  carrier_locked: boolean
  recipient_name: string | null
  company: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  email: string | null
  phone: string | null
  order_ref: string | null
  ship_date: string | null
  status: string
  status_raw: string | null
  status_code: string | null
  attention_flag: string | null
  expected_delivery: string | null
  delivered_at: string | null
  first_event_at: string | null
  last_event_at: string | null
  last_event_desc: string | null
  last_event_place: string | null
  dest_lat: number | null
  dest_lng: number | null
  geocode_precision: string
  geocode_source: string | null
  origin_postal_code: string | null
  last_polled_at: string | null
  poll_error_count: number
  poll_last_error: string | null
  created_at: string
  updated_at: string
  tag_ids: number[]
  upload_refs: { upload_id: number; row_number: number }[]
  events: LocalEvent[]
  notes: NoteOut[]
}

export interface LocalUpload {
  id: number
  filename: string
  size_bytes: number
  created_at: string
  committed_at: string | null
  status: 'pending' | 'committed' | 'failed'
  sheet_name: string | null
  header_row: number
  column_mapping: Record<string, string> | null
  preset_id: number | null
  geocode_mode: string
  default_carrier: string | null
  row_count: number
  imported_count: number
  duplicate_count: number
  skipped_count: number
  errors: { row: number; error: string }[] | null
}

export interface LocalPreset {
  id: number
  name: string
  mapping: Record<string, string>
  header_signature: string | null
  created_at: string
  last_used_at: string | null
}

export interface LocalJob extends JobOut {
  ids: number[]
  cancel_requested: boolean
}

export interface LocalSettings {
  stuck_days: number
  origin_postal_code: string | null
  map_style_url: string | null
  map_style_url_dark: string | null
}

export interface LocalData {
  format: 'fulfillment-tracker-local'
  version: 1
  created_at: string
  shipments: LocalShipment[]
  uploads: LocalUpload[]
  tags: TagOut[]
  presets: LocalPreset[]
  jobs: LocalJob[]
  settings: LocalSettings
  seq: Record<string, number>
}

export const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'
export const DEFAULT_MAP_STYLE_DARK = 'https://tiles.openfreemap.org/styles/fiord'

/** Naive ISO timestamp (no zone), the same shape the backend stores. */
export function nowIso(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19)
}

export function emptyData(): LocalData {
  return {
    format: 'fulfillment-tracker-local',
    version: 1,
    created_at: nowIso(),
    shipments: [],
    uploads: [],
    tags: [],
    presets: [],
    jobs: [],
    settings: { stuck_days: 7, origin_postal_code: null, map_style_url: null, map_style_url_dark: null },
    seq: {},
  }
}

const DB = 'ft-local'
const STORE = 'kv'
const KEY = 'data'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(): Promise<LocalData | null> {
  const db = await openIdb()
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as LocalData) ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

async function idbPut(data: LocalData | null): Promise<void> {
  const db = await openIdb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      if (data) tx.objectStore(STORE).put(data, KEY)
      else tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export class LocalDb {
  data: LocalData
  /** bumps on every write; readers can cache derived views per version */
  version = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private persist: (d: LocalData | null) => Promise<void>

  constructor(data: LocalData, persist: (d: LocalData | null) => Promise<void> = idbPut) {
    this.data = data
    this.persist = persist
  }

  static async open(): Promise<LocalDb> {
    let data: LocalData | null = null
    try {
      data = await idbGet()
    } catch {
      data = null
    }
    if (!data || data.format !== 'fulfillment-tracker-local') data = emptyData()
    return new LocalDb(data)
  }

  static async exists(): Promise<boolean> {
    try {
      const d = await idbGet()
      return !!d && d.format === 'fulfillment-tracker-local'
    } catch {
      return false
    }
  }

  static async destroy(): Promise<void> {
    try {
      await idbPut(null)
    } catch {
      /* ignore */
    }
  }

  nextId(kind: string): number {
    const n = (this.data.seq[kind] ?? 0) + 1
    this.data.seq[kind] = n
    return n
  }

  /** Mark the data changed and persist it shortly (writes are coalesced). */
  touch(): void {
    this.version++
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), 250)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      await this.persist(this.data)
    } catch (e) {
      console.error('Could not save to this browser', e)
    }
  }

  /** Delete everything (optionally keeping settings). */
  async wipe(keepSettings: boolean): Promise<void> {
    const settings = this.data.settings
    this.data = emptyData()
    if (keepSettings) this.data.settings = settings
    this.version++
    await this.flush()
  }

  shipment(id: number): LocalShipment | undefined {
    return this.data.shipments.find((s) => s.id === id)
  }
  upload(id: number): LocalUpload | undefined {
    return this.data.uploads.find((u) => u.id === id)
  }
  /** Approximate size of the stored data, for the privacy page. */
  sizeBytes(): number {
    try {
      return new Blob([JSON.stringify(this.data)]).size
    } catch {
      return 0
    }
  }
}
