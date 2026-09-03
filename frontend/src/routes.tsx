import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { MapPage } from '@/pages/MapPage'
import { BoardPage } from '@/pages/BoardPage'
import { AttentionPage } from '@/pages/AttentionPage'
import { UploadsPage } from '@/pages/UploadsPage'
import { UploadWizardPage } from '@/pages/UploadWizardPage'
import { ShipmentPage } from '@/pages/ShipmentPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { PrivacyPage } from '@/pages/PrivacyPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      { path: 'map', element: <MapPage /> },
      { path: 'board', element: <BoardPage /> },
      { path: 'attention', element: <AttentionPage /> },
      { path: 'uploads', element: <UploadsPage /> },
      { path: 'uploads/new', element: <UploadWizardPage /> },
      { path: 'shipments/:id', element: <ShipmentPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: '*', element: <Navigate to="/map" replace /> },
    ],
  },
])
