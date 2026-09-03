import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { router } from './routes'
import { applyTheme, useUiStore } from './stores/uiStore'
import './index.css'

applyTheme(useUiStore.getState().theme)
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyTheme(useUiStore.getState().theme)
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="bottom-right" closeButton />
    </QueryClientProvider>
  </StrictMode>,
)
