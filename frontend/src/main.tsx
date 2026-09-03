import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { router } from './routes'
import { AppGate } from './components/layout/AppGate'
import { applyHandoffParams } from './lib/server'
import { applyTheme, useUiStore } from './stores/uiStore'
import './index.css'

applyHandoffParams()
applyTheme(useUiStore.getState().theme)
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyHandoffParams()
applyTheme(useUiStore.getState().theme)
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppGate>
        <RouterProvider router={router} />
      </AppGate>
      <Toaster richColors position="bottom-right" closeButton />
    </QueryClientProvider>
  </StrictMode>,
)
