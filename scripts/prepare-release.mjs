import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [installer, destination] = process.argv.slice(2);
if (!installer || !destination || process.argv.length !== 4) {
  throw new Error('Usage: node scripts/prepare-release.mjs INSTALLER OUTPUT_DIRECTORY');
}
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('Release version must be a stable semantic version');
}
const output = resolve(destination);
await mkdir(output, { recursive: true });
await copyFile(resolve(installer), resolve(output, 'Rillday_windows_x64_setup.exe'));
await copyFile(resolve(root, 'compose.yaml'), resolve(output, 'compose.yaml'));
const environment = await readFile(resolve(root, '.env.example'), 'utf8');
if (!/^RILLDAY_VERSION=.+$/m.test(environment)) {
  throw new Error('Environment example must declare RILLDAY_VERSION');
}
await writeFile(
  resolve(output, 'example.env'),
  environment.replace(/^RILLDAY_VERSION=.+$/m, `RILLDAY_VERSION=${version}`),
);
const sums = [];
for (const name of ['Rillday_windows_x64_setup.exe', 'compose.yaml', 'example.env']) {
  const content = await readFile(resolve(output, name));
  sums.push(`${createHash('sha256').update(content).digest('hex')}  ${name}`);
}
await writeFile(resolve(output, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`Prepared Rillday ${version} in ${output}`);
