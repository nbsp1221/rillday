import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.RILLDAY_TEST_COMPONENT_PORT ?? 4193);
const output = resolve(process.env.RILLDAY_TEST_OUTPUT ?? '.cache/tests', 'components');
const browser =
  process.env.RILLDAY_TEST_BROWSER ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('RILLDAY_TEST_COMPONENT_PORT must be between 1 and 65535');
}

export default defineConfig({
  testDir: resolve(import.meta.dirname, '../../src/presentation/shared/ui'),
  testMatch: '*.browser.test.ts',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  outputDir: resolve(output, 'results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(output, 'report'), open: 'never' }],
    ['junit', { outputFile: resolve(output, 'results.xml') }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: browser === 'chromium' ? undefined : browser,
    viewport: { width: 1280, height: 480 },
    locale: 'en-US',
    timezoneId: 'Asia/Seoul',
    serviceWorkers: 'block',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --config tests/browser/vite.config.ts --port ${port}`,
    cwd: resolve(import.meta.dirname, '../..'),
    url: `http://127.0.0.1:${port}`,
  },
});
