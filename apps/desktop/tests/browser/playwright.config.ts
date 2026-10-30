import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const output = resolve(process.env.RILLDAY_TEST_OUTPUT ?? '.cache/tests', 'desktop-components');
const browser = process.platform === 'win32' ? 'msedge' : undefined;

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: '*.test.ts',
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
    baseURL: 'http://127.0.0.1:4194',
    channel: browser,
    viewport: { width: 1280, height: 900 },
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4194 --strictPort',
    cwd: resolve(import.meta.dirname, '../..'),
    url: 'http://127.0.0.1:4194/tests/browser/',
  },
});
