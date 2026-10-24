import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

const cli = fileURLToPath(import.meta.resolve('@tauri-apps/cli/tauri.js'));

const generate = (args) =>
  execFileSync(process.execPath, [cli, 'icon', ...args], { stdio: 'inherit' });

const source = path('../packages/frontend/src/presentation/shared/assets/brand/icon.svg');
const native = path('../apps/desktop/src-tauri/icons');
const web = path('../apps/web/public/icons');
const svg = await readFile(source, 'utf8');
const background = /<rect[^>]*fill="(#[\da-f]{6})"/iu.exec(svg)?.[1];
if (!background) {
  throw new Error('The application icon must define an opaque background color');
}

generate([source, '--output', native, '--ios-color', background]);
generate([source, '--output', web, '--png', '192', '--png', '512']);

// Let the OS apply its mask to a full-bleed background, preserving the same mark.
const opaqueSource = `${native}/maskable.svg`;
await writeFile(opaqueSource, svg.replace(/(<rect\b[^>]*?)\s+rx="[^"]*"/u, '$1'));
generate([opaqueSource, '--output', `${native}/web`, '--png', '180', '--png', '512']);
await mkdir(`${web}/maskable`, { recursive: true });
await copyFile(`${native}/web/512x512.png`, `${web}/maskable/512x512.png`);
await copyFile(`${native}/icon.ico`, path('../apps/web/public/favicon.ico'));
await copyFile(`${native}/web/180x180.png`, path('../apps/web/public/apple-touch-icon.png'));

await copyFile(source, path('../apps/web/public/icon.svg'));
await mkdir(path('../apps/desktop/public'), { recursive: true });
for (const name of ['icon.svg', 'favicon.ico', 'apple-touch-icon.png']) {
  await copyFile(
    name === 'icon.svg'
      ? source
      : name === 'favicon.ico'
        ? `${native}/icon.ico`
        : `${native}/web/180x180.png`,
    path('../apps/desktop/public/' + name),
  );
}

for (const app of ['landing', 'demo']) {
  const destination = path(`../apps/${app}/public`);
  await mkdir(destination, { recursive: true });
  for (const name of ['icon.svg', 'favicon.ico', 'apple-touch-icon.png']) {
    await copyFile(path(`../apps/web/public/${name}`), `${destination}/${name}`);
  }
  if (app === 'demo') {
    await mkdir(`${destination}/icons/maskable`, { recursive: true });
    for (const name of ['192x192.png', '512x512.png', 'maskable/512x512.png']) {
      await copyFile(`${web}/${name}`, `${destination}/icons/${name}`);
    }
  }
}
