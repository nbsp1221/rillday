import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

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
    VitePWA({
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'Rillday',
        short_name: 'Rillday',
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
        navigateFallbackDenylist: [/^\/v1\//, /^\/api\//, /^\/health$/],
      },
    }),
  ],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    outDir: process.env.RILLDAY_TEST_WEB_DIR ?? 'dist',
    target: 'es2022',
    license: { fileName: 'THIRD_PARTY_LICENSES.md' },
  },
});
