import { useEffect, useState } from 'react'
import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type MapMode = 'points' | 'heatmap' | 'states'
export type LayoutPref = 'auto' | 'desktop' | 'phone'

function readLayout(): LayoutPref {
  try {
    const v = localStorage.getItem('ft.layout')
    if (v === 'desktop' || v === 'phone' || v === 'auto') return v
  } catch {
    /* ignore */
  }
  return 'auto'
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('ft.theme')
    if (t === 'light' || t === 'dark' || t === 'system') return t
  } catch {
    /* ignore */
  }
  return 'system'
}

function readMapMode(): MapMode {
  try {
    const m = localStorage.getItem('ft.mapMode')
    if (m === 'points' || m === 'heatmap' || m === 'states') return m
  } catch {
    /* ignore */
  }
  return 'points'
}

export function resolveDark(theme: Theme): boolean {
  const prefersDark = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return theme === 'dark' || (theme === 'system' && prefersDark)
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', resolveDark(theme))
}

/** True when the dark class is active; tracks theme changes and the OS setting. */
export function useIsDark(): boolean {
  const theme = useUiStore((s) => s.theme)
  const [dark, setDark] = useState(() => resolveDark(theme))
  useEffect(() => {
    setDark(resolveDark(theme))
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => setDark(resolveDark(useUiStore.getState().theme))
    mq?.addEventListener('change', onChange)
    return () => mq?.removeEventListener('change', onChange)
  }, [theme])
  return dark
}

interface UiState {
  theme: Theme
  setTheme: (t: Theme) => void
  mapMode: MapMode
  setMapMode: (m: MapMode) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  /** Force the desktop or phone layout regardless of window width. */
  layout: LayoutPref
  setLayout: (l: LayoutPref) => void
}

export const useUiStore = create<UiState>((set) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem('ft.theme', theme)
    } catch {
      /* ignore */
    }
    applyTheme(theme)
    set({ theme })
  },
  mapMode: readMapMode(),
  setMapMode: (mapMode) => {
    try {
      localStorage.setItem('ft.mapMode', mapMode)
    } catch {
      /* ignore */
    }
    set({ mapMode })
  },
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  layout: readLayout(),
  setLayout: (layout) => {
    try {
      localStorage.setItem('ft.layout', layout)
    } catch {
      /* ignore */
    }
    set({ layout })
  },
}))
