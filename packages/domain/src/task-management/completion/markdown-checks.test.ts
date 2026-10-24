import { expect, test } from 'vitest';
import { resetChecks } from './markdown-checks.ts';

test('recurrence resets task markers without rewriting code or unrelated Markdown', () => {
  const source =
    '- [x] first\n  - [X] nested\n- [ ] pending\n\n`- [x] inline`\n\n```md\n- [x] code\n```\n\n**Keep this**';
  expect(resetChecks(source)).toBe(
    source.replace('- [x] first', '- [ ] first').replace('- [X] nested', '- [ ] nested'),
  );
});
