import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    maxWorkers: 2,
    env: { TZ: 'Asia/Seoul' },
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    fileParallelism: false,
  },
});
