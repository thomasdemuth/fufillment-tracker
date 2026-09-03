import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, authEvents, unwrap } from '@/api/client'
import { ConnectScreen } from '@/components/layout/ConnectScreen'
import { HOSTED, getServerUrl, setToken } from '@/lib/server'

/** Decides whether to show the app, the connect screen (hosted build) or the login screen (401). */
export function AppGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [hasServer, setHasServer] = useState(() => !HOSTED || !!getServerUrl())
  const [unauthorized, setUnauthorized] = useState(false)
  const probe = useQuery({
    queryKey: ['gate', getServerUrl()],
    queryFn: async () => unwrap(await api.GET('/api/config')),
    enabled: hasServer,
    retry: false,
    staleTime: Infinity,
  })
  useEffect(() => {
    const on = () => setUnauthorized(true)
    authEvents.addEventListener('unauthorized', on)
    return () => authEvents.removeEventListener('unauthorized', on)
  }, [])
  const done = () => {
    setHasServer(true)
    setUnauthorized(false)
    qc.clear()
  }
  if (!hasServer) return <ConnectScreen mode="connect" onDone={done} />
  if (unauthorized || (probe.error && (probe.error as { status?: number }).status === 401)) {
    setToken(null)
    return <ConnectScreen mode="login" onDone={done} />
  }
  if (probe.error && HOSTED) {
    return <ConnectScreen mode="connect" initialError="Could not reach the server saved in this browser. Check the address or the server." onDone={done} />
  }
  if (probe.isLoading) return null
  return <>{children}</>
}
