import retn0 from '@retn0/oxlint-config';

export default retn0({
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
});
