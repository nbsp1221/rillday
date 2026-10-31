import assert from 'node:assert/strict';
import { type Page, expect, test } from '@playwright/test';
import { visibleBox } from '@repo/test-support';
import { selectCalendarDate } from '../support/date-picker';
import { reloadSavedPage } from '../support/navigation';
import { storedWorkspace } from '../support/storage';
import { archiveFixture } from '../support/workspace-archive';

async function add(page: Page, title: string) {
  const capture = page.getByLabel('Quick add task', { exact: true });
  await capture.fill(title);
  await capture.press('Enter');
}

test('every priority keeps one semantic color across menu, detail circle, rest, hover and focus', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, 'Priority color');
  await page.locator('.task-title').click();
  const trigger = page.getByRole('button', { name: 'Set priority', exact: true });
  for (const theme of ['dark', 'light']) {
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page
      .getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    for (const [value, name] of [
      [3, 'High priority'],
      [2, 'Medium priority'],
      [1, 'Low priority'],
      [0, 'No priority'],
    ] as const) {
      await trigger.click();
      const item = page.getByRole('menuitemradio', { name, exact: true });
      let color = '';
      await expect
        .poll(async () => {
          color = await item.evaluate((el) => getComputedStyle(el).color);
          return color;
        })
        .not.toBe('');
      await item.click();
      await expect(trigger).toHaveAttribute('title', name);
      for (const state of ['rest', 'hover', 'focus']) {
        if (state === 'rest') {
          await page.mouse.move(0, 0);
        } else if (state === 'hover') {
          await trigger.hover();
        } else {
          await page.keyboard.press('Tab');
          await trigger.focus();
        }
        await expect(trigger).toHaveCSS('color', color);
      }
      await expect
        .poll(() =>
          page
            .locator('.td-title-row .td-complete')
            .evaluate((el) => getComputedStyle(el, '::before').borderTopColor),
        )
        .toBe(color);
      await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.priority).toBe(value);
    }
  }
});

test('selection changes never paint an old title or a missing description editor', async ({
  page,
}) => {
  await page.goto('/');
  const tasks = [
    ['Alpha short', 'Alpha document'],
    ['Beta long title '.repeat(9).trim(), 'Beta document'],
    ['Empty description', ''],
  ] as const;
  for (const [title, body] of tasks) {
    await add(page, title);
    await page.locator('.task-title').filter({ hasText: title }).click();
    await page.getByLabel('Task description', { exact: true }).fill(body);
    await page.getByLabel('Close task details', { exact: true }).click();
  }
  await page.locator('.task-title').filter({ hasText: tasks[0][0] }).click();
  await page.getByLabel('Task description', { exact: true }).waitFor();
  const observed = page.evaluate(
    () =>
      new Promise<Array<{ selected: string; title: string; body: string; width: number }>>(
        (resolve) => {
          const samples: Array<{
            selected: string;
            title: string;
            body: string;
            width: number;
          }> = [];
          let stopped = false;

          const record = () => {
            const selected =
              document.querySelector('.task-row.selected .task-title')?.textContent ?? '';
            const matchedElement = document.querySelector('.detail-pane');
            if (matchedElement === null) {
              throw new Error("Expected element matching '.detail-pane'");
            }
            samples.push({
              selected,
              title: document.querySelector<HTMLTextAreaElement>('.td-title')?.value ?? '',
              body: document.querySelector('.td-markdown [contenteditable]')?.textContent ?? '',
              width: matchedElement.getBoundingClientRect().width,
            });
            if (!stopped) {
              requestAnimationFrame(record);
            }
          };

          requestAnimationFrame(record);
          window.addEventListener(
            'selection-probe-stop',
            () => {
              stopped = true;
              resolve(samples);
            },
            { once: true },
          );
        },
      ),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (let repetition = 0; repetition < 4; repetition++) {
    for (const [title] of tasks) {
      await page.locator('.task-title').filter({ hasText: title }).click({ delay: 80 });
    }
  }
  await page.evaluate(() => window.dispatchEvent(new Event('selection-probe-stop')));
  const samples = await observed;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(samples.length).toBeGreaterThan(12);
  for (const frame of samples) {
    expect(frame.title).toBe(frame.selected);
    const entry = tasks.find(([title]) => title === frame.selected);
    assert(entry !== undefined, 'Missing entry');
    expect(frame.body).toBe(entry[1]);
    expect(frame.width).toBe(samples[0]?.width);
  }
});

test('switching descriptions isolates task content and undo, including identical documents', async ({
  page,
}) => {
  await page.goto('/');
  const notes = page.getByLabel('Task description', { exact: true });
  for (const [title, body] of [
    ['Alpha', 'Alpha original'],
    ['Beta', 'Beta original'],
    ['Same', 'Beta original'],
  ] as const) {
    await add(page, title);
    await page.locator('.task-title').filter({ hasText: title }).click();
    await notes.fill(body);
    await page.getByLabel('Close task details', { exact: true }).click();
  }
  await page.locator('.task-title').filter({ hasText: 'Alpha' }).click();
  await notes.fill('Alpha edited');
  await page.locator('.task-title').filter({ hasText: 'Beta' }).click();
  await notes.focus();
  await notes.press('Control+z');
  await expect(notes).toHaveText('Beta original');
  await notes.press('End');
  await notes.pressSequentially(' changed');
  await notes.press('Control+z');
  await expect(notes).toHaveText('Beta original');
  await notes.press('Control+Shift+z');
  await expect(notes).toHaveText('Beta original changed');
  await notes.press('Control+z');
  await page.locator('.task-title').filter({ hasText: 'Same' }).click();
  await notes.focus();
  await notes.press('End');
  await notes.pressSequentially(' same');
  await notes.press('Control+z');
  await expect(notes).toHaveText('Beta original');
  await expect
    .poll(async () => {
      const saved = await storedWorkspace(page);
      return ['Alpha', 'Beta', 'Same'].map(
        (title) => saved.tasks.find((task) => task.title === title)?.notes,
      );
    })
    .toEqual(['Alpha edited', 'Beta original', 'Beta original']);
  await reloadSavedPage(page);
  await page.locator('.task-title').filter({ hasText: 'Same' }).click();
  await expect(notes).toHaveText('Beta original');
});

test('Korean composition caret follows the complete glyph and commits without sentinel text', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, '한글 입력 검토');
  await page.locator('.task-title').click();
  const notes = page.getByLabel('Task description', { exact: true });
  const cdp = await page.context().newCDPSession(page);
  await notes.focus();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await notes.press('ControlOrMeta+a');
    await notes.press('Backspace');
    await expect(notes).toHaveText('');
    await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.notes).toBe('');
    await notes.focus();
    for (const text of ['ㅇ', '아', '안']) {
      await cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
      await expect(notes).toContainText(text);
      const error = await notes.evaluate(() => {
        const selection = getSelection();
        if (selection === null) {
          throw new Error('Missing selection');
        }
        const node = selection.anchorNode;
        if (node === null) {
          throw new Error('Missing node');
        }
        const offset = selection.anchorOffset;
        const range = document.createRange();
        range.setStart(node, 0);
        range.collapse(true);
        const start = range.getBoundingClientRect().x;
        range.setStart(node, offset);
        range.collapse(true);
        const actual = range.getBoundingClientRect().x - start;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
          throw new Error('Missing ctx');
        }
        if (node.parentElement === null) {
          throw new Error('Missing node.parentElement');
        }
        ctx.font = getComputedStyle(node.parentElement).font;
        if (node.textContent === null) {
          throw new Error('Missing node.textContent');
        }
        return Math.abs(actual - ctx.measureText(node.textContent.slice(0, offset)).width);
      });
      expect(error).toBeLessThan(1);
    }
    await cdp.send('Input.insertText', { text: '안' });
    await notes.press('End');
    await cdp.send('Input.imeSetComposition', { text: '녕', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '녕' });
    await expect(notes).toHaveText('안녕');
    await expect.poll(async () => (await storedWorkspace(page)).tasks[0]?.notes).toBe('안녕');
  }
  await notes.press('Enter');
  await notes.pressSequentially('[] ');
  for (const text of ['ㅎ', '하', '한']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 });
  }
  await cdp.send('Input.insertText', { text: '한' });
  await expect(notes.getByRole('checkbox')).toHaveText('한');
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.notes)
    .toBe('안녕\n\n- [ ] 한');
  await page.reload();
  await page.locator('.task-title').click();
  await expect(notes).toContainText('안녕');
  await expect(notes.getByRole('checkbox')).toHaveText('한');
});

test('imported Markdown renders tables and unknown-language code without rewriting the stored source', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, 'Formatted document');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(1);
  const backup = await storedWorkspace(page);
  const source =
    '## Review content\n\n| Item | Status |\n| --- | --- |\n| research | Complete |\n\n```custom-language caption\nconst sample = "Preserve";\n```\n\n[Reference document](https://example.com)\n\n- [x] Completed item';
  assert(backup.tasks[0] !== undefined, 'Missing backup.tasks[0]');
  backup.tasks[0].notes = source;
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'markdown.json',
    mimeType: 'application/json',
    buffer: Buffer.from(await archiveFixture(backup, 'Asia/Seoul')),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('.task-title').click();
  const notes = page.getByLabel('Task description', { exact: true });
  await expect(notes.locator('h2')).toHaveText('Review content');
  await expect(notes.locator('table')).toContainText('research');
  await expect(notes.getByRole('link', { name: 'Reference document' })).toHaveAttribute(
    'href',
    'https://example.com',
  );
  await expect(notes.locator('.cm-content')).toContainText('Preserve');
  expect((await storedWorkspace(page)).tasks[0]?.notes).toBe(source);

  const codeLayout = async () =>
    page.locator('.cm-editor').evaluate((editor) => {
      const code = editor.getBoundingClientRect();
      if (editor.parentElement === null) {
        throw new Error('Missing editor.parentElement');
      }
      const wrapper = editor.parentElement.parentElement;
      if (wrapper === null) {
        throw new Error('Missing wrapper');
      }
      if (wrapper.firstElementChild === null) {
        throw new Error('Missing wrapper.firstElementChild');
      }
      const bar = wrapper.firstElementChild.getBoundingClientRect();
      const style = getComputedStyle(wrapper);
      return {
        overlap: bar.bottom > code.y,
        width: code.width,
        available:
          wrapper.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight) -
          2,
      };
    });

  const desktopCode = await codeLayout();
  expect(desktopCode.overlap).toBe(false);
  expect(desktopCode.width).toBeGreaterThanOrEqual(desktopCode.available - 1);

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const narrowCode = await codeLayout();
  expect(narrowCode.overlap).toBe(false);
  expect(narrowCode.width).toBeGreaterThanOrEqual(narrowCode.available - 1);

  await notes.getByRole('checkbox').click({ position: { x: 8, y: 14 } });
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.notes)
    .toContain('```custom-language caption');
});

test('embedded expression syntax stays literal without executing code or rewriting saved text', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, 'Preserve source');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(1);
  const backup = await storedWorkspace(page);
  const source = '{globalThis.__rilldayMarkdownExecuted = true}\n\nBody text';
  assert(backup.tasks[0] !== undefined, 'Missing backup.tasks[0]');
  backup.tasks[0].notes = source;
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'unsupported.json',
    mimeType: 'application/json',
    buffer: Buffer.from(await archiveFixture(backup, 'Asia/Seoul')),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('.task-title').click();
  const editor = page.getByLabel('Task description', { exact: true });
  await expect(editor).toContainText('{globalThis.__rilldayMarkdownExecuted = true}');
  await expect(editor).toContainText('Body text');
  expect(await page.evaluate(() => '__rilldayMarkdownExecuted' in globalThis)).toBe(false);
  expect((await storedWorkspace(page)).tasks[0]?.notes).toBe(source);
  await editor.fill(source + '\nUpdated source');
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.notes)
    .toContain('Updated source');
});

test('Markdown shortcuts edit one document and checkboxes support pointer, keyboard and local undo', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, 'Edit Markdown');
  await page.locator('.task-title').click();
  const notes = page.getByLabel('Task description', { exact: true });
  await notes.focus();
  await notes.pressSequentially('# Important plan');
  await notes.press('Enter');
  await notes.pressSequentially('**Emphasized text** ');
  await notes.press('Enter');
  await notes.pressSequentially('[] First item');
  await notes.press('Enter');
  await notes.pressSequentially('Second item');
  await expect(notes.locator('h1')).toHaveText('Important plan');
  await expect(notes.locator('strong')).toHaveText('Emphasized text');
  const checks = notes.getByRole('checkbox');
  await expect(checks).toHaveCount(2);
  await checks.first().click({ position: { x: 8, y: 14 } });
  await expect(checks.first()).toHaveAttribute('aria-checked', 'true');
  await checks.last().focus();
  await checks.last().press('Space');
  await expect(checks.last()).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.notes)
    .toContain('- [x] Second item');
  await notes.focus();
  await notes.press('Control+z');
  await expect(checks.last()).toHaveAttribute('aria-checked', 'false');
  await notes.press('Control+Shift+z');
  await expect(checks.last()).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Close task details', { exact: true }).click();
  await expect
    .poll(async () => (await storedWorkspace(page)).tasks[0]?.notes)
    .toMatch(/- \[x\] First item[\s\S]*- \[x\] Second item/);
  await reloadSavedPage(page);
  await page.locator('.task-title').click();
  await expect(page.getByRole('checkbox', { name: 'First item', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('Markdown checkbox focus follows the small mark while the larger target remains operable', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByLabel('Settings and backup', { exact: true }).click();
    await page
      .locator('.settings-nav')
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page
      .getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page
      .locator('.task-title')
      .filter({ hasText: 'Choose three priorities for the coming week' })
      .click();
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const check = page.locator('.td-markdown [role=checkbox]').nth(width === 1440 ? 1 : 2);
      const before = await check.getAttribute('aria-checked');
      await check.click({ position: { x: 2, y: 14 } });
      await expect(check).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
      for (const method of ['pointer', 'keyboard']) {
        if (method === 'keyboard') {
          await page.getByLabel('Task description', { exact: true }).focus();
          await check.focus();
          await check.press('Space');
          assert(before !== null, 'Missing before');
          await expect(check).toHaveAttribute('aria-checked', before);
        }
        const geometry = await check.evaluate((el) => {
          const s = getComputedStyle(el, '::before');
          const target = parseFloat(s.width);
          const border = parseFloat(s.borderLeftWidth);
          const outline = parseFloat(s.outlineWidth);
          const offset = parseFloat(s.outlineOffset);
          return {
            target,
            visual: target - 2 * border,
            focus: target + 2 * (outline + offset),
            visible: el.matches(':focus-visible'),
            outline: s.outlineStyle,
          };
        });
        expect(geometry.target).toBe(28);
        expect(geometry.visual).toBe(16);
        expect(geometry.visible).toBe(true);
        expect(geometry.outline).toBe('solid');
        expect(geometry.focus).toBeGreaterThan(geometry.visual);
        expect(geometry.focus).toBeLessThanOrEqual(geometry.visual + 4);
      }
    }
    await page.getByLabel('Close task details', { exact: true }).click();
  }
});

test('unsupported backup shapes preserve the current workspace', async ({ page }) => {
  await page.goto('/');
  await add(page, 'Keep this research');
  await expect.poll(async () => (await storedWorkspace(page)).tasks.length).toBe(1);
  const before = await storedWorkspace(page);
  await page.getByLabel('Settings and backup', { exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'unsupported.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(before)),
  });
  await expect(page.locator('.toast')).toContainText('backup format is unsupported');
  expect(await storedWorkspace(page)).toEqual(before);
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
});

test('Pin is a stable toggle, marks task identity and keeps dates in place', async ({ page }) => {
  await page.goto('/');
  await add(page, 'Pinned task tomorrow');
  await add(page, 'Another task');
  const row = page.locator('.task-row').filter({ hasText: 'Pinned task' });
  await row.locator('.task-title').click();
  const pin = page.getByRole('button', { name: 'Pin to top', exact: true });
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  const before = await visibleBox(pin);
  const date = await visibleBox(row.locator('.row-date'));

  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  expect(await visibleBox(pin)).toEqual(before);
  await expect(page.locator('.task-title').first()).toHaveText('Pinned task');
  await expect(row.locator('.task-heading .row-pin')).toHaveCount(1);
  await expect(row.locator('.row-trailing .row-pin')).toHaveCount(0);
  expect((await visibleBox(row.locator('.row-date'))).x).toBe(date.x);
  const geometry = await page.locator('.td-header .td-icon-button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      const iconElement = button.querySelector('svg');
      if (iconElement === null) {
        throw new Error("Expected element matching 'svg'");
      }
      const icon = iconElement.getBoundingClientRect();
      return {
        size: [box.width, box.height],
        icon: [icon.width, icon.height],
        center: [
          Math.abs(icon.x + icon.width / 2 - box.x - box.width / 2),
          Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2),
        ],
      };
    }),
  );
  for (const button of geometry) {
    expect(button.size).toEqual([32, 32]);
    expect(button.icon).toEqual([16, 16]);
    expect(button.center.every((error) => error < 0.5)).toBe(true);
  }
  await pin.focus();
  await pin.press('Space');
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await expect(row.locator('.row-pin')).toHaveCount(0);
  await pin.press('Enter');
  await expect
    .poll(
      async () =>
        (await storedWorkspace(page)).tasks.find((task) => task.title === 'Pinned task')?.pinned,
    )
    .toBe(true);
  await reloadSavedPage(page);
  await page.locator('.task-title').filter({ hasText: 'Pinned task' }).click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
});

test('unset properties share icon geometry and the date appears only after assignment', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, 'Property alignment');
  await page.locator('.task-title').click();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 700 });
    const state = await page.locator('.td-metadata button').evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        const iconElement2 = button.querySelector('svg');
        if (iconElement2 === null) {
          throw new Error("Expected element matching 'svg'");
        }
        const icon = iconElement2.getBoundingClientRect();
        return {
          size: [box.width, box.height],
          icon: [icon.width, icon.height],
          center: box.y + box.height / 2,
          text: button.textContent,
        };
      }),
    );
    expect(state).toHaveLength(3);
    for (const button of state) {
      expect(button.size).toEqual([32, 32]);
      expect(button.icon).toEqual([16, 16]);
      assert(state[0] !== undefined, 'Missing state[0]');
      expect(button.center).toBe(state[0].center);
      expect(button.text).toBe('');
    }
    const position = await page.locator('.td-metadata').evaluate((el) => {
      const iconElement3 = el.querySelector('svg');
      if (iconElement3 === null) {
        throw new Error("Expected element matching 'svg'");
      }
      const icon = iconElement3.getBoundingClientRect();
      const checkElement = document.querySelector('.td-title-row .td-complete');
      if (checkElement === null) {
        throw new Error("Expected element matching '.td-title-row .td-complete'");
      }
      const check = checkElement.getBoundingClientRect();
      const titleElement = document.querySelector('.td-title-row');
      if (titleElement === null) {
        throw new Error("Expected element matching '.td-title-row'");
      }
      const title = titleElement.getBoundingClientRect();
      return {
        axis: Math.abs(icon.x + icon.width / 2 - check.x - check.width / 2),
        gap: title.top - el.getBoundingClientRect().bottom,
      };
    });
    expect(position.axis).toBeLessThan(0.5);
    expect(position.gap).toBe(16);
  }
  await page.getByLabel('Set date', { exact: true }).click();
  await selectCalendarDate(page, '2026-12-31');
  await page.keyboard.press('Escape');
  await expect(page.locator('.td-date-button')).not.toHaveText('');
});

test.describe(() => {
  test.use({ serviceWorkers: 'block' });

  test('a missing editor chunk keeps the workspace open and its plain-text fallback saves durably', async ({
    page,
  }) => {
    await page.route('**/assets/MarkdownNotes-*.js', (route) => route.abort());
    await page.goto('/');
    const input = page.locator('#quick-add-input');
    await input.fill('Offline editor fallback');
    await input.press('Enter');
    await page.getByText('Offline editor fallback', { exact: true }).click();
    await expect(
      page.getByText('The editor could not load. You can edit the plain text here.', {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Task description', exact: true })
      .fill('Keep these offline notes');
    await page.getByLabel('Close task details', { exact: true }).click();
    await expect
      .poll(
        async () =>
          (await storedWorkspace(page)).tasks.find(
            (task) => task.title === 'Offline editor fallback',
          )?.notes,
      )
      .toBe('Keep these offline notes');
    await reloadSavedPage(page);
    await page.getByText('Offline editor fallback', { exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Task description', exact: true })).toHaveValue(
      'Keep these offline notes',
    );
    await expect(page.locator('.rillday-app')).toBeVisible();
  });
});
