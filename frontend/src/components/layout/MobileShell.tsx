import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { AlertTriangle, LayoutList, Map, MoreHorizontal, Settings, ShieldCheck, Upload } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/AppShell'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { SnapshotBanner } from '@/components/layout/SnapshotBanner'
import { ShareButton } from '@/components/layout/ShareButton'
import { Sheet } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/map', label: 'Map', icon: Map },
  { to: '/board', label: 'Board', icon: LayoutList },
  { to: '/attention', label: 'Attention', icon: AlertTriangle },
  { to: '/uploads', label: 'Uploads', icon: Upload },
]

export function MobileShell() {
  const [more, setMore] = useState(false)
  const loc = useLocation()
  const moreActive = loc.pathname.startsWith('/settings') || loc.pathname.startsWith('/privacy')
  return (
    <div className="flex h-full flex-col bg-bg">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SnapshotBanner />
        <Outlet />
      </main>
      <nav className="shrink-0 border-t border-border bg-panel" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cn('flex h-[54px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-muted', isActive && 'text-accent')}>
              {({ isActive }) => (
                <>
                  <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.75} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className={cn('flex h-[54px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-muted', moreActive && 'text-accent')}>
            <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={1.75} />
            More
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="flex flex-col gap-1">
          {[
            { to: '/settings', label: 'Settings', icon: Settings },
            { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMore(false)} className="flex items-center gap-3 rounded-control px-3 py-3 text-[14px] hover:bg-panel-2">
              <Icon className="h-4.5 w-4.5 text-muted" /> {label}
            </NavLink>
          ))}
          <div className="mt-2 flex items-center justify-between rounded-control bg-panel-2 px-3 py-2 text-[13px]">
            <span className="flex items-center gap-2">
              <Logo className="h-5 w-5" /> Theme
            </span>
            <ThemeToggle />
          </div>
        </div>
      </Sheet>
      <CommandPalette />
    </div>
  )
}

/** Compact page header for phones: title left, actions right, subtitle under. */
export function MobileHeader({ title, subtitle, back, children, share = true }: { title: string; subtitle?: string; back?: React.ReactNode; children?: React.ReactNode; share?: boolean }) {
  return (
    <div className="shrink-0 border-b border-border bg-panel px-3 pb-2 pt-2" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-2">
        {back}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-[11.5px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {children}
          {share && <ShareButton compact />}
        </div>
      </div>
    </div>
  )
}
