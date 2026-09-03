import { useState } from 'react'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import { Check, Copy, Smartphone } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import { Button } from '@/components/ui/button'
import { HOSTED, getServerUrl } from '@/lib/server'

type Handoff = { lan_url: string | null; public_url: string | null; hosted_ui_url: string | null; auth_required: boolean }

/** Builds the best link to open the current view on another device. */
export function buildHandoffLink(h: Handoff, path: string, currentOrigin: string): { url: string; note: string } {
  // On the hosted UI, the phone should open this same site pointed at the same server.
  if (HOSTED) {
    const server = getServerUrl()
    const u = new URL(path, currentOrigin)
    if (server) u.searchParams.set('server', server)
    return { url: u.toString(), note: 'Opens this site on the phone, connected to your server.' }
  }
  // Self-hosted UI: prefer the hosted UI + public server (works anywhere), then the public server alone,
  // then the LAN address (same Wi-Fi only).
  if (h.hosted_ui_url && h.public_url) {
    const u = new URL(path, h.hosted_ui_url)
    u.searchParams.set('server', h.public_url)
    return { url: u.toString(), note: 'Works anywhere: opens the hosted site pointed at your server.' }
  }
  if (h.public_url) return { url: new URL(path, h.public_url).toString(), note: 'Works anywhere via your public server address.' }
  if (h.lan_url) return { url: new URL(path, h.lan_url).toString(), note: 'Works on the same Wi-Fi. Set PUBLIC_URL to make links work anywhere.' }
  return { url: new URL(path, currentOrigin).toString(), note: 'Only works on this machine. Set PUBLIC_URL or HOSTED_UI_URL to share.' }
}

export function ShareButton({ label = 'Copy link', compact = false }: { label?: string; compact?: boolean }) {
  const loc = useLocation()
  const [copied, setCopied] = useState(false)
  const handoff = useQuery({
    queryKey: ['handoff'],
    queryFn: async () => (await unwrap(await api.GET('/api/handoff'))) as Handoff,
    staleTime: 60_000,
  })
  const onClick = async () => {
    const h = handoff.data ?? { lan_url: null, public_url: null, hosted_ui_url: null, auth_required: false }
    const { url, note } = buildHandoffLink(h, loc.pathname + loc.search, window.location.origin)
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ url, title: 'Fulfillment Tracker' })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast.success('Link copied', { description: `${note}${h.auth_required ? ' The phone will ask for the password once.' : ''}` })
    } catch {
      toast.message('Copy this link', { description: url, duration: 15000 })
    }
  }
  return (
    <Button variant="outline" size={compact ? 'icon' : 'sm'} onClick={onClick} title="Copy a link to open this view on your phone" aria-label={label}>
      {copied ? <Check className="h-3.5 w-3.5 text-status-delivered" /> : compact ? <Smartphone className="h-4 w-4" /> : <Copy className="h-3.5 w-3.5" />}
      {!compact && (copied ? 'Copied' : label)}
    </Button>
  )
}
