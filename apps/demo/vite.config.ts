import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';

const version = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const policy = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').match(
  /^ {2}Content-Security-Policy: (.+)$/m,
)?.[1];
if (!policy) {
  throw new Error('Missing demo Content-Security-Policy');
}

export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  plugins: [
    wasm(),
    react(),
    tailwindcss(),
    {
      name: 'demo-licenses',
      generateBundle() {
        for (const [fileName, source] of [
          ['LICENSE', '../../LICENSE'],
          ['licenses/pretendard-OFL-1.1.txt', '../../packages/ui/LICENSE.pretendard'],
        ] as const) {
          this.emitFile({
            type: 'asset',
            fileName,
            source: readFileSync(new URL(source, import.meta.url)),
          });
        }
      },
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'Rillday demo',
        short_name: 'Rillday demo',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#7060c3',
        background_color: '#171717',
        icons: [
          { src: '/icons/192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable/512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,wasm,woff2,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
  preview: {
    host: '127.0.0.1',
    port: 4175,
    strictPort: true,
    headers: { 'Content-Security-Policy': policy },
  },
  build: {
    outDir: process.env.RILLDAY_TEST_DEMO_DIR ?? 'dist',
    target: 'es2022',
    license: { fileName: 'THIRD_PARTY_LICENSES.md' },
  },
});
