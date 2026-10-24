import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const desktop = resolve(root, 'apps/desktop/src-tauri');
const output = resolve(root, 'apps/desktop/dist');
const target = process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.CARGO_BUILD_TARGET;
if (!target) {
  throw new Error('Run through Tauri or set CARGO_BUILD_TARGET for standalone license generation');
}

mkdirSync(output, { recursive: true });
execFileSync(
  'cargo',
  [
    'about',
    'generate',
    '--locked',
    '--fail',
    '--target',
    target,
    '--output-file',
    resolve(output, 'THIRD_PARTY_RUST_LICENSES.html'),
    'about.hbs',
  ],
  { cwd: desktop, stdio: 'inherit' },
);
