import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'
export type MapMode = 'points' | 'heatmap' | 'states'

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

export function applyTheme(theme: Theme) {
  const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
}

interface UiState {
  theme: Theme
  setTheme: (t: Theme) => void
  mapMode: MapMode
  setMapMode: (m: MapMode) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
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
}))
