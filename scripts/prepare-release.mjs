import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { releaseNotes, releaseVersion } from './release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [installer, executable, destination] = process.argv.slice(2);
if (!installer || !executable || !destination || process.argv.length !== 5) {
  throw new Error('Usage: node scripts/prepare-release.mjs INSTALLER EXECUTABLE OUTPUT_DIRECTORY');
}
const version = await releaseVersion();
const output = resolve(destination);
await mkdir(output, { recursive: true });
await copyFile(resolve(installer), resolve(output, 'Rillday_windows_x64_setup.exe'));
const archive = zipSync({
  'rillday-desktop.exe': await readFile(resolve(executable)),
  'LICENSE': await readFile(resolve(root, 'LICENSE')),
});
await writeFile(resolve(output, 'Rillday_windows_x64.zip'), archive);
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
await writeFile(resolve(output, 'release-notes.md'), await releaseNotes());
for (const name of [
  'Rillday_windows_x64_setup.exe',
  'Rillday_windows_x64.zip',
  'compose.yaml',
  'example.env',
]) {
  const content = await readFile(resolve(output, name));
  sums.push(`${createHash('sha256').update(content).digest('hex')}  ${name}`);
}
await writeFile(resolve(output, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`Prepared Rillday ${version} in ${output}`);
