import { describe, expect, it } from 'vitest';
import init, { Engine } from 'edgefall-wasm';
import { MIN_ARMY } from './roguelite';
import { armyOnBoard, runScoreHtml } from './runhud';

// The score of a run's army fight (#1540, docs/specs/roguelite.md section 31): the army on the board, the army at which the
// run ends, the marbles lost this fight in red and the bot's ejections, all read from the engine's own counts.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
await init({ module_or_path: await readFile(new URL('../../crates/edgefall-wasm/pkg/edgefall_wasm_bg.wasm', import.meta.url)) });

const text = (html: string): string => html.replace(/<[^>]+>/g, '');

describe('armyOnBoard', () => {
  it('counts the Black marbles of a board, not the White ones nor the empty cells', () => {
    expect(armyOnBoard([0, 1, 1, 2, 2, 2, 1])).toBe(3);
    expect(armyOnBoard([])).toBe(0);
  });
});

describe('runScoreHtml', () => {
  it('reads the army, the army the run ends below, the marbles lost and the bot\'s ejections at the start of a fight', () => {
    const game = Engine.with_army(14, 10);
    const html = runScoreHtml(game.board(), [game.ejected(1), game.ejected(2)], [game.win_ejections(1), game.win_ejections(2)]);
    expect(text(html)).toBe('Army 14 (run ends below 9) · lost 0Bot ejected 0/6');
    expect(html).not.toContain('class="lost"'); // nothing lost: not red
  });

  it('puts the marbles lost in red, the army less what was lost, and the same threshold', () => {
    const html = runScoreHtml(Array(12).fill(1), [3, 2], [6, 6]);
    expect(html).toContain('<span class="lost">lost 2</span>');
    expect(text(html)).toBe('Army 12 (run ends below 9) · lost 2Bot ejected 3/6');
  });

  it('moves the threshold with a marble that joined the board (Reinforce): the fight is lost after the same ejections', () => {
    expect(text(runScoreHtml(Array(13).fill(1), [0, 2], [6, 6]))).toContain('Army 13 (run ends below 10)');
  });

  it('is the engine\'s threshold for every army: below 4 up to an army of 9, the cap of 6 ejections above', () => {
    for (let army = MIN_ARMY; army <= 14; army++) {
      const game = Engine.with_army(army, 10);
      const html = text(runScoreHtml(game.board(), [0, 0], [game.win_ejections(1), game.win_ejections(2)]));
      const below = army <= MIN_ARMY + 5 ? MIN_ARMY : army - 5; // the rule of crates/edgefall-core/src/run.rs, `army_game_against`
      expect(html, `army ${army}`).toContain(`Army ${army} (run ends below ${below})`);
    }
  });

  it('says the bot\'s ejections out of the engine\'s count, not its marbles left', () => {
    expect(text(runScoreHtml(Array(14).fill(1), [4, 0], [6, 6]))).toContain('Bot ejected 4/6');
  });
});
