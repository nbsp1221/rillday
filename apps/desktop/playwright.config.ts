import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const output = resolve(process.env.RILLDAY_TEST_OUTPUT ?? '.cache/tests');

export default defineConfig({
  testDir: './tests/native',
  outputDir: resolve(output, 'native-results'),
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list'], ['html', { outputFolder: resolve(output, 'native-report'), open: 'never' }]],
  metadata: {
    executable: process.env.RILLDAY_NATIVE_EXECUTABLE
      ? resolve(process.env.RILLDAY_NATIVE_EXECUTABLE)
      : undefined,
  },
});
