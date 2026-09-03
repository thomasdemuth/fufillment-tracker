import { chromium } from '@playwright/test'
const out = process.env.SHOT_DIR || 'screenshots'
const base = 'http://localhost:8000'
const pages = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)) })
for (const spec of pages) {
  const [path, name, dark] = spec.split('|')
  if (dark) await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log('shot', name)
}
await browser.close()
