import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

// A local game exported as a JSON file and imported back, replayed through the engine (#219,
// docs/specs/tech.md section 8). The file is the save format of the resume task (#218).

/** Waits for a loaded page to show its game and be ready for clicks. */
async function ready(page: Page): Promise<void> {
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('to move');
  // __cellToScreen reads the camera, which is only set after the first rendered frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
}

async function click(page: Page, q: number, r: number): Promise<void> {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  await page.mouse.click(p.x, p.y);
}

/** Moves one marble: select it, then click the cell it goes to. */
async function move(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await click(page, ...from);
  await click(page, ...to);
}

const plies = (page: Page) => page.evaluate(() => (window as any).__plies() as number);
const history = (page: Page) => page.evaluate(() => (window as any).__history() as number[][]);

/** Moves of the saved local game, read from the page's real IndexedDB; 0 when nothing is saved. */
const savedPlies = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((done) => {
        const req = indexedDB.open('ab-alone');
        req.onupgradeneeded = () => req.transaction!.abort(); // never create the page's database here
        req.onerror = () => done(0);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('game').objectStore('game').get('local');
          get.onsuccess = () => {
            db.close();
            done(get.result?.moves.length ?? 0);
          };
        };
      }),
  );

/** Deletes the saved local game, so the next load starts a new game (the New game button is #230). */
const clearSave = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done, fail) => {
        const req = indexedDB.open('ab-alone');
        req.onerror = () => fail(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('game', 'readwrite');
          tx.objectStore('game').delete('local');
          tx.oncomplete = () => {
            db.close();
            done();
          };
        };
      }),
  );

/** What an import must restore: the plies played, the legal moves (they follow the position) and the HUD. */
const snapshot = async (page: Page) => ({
  history: await history(page),
  legal: await page.evaluate(() => (window as any).__legal()),
  hud: await page.locator('#hud .turn').textContent(),
  score: await page.locator('#hud .score').textContent(),
});

/** Clicks Export game and saves the download, returns its file name, path and parsed content. */
async function exportGame(page: Page, dir: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export game' }).click(),
  ]);
  const name = download.suggestedFilename();
  const path = `${dir}/${name}`;
  await download.saveAs(path);
  return { name, path, content: JSON.parse(await readFile(path, 'utf8')) };
}

/** Clicks Import game and picks the file at `path` in the file chooser. */
async function importGame(page: Page, path: string): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import game' }).click(),
  ]);
  await chooser.setFiles(path);
}

/** Picks a file holding `text` straight in the file input behind Import game (lighter on a loaded machine). */
const importText = (page: Page, text: string) =>
  page
    .locator('#import-file')
    .setInputFiles({ name: 'game.json', mimeType: 'application/json', buffer: Buffer.from(text) });

const A = [1, 4, 0, 2, 0, 0, 0, 0]; // Black (0, 2) to (0, 1)
const B = [1, 5, 0, -2, 0, 0, 0, 0]; // White (0, -2) to (0, -1)
const C = [1, 4, 0, 1, 0, 0, 0, 0]; // Black (0, 1) to (0, 0)
const D = [1, 4, 0, -1, 0, 0, 0, 0]; // White (0, -1) back to (0, -2)
const E = [1, 5, 0, 0, 0, 0, 0, 0]; // Black (0, 0) back to (0, 1)
const save = (bot: boolean, moves: number[][], version = 1) => ({ version, mode: 'local', layout: 'standard', bot, moves });

test('a game exported to a file comes back on a new game, replayed and saved', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 24, 12, 0)); // local noon: the file name holds that date
  await page.goto('./?bot=off');
  await ready(page);
  const hud = page.locator('#hud');
  await move(page, [0, 2], [0, 1]); // Black
  await move(page, [0, -2], [0, -1]); // White
  await expect(hud).toContainText('Black to move');
  const before = await snapshot(page);

  const file = await exportGame(page, testInfo.outputDir);
  expect(file.name).toBe('ab-alone-2026-10-24.json');
  expect(file.content).toEqual(save(false, [A, B]));

  // A new game: the save cleared and the page reloaded.
  await clearSave(page);
  await page.reload();
  await ready(page);
  expect(await plies(page)).toBe(0);

  await importGame(page, file.path);
  await expect.poll(() => plies(page)).toBe(2);
  expect(await snapshot(page)).toEqual(before);
  await expect(hud).toContainText('Black to move');
  await expect.poll(() => savedPlies(page)).toBe(2);

  // Saved like a game played here: it survives a reload, and goes on.
  await page.reload();
  await ready(page);
  expect(await snapshot(page)).toEqual(before);
  await move(page, [0, 1], [0, 0]); // Black
  await expect(hud).toContainText('White to move');
  expect(await history(page)).toEqual([A, B, C]);
});

test('a file that is not a game, of an unknown version or with an illegal move is refused, the game stays', async ({
  page,
}) => {
  await page.goto('./?bot=off');
  await ready(page);
  const hud = page.locator('#hud');
  await move(page, [0, 2], [0, 1]); // Black
  await expect(hud).toContainText('White to move');
  await expect.poll(() => savedPlies(page)).toBe(1);
  const before = await snapshot(page);

  // Each refusal says something else than the one before, so every message is the new file's. The other
  // causes of "not a game file" are unit tests (gamefile.test.ts).
  for (const [text, message] of [
    ['not a game', 'import refused: not a game file'],
    [JSON.stringify(save(false, [A], 2)), 'import refused: unknown file version'],
    [JSON.stringify(save(false, [A, A])), 'import refused: illegal move in the file'], // Black twice
  ]) {
    await importText(page, text);
    await expect(hud).toContainText(message);
    expect(await history(page)).toEqual([A]);
    expect(await savedPlies(page)).toBe(1);
  }
  expect(await snapshot(page)).toEqual(before);

  // The game goes on as it was.
  await move(page, [0, -2], [0, -1]); // White
  await expect(hud).toContainText('Black to move');
  expect(await history(page)).toEqual([A, B]);
});

test('an imported game replaces a game against the bot in progress, and the bot plays on', async ({ page }, testInfo) => {
  test.slow(); // two bot searches in the worker
  await page.goto('./');
  await ready(page);
  await move(page, [0, 2], [0, 1]);
  await expect.poll(() => plies(page), { timeout: 30_000 }).toBe(2); // the bot replied

  // A hot-seat file with White to move: the page plays on in its own mode, the bot answers.
  await importText(page, JSON.stringify(save(false, [A, B, C])));
  await expect.poll(() => plies(page), { timeout: 30_000 }).toBe(4);
  expect((await history(page)).slice(0, 3)).toEqual([A, B, C]);
  await expect(page.locator('#hud')).toContainText('Black to move');
  await expect.poll(() => savedPlies(page)).toBe(4);

  const file = await exportGame(page, testInfo.outputDir);
  expect(file.content).toEqual(save(true, await history(page)));
});

test('an imported finished game shows its result, and a reload starts a new game', async ({ page }) => {
  await page.goto('./?bot=off');
  await ready(page);
  await move(page, [0, 2], [0, 1]); // Black
  await expect.poll(() => savedPlies(page)).toBe(1);

  // The position after the first move comes back a third time: a draw.
  await importText(page, JSON.stringify(save(false, [A, B, C, D, E, B, C, D, E])));
  await expect(page.locator('#hud')).toContainText('Draw by threefold repetition');
  expect(await plies(page)).toBe(9);
  await expect.poll(() => savedPlies(page)).toBe(0); // a finished game is not saved

  await page.reload();
  await ready(page);
  await expect(page.locator('#hud')).toContainText('Black to move');
  expect(await plies(page)).toBe(0);
});

test('export and import are not shown during a boss fight, a daily fight or an online game', async ({ page }) => {
  const exportButton = page.getByRole('button', { name: 'Export game' });
  const importButton = page.getByRole('button', { name: 'Import game' });
  const local = async () => {
    await ready(page);
    await expect(exportButton).toBeVisible();
    await expect(importButton).toBeVisible();
  };
  const hidden = async () => {
    await expect(exportButton).toBeHidden();
    await expect(importButton).toBeHidden();
  };
  await page.goto('./?net=hook');
  await local();
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();
  await expect(page.locator('#hud')).toContainText('The Echo');
  await hidden();

  await page.reload();
  await local();
  await page.locator('#daily').click();
  await expect(page.locator('#hud')).toContainText('Daily challenge');
  await hidden();

  await page.reload();
  await local();
  await page.locator('#play-online').click();
  await expect(page.locator('#hud')).toContainText('You are Black');
  await hidden();
});
