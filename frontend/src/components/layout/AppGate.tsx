import { createContext, useContext, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, authEvents, resetApiClient, unwrap } from '@/api/client'
import { ConnectScreen } from '@/components/layout/ConnectScreen'
import { HOSTED, getDataMode, getServerUrl, setDataMode, setToken } from '@/lib/server'
import { clearSnapshot, loadDemoSnapshot, loadSnapshot, saveSnapshot, setCurrentSnapshot, type Snapshot } from '@/lib/snapshot'
import { LocalDb } from '@/local/db'
import { clearPendingUploads } from '@/local/server'
import { setLocalDb } from '@/local/state'
import { useIsMobile } from '@/lib/useIsMobile'

type Phase = 'booting' | 'connect' | 'login' | 'ready'

export type DataSource = 'server' | 'snapshot' | 'demo' | 'local'

export interface SnapshotActions {
  /** What the app is currently showing. */
  source: DataSource
  /** True when this browser holds the user's own data (even while the demo or a snapshot is open). */
  hasLocalData: boolean
  /** Drop the snapshot/demo/browser data and talk to a server. */
  leaveSnapshot: () => Promise<void>
  openSnapshot: (s: Snapshot) => Promise<void>
  openFilePicker: () => void
  /** Switch to (or start) the user's own data kept in this browser. */
  startLocal: () => Promise<void>
  /** Show the bundled demo without touching the user's data. */
  openDemo: () => Promise<void>
}

export const SnapshotContext = createContext<SnapshotActions | null>(null)
export function useSnapshotActions() {
  return useContext(SnapshotContext)
}

/** Decides whether to show the app, the connect screen (hosted build) or the login screen (401). */
export function AppGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const mobile = useIsMobile()
  const [phase, setPhase] = useState<Phase>('booting')
  const [source, setSource] = useState<DataSource>('server')
  const [hasLocalData, setHasLocalData] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [probeKey, setProbeKey] = useState(0)

  const activateLocal = async () => {
    const db = await LocalDb.open()
    setCurrentSnapshot(null)
    setLocalDb(db)
    setHasLocalData(true)
    setSource('local')
    resetApiClient()
  }
  const activateSnapshot = (snap: Snapshot, demo: boolean) => {
    clearPendingUploads()
    setLocalDb(null)
    setCurrentSnapshot(snap)
    setSource(demo ? 'demo' : 'snapshot')
    resetApiClient()
  }

  // Boot: restore the saved data source (hosted) or go straight to the server.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const mode = getDataMode()
      const local = await LocalDb.exists()
      if (!alive) return
      setHasLocalData(local)
      if (mode === 'local') {
        await activateLocal()
        if (!alive) return
        setPhase('ready')
        return
      }
      if (mode === 'snapshot') {
        const snap = await loadSnapshot()
        if (!alive) return
        if (snap) {
          activateSnapshot(snap, false)
          setPhase('ready')
          return
        }
        setDataMode('server')
      }
      if (!HOSTED || getServerUrl()) {
        setSource('server')
        setPhase('ready')
        return
      }
      // Hosted site with nothing configured: phones get the connect screen (that is where a handoff
      // lands); desktops open the app on the bundled demo data, with the other options in the banner.
      if (mobile) {
        setPhase('connect')
        return
      }
      try {
        const demo = await loadDemoSnapshot()
        if (!alive) return
        activateSnapshot(demo, true)
        setPhase('ready')
      } catch {
        if (alive) setPhase('connect')
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const probe = useQuery({
    queryKey: ['gate', getServerUrl(), probeKey],
    queryFn: async () => unwrap(await api.GET('/api/config')),
    enabled: phase === 'ready',
    retry: false,
    staleTime: Infinity,
  })
  useEffect(() => {
    const on = () => setPhase('login')
    authEvents.addEventListener('unauthorized', on)
    return () => authEvents.removeEventListener('unauthorized', on)
  }, [])
  useEffect(() => {
    if (!probe.error) return
    const status = (probe.error as { status?: number }).status
    if (status === 401) {
      setToken(null)
      setPhase('login')
    } else if (HOSTED) {
      setError('Could not reach the server saved in this browser. Check the address, or open a snapshot file instead.')
      setPhase('connect')
    }
  }, [probe.error])

  const done = () => {
    setError(undefined)
    qc.clear()
    setProbeKey((k) => k + 1)
    setPhase('ready')
  }
  const openSnapshot = async (snap: Snapshot) => {
    await saveSnapshot(snap)
    activateSnapshot(snap, false)
    setDataMode('snapshot')
    done()
  }
  const startLocal = async () => {
    await activateLocal()
    setDataMode('local')
    done()
  }
  const openDemo = async () => {
    const demo = await loadDemoSnapshot()
    activateSnapshot(demo, true)
    // Not persisted: reloading brings back whatever the user was using before.
    done()
  }
  const leaveSnapshot = async () => {
    await clearSnapshot()
    clearPendingUploads()
    setCurrentSnapshot(null)
    setLocalDb(null)
    setSource('server')
    setDataMode('server')
    resetApiClient()
    qc.clear()
    setPhase(!HOSTED || getServerUrl() ? 'ready' : 'connect')
    setProbeKey((k) => k + 1)
  }
  const openFilePicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      const { readSnapshotFile } = await import('@/lib/snapshot')
      await openSnapshot(await readSnapshotFile(f))
    }
    input.click()
  }

  if (phase === 'booting') return null
  if (phase === 'connect') return <ConnectScreen mode="connect" initialError={error} onDone={done} onSnapshot={openSnapshot} onLocal={startLocal} hasLocalData={hasLocalData} />
  if (phase === 'login') return <ConnectScreen mode="login" onDone={done} onSnapshot={openSnapshot} />
  if (probe.isLoading) return null
  return <SnapshotContext.Provider value={{ source, hasLocalData, leaveSnapshot, openSnapshot, openFilePicker, startLocal, openDemo }}>{children}</SnapshotContext.Provider>
}
