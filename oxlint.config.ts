import retn0 from '@retn0/oxlint-config';

export const vitestFiles = [
  'packages/domain/**/*.{test,spec}.{ts,tsx}',
  'packages/frontend/**/*.{test,spec}.{ts,tsx}',
  'apps/server/**/*.{test,spec}.{ts,tsx}',
  'apps/desktop/**/*.{test,spec}.{ts,tsx}',
];

const config = retn0(
  { react: true, vitest: true },
  {
    ignorePatterns: ['packages/ui/src/components/**'],
    overrides: [
      {
        files: ['{apps,packages}/*/src/**/*.{ts,tsx}'],
        excludeFiles: ['**/*.{test,spec}.{ts,tsx}', 'packages/test-support/**'],
        rules: {
          'eslint/no-restricted-imports': [
            'error',
            {
              patterns: [
                '@repo/server',
                '@repo/server/*',
                '@repo/test-support',
                '@repo/test-support/*',
              ],
            },
          ],
        },
      },
      {
        files: ['**/tests/**/*.ts', '**/*.{test,spec}.ts'],
        rules: {
          // Vitest fixtures destructure an empty dependency list.
          'eslint/no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
        },
      },
    ],
  },
);

for (const entry of config.overrides ?? []) {
  if (entry.plugins?.includes('vitest')) {
    entry.files = vitestFiles;
    entry.rules = {
      ...entry.rules,
      'vitest/no-standalone-expect': [
        'error',
        { additionalTestBlockFunctions: ['test', 'preferenceTest'] },
      ],
    };
  }
}

export default config;
