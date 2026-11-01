import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-site',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4174/cove-browser/', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite site --host 127.0.0.1 --port 4174 --strictPort --base=/cove-browser/',
    url: 'http://127.0.0.1:4174/cove-browser/',
    reuseExistingServer: false
  }
});
