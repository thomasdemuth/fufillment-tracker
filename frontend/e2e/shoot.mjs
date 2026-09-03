// Screenshot helper: node e2e/shoot.mjs "/path|name[|dark][|click=Button text]" ...
import { chromium } from '@playwright/test'
const out = process.env.SHOT_DIR || 'screenshots'
const base = process.env.BASE_URL || 'http://localhost:8000'
const specs = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)) })
for (const spec of specs) {
  const [path, name, ...opts] = spec.split('|')
  await page.emulateMedia({ colorScheme: opts.includes('dark') ? 'dark' : 'light' })
  await page.goto(base + path, { waitUntil: 'networkidle' })
  for (const o of opts) {
    if (o.startsWith('click=')) {
      await page.getByText(o.slice(6), { exact: true }).first().click()
      await page.waitForTimeout(300)
    }
    if (o.startsWith('wait=')) await page.waitForTimeout(Number(o.slice(5)))
  }
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log('shot', name)
}
await browser.close()
