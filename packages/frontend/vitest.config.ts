import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.browser.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    maxWorkers: 2,
    env: { TZ: 'Asia/Seoul' },
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    fileParallelism: false,
  },
});
