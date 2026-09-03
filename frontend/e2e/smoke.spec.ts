/**
 * End-to-end smoke test against a running server (BASE_URL, default http://localhost:8000) in mock mode.
 * Uploads the demo spreadsheets through the UI, refreshes, and walks every main screen.
 */
import path from 'node:path'
import { expect, test } from '@playwright/test'

const DEMO = path.resolve(__dirname, '../../demo')

test.describe.configure({ mode: 'serial' })

test('upload wizard imports a spreadsheet', async ({ page }) => {
  await page.goto('/uploads/new')
  const input = page.locator('input[type=file]')
  await input.setInputFiles(path.join(DEMO, 'batch_1.xlsx'))
  await expect(page.getByText('Map columns')).toBeVisible()
  await expect(page.getByText('Tracking Number', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: /Import \d+ rows/ }).click()
  await expect(page.getByText(/Imported batch_1.xlsx/)).toBeVisible({ timeout: 30_000 })
})

test('messy csv is detected and imported', async ({ page }) => {
  await page.goto('/uploads/new')
  await page.locator('input[type=file]').setInputFiles(path.join(DEMO, 'batch_3_messy.csv'))
  await expect(page.getByText('Map columns')).toBeVisible()
  // header row auto-detected as row 2
  await expect(page.locator('input[type=number]').first()).toHaveValue('2')
  await page.getByRole('button', { name: /Import \d+ rows/ }).click()
  await expect(page.getByText(/Imported batch_3_messy.csv/)).toBeVisible({ timeout: 30_000 })
})

test('board lists shipments and filters', async ({ page }) => {
  await page.goto('/board')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await page.getByPlaceholder(/Search name/).fill('zzzz-no-match')
  await expect(page.getByText('No shipments match these filters.')).toBeVisible()
  await page.getByPlaceholder(/Search name/).fill('')
  await expect(page.locator('tbody tr').first()).toBeVisible()
})

test('refresh updates statuses', async ({ page }) => {
  await page.goto('/board')
  await page.getByRole('button', { name: 'Refresh' }).click()
  await page.getByRole('button', { name: 'Refresh all active shipments' }).click()
  await expect(page.getByText(/Refreshed \d+ shipments/)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('tbody tr').filter({ hasText: /Delivered|In transit|Exception/ }).first()).toBeVisible()
})

test('shipment drawer shows timeline and carrier link', async ({ page }) => {
  await page.goto('/board?status=delivered')
  await page.locator('tbody tr').first().click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('History')).toBeVisible()
  await expect(drawer.getByRole('button', { name: /Open on (USPS|FedEx)/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
})

test('map renders points and switches modes', async ({ page }) => {
  await page.goto('/map')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await page.getByText('Heatmap', { exact: true }).click()
  await page.getByText('By state', { exact: true }).click()
  await page.getByText('Points', { exact: true }).click()
})

test('attention, settings, privacy pages load', async ({ page }) => {
  await page.goto('/attention')
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByText('USPS', { exact: true })).toBeVisible()
  await page.goto('/privacy')
  await expect(page.getByText('What leaves this machine')).toBeVisible()
})

test('command palette finds shipments', async ({ page }) => {
  await page.goto('/board')
  await page.keyboard.press('Control+k')
  await page.getByPlaceholder(/Search shipments/).fill('ORD-01')
  await expect(page.locator('[cmdk-item]').first()).toBeVisible()
})
