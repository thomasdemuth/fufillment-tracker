/**
 * Hosted (GitHub Pages) build, desktop, "this browser" data mode: no server at all. Needs only
 *   `pnpm serve:hosted` on :4173 serving dist-hosted under /fufillment-tracker/.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const HOSTED = process.env.HOSTED_URL || 'http://localhost:4173/fufillment-tracker/'
const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../demo')

test.describe.configure({ mode: 'serial' })

test("desktop opens the demo, then switches to the user's own data kept in the browser", async ({ page }) => {
  await page.goto(HOSTED)
  await expect(page.getByTestId('demo-banner')).toBeVisible()
  await page.getByTestId('use-my-data').click()
  // fresh browser: lands on the upload wizard with an empty local database
  await expect(page).toHaveURL(/uploads\/new/)
  await expect(page.getByTestId('local-banner')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(path.join(DEMO, 'batch_1.xlsx'))
  await expect(page.getByText('Map columns')).toBeVisible()
  await expect(page.getByText('Tracking Number', { exact: false }).first()).toBeVisible()
  // no online geocoding offered in the browser
  await expect(page.getByText('Street-level (online)')).toHaveCount(0)
  await page.getByRole('button', { name: /Import \d+ rows/ }).click()
  await expect(page.getByText(/Imported batch_1.xlsx/)).toBeVisible({ timeout: 30_000 })

  await page.goto(`${HOSTED}board`)
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await expect(page.getByTestId('local-banner')).toContainText(/\d+ shipments/)

  // mock refresh runs in the browser
  await page.getByRole('button', { name: 'Refresh' }).click()
  await page.getByRole('button', { name: 'Refresh all active shipments' }).click()
  await expect(page.getByText(/Refreshed \d+ shipments/)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('tbody tr').filter({ hasText: /Delivered|In transit|Exception|Label/ }).first()).toBeVisible()

  // map has points (offline ZIP geocoding)
  await page.goto(`${HOSTED}map`)
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

  // survives a reload: the data is in IndexedDB
  await page.reload()
  await expect(page.getByTestId('local-banner')).toBeVisible()
  await page.goto(`${HOSTED}board`)
  await expect(page.locator('tbody tr').first()).toBeVisible()

  // privacy page says where the data lives
  await page.goto(`${HOSTED}privacy`)
  await expect(page.getByText('This browser only')).toBeVisible()
})

test("demo can be shown again and the user's data comes back", async ({ page }) => {
  // Each test gets a fresh browser profile, so start from the demo again.
  await page.goto(HOSTED)
  await page.getByTestId('use-my-data').click()
  await expect(page.getByTestId('local-banner')).toBeVisible()
  await page.getByRole('button', { name: 'Demo' }).click()
  await expect(page.getByTestId('demo-banner')).toBeVisible()
  await page.getByRole('button', { name: 'Back to my data' }).click()
  await expect(page.getByTestId('local-banner')).toBeVisible()
  // the choice is remembered across reloads
  await page.reload()
  await expect(page.getByTestId('local-banner')).toBeVisible()
})
