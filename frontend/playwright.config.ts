import { defineConfig, devices } from '@playwright/test'

const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8000',
    launchOptions,
    screenshot: 'only-on-failure',
  },
  reporter: [['list']],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1400, height: 900 } }, testMatch: /smoke\.spec\.ts/ },
    { name: 'mobile', dependencies: ['desktop'], use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions }, testMatch: /mobile\.spec\.ts/ },
    { name: 'hosted', dependencies: ['desktop'], use: { ...devices['iPhone 13'], browserName: 'chromium', launchOptions }, testMatch: /hosted\.spec\.ts/ },
    // No backend needed: the hosted build with data kept in the browser.
    { name: 'hosted-local', use: { viewport: { width: 1400, height: 900 }, launchOptions }, testMatch: /hosted-local\.spec\.ts/ },
  ],
})
