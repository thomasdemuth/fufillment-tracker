import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, authEvents, resetApiClient, unwrap } from '@/api/client'
import { ConnectScreen } from '@/components/layout/ConnectScreen'
import { HOSTED, getDataMode, getServerUrl, setDataMode, setToken } from '@/lib/server'
import { clearSnapshot, loadSnapshot, saveSnapshot, setCurrentSnapshot, type Snapshot } from '@/lib/snapshot'

type Phase = 'booting' | 'connect' | 'login' | 'ready'

/** Decides whether to show the app, the connect screen (hosted build) or the login screen (401). */
export function AppGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
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
      setPhase(!HOSTED || getServerUrl() ? 'ready' : 'connect')
    })()
    return () => {
      alive = false
    }
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

  if (phase === 'booting') return null
  if (phase === 'connect') return <ConnectScreen mode="connect" initialError={error} onDone={done} onSnapshot={openSnapshot} />
  if (phase === 'login') return <ConnectScreen mode="login" onDone={done} onSnapshot={openSnapshot} />
  if (probe.isLoading) return null
  return <SnapshotContext.Provider value={{ leaveSnapshot, openSnapshot }}>{children}</SnapshotContext.Provider>
}

import { createContext, useContext } from 'react'
export const SnapshotContext = createContext<{ leaveSnapshot: () => Promise<void>; openSnapshot: (s: Snapshot) => Promise<void> } | null>(null)
export function useSnapshotActions() {
  return useContext(SnapshotContext)
}
