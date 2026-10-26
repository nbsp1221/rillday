import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { releaseNotes, releaseVersion } from './release.mjs';

function workspace(t, { versions = {}, notes = {} } = {}) {
  t.mock.method(fs, 'readFile', async (path) => {
    const match = String(path).match(
      /apps[/\\](web|desktop|server)[/\\](package.json|CHANGELOG.md)$/,
    );
    assert(match, `Unexpected file read: ${path}`);
    const [, app, file] = match;
    return file === 'package.json'
      ? JSON.stringify({ version: versions[app] ?? '0.2.1' })
      : (notes[app] ??
          `# ${app}\n\n## 0.2.1\n\n- ${app} correction.\n\n## 0.2.0\n\n- Previous change.`);
  });
}

test('one release version comes from the applications without a root version', async (t) => {
  workspace(t);
  assert.equal(await releaseVersion(), '0.2.1');
});

test('different application versions cannot form a release', async (t) => {
  workspace(t, { versions: { server: '0.2.0' } });
  await assert.rejects(releaseVersion(), /must match/);
});

test('prerelease and malformed versions cannot enter the stable release flow', async (t) => {
  for (const version of ['0.2.1-rc.1', '02.2.1', 'v0.2.1', '0.2.1+build.1', 'not-a-version']) {
    workspace(t, { versions: { web: version, desktop: version, server: version } });
    await assert.rejects(releaseVersion(), /stable release version/);
    t.mock.restoreAll();
  }
});

test('release notes retain Markdown and include only the matching version of each application', async (t) => {
  workspace(t, {
    notes: {
      desktop:
        '# Desktop\n\n## 0.2.1\n\n### Fixed\n\n- **Windows:** keep focus.\n\n## 0.2.0\n\n- Old bug.',
    },
  });
  const notes = await releaseNotes();
  assert.match(notes, /## Web/);
  assert.match(notes, /## Desktop\n\n### Fixed\n\n- \*\*Windows:\*\* keep focus/);
  assert.match(notes, /## Server/);
  assert.doesNotMatch(notes, /Old bug|Previous change/);
});

test('fixed-group applications without changes do not add empty sections', async (t) => {
  workspace(t, { notes: { server: '# Server\n\n## 0.2.1\n\n## 0.2.0\n\n- Old change.' } });
  assert.doesNotMatch(await releaseNotes(), /## Server/);
});

test('missing or entirely empty release notes cannot produce a draft', async (t) => {
  workspace(t, { notes: { server: '# Server\n\n## 0.2.0\n\n- Old change.' } });
  await assert.rejects(releaseNotes(), /Missing server changelog/);
  t.mock.restoreAll();
  workspace(t, {
    notes: Object.fromEntries(
      ['web', 'desktop', 'server'].map((app) => [app, `# ${app}\n\n## 0.2.1\n`]),
    ),
  });
  await assert.rejects(releaseNotes(), /Missing release notes/);
});
