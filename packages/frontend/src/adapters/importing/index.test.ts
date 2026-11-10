import { expect, test, vi } from 'vitest';
import { createHabitImportReader } from './index.ts';

class WorkerStub {
  static instances: WorkerStub[] = [];
  constructor() {
    WorkerStub.instances.push(this);
  }
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
}

function fixture() {
  WorkerStub.instances = [];
  vi.stubGlobal('Worker', WorkerStub);
  const controller = new AbortController();
  const pending = createHabitImportReader().read(
    { bytes: new ArrayBuffer(0), name: 'file.csv', source: 'rillday' },
    controller.signal,
  );
  const worker = WorkerStub.instances[0];
  expect.assert(worker !== undefined);
  return { controller, pending, worker };
}

test('reader releases its worker after a successful result without retaining the source file', async () => {
  const { pending, worker } = fixture();
  worker.onmessage?.({ data: { draft: { fingerprint: 'synthetic', groups: [] } } });
  await expect(pending).resolves.toEqual({ fingerprint: 'synthetic', groups: [] });
  expect(worker.terminate).toHaveBeenCalledOnce();
});

test('reader cancellation terminates the owned worker and rejects instead of accepting late results', async () => {
  const { pending, worker, controller } = fixture();
  controller.abort();
  worker.onmessage?.({ data: { draft: { fingerprint: 'late', groups: [] } } });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(worker.terminate).toHaveBeenCalled();
});

test('reader reports parser errors and releases its worker', async () => {
  const { pending, worker } = fixture();
  worker.onmessage?.({ data: { error: 'invalid_import_format' } });
  await expect(pending).rejects.toThrow('invalid_import_format');
  expect(worker.terminate).toHaveBeenCalledOnce();
});

test('reader reports a worker runtime error and releases its worker', async () => {
  const { pending, worker } = fixture();
  worker.onerror?.();
  await expect(pending).rejects.toThrow('invalid_import_format');
  expect(worker.terminate).toHaveBeenCalledOnce();
});
