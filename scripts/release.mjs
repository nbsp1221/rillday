import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from 'changelog-parser';
import semver from 'semver';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const applications = [
  ['web', 'Web'],
  ['desktop', 'Desktop'],
  ['server', 'Server'],
];

export async function releaseVersion(directory = root) {
  const versions = await Promise.all(
    applications.map(async ([name]) => {
      const manifest = JSON.parse(
        await fs.readFile(resolve(directory, 'apps', name, 'package.json'), 'utf8'),
      );
      return manifest.version;
    }),
  );
  const [version] = versions;
  assert(
    semver.valid(version) === version && !semver.prerelease(version),
    'Expected a stable release version',
  );
  assert(
    versions.every((value) => value === version),
    'Application release versions must match',
  );
  return version;
}

export async function releaseNotes(directory = root) {
  const version = await releaseVersion(directory);
  const sections = await Promise.all(
    applications.map(async ([name, title]) => {
      const changelog = await parseChangelog({
        text: await fs.readFile(resolve(directory, 'apps', name, 'CHANGELOG.md'), 'utf8'),
        removeMarkdown: false,
      });
      const entry = changelog.versions.find((value) => value.version === version);
      assert(entry, `Missing ${name} changelog for ${version}`);
      return entry.body.trim() ? `## ${title}\n\n${entry.body.trim()}` : '';
    }),
  );
  const notes = sections.filter(Boolean).join('\n\n');
  assert(notes, `Missing release notes for ${version}`);
  return notes + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [
    command,
    tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined,
  ] = process.argv.slice(2);
  const version = await releaseVersion();
  switch (command) {
    case 'check':
      if (tag) {
        assert.equal(tag, `v${version}`, 'Tag must match the application release version');
      }
      {
        const metadata = JSON.parse(
          execFileSync(
            'cargo',
            [
              'metadata',
              '--manifest-path',
              resolve(root, 'apps/desktop/src-tauri/Cargo.toml'),
              '--format-version',
              '1',
              '--no-deps',
              '--locked',
              '--offline',
            ],
            { encoding: 'utf8' },
          ),
        );
        assert.equal(
          metadata.packages.find((value) => value.name === 'rillday-desktop')?.version,
          version,
          'Native version must match the application release version',
        );
      }
      console.log(version);
      break;
    case 'native':
      execFileSync(
        'cargo',
        [
          'set-version',
          '--manifest-path',
          resolve(root, 'apps/desktop/src-tauri/Cargo.toml'),
          version,
        ],
        { stdio: 'inherit' },
      );
      break;
    case 'notes':
      process.stdout.write(await releaseNotes());
      break;
    default:
      throw new Error('Usage: node scripts/release.mjs check [TAG] | native | notes');
  }
}
