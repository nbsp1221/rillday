import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { access, cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';
import { type Browser, type Page, test as base, chromium, expect } from '@playwright/test';
import fs from 'fs-extra';
import { z } from 'zod';
import { verifyNativeSync } from './support/sync';

const helper = resolve(import.meta.dirname, 'windows-desktop.py');

const nativeResultSchema = z.looseObject({
  inputBefore: z.string(),
  inputAfter: z.string(),
  desktop: z.string(),
  isolated: z.boolean(),
  pid: z.number().optional(),
  exitCode: z.number().optional(),
  exists: z.boolean().optional(),
  windows: z
    .array(
      z.looseObject({
        pid: z.number(),
        class: z.string(),
        texts: z.array(z.string()),
        ready: z.boolean(),
      }),
    )
    .optional(),
});

type NativeResult = z.infer<typeof nativeResultSchema>;

type Native = (request: object) => Promise<NativeResult>;

const test = base.extend<{ native: Native; debuggingPort: number }>({
  debuggingPort: async ({}, provide) => {
    const configuration = z
      .object({
        app: z.object({ windows: z.array(z.object({ additionalBrowserArgs: z.string() })) }),
      })
      .parse(
        JSON.parse(await readFile(resolve(import.meta.dirname, 'tauri.test.conf.json'), 'utf8')),
      );
    const match = configuration.app.windows[0]?.additionalBrowserArgs.match(
      /--remote-debugging-port=(\d+)/,
    );
    if (!match) {
      throw new Error('The native test configuration must specify its debugging port');
    }
    const port = Number(match[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('The native debugging port must be between 1 and 65535');
    }
    const listener = createServer();
    try {
      listener.listen(port, '127.0.0.1');
      await once(listener, 'listening');
      await promisify(listener.close.bind(listener))();
      await provide(port);
    } finally {
      if (listener.listening) {
        await promisify(listener.close.bind(listener))();
      }
    }
  },
  native: async ({}, provide) => {
    const driver = spawn('python', ['-u', helper], {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        RUST_BACKTRACE: '1',
      },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const protocol = createInterface({
      input: driver.stdout,
      output: driver.stdin,
      terminal: false,
    });
    const stopped = new AbortController();
    let completed = false;
    let driverError: Error | undefined;
    let transportError: Error | undefined;
    driver.once('error', (error) => {
      driverError = error;
      stopped.abort(error);
    });
    driver.once('close', (code, signal) => {
      completed = true;
      stopped.abort(new Error(`Native driver exited: ${code}, ${signal}`));
    });

    async function closeDriver() {
      const exited = !completed
        ? once(driver, 'close', { signal: AbortSignal.timeout(30_000) })
        : Promise.resolve();
      protocol.close();
      driver.stdin.end();
      try {
        await exited;
        if (driverError) {
          throw driverError;
        }
        expect(driver.exitCode).toBe(0);
      } catch (error) {
        if (driver.pid && driver.exitCode === null && driver.signalCode === null) {
          const closed = once(driver, 'close', { signal: AbortSignal.timeout(15_000) });
          const cleanup = await Promise.allSettled([
            promisify(execFile)('taskkill.exe', ['/PID', String(driver.pid), '/T', '/F'], {
              windowsHide: true,
              timeout: 10_000,
            }),
            closed,
          ]);
          const failures = cleanup.filter((result) => result.status === 'rejected');
          if (failures.length) {
            throw new Error(
              `Native driver teardown failed: ${failures.map((result) => String(result.reason)).join('; ')}`,
              { cause: error },
            );
          }
        }
        throw error;
      }
    }

    try {
      await provide(async (request) => {
        if (transportError) {
          throw transportError;
        }
        let line: string;
        try {
          line = await protocol.question(JSON.stringify(request) + '\n', {
            signal: AbortSignal.any([AbortSignal.timeout(25_000), stopped.signal]),
          });
        } catch (error) {
          // A late response cannot be assigned to a subsequent request after a timeout.
          transportError = error instanceof Error ? error : new Error(String(error));
          throw transportError;
        }
        const response = z
          .object({ result: nativeResultSchema.optional(), error: z.string().optional() })
          .parse(JSON.parse(line));
        if (response.error) {
          throw new Error(response.error);
        }
        if (!response.result) {
          throw new Error('Native driver returned no result');
        }
        return response.result;
      });
    } finally {
      await closeDriver();
    }
  },
});
test.skip(process.platform !== 'win32', 'Windows WebView2 integration');

async function saved(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))),
    )
    .toBe(true);
}

test('first-run selection, shared profiles and folder changes preserve offline work without touching user input', async ({
  native,
  debuggingPort,
}, testInfo) => {
  if (typeof testInfo.config.metadata.executable !== 'string') {
    throw new Error(
      'Set RILLDAY_NATIVE_EXECUTABLE to an application built with tauri.test.conf.json',
    );
  }
  const root = resolve(process.env.RILLDAY_TEST_OUTPUT ?? '.cache/tests', 'native');
  await mkdir(root, { recursive: true });
  const fixture = await mkdtemp(resolve(root, 'case-'));
  const unpacked = resolve(fixture, 'archive-app');
  await mkdir(unpacked);
  await cp(testInfo.config.metadata.executable, resolve(unpacked, 'rillday-desktop.exe'));
  const identifier = 'dev.rillday.workspace.test';
  const localAppData = process.env.LOCALAPPDATA;
  const roamingAppData = process.env.APPDATA;
  assert(
    localAppData !== undefined && roamingAppData !== undefined,
    'Missing Windows app data paths',
  );
  const defaultPath = resolve(localAppData, identifier);
  const configuration = resolve(roamingAppData, identifier);
  const locationFile = resolve(configuration, 'rillday-data-directory');
  await expect(access(defaultPath)).rejects.toThrow();
  await expect(access(configuration)).rejects.toThrow();
  let failed = false;
  let failure: unknown;
  let desktop: string | undefined;
  let browser: Browser | undefined;
  let owned: { exe: string; pid?: number } | undefined;
  let launch: NativeResult | undefined;
  let previousEndpoint: string | undefined;

  async function disconnect() {
    await browser?.close().catch(() => undefined);
    browser = undefined;
  }

  async function captureFailure() {
    const page = browser?.contexts().flatMap((context) => context.pages())[0];
    if (page && !page.isClosed()) {
      await page.screenshot({ path: testInfo.outputPath('failure.png') }).catch(() => undefined);
      await writeFile(testInfo.outputPath('failure.txt'), await page.locator('body').innerText());
    }
  }

  async function stop() {
    const currentDesktop = desktop;
    try {
      if (currentDesktop) {
        await native({ action: 'close', desktop: currentDesktop });
        await expect
          .poll(
            async () =>
              (await native({ action: 'inspect', desktop: currentDesktop })).windows?.length,
            { timeout: 30_000 },
          )
          .toBe(0);
      }
    } finally {
      try {
        await disconnect();
      } finally {
        if (currentDesktop) {
          const { isolated } = await native({ action: 'release', desktop: currentDesktop });
          desktop = undefined;
          owned = undefined;
          await expect
            .poll(async () => (await native({ action: 'inspect', desktop: currentDesktop })).exists)
            .toBe(!isolated);
        }
      }
    }
  }

  async function connect() {
    let endpoint: string | undefined;
    await expect
      .poll(
        async () => {
          try {
            const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`, {
              signal: AbortSignal.timeout(300),
            });
            if (!response.ok) {
              return false;
            }
            const version = z
              .object({ webSocketDebuggerUrl: z.string().optional() })
              .parse(await response.json());
            endpoint = version.webSocketDebuggerUrl;
            return Boolean(endpoint && endpoint !== previousEndpoint);
          } catch {
            return false;
          }
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    assert(endpoint !== undefined, 'Missing native browser debugger endpoint');
    const connectedBrowser = await chromium.connectOverCDP(endpoint);
    browser = connectedBrowser;
    previousEndpoint = endpoint;
    let page: Page | undefined;
    await expect
      .poll(() => {
        page = connectedBrowser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => !candidate.isClosed());
        return Boolean(page);
      })
      .toBe(true);
    assert(page !== undefined, 'Missing native application page');
    await expect(page.locator('main').first()).toBeVisible();
    if (owned) {
      owned.pid = (await native({ action: 'inspect', desktop })).windows?.find(
        (window) => window.class !== '#32770',
      )?.pid;
    }
    return page;
  }

  async function start(folder: string) {
    desktop = `RilldayTest-${randomUUID()}`;
    owned = { exe: resolve(folder, 'rillday-desktop.exe') };
    launch = await native({
      action: 'start',
      desktop,
      exe: owned.exe,
    });
    owned.pid = launch.pid;
    return connect();
  }

  try {
    let page = await start(unpacked);
    await expect(
      page.getByRole('heading', { name: 'Choose where to keep your work' }),
    ).toBeVisible();
    await expect(page.getByLabel('Current data folder')).toHaveText(defaultPath);
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
    await expect(access(locationFile)).rejects.toThrow();
    await page.getByRole('button', { name: 'Choose folder…', exact: true }).click();
    await expect
      .poll(async () =>
        (await native({ action: 'inspect', desktop })).windows?.some(
          (window) => window.class === '#32770' && window.ready,
        ),
      )
      .toBe(true);
    await native({ action: 'cancel', desktop });
    await expect(page.getByLabel('Current data folder')).toHaveText(defaultPath);
    await expect(access(locationFile)).rejects.toThrow();
    await expect(page.getByRole('button', { name: 'Open Rillday', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Open Rillday', exact: true }).focus();
    await page.getByRole('button', { name: 'Open Rillday', exact: true }).press('Enter');
    await expect.poll(() => page.isClosed(), { timeout: 30_000 }).toBe(true);
    await disconnect();
    page = await connect();
    await expect(page.locator('.rillday-app[data-runtime="desktop"]')).toBeVisible();
    await page.context().setOffline(true);
    const title = 'Offline desktop task';
    await page.locator('#quick-add-input').fill(title);
    await page.locator('#quick-add-input').press('Enter');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByLabel('Habit', { exact: true }).click();
    await page.getByRole('button', { name: 'Add habit', exact: true }).click();
    await page.getByLabel('Habit name', { exact: true }).fill('Desktop habit');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page
      .locator('.habit-checkin')
      .getByRole('button', { name: 'Complete', exact: true })
      .click();
    await saved(page);
    const windows = (await native({ action: 'inspect', desktop })).windows;
    expect((await native({ action: 'relaunch', desktop })).exitCode).toBe(0);
    expect((await native({ action: 'inspect', desktop })).windows).toEqual(windows);
    await expect(page.getByRole('heading', { name: 'Desktop habit', exact: true })).toBeVisible();
    await stop();

    const moved = resolve(fixture, 'moved');
    await cp(unpacked, moved, { recursive: true, errorOnExist: true, force: false });
    const selected = resolve(moved, ' 선택한 자료');
    await cp(defaultPath, selected, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    page = await start(moved);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByLabel('Habit', { exact: true }).click();
    await expect(page.getByText('Desktop habit', { exact: true })).toBeVisible();
    await page.getByText('Desktop habit', { exact: true }).click();
    await expect(page.locator('.habit-finish')).toContainText('Mark incomplete');
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page.getByRole('button', { name: 'Data and backups', exact: true }).click();
    await expect(page.getByLabel('Current data folder', { exact: true })).toHaveText(
      await realpath(defaultPath),
    );
    await expect(page.getByRole('button', { name: 'Choose folder…', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('data-folder.png'), animations: 'disabled' });

    async function chooseFolder(path = selected) {
      await page.getByRole('button', { name: 'Choose folder…', exact: true }).click();
      await expect
        .poll(async () =>
          (await native({ action: 'inspect', desktop })).windows?.some(
            (window) => window.class === '#32770' && window.ready,
          ),
        )
        .toBe(true);
      const picker = await native({ action: 'select', desktop, path });
      await testInfo.attach('folder-picker', {
        body: JSON.stringify(picker),
        contentType: 'application/json',
      });
      const confirmation = page.getByRole('dialog', { name: 'Use this data folder?', exact: true });
      await expect(confirmation).toBeVisible();
      await expect(confirmation.getByText(path, { exact: true })).toBeVisible();
    }

    const invalid = resolve(fixture, 'unrelated');
    await mkdir(invalid);
    await writeFile(resolve(invalid, 'unrelated.txt'), 'Preserve this file');
    await chooseFolder(invalid);
    await page.getByRole('button', { name: 'Save and restart', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Could not use this folder. Choose an empty, writable folder or an existing Rillday data folder. Your current data is preserved.',
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByLabel('Current data folder', { exact: true })).toHaveText(
      await realpath(defaultPath),
    );
    await chooseFolder();
    await expect(
      page.getByRole('dialog', { name: 'Use this data folder?', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByLabel('Current data folder', { exact: true })).toHaveText(
      await realpath(defaultPath),
    );
    await chooseFolder();
    await page.getByRole('button', { name: 'Save and restart', exact: true }).click();
    await expect.poll(() => page.isClosed(), { timeout: 30_000 }).toBe(true);
    await disconnect();
    page = await connect();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByLabel('Habit', { exact: true }).click();
    await expect(page.getByText('Desktop habit', { exact: true })).toBeVisible();
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page.getByRole('button', { name: 'Data and backups', exact: true }).click();
    await expect(page.getByLabel('Current data folder', { exact: true })).toHaveText(selected);
    expect(await readFile(locationFile, 'utf8')).toBe(selected + '\n');
    await saved(page);
    await stop();
    await fs.move(configuration, resolve(fixture, 'previous-configuration'));
    page = await start(moved);
    await expect(
      page.getByRole('heading', { name: 'Choose where to keep your work' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Choose folder…', exact: true }).click();
    await expect
      .poll(async () =>
        (await native({ action: 'inspect', desktop })).windows?.some(
          (window) => window.class === '#32770' && window.ready,
        ),
      )
      .toBe(true);
    await native({ action: 'select', desktop, path: selected });
    await expect(page.getByLabel('Current data folder')).toHaveText(selected);
    await page.getByRole('button', { name: 'Open Rillday', exact: true }).click();
    await expect.poll(() => page.isClosed(), { timeout: 30_000 }).toBe(true);
    await disconnect();
    page = await connect();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await verifyNativeSync(page, testInfo);
    await writeFile(
      testInfo.outputPath('native.json'),
      JSON.stringify(
        {
          fixture,
          selected,
          inputDesktopUnchanged: true,
          persistence: true,
          cancelledSelection: true,
          nativeRestart: true,
          singleInstance: true,
          offlineTaskAndHabit: true,
          invalidFolderRejected: true,
          manualServerSetupAndSync: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    failed = true;
    failure = error;
    await testInfo
      .attach('native-error', {
        body: error instanceof Error ? (error.stack ?? error.message) : String(error),
        contentType: 'text/plain',
      })
      .catch(() => undefined);
    if (desktop && owned) {
      await testInfo
        .attach('native-host-log', {
          path: resolve(dirname(owned.exe), 'native-host.log'),
          contentType: 'text/plain',
        })
        .catch(() => undefined);
      try {
        await testInfo.attach('native-processes', {
          body: JSON.stringify(
            {
              launch,
              current: await native({
                action: 'inspect',
                desktop,
                diagnostics: true,
                pid: owned.pid,
                exe: owned.exe,
              }),
            },
            null,
            2,
          ),
          contentType: 'application/json',
        });
      } catch (inspectionError) {
        await testInfo
          .attach('native-inspection-error', {
            body: JSON.stringify({ launch, inspectionError: String(inspectionError) }),
            contentType: 'application/json',
          })
          .catch(() => undefined);
      }
    }
    await captureFailure().catch(() => undefined);
  } finally {
    await writeFile(testInfo.outputPath('fixture.json'), JSON.stringify({ fixture })).catch(
      () => undefined,
    );
    try {
      await stop();
      for (const [source, name] of [
        [defaultPath, 'default-profile'],
        [configuration, 'configuration'],
      ] as const) {
        if (
          await access(source).then(
            () => true,
            () => false,
          )
        ) {
          await fs.move(source, resolve(fixture, name));
        }
      }
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
      await testInfo
        .attach('native-cleanup-error', {
          body: error instanceof Error ? (error.stack ?? error.message) : String(error),
          contentType: 'text/plain',
        })
        .catch(() => undefined);
    }
  }
  if (failed) {
    throw failure;
  }
});
