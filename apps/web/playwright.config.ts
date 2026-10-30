import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.RILLDAY_TEST_PORT ?? 4181);
const browser =
  process.env.RILLDAY_TEST_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
const outputRoot = resolve(process.env.RILLDAY_TEST_OUTPUT ?? '.cache/tests', 'web-e2e');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('RILLDAY_TEST_PORT must be between 1 and 65535');
}
export default defineConfig({
  testDir: './e2e/tests',
  outputDir: resolve(outputRoot, 'e2e'),
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  globalTimeout: 20 * 60 * 1000,
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(outputRoot, 'report'), open: 'never' }],
    ['junit', { outputFile: resolve(outputRoot, 'results.xml') }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: browser === 'chromium' ? undefined : browser,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'Asia/Seoul',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm --filter @repo/web preview --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
  },
});
