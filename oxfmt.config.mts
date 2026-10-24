import retn0 from '@retn0/oxfmt-config';

export default {
  ...retn0,
  ignorePatterns: [...(retn0.ignorePatterns ?? []), 'packages/ui/src/components/**'],
};
