import { useState } from 'react'
import { Database, FileJson, Link2, Lock, Smartphone, UploadCloud } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { getServerUrl, normalizeServerUrl, setServerUrl, setToken } from '@/lib/server'
import { readSnapshotFile, type Snapshot } from '@/lib/snapshot'
import { useIsMobile } from '@/lib/useIsMobile'
import { resetApiClient } from '@/api/client'
import { cn } from '@/lib/utils'

type Mode = 'connect' | 'login'

/**
 * Hosted build only: this site is just the interface. Data comes either from a snapshot file made by
 * "Send to phone" on the desktop app, or from the user's own server. Nothing is sent anywhere else.
 */
export function ConnectScreen({
  mode,
  initialError,
  onDone,
  onSnapshot,
  onLocal,
  hasLocalData = false,
}: {
  mode: Mode
  initialError?: string
  onDone: () => void
  onSnapshot?: (s: Snapshot) => Promise<void>
  /** Keep data in this browser instead (hosted build, no server). */
  onLocal?: () => Promise<void>
  hasLocalData?: boolean
}) {
  const mobile = useIsMobile()
  const [server, setServer] = useState(getServerUrl())
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileBusy, setFileBusy] = useState(false)
  const [over, setOver] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const base = normalizeServerUrl(server)
    if (!base) {
      setError('Enter your server address')
      setBusy(false)
      return
    }
    try {
      const headers: Record<string, string> = password ? { Authorization: `Bearer ${password}` } : {}
      const r = await fetch(`${base}/api/auth/check`, { headers, mode: 'cors' })
      if (r.status === 401) {
        setError(password ? 'Wrong password' : 'This server requires a password')
        setBusy(false)
        return
      }
      if (!r.ok) throw new Error(`Server answered ${r.status}`)
      setServerUrl(base)
      setToken(password || null)
      resetApiClient()
      onDone()
    } catch (err) {
      const msg = (err as Error).message
      setError(
        /Failed to fetch|NetworkError|Load failed/i.test(msg)
          ? 'Could not reach that server. Check the address, that it is running, and that it allows this site (ALLOWED_ORIGINS). An http:// address cannot be used from this https:// page: use a Cloudflare Tunnel, or open the server directly on your network.'
          : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  const pickFile = async (f: File | undefined) => {
    if (!f || !onSnapshot) return
    setFileBusy(true)
    setFileError(null)
    try {
      await onSnapshot(await readSnapshotFile(f))
    } catch (err) {
      setFileError((err as Error).message)
    } finally {
      setFileBusy(false)
    }
  }

  const showFile = !!onSnapshot && mode === 'connect'
  const showLocal = !!onLocal && mode === 'connect'
  const [localBusy, setLocalBusy] = useState(false)
  const startLocal = async () => {
    if (!onLocal) return
    setLocalBusy(true)
    try {
      await onLocal()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLocalBusy(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-bg p-4 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Logo className="h-9 w-9" />
        <div>
          <div className="text-[17px] font-semibold tracking-[-0.01em]">Fulfillment Tracker</div>
          <div className="text-[12px] text-muted">Interface only. Your shipments stay on your own computer or in the file you open.</div>
        </div>
      </div>
      {showLocal && (
        <button
          onClick={startLocal}
          disabled={localBusy}
          data-testid="use-this-browser"
          className="mb-4 flex w-full max-w-4xl items-center gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-pop transition-colors hover:border-accent hover:bg-panel-2/60"
        >
          <Database className="h-5 w-5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{hasLocalData ? 'Open my data in this browser' : 'Keep my data in this browser'}</span>
            <span className="block text-[12.5px] text-text-2">
              {hasLocalData
                ? 'Continue with the shipments already saved on this device.'
                : 'Upload spreadsheets right here, with no server. Everything stays on this device and is never uploaded anywhere.'}
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-medium text-accent">{localBusy ? 'Opening…' : 'Start →'}</span>
        </button>
      )}
      <div className={cn('grid w-full gap-4', showFile ? 'max-w-4xl md:grid-cols-2' : 'max-w-md')}>
        {showFile && (
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              pickFile(e.dataTransfer.files?.[0])
            }}
            className={cn(
              'flex cursor-pointer flex-col rounded-card border border-border bg-panel p-5 shadow-pop transition-colors hover:bg-panel-2/60',
              over && 'border-accent bg-accent-soft',
            )}
          >
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} data-testid="snapshot-input" />
            <div className="flex items-center gap-2 text-[15px] font-semibold">
              <FileJson className="h-4 w-4 text-accent" /> Open a snapshot file
            </div>
            <p className="mt-1 text-[12.5px] text-text-2">The file that “Send to phone” saved on your computer. Works with no server, and stays in this browser.</p>
            <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed border-border-strong/60 bg-bg px-4 py-8 text-center">
              <UploadCloud className={cn('h-8 w-8', over ? 'text-accent' : 'text-muted')} />
              <div className="text-[14px] font-medium">{fileBusy ? 'Opening…' : mobile ? 'Tap to choose the file' : 'Drop the .snapshot.json file here'}</div>
              {!mobile && <div className="text-[12px] text-muted">or click to browse</div>}
            </div>
            {fileError && <div className="mt-3 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger">{fileError}</div>}
            <p className="mt-3 text-[11.5px] text-muted">Read-only. To see newer tracking, make a new snapshot and open it here.</p>
          </label>
        )}

        <form onSubmit={submit} className="flex flex-col rounded-card border border-border bg-panel p-5 shadow-pop">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <Link2 className="h-4 w-4 text-accent" /> {mode === 'login' ? 'Sign in to your server' : showFile ? 'Or connect to your server' : 'Connect to your server'}
          </div>
          <p className="mt-1 text-[12.5px] text-text-2">{mode === 'login' ? 'This server is protected with a password.' : 'Live data, if your server has a public https:// address (for example a Cloudflare Tunnel).'}</p>
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <Label>Server address</Label>
              <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://tracker.example.com" autoCapitalize="none" autoCorrect="off" inputMode="url" disabled={mode === 'login'} />
            </label>
            <label className="flex flex-col gap-1">
              <Label className="flex items-center gap-1">
                <Lock className="h-3 w-3" /> Password {mode === 'connect' && <span className="font-normal">(only if you set APP_PASSWORD)</span>}
              </Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
          </div>
          {error && <div className="mt-3 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger">{error}</div>}
          <Button type="submit" variant={showFile ? 'outline' : 'default'} className="mt-4 w-full" disabled={busy}>
            {busy ? 'Connecting…' : mode === 'login' ? 'Sign in' : 'Connect'}
          </Button>
          <div className="mt-auto flex items-start gap-2 pt-4 text-[11.5px] text-muted">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>On your home network, open the server's own address instead (for example http://192.168.x.x:8000).</span>
          </div>
        </form>
      </div>
    </div>
  )
}
