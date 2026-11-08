import { expect, test, type CDPSession, type Page } from '@playwright/test';

// The Open world budget (#1520, docs/specs/openworld.md section 17): a fixed script, run by hand with `bun run e2e:budget`. It is a report,
// not a gate (tag @budget): every run is a fresh page on `?openworld=7`, and the last test prints the median and the range
// of RUNS runs, since a loaded machine moves the long tasks. It measures, for the world: the triangles and draw calls of a frame, the
// JS heap once collected, the longest task from the load to the first drawn world, the longest task from a wild fight's touch to its
// arena (the first fight of the page, then a second), the heap once collected after the first fight, back in the world at the spawn, against the heap
// before it (`margin`: the board files the fight loaded stay), and after the second against the first (`leak`: what a fight leaves behind).
const RUNS = 5;
const SEED = 3; // a marble stands within the hero's sight of the spawn (openworld-wild.spec.ts)
const results: Record<string, number>[] = [];

type Hooks = { __openworldFixture: (f: object) => void; __openworldEnemies: () => [number, number][]; __renderCost: { calls: number; triangles: number } };
const data = (page: Page, key: string) => page.evaluate((k) => document.body.dataset[k], key);

/** The JS heap in MB after a full collection (the DevTools one, no `--expose-gc` needed), twice: weak references and finalizers go in the second. */
async function heap(cdp: CDPSession): Promise<number> {
  for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize / 1e6;
}

/**
 * Back from a fight, the hero stands beside the marble it fled, which fights again once the world's calm ends, 5 s after its first draw
 * (FLEE_GRACE_MS, #1511): on a loaded machine the settle and the heap's collections outlast it, a fight starts and the next fixture finds
 * no world (#1642). The hero steps back to the spawn in the same task the world comes back in (`openworldAt` is written with its view),
 * so no frame runs in between: no fight starts until the next fixture puts the hero beside the marble again.
 */
const stepAway = (page: Page, from: string) =>
  page.evaluate(
    (from) =>
      new Promise<void>((done) => {
        const away = () => {
          if (document.body.dataset.openworldAt !== from) return false;
          (window as unknown as Hooks).__openworldFixture({ hero: [0, 0], troop: [] });
          done();
          return true;
        };
        if (away()) return;
        const watch = new MutationObserver(() => away() && watch.disconnect());
        watch.observe(document.body, { attributes: true, attributeFilter: ['data-openworld-at'] });
      }),
    from,
  );

/** The longest main-thread task since the last call, in ms. */
const longest = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __long: number };
    const ms = w.__long;
    w.__long = 0;
    return ms;
  });

for (let run = 1; run <= RUNS; run++) {
  test(`run ${run} of the Open world budget @budget`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __long: number }).__long = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) (window as unknown as { __long: number }).__long = Math.max((window as unknown as { __long: number }).__long, e.duration);
      }).observe({ type: 'longtask', buffered: true });
    });
    const cdp = await page.context().newCDPSession(page);
    await page.goto(`./?openworld=${SEED}`);
    await expect.poll(() => data(page, 'openworldAt')).toBe('0,0');
    await expect.poll(() => data(page, 'veil')).toBeUndefined(); // the first world frame is shown
    await page.waitForTimeout(1500); // the shaders, the chunks and the models settle
    const entry = await longest(page);
    const cost = await page.evaluate(() => (window as unknown as Hooks).__renderCost);
    const heapLoad = await heap(cdp);
    const [marble] = await page.evaluate(() => (window as unknown as Hooks).__openworldEnemies());
    const beside = [marble![0] + 1, marble![1]];
    const fights: { long: number; heapAfter: number }[] = [];
    for (let fight = 0; fight < 2; fight++) {
      await longest(page);
      await page.evaluate((hero) => (window as unknown as Hooks).__openworldFixture({ hero, troop: [] }), beside); // beside a marble: it touches
      await expect(page.getByRole('button', { name: 'Flee' })).toBeVisible();
      await expect.poll(() => data(page, 'fightBoard')).toBeDefined();
      await page.waitForTimeout(1000);
      const long = await longest(page);
      await page.getByRole('button', { name: 'Flee' }).click();
      await stepAway(page, beside.join(','));
      await expect.poll(() => data(page, 'openworldAt')).toBe('0,0');
      await page.waitForTimeout(1000);
      fights.push({ long, heapAfter: await heap(cdp) });
    }
    const [first, second] = fights as [(typeof fights)[number], (typeof fights)[number]];
    results.push({ triangles: cost.triangles, calls: cost.calls, heapLoad, entry, toFight: first.long, toFight2: second.long, heapAfter: first.heapAfter, margin: first.heapAfter - heapLoad, leak: second.heapAfter - first.heapAfter });
  });
}

test('the median and the range of the Open world budget runs @budget', () => {
  const rows = Object.keys(results[0]!).map((key) => {
    const values = results.map((r) => r[key]!).sort((a, b) => a - b);
    return `${key.padEnd(10)} median ${values[Math.floor(values.length / 2)]!.toFixed(1)}  range ${values[0]!.toFixed(1)} to ${values.at(-1)!.toFixed(1)}`;
  });
  console.log(`\nOpen world budget, ${results.length} runs, seed ${SEED}:\n${rows.join('\n')}`);
  expect(results.length).toBe(RUNS);
});
