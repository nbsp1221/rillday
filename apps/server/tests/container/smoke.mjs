import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const image = process.argv[2];
assert.ok(image, 'Usage: node apps/server/tests/container/smoke.mjs IMAGE');
const id = `rillday-release-${randomUUID()}`;
const directory = resolve(
  process.env.RILLDAY_TEST_OUTPUT ?? resolve(root, 'apps/server/.cache/tests'),
  id,
);
const password = 'Synthetic-container-password-2026!';
const email = 'admin@example.test';
const replacement = 'Synthetic-replacement-password-2026!';
const result = { image, checks: [] };
let registry;
let beforeImage;
let afterImage;

const docker = (args, input) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    input,
    timeout: 120000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

const compose = (...args) =>
  docker([
    'compose',
    '--project-name',
    id,
    '--project-directory',
    directory,
    '-f',
    resolve(directory, 'compose.yaml'),
    '-f',
    resolve(directory, 'registry.yaml'),
    ...args,
  ]);

const node = (code, input) =>
  compose(
    'exec',
    '-T',
    '-w',
    '/app/apps/server',
    'rillday',
    'node',
    '--input-type=module',
    '-e',
    code,
    ...(input ?? []),
  );

let origin;

async function request(path, body, token, expected = 200) {
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      origin,
      connection: 'close',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, expected, `${path}: ${await response.clone().text()}`);
  return response.json();
}

const signin = async (value = password) =>
  (await request('/api/auth/sign-in/email', { email, password: value })).token;

const snapshot = () =>
  JSON.parse(
    node(`
  import Database from 'better-sqlite3';
  import { createHash } from 'node:crypto';
  const db = new Database(process.env.RILLDAY_DB, { readonly: true });
  try {
    const rows = db.prepare('SELECT owner,documentId,data FROM workspace_documents ORDER BY owner').all();
    const identity = db.prepare('SELECT * FROM instance_config').get();
    console.log(JSON.stringify({
      documents: rows.map(row => ({owner:row.owner,documentId:row.documentId,hash:createHash('sha256').update(row.data ?? '').digest('hex')})),
      identity: createHash('sha256').update(JSON.stringify(identity)).digest('hex')
    }));
  } finally { db.close(); }
`),
  );

try {
  await mkdir(directory, { recursive: true });
  await copyFile(resolve(root, 'compose.yaml'), resolve(directory, 'compose.yaml'));
  registry = docker([
    'run',
    '-d',
    '--label',
    `dev.rillday.verification=${id}`,
    '-p',
    '127.0.0.1::5000',
    'registry:3',
  ]);
  const registryPort = JSON.parse(docker(['inspect', registry]))[0].NetworkSettings.Ports[
    '5000/tcp'
  ][0].HostPort;
  const address = `127.0.0.1:${registryPort}`;
  beforeImage = `${address}/rillday:verification-before`;
  afterImage = `${address}/rillday:verification-after`;
  docker(['tag', image, beforeImage]);
  docker(
    ['build', '-t', afterImage, '-'],
    `FROM ${image}\nLABEL dev.rillday.verification="${id}"\n`,
  );
  docker(['push', beforeImage]);
  docker(['push', afterImage]);
  const portServer = createServer();
  await new Promise((resolve, reject) => {
    portServer.once('error', reject);
    portServer.listen(0, '127.0.0.1', resolve);
  });
  const port = portServer.address().port;
  await new Promise((resolve, reject) => {
    portServer.close((error) => (error ? reject(error) : resolve()));
  });
  origin = `http://127.0.0.1:${port}`;
  await writeFile(
    resolve(directory, 'registry.yaml'),
    `services:\n  rillday:\n    image: ${address}/rillday:\${RILLDAY_VERSION}\n`,
  );
  await writeFile(
    resolve(directory, '.env'),
    (await readFile(resolve(root, '.env.example'), 'utf8'))
      .replace(/^RILLDAY_VERSION=.+$/m, 'RILLDAY_VERSION=verification-before')
      .replace(/^RILLDAY_PORT=.+$/m, `RILLDAY_PORT=${port}`)
      .replace(/^RILLDAY_PUBLIC_URL=.+$/m, `RILLDAY_PUBLIC_URL=${origin}`),
  );
  compose('pull');
  compose('up', '-d', '--wait', '--wait-timeout', '60');
  await request('/health');
  const html = await fetch(origin, { headers: { connection: 'close' } });
  assert.equal(html.status, 200);
  assert.match(await html.text(), /Rillday/);
  assert.equal(node('console.log(process.getuid())'), '1000');
  node(
    "import {writeFileSync} from 'node:fs'; try {writeFileSync('/app/probe','x');process.exit(1)} catch(e) {if(e.code!=='EROFS')throw e}",
  );
  result.checks.push('fresh Compose install, web/API, non-root and read-only filesystem');
  await request('/v1/setup', { email, password }, undefined, 201);
  const token = await signin();
  const account = await request('/v1/account', undefined, token);
  await request('/v1/admin/users', { email: 'person@example.test', password }, token, 201);
  // Opaque document fixtures keep the packaging test independent of the renderer.
  const documentId = node(
    `import {generateAutomergeUrl,parseAutomergeUrl} from '@automerge/automerge-repo'; console.log(parseAutomergeUrl(generateAutomergeUrl()).documentId)`,
  );
  await request('/v1/connection', { documentId }, token);
  node(`
    import * as Automerge from '@automerge/automerge';
    import Database from 'better-sqlite3';
    const document = Automerge.from({tasks:['Synthetic task'],habits:['Synthetic habit']});
    const db = new Database(process.env.RILLDAY_DB);
    try { db.prepare('UPDATE workspace_documents SET data=? WHERE owner=?').run(Automerge.save(document),${JSON.stringify(account.user.id)}); }
    finally {db.close();Automerge.free(document)}
  `);
  const baseline = snapshot();
  compose(
    'exec',
    '-T',
    'rillday',
    'node',
    '/app/apps/server/src/maintenance.ts',
    'backup',
    '/data/rillday-backup.sqlite',
  );
  compose('cp', 'rillday:/data/rillday-backup.sqlite', resolve(directory, 'rillday-backup.sqlite'));
  assert.throws(() =>
    compose(
      'exec',
      '-T',
      'rillday',
      'node',
      '/app/apps/server/src/maintenance.ts',
      'backup',
      '/data/rillday-backup.sqlite',
    ),
  );
  result.checks.push(
    'first administrator, ordinary user, native data and online backup without overwrite',
  );
  const originalContainer = compose('ps', '-q', 'rillday');
  await writeFile(
    resolve(directory, '.env'),
    (await readFile(resolve(directory, '.env'), 'utf8')).replace(
      'verification-before',
      'verification-after',
    ),
  );
  compose('pull');
  compose('up', '-d', '--wait', '--wait-timeout', '60');
  assert.notEqual(compose('ps', '-q', 'rillday'), originalContainer);
  assert.deepEqual(snapshot(), baseline);
  assert.equal((await request('/v1/connection', undefined, await signin())).documentId, documentId);
  result.checks.push(
    'image update by pull/up preserves accounts, server identity and native document bytes',
  );
  compose('stop', 'rillday');
  compose('cp', resolve(directory, 'rillday-backup.sqlite'), 'rillday:/data/restore-source.sqlite');
  compose(
    'run',
    '--rm',
    '--no-deps',
    'rillday',
    'node',
    '/app/apps/server/src/maintenance.ts',
    'restore',
    '/data/restore-source.sqlite',
    '/data/restored.sqlite',
  );
  assert.throws(() =>
    compose(
      'run',
      '--rm',
      '--no-deps',
      'rillday',
      'node',
      '/app/apps/server/src/maintenance.ts',
      'restore',
      '/data/restore-source.sqlite',
      '/data/restored.sqlite',
    ),
  );
  await writeFile(
    resolve(directory, '.env'),
    (await readFile(resolve(directory, '.env'), 'utf8')).replace(
      '/data/data.sqlite',
      '/data/restored.sqlite',
    ),
  );
  compose('up', '-d', '--wait', '--wait-timeout', '60');
  assert.deepEqual(snapshot(), baseline);
  node("import {existsSync} from 'node:fs';if(!existsSync('/data/data.sqlite'))process.exit(1)");
  const restoredToken = await signin();
  assert.equal((await request('/v1/connection', undefined, restoredToken)).documentId, documentId);
  result.checks.push(
    'stopped-container copy, non-root restore to a new file, original preserved and restored sign-in',
  );
  docker(
    [
      'compose',
      '--project-name',
      id,
      '--project-directory',
      directory,
      '-f',
      resolve(directory, 'compose.yaml'),
      '-f',
      resolve(directory, 'registry.yaml'),
      'exec',
      '-T',
      'rillday',
      'node',
      '/app/apps/server/src/maintenance.ts',
      'reset-password',
      email,
    ],
    replacement + '\n',
  );
  await request('/v1/account', undefined, restoredToken, 401);
  await signin(replacement);
  assert.deepEqual(snapshot(), baseline);
  result.checks.push('stdin password recovery revokes sessions and preserves workspace data');
  result.ok = true;
} catch (error) {
  result.failure = String(error.stack ?? error);
  result.cause = String(error.cause ?? '');
  try {
    await writeFile(resolve(directory, 'container.log'), compose('logs', '--no-color', 'rillday'));
  } catch {
    // Preserve the original failure when diagnostics are unavailable.
  }
  process.exitCode = 1;
} finally {
  const failures = [];
  try {
    compose('down', '--volumes', '--remove-orphans');
  } catch (error) {
    failures.push(String(error));
  }
  if (registry) {
    try {
      docker(['stop', registry]);
      docker(['rm', '-v', registry]);
    } catch (error) {
      failures.push(String(error));
    }
  }
  for (const tag of [beforeImage, afterImage]) {
    if (tag) {
      try {
        docker(['image', 'rm', tag]);
      } catch (error) {
        failures.push(String(error));
      }
    }
  }
  result.cleanup = {
    remainingContainers: docker([
      'ps',
      '-aq',
      '--filter',
      `label=com.docker.compose.project=${id}`,
    ]),
    remainingVolumes: docker([
      'volume',
      'ls',
      '-q',
      '--filter',
      `label=com.docker.compose.project=${id}`,
    ]),
    failures,
  };
  if (failures.length || result.cleanup.remainingContainers || result.cleanup.remainingVolumes) {
    process.exitCode = 1;
  }
  await writeFile(resolve(directory, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, directory }));
}
