import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/ui',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1180, height: 780 }, trace: 'retain-on-failure' },
  webServer: { command: 'npx vite --config test/renderer.config.ts', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI }
})
