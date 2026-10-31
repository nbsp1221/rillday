import { fileURLToPath } from 'node:url';
import retn0 from '@retn0/eslint-config';
import oxlint from '@retn0/eslint-config-oxlint';
import { globalIgnores, includeIgnoreFile } from 'eslint/config';
import oxlintConfig, { vitestFiles, vitestIgnores } from './oxlint.config.ts';

export default retn0(
  { react: true, vitest: true, environments: ['node', 'browser'] },
  includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url))),
  globalIgnores(['packages/ui/src/components/**'], 'shadcn generated components'),
  oxlint(oxlintConfig),
).map((entry) =>
  entry.name?.startsWith('retn0/vitest')
    ? { ...entry, files: vitestFiles, ignores: vitestIgnores }
    : entry,
);
