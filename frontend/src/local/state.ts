/** The currently open in-browser database (set by AppGate), kept apart from server.ts to avoid import cycles. */
import type { LocalDb } from '@/local/db'

let current: LocalDb | null = null
export function getLocalDb(): LocalDb | null {
  return current
}
export function setLocalDb(db: LocalDb | null) {
  current = db
}
