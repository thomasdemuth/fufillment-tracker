import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, authEvents, resetApiClient, unwrap } from '@/api/client'
import { ConnectScreen } from '@/components/layout/ConnectScreen'
import { HOSTED, getDataMode, getServerUrl, setDataMode, setToken } from '@/lib/server'
import { clearSnapshot, loadDemoSnapshot, loadSnapshot, saveSnapshot, setCurrentSnapshot, type Snapshot } from '@/lib/snapshot'
import { useIsMobile } from '@/lib/useIsMobile'

type Phase = 'booting' | 'connect' | 'login' | 'ready'

/** Decides whether to show the app, the connect screen (hosted build) or the login screen (401). */
export function AppGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const mobile = useIsMobile()
  const [phase, setPhase] = useState<Phase>('booting')
  const [error, setError] = useState<string | undefined>()
  const [probeKey, setProbeKey] = useState(0)

  // Boot: restore a saved snapshot (hosted) or go straight to the server.
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (getDataMode() === 'snapshot') {
        const snap = await loadSnapshot()
        if (!alive) return
        if (snap) {
          setCurrentSnapshot(snap)
          resetApiClient()
          setPhase('ready')
          return
        }
        setDataMode('server')
      }
      if (!HOSTED || getServerUrl()) {
        setPhase('ready')
        return
      }
      // Hosted site with nothing configured: phones get the connect screen (that is where a handoff
      // lands); desktops open the app on the bundled demo data, with the connect options in the banner.
      if (mobile) {
        setPhase('connect')
        return
      }
      try {
        const demo = await loadDemoSnapshot()
        if (!alive) return
        setCurrentSnapshot(demo)
        resetApiClient()
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
    setCurrentSnapshot(snap)
    setDataMode('snapshot')
    resetApiClient()
    done()
  }
  const leaveSnapshot = async () => {
    await clearSnapshot()
    setCurrentSnapshot(null)
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
  if (phase === 'connect') return <ConnectScreen mode="connect" initialError={error} onDone={done} onSnapshot={openSnapshot} />
  if (phase === 'login') return <ConnectScreen mode="login" onDone={done} onSnapshot={openSnapshot} />
  if (probe.isLoading) return null
  return <SnapshotContext.Provider value={{ leaveSnapshot, openSnapshot, openFilePicker }}>{children}</SnapshotContext.Provider>
}

import { createContext, useContext } from 'react'
export const SnapshotContext = createContext<{ leaveSnapshot: () => Promise<void>; openSnapshot: (s: Snapshot) => Promise<void>; openFilePicker: () => void } | null>(null)
export function useSnapshotActions() {
  return useContext(SnapshotContext)
}
