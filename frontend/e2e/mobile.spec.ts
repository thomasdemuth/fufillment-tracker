/**
 * Phone-layout smoke test. Runs after smoke.spec.ts has imported and refreshed data (same server).
 */
import { expect, test } from '@playwright/test'

test('bottom tabs and card list', async ({ page }) => {
  await page.goto('/board')
  await expect(page.getByRole('link', { name: 'Board' })).toBeVisible()
  await expect(page.locator('[data-shipment-id]').first()).toBeVisible()
  // no desktop table on phones
  await expect(page.locator('table')).toHaveCount(0)
})

test('filter sheet opens and applies a status chip', async ({ page }) => {
  await page.goto('/board')
  await page.getByRole('button', { name: 'Filters' }).click()
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
  await page.getByRole('button', { name: 'Show results' }).click()
  await page.getByRole('button', { name: /Delivered/ }).first().click()
  await expect(page).toHaveURL(/status=delivered/)
})

test('card opens the full-screen shipment page with sticky actions', async ({ page }) => {
  await page.goto('/board?status=delivered')
  await page.locator('[data-shipment-id]').first().click()
  await expect(page).toHaveURL(/\/shipments\/\d+/)
  await expect(page.getByRole('progressbar', { name: 'Delivery progress' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Open on (USPS|FedEx)/ })).toBeVisible()
})

test('map shows mode chips and bottom sheet on tap', async ({ page }) => {
  await page.goto('/map?shipment=1')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await expect(page.getByText('Heatmap', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: /Details/ }).click()
  await expect(page).toHaveURL(/\/shipments\/1/)
})

test('more sheet reaches settings', async ({ page }) => {
  await page.goto('/map')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByText('USPS', { exact: true })).toBeVisible()
})
