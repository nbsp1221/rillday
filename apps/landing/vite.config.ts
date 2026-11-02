import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const policy = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').match(
  /^ {2}Content-Security-Policy: (.+)$/m,
)?.[1];
if (!policy) {
  throw new Error('Missing site Content-Security-Policy');
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: 'site-assets',
      generateBundle() {
        for (const [fileName, source] of [
          ['LICENSE', '../../LICENSE'],
          ['licenses/pretendard-OFL-1.1.txt', '../../packages/ui/LICENSE.pretendard'],
          ['social-preview.png', './public/screenshots/tasks-light.png'],
        ] as const) {
          this.emitFile({
            type: 'asset',
            fileName,
            source: readFileSync(new URL(source, import.meta.url)),
          });
        }
      },
    },
  ],
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    headers: { 'Content-Security-Policy': policy },
  },
  build: {
    outDir: process.env.RILLDAY_TEST_LANDING_DIR ?? 'dist',
    target: 'es2022',
    license: { fileName: 'THIRD_PARTY_LICENSES.md' },
  },
});
