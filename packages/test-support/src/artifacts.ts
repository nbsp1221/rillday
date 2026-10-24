import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';

export const generatedRoot = resolve(
  process.env.RILLDAY_TEST_OUTPUT ?? resolve(process.cwd(), '.cache/tests'),
  basename(process.cwd()),
);

export function tempDir(prefix = 'case-') {
  mkdirSync(generatedRoot, { recursive: true });
  return mkdtempSync(resolve(generatedRoot, prefix));
}

export function removeOwned(path: string) {
  const target = resolve(path);
  if (
    target === generatedRoot ||
    !target.startsWith(generatedRoot + sep) ||
    realpathSync(target) !== target
  ) {
    throw new Error('Refusing cleanup outside the generated test directory');
  }
  if (process.env.RILLDAY_TEST_KEEP_ARTIFACTS === '1') {
    return;
  }
  rmSync(target, { recursive: true });
}
