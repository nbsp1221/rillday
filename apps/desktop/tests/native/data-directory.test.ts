import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Browser, type Page, chromium, expect, test } from '@playwright/test';
import { freePort } from '@repo/test-support';
import { verifyNativeSync } from './support/sync';

test.skip(process.platform !== 'win32', 'Windows WebView2 integration');
const helper = resolve(import.meta.dirname, 'windows-desktop.py');

interface NativeResult {
  inputBefore: string;
  inputAfter: string;
  desktop: string;
  pid?: number;
  exists?: boolean;
  windows?: { pid: number; class: string; texts: string[] }[];
}

const native = (request: object) =>
  JSON.parse(
    execFileSync('python', [helper], {
      input: JSON.stringify(request),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 25_000,
      env: { ...process.env, PYTHONUTF8: '1' },
    }),
  ) as NativeResult;

async function saved(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))),
    )
    .toBe(true);
}

test('first-run selection, shared profiles and folder changes preserve offline work without touching user input', async ({}, testInfo) => {
  if (typeof testInfo.config.metadata.executable !== 'string') {
    throw new Error(
      'Set RILLDAY_NATIVE_EXECUTABLE to an application built with tauri.test.conf.json',
    );
  }
  const root = resolve('.cache/tests/native');
  await mkdir(root, { recursive: true });
  const fixture = await mkdtemp(resolve(root, 'case-'));
  const unpacked = resolve(fixture, 'archive-app');
  await mkdir(unpacked);
  await cp(String(testInfo.config.metadata.executable), resolve(unpacked, 'rillday-desktop.exe'));
  const identifier = 'dev.rillday.workspace.test';
  const defaultPath = resolve(process.env.LOCALAPPDATA!, identifier);
  const configuration = resolve(process.env.APPDATA!, identifier);
  const locationFile = resolve(configuration, 'rillday-data-directory');
  await expect(access(defaultPath)).rejects.toThrow();
  await expect(access(configuration)).rejects.toThrow();
  let desktop: string | undefined;
  let browser: Browser | undefined;
  let port = 0;
  let owned: { exe: string; pid?: number } | undefined;

  async function disconnect() {
    await browser?.close().catch(() => undefined);
    browser = undefined;
  }

  async function captureFailure() {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page && !page.isClosed()) {
      await page.screenshot({ path: testInfo.outputPath('failure.png') }).catch(() => undefined);
      await writeFile(testInfo.outputPath('failure.txt'), await page.locator('body').innerText());
    }
  }

  async function stop() {
    try {
      if (desktop) {
        try {
          native({ action: 'close', desktop });
          await expect
            .poll(() => native({ action: 'inspect', desktop }).exists, { timeout: 30_000 })
            .toBe(false);
        } finally {
          const status = native({ action: 'inspect', desktop });
          if (status.exists && owned) {
            const pids = new Set([
              owned.pid,
              ...(status.windows?.map((window) => window.pid) ?? []),
            ]);
            for (const pid of pids) {
              if (pid) {
                native({ action: 'terminate', desktop, exe: owned.exe, pid });
              }
            }
            await expect
              .poll(() => native({ action: 'inspect', desktop }).exists, { timeout: 5000 })
              .toBe(false);
          }
        }
        desktop = undefined;
        owned = undefined;
      }
    } finally {
      await disconnect();
    }
  }

  async function connect() {
    await expect
      .poll(
        async () => {
          try {
            return (
              await fetch(`http://127.0.0.1:${port}/json/version`, {
                signal: AbortSignal.timeout(300),
              })
            ).ok;
          } catch {
            return false;
          }
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = browser.contexts()[0].pages()[0];
    await expect(page.locator('main').first()).toBeVisible();
    if (owned) {
      owned.pid = native({ action: 'inspect', desktop }).windows?.find(
        (window) => window.class !== '#32770',
      )?.pid;
    }
    return page;
  }

  async function start(folder: string) {
    port = await freePort();
    desktop = `RilldayTest-${randomUUID()}`;
    owned = { exe: resolve(folder, 'rillday-desktop.exe') };
    owned.pid = native({
      action: 'start',
      desktop,
      exe: owned.exe,
      env: {
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --enable-automation --lang=en-US --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding`,
      },
    }).pid;
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
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Choose where to keep your work' }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(23, 23, 23)');
    await page.screenshot({ path: testInfo.outputPath('first-run.png'), animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Choose where to keep your work' }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(255, 255, 255)');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    await page.screenshot({
      path: testInfo.outputPath('first-run-light.png'),
      animations: 'disabled',
    });
    const session = await page.context().newCDPSession(page);
    const userAgent = await page.evaluate(() => navigator.userAgent);
    await session.send('Emulation.setUserAgentOverride', { userAgent, acceptLanguage: 'ko-KR' });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: '자료를 보관할 위치를 선택하세요' }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('first-run-korean.png'),
      animations: 'disabled',
    });
    await session.send('Emulation.setUserAgentOverride', { userAgent, acceptLanguage: 'en-US' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Choose where to keep your work' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Choose folder…', exact: true }).click();
    await expect
      .poll(() =>
        native({ action: 'inspect', desktop }).windows?.some((window) => window.class === '#32770'),
      )
      .toBe(true);
    native({ action: 'cancel', desktop });
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
    await page.getByLabel('Habit Tracker', { exact: true }).click();
    await page.getByRole('button', { name: 'Add habit', exact: true }).click();
    await page.getByRole('button', { name: 'Create your own', exact: true }).click();
    await page.getByLabel('Habit name', { exact: true }).fill('Desktop habit');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.habit-name').filter({ hasText: 'Desktop habit' }).click();
    await page
      .locator('.habit-checkin')
      .getByRole('button', { name: 'Complete', exact: true })
      .click();
    await saved(page);
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
    await page.getByLabel('Habit Tracker', { exact: true }).click();
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
        .poll(() =>
          native({ action: 'inspect', desktop }).windows?.some(
            (window) => window.class === '#32770',
          ),
        )
        .toBe(true);
      const picker = native({ action: 'select', desktop, path });
      await testInfo.attach('folder-picker', {
        body: JSON.stringify(picker),
        contentType: 'application/json',
      });
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
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`http://127.0.0.1:${port}/json/list`)).ok && page.isClosed();
          } catch {
            return page.isClosed();
          }
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await disconnect();
    page = await connect();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByLabel('Habit Tracker', { exact: true }).click();
    await expect(page.getByText('Desktop habit', { exact: true })).toBeVisible();
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page.getByRole('button', { name: 'Data and backups', exact: true }).click();
    await expect(page.getByLabel('Current data folder', { exact: true })).toHaveText(selected);
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await page.getByRole('radio', { name: 'Light', exact: true }).click();
    await page.getByRole('button', { name: 'Data and backups', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose folder…', exact: true })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath('data-folder-light.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await page.getByRole('combobox', { name: 'Language', exact: true }).click();
    await page.getByRole('option', { name: '한국어', exact: true }).click();
    await page.getByRole('button', { name: '데이터와 백업', exact: true }).click();
    await expect(page.getByLabel('현재 자료 폴더', { exact: true })).toHaveText(selected);
    await expect(page.getByRole('button', { name: '폴더 선택…', exact: true })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath('data-folder-korean.png'),
      animations: 'disabled',
    });
    expect(await readFile(locationFile, 'utf8')).toBe(selected + '\n');
    await saved(page);
    await stop();
    await rename(configuration, resolve(fixture, 'previous-configuration'));
    page = await start(moved);
    await expect(
      page.getByRole('heading', { name: 'Choose where to keep your work' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Choose folder…', exact: true }).click();
    await expect
      .poll(() =>
        native({ action: 'inspect', desktop }).windows?.some((window) => window.class === '#32770'),
      )
      .toBe(true);
    native({ action: 'select', desktop, path: selected });
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
          offlineTaskAndHabit: true,
          invalidFolderRejected: true,
          manualServerSetupAndSync: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await captureFailure().catch(() => undefined);
    throw error;
  } finally {
    await writeFile(testInfo.outputPath('fixture.json'), JSON.stringify({ fixture })).catch(
      () => undefined,
    );
    await stop();
    for (const [source, name] of [
      [defaultPath, 'default-profile'],
      [configuration, 'configuration'],
    ]) {
      if (
        await access(source).then(
          () => true,
          () => false,
        )
      ) {
        await rename(source, resolve(fixture, name));
      }
    }
  }
});
