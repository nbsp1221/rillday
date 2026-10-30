import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { releaseNotes, releaseVersion } from './release.mjs';

async function workspace(t, { version = '0.2.1', versions = {}, notes = {} } = {}) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'rillday-release-'));
  t.after(() => fs.rm(directory, { recursive: true }));
  for (const app of ['web', 'desktop', 'server']) {
    const folder = join(directory, 'apps', app);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      join(folder, 'package.json'),
      JSON.stringify({ version: versions[app] ?? version }),
    );
    await fs.writeFile(
      join(folder, 'CHANGELOG.md'),
      notes[app] ??
        `# ${app}\n\n## ${version}\n\n- ${app} correction.\n\n## 0.2.0\n\n- Previous change.`,
    );
  }
  return directory;
}

test('one release version comes from the applications without a root version', async (t) => {
  const directory = await workspace(t);
  assert.equal(await releaseVersion(directory), '0.2.1');
  const other = await workspace(t, {
    version: '0.2.2',
    notes: { web: '# Web\n\n## 0.2.2\n\n- Separate workspace.' },
  });
  assert.equal(await releaseVersion(other), '0.2.2');
  assert.match(await releaseNotes(other), /Separate workspace/);
  assert.doesNotMatch(await releaseNotes(directory), /Separate workspace/);
});

test('different application versions cannot form a release', async (t) => {
  const directory = await workspace(t, { versions: { server: '0.2.0' } });
  await assert.rejects(releaseVersion(directory), /must match/);
});

test('prerelease and malformed versions cannot enter the stable release flow', async (t) => {
  for (const version of ['0.2.1-rc.1', '02.2.1', 'v0.2.1', '0.2.1+build.1', 'not-a-version']) {
    const directory = await workspace(t, {
      versions: { web: version, desktop: version, server: version },
    });
    await assert.rejects(releaseVersion(directory), /stable release version/);
  }
});

test('release notes retain Markdown and include only the matching version of each application', async (t) => {
  const directory = await workspace(t, {
    notes: {
      desktop:
        '# Desktop\n\n## 0.2.1\n\n### Fixed\n\n- **Windows:** keep focus.\n\n## 0.2.0\n\n- Old bug.',
    },
  });
  const notes = await releaseNotes(directory);
  assert.match(notes, /## Web/);
  assert.match(notes, /## Desktop\n\n### Fixed\n\n- \*\*Windows:\*\* keep focus/);
  assert.match(notes, /## Server/);
  assert.doesNotMatch(notes, /Old bug|Previous change/);
});

test('fixed-group applications without changes do not add empty sections', async (t) => {
  const directory = await workspace(t, {
    notes: { server: '# Server\n\n## 0.2.1\n\n## 0.2.0\n\n- Old change.' },
  });
  assert.doesNotMatch(await releaseNotes(directory), /## Server/);
});

test('missing or entirely empty release notes cannot produce a draft', async (t) => {
  const directory = await workspace(t, {
    notes: { server: '# Server\n\n## 0.2.0\n\n- Old change.' },
  });
  await assert.rejects(releaseNotes(directory), /Missing server changelog/);
  const empty = await workspace(t, {
    notes: Object.fromEntries(
      ['web', 'desktop', 'server'].map((app) => [app, `# ${app}\n\n## 0.2.1\n`]),
    ),
  });
  await assert.rejects(releaseNotes(empty), /Missing release notes/);
});
