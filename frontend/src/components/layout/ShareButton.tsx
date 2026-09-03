import { useState } from 'react'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { Check, Copy, Download, Smartphone } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, isReadOnly, unwrap } from '@/api/client'
import { Button } from '@/components/ui/button'
import { dataFilters, filtersToParams, parseFilters } from '@/lib/filters'
import { HOSTED, apiUrl, authHeaders, getServerUrl } from '@/lib/server'

type Handoff = { lan_url: string | null; public_url: string | null; hosted_ui_url: string | null; auth_required: boolean }

/** Joins a path onto a base that may itself include a path (GitHub Pages: https://user.github.io/repo). */
function joinUrl(base: string, path: string): URL {
  const b = base.endsWith('/') ? base : `${base}/`
  return new URL(path.replace(/^\//, ''), b)
}

/** Which link a phone should open, best first. */
export function buildHandoffLink(h: Handoff, path: string, currentOrigin: string): { url: string; note: string; mode: 'hosted-server' | 'hosted-file' | 'public' | 'lan' | 'local' } {
  if (HOSTED) {
    const server = getServerUrl()
    const u = new URL(path, currentOrigin)
    if (server && !isReadOnly()) {
      u.searchParams.set('server', server)
      return { url: u.toString(), note: 'Opens this site connected to your server.', mode: 'hosted-server' }
    }
    return { url: u.toString(), note: 'Opens this site; pick the snapshot file there.', mode: 'hosted-file' }
  }
  if (h.hosted_ui_url && h.public_url) {
    const u = joinUrl(h.hosted_ui_url, path)
    u.searchParams.set('server', h.public_url)
    return { url: u.toString(), note: 'Works anywhere: opens the hosted site connected to your server.', mode: 'hosted-server' }
  }
  if (h.public_url) return { url: new URL(path, h.public_url).toString(), note: 'Works anywhere via your public server address.', mode: 'public' }
  if (h.hosted_ui_url) {
    // No public server: the phone gets the hosted site plus a snapshot file (two things to send).
    return { url: joinUrl(h.hosted_ui_url, path).toString(), note: 'Send the link and the downloaded snapshot file; open the link on the phone and pick the file.', mode: 'hosted-file' }
  }
  if (h.lan_url) return { url: new URL(path, h.lan_url).toString(), note: 'Works on the same Wi-Fi.', mode: 'lan' }
  return { url: new URL(path, currentOrigin).toString(), note: 'Only works on this machine.', mode: 'local' }
}

async function downloadSnapshot(search: string) {
  const f = parseFilters(new URLSearchParams(search))
  const p = filtersToParams(dataFilters(f))
  const res = await fetch(apiUrl(`/api/snapshot?${p.toString()}`), { headers: authHeaders() })
  if (!res.ok) throw new Error(`Snapshot failed (${res.status})`)
  const blob = await res.blob()
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'shipments.snapshot.json'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return name
}

/**
 * One click: copies the best link for a phone and, when the phone can't reach this server directly,
 * also downloads a snapshot file of the current view. Send both to the phone (AirDrop, Messages, email).
 */
export function ShareButton({ label = 'Send to phone', compact = false }: { label?: string; compact?: boolean }) {
  const loc = useLocation()
  const [copied, setCopied] = useState(false)
  const handoff = useQuery({
    queryKey: ['handoff'],
    queryFn: async () => (await unwrap(await api.GET('/api/handoff'))) as Handoff,
    staleTime: 60_000,
  })
  const onClick = async () => {
    const h = handoff.data ?? { lan_url: null, public_url: null, hosted_ui_url: null, auth_required: false }
    const { url, note, mode } = buildHandoffLink(h, loc.pathname + loc.search, window.location.origin)
    let fileName: string | null = null
    if (mode === 'hosted-file' && !isReadOnly()) {
      try {
        fileName = await downloadSnapshot(loc.search)
      } catch (e) {
        toast.error(`Could not create the snapshot file: ${(e as Error).message}`)
      }
    }
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ url, title: 'Fulfillment Tracker' })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast.success(fileName ? 'Snapshot downloaded and link copied' : 'Link copied', {
        description: fileName ? `Send “${fileName}” and the link to your phone. Open the link, then pick the file.` : `${note}${h.auth_required ? ' The phone will ask for the password once.' : ''}`,
        duration: fileName ? 9000 : 5000,
      })
    } catch {
      toast.message('Copy this link', { description: url, duration: 15000 })
    }
  }
  const Icon = copied ? Check : compact ? Smartphone : handoff.data && !handoff.data.public_url && handoff.data.hosted_ui_url && !HOSTED ? Download : Copy
  return (
    <Button variant="outline" size={compact ? 'icon' : 'sm'} onClick={onClick} title="Send this view to your phone" aria-label={label}>
      <Icon className={copied ? 'h-3.5 w-3.5 text-status-delivered' : compact ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {!compact && (copied ? 'Copied' : label)}
    </Button>
  )
}
