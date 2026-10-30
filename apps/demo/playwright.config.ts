import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.RILLDAY_TEST_DEMO_PORT ?? 4186);
const directory = process.env.RILLDAY_TEST_DEMO_DIR ?? 'dist';
export default defineConfig({
  testDir: './e2e/tests',
  outputDir: resolve(process.env.RILLDAY_TEST_OUTPUT ?? '.cache/tests', 'demo'),
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    timezoneId: 'Asia/Seoul',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm preview --port ${port} --strictPort --outDir "${directory}"`,
    url: `http://127.0.0.1:${port}`,
  },
});
