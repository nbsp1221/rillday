import { resolve } from 'node:path';
import { build } from 'vite';

/** Build genuine PWA releases once; each test deploys its own copies. */
export async function buildBrowserReleases(source: string, directory: string) {
  const releases = { one: resolve(directory, 'one'), two: resolve(directory, 'two') };
  for (const [revision, outDir] of Object.entries(releases)) {
    await build({
      root: source,
      configFile: resolve(source, 'vite.config.ts'),
      logLevel: 'silent',
      define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(`test-${revision}`) },
      build: { outDir, emptyOutDir: true },
      plugins: [
        {
          name: 'test-release-marker',
          transformIndexHtml: (html) =>
            html.replace('</head>', `<meta name="test-release" content="${revision}"></head>`),
        },
      ],
    });
  }
  return releases;
}
