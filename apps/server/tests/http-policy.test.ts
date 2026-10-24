import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { removeOwned, tempDir } from '@repo/test-support';
import Fastify from 'fastify';
import { test as base, expect } from 'vitest';
import { registerHttpPolicy, registerWebApplication } from '../src/http-policy.ts';

const test = base.extend('app', async ({}, { onCleanup }) => {
  const app = Fastify();
  onCleanup(() => app.close());
  await registerHttpPolicy(app, []);
  return app;
});

test('fingerprinted fonts are immutable while app entrypoints and API responses revalidate', async ({
  app,
  onTestFinished,
}) => {
  const directory = tempDir('font-cache-');
  onTestFinished(() => removeOwned(directory));
  mkdirSync(resolve(directory, 'assets'));
  for (const name of [
    'assets/Pretendard-aB09_-xy.woff2',
    'assets/Pretendard.woff2',
    'index.html',
    'sw.js',
  ]) {
    writeFileSync(resolve(directory, name), 'fixture');
  }
  app.get('/v1/cache-probe', () => ({ ok: true }));
  await registerWebApplication(app, directory);

  const font = await app.inject('/assets/Pretendard-aB09_-xy.woff2');
  expect(font.statusCode).toBe(200);
  expect(font.headers['cache-control']).toBe('public, max-age=31536000, immutable');

  for (const url of ['/', '/index.html', '/sw.js', '/assets/Pretendard.woff2', '/v1/cache-probe']) {
    const response = await app.inject(url);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control'] ?? '').not.toContain('immutable');
  }
});
