import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/native',
  outputDir: '.cache/tests/native-results',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list'], ['html', { outputFolder: '.cache/tests/native-report', open: 'never' }]],
  metadata: {
    executable: process.env.RILLDAY_NATIVE_EXECUTABLE
      ? resolve(process.env.RILLDAY_NATIVE_EXECUTABLE)
      : undefined,
  },
});
