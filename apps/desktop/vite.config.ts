import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import { z } from 'zod';

const metadata: unknown = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const { version } = z.object({ version: z.string() }).parse(metadata);
export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  plugins: [
    wasm(),
    react(),
    tailwindcss(),
    {
      name: 'project-license',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'LICENSE',
          source: readFileSync(new URL('../../LICENSE', import.meta.url)),
        });
        this.emitFile({
          type: 'asset',
          fileName: 'licenses/pretendard-OFL-1.1.txt',
          source: readFileSync(new URL('../../packages/ui/LICENSE.pretendard', import.meta.url)),
        });
      },
    },
  ],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
  build: { target: 'es2022', license: { fileName: 'THIRD_PARTY_LICENSES.md' } },
});
