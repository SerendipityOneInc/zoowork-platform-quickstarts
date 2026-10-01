import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './test/browser', fullyParallel: false, workers: 1, timeout: 30_000,
  use: { baseURL: 'http://localhost:3187', trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) },
  webServer: { command: 'npm run dev:fixture', url: 'http://localhost:3187/api/info', reuseExistingServer: false },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
})
