/**
 * Hosted (GitHub Pages) build in snapshot mode: no server. Needs
 *   - the backend on :8000 with data (smoke.spec.ts ran first), to fetch a snapshot file;
 *   - `pnpm serve:hosted` on :4173 serving dist-hosted under /fufillment-tracker/.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const HOSTED = process.env.HOSTED_URL || 'http://localhost:4173/fufillment-tracker/'
const API = process.env.BASE_URL || 'http://localhost:8000'

let snapshotPath: string

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API}/api/snapshot`)
  expect(res.ok()).toBeTruthy()
  snapshotPath = path.join(os.tmpdir(), 'ft-test.snapshot.json')
  fs.writeFileSync(snapshotPath, await res.body())
})

async function openSnapshot(page: import('@playwright/test').Page) {
  await page.goto(HOSTED)
  await expect(page.getByText('Open a snapshot file')).toBeVisible()
  await page.getByTestId('snapshot-input').setInputFiles(snapshotPath)
  await expect(page.getByText(/Snapshot of \d+ shipments/)).toBeVisible()
}

test('asks for a snapshot file or a server, then runs from the file', async ({ page }) => {
  await openSnapshot(page)
  // board works from the file
  await page.goto(`${HOSTED}board?status=delivered`)
  await expect(page.locator('[data-shipment-id], tbody tr').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0)
})

test('detail, map and attention work offline from the file', async ({ page }) => {
  await openSnapshot(page)
  await page.goto(`${HOSTED}board?status=delivered`)
  await page.locator('[data-shipment-id], tbody tr').first().click()
  await expect(page.getByRole('progressbar', { name: 'Delivery progress' })).toBeVisible()
  await page.goto(`${HOSTED}map`)
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await page.goto(`${HOSTED}attention`)
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
})

test('deep link under the repo base path survives a reload (404.html fallback)', async ({ page }) => {
  await openSnapshot(page)
  await page.goto(`${HOSTED}shipments/1`)
  await page.reload()
  await expect(page.getByRole('progressbar', { name: 'Delivery progress' })).toBeVisible()
})

test('rejects a file that is not a snapshot', async ({ page }) => {
  await page.goto(HOSTED)
  const bad = path.join(os.tmpdir(), 'ft-bad.json')
  fs.writeFileSync(bad, '{"hello": 1}')
  await page.getByTestId('snapshot-input').setInputFiles(bad)
  await expect(page.getByText(/not a Fulfillment Tracker snapshot/)).toBeVisible()
})
