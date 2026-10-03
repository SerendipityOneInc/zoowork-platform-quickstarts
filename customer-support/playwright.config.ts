import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:4688",
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run demo:offline",
    url: "http://localhost:4688",
    reuseExistingServer: false,
    env: { PORT: "4688" },
    timeout: 20_000,
  },
});
