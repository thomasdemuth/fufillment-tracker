import { useState } from 'react'
import { FileJson, Link2, Lock, Smartphone } from 'lucide-react'
import { readSnapshotFile, type Snapshot } from '@/lib/snapshot'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { getServerUrl, normalizeServerUrl, setServerUrl, setToken } from '@/lib/server'
import { resetApiClient } from '@/api/client'

type Mode = 'connect' | 'login'

/**
 * Hosted build only: this site is just the UI. The data stays on the user's own server, so we ask
 * which server to talk to (and the password, if one is set). Nothing is sent anywhere else.
 */
export function ConnectScreen({ mode, initialError, onDone, onSnapshot }: { mode: Mode; initialError?: string; onDone: () => void; onSnapshot?: (s: Snapshot) => Promise<void> }) {
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileBusy, setFileBusy] = useState(false)
  const [server, setServer] = useState(getServerUrl())
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

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
          ? 'Could not reach that server. Check the address, that it is running, and that it allows this site (ALLOWED_ORIGINS). If the address starts with http:// the browser will block it from this https:// page: use a Cloudflare Tunnel or open the app directly on your LAN instead.'
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

  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4 sm:p-6">
      <div className="flex w-full max-w-md flex-col gap-3">
      {onSnapshot && mode === 'connect' && (
        <label className="block cursor-pointer rounded-card border border-border bg-panel p-5 shadow-pop transition-colors hover:bg-panel-2 active:bg-panel-2">
          <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} data-testid="snapshot-input" />
          <div className="flex items-center gap-3">
            <Logo className="h-9 w-9" />
            <div>
              <div className="text-[15px] font-semibold">Open a snapshot file</div>
              <div className="text-[12px] text-muted">The file “Send to phone” made on your computer</div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 rounded-control border border-dashed border-border-strong/70 bg-bg px-3 py-4 text-[13px] text-text-2">
            <FileJson className="h-4 w-4 text-accent" /> {fileBusy ? 'Opening…' : 'Tap to choose the .snapshot.json file'}
          </div>
          {fileError && <div className="mt-2 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger">{fileError}</div>}
          <p className="mt-2 text-[11.5px] text-muted">Everything stays in this browser. Nothing is uploaded anywhere.</p>
        </label>
      )}
      <form onSubmit={submit} className="w-full rounded-card border border-border bg-panel p-5 shadow-pop">
        <div className="flex items-center gap-3">
          {(mode === 'login' || !onSnapshot) && <Logo className="h-9 w-9" />}
          <div>
            <div className="text-[15px] font-semibold">{mode === 'login' ? 'Sign in to your server' : 'Or connect to your server'}</div>
            <div className="text-[12px] text-muted">{mode === 'login' ? 'This server is protected with a password.' : 'Live data, if your server is reachable from here'}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <Label className="flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Server address
            </Label>
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
        <Button type="submit" className="mt-4 w-full" disabled={busy}>
          {busy ? 'Connecting…' : mode === 'login' ? 'Sign in' : 'Connect'}
        </Button>
        <div className="mt-4 flex items-start gap-2 rounded-control bg-panel-2 px-3 py-2 text-[11.5px] text-muted">
          <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Connecting to a server needs an https:// address (a Cloudflare Tunnel or similar). On home Wi-Fi, open the server's own address instead.</span>
        </div>
      </form>
      </div>
    </div>
  )
}
