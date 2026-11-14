import { defineConfig } from '@playwright/test'
import browserConfig from './playwright.config.js'

export default defineConfig({
  ...browserConfig,
  testDir: './tests/release',
  outputDir: './test-results/release',
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4175/UrkuSAR/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      'npm run preview -- --host 127.0.0.1 --port 4175 --strictPort --base=/UrkuSAR/',
    url: 'http://127.0.0.1:4175/UrkuSAR/',
    reuseExistingServer: false,
  },
})
