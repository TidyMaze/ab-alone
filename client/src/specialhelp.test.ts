import { describe, expect, it } from 'vitest';
import init, { Engine } from 'abalone-wasm';
import { cellIndex } from './board';
import { SPECIAL_LOOKS } from './roguelite';
import { SECRETS } from './story';
import { cardText, GIST, Legend, legendHtml, marksOn, RULES } from './specialhelp';

// What a special marble does, said in plain words on the fight's HUD (#1541, docs/specs/roguelite.md section 31): a legend line
// for each kind on the board that the player has not met, and a card with the rule of a marble hovered or tapped.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
await init({ module_or_path: await readFile(new URL('../../crates/abalone-wasm/pkg/abalone_wasm_bg.wasm', import.meta.url)) });

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
const digits = (s: string): string[] => s.match(/\d+/g) ?? [];

describe('the rule texts', () => {
  it('have a rule and a short line for each of the 10 kinds', () => {
    expect(RULES).toHaveLength(SPECIAL_LOOKS.length);
    expect(GIST).toHaveLength(SPECIAL_LOOKS.length);
    for (const text of [...RULES, ...GIST]) expect(text.length).toBeGreaterThan(10);
  });

  it('use no secret word of the story, whatever the stage of the player', () => {
    for (const text of [...RULES, ...GIST]) for (const { word } of SECRETS) expect(text).not.toMatch(word);
  });

  it('carry the numbers of the rule the compendium states: every number in the short help is in the rule', () => {
    SPECIAL_LOOKS.forEach((look, k) => {
      for (const n of digits(look.help)) expect(digits(RULES[k]!), look.name).toContain(n);
    });
  });

  it('say the weights and the turns of the engine: a Heavy weighs 2, a Heavy+ 3, a Bomb bursts on its 3rd turn', () => {
    const game = Engine.with_army(14, 14);
    game.place_special(0, 4, 9);
    expect(Array.from(game.fuses())).toEqual([0, 4, 3]); // 3 turns of its side at the start
    expect(RULES[8]).toContain('third turn');
    expect(GIST[8]).toContain('3rd turn');
    expect(RULES[0]).toContain('Weighs 2');
    expect(RULES[3]).toContain('Weighs 3');
  });
});

describe('marksOn', () => {
  it('lists the special marbles on the board with the side that owns each, in the order of the bridge', () => {
    const board = Array(61).fill(0) as number[];
    board[cellIndex(0, 4)] = 1;
    board[cellIndex(0, -4)] = 2;
    expect(marksOn(board, [0, 4, 3, 0, -4, 8])).toEqual([
      { cell: [0, 4], kind: 3, side: 1 },
      { cell: [0, -4], kind: 8, side: 2 },
    ]);
  });
});

describe('cardText', () => {
  it('names the marble, whose it is and its rule', () => {
    expect(cardText(3, 1)).toBe(`Spark (yours): ${RULES[2]}`);
    expect(cardText(1, 2)).toBe(`Heavy (the bot's): ${RULES[0]}`);
  });

  it('adds the turns a Bomb has left', () => {
    expect(cardText(9, 1, 2)).toBe(`Bomb (yours): ${RULES[8]} 2 turns left.`);
    expect(cardText(9, 2, 1)).toBe(`Bomb (the bot's): ${RULES[8]} 1 turn left.`);
  });
});

describe('legendHtml', () => {
  it('is a line per kind with its glyph, name and short line, none without a kind', () => {
    expect(legendHtml([], 0, '')).toBe('');
    const html = legendHtml([3, 9], 0, '');
    expect(html).toContain('<button type="button" class="special" data-special="3" aria-pressed="false">');
    expect(html).toContain(`Spark</b> ${GIST[2]}`);
    expect(html).toContain(`Bomb</b> ${GIST[8]}`);
    expect(html).not.toContain('special-card');
  });

  it('presses the line of the kind shown and writes the card under it', () => {
    const html = legendHtml([3, 9], 9, 'Bomb (yours): rule');
    expect(html).toContain('data-special="9" aria-pressed="true"');
    expect(html).toContain('data-special="3" aria-pressed="false"');
    expect(html).toContain('<p class="special-card" role="status">Bomb (yours): rule</p>');
  });

  it('shows the card alone when every kind on the board is met', () => {
    expect(legendHtml([], 3, 'Spark (yours): rule')).toBe('<div class="specials"><p class="special-card" role="status">Spark (yours): rule</p></div>');
  });
});

describe('Legend', () => {
  it('shows every kind on the board of a player who met none, and keeps them for the whole fight', () => {
    const store = memoryStorage();
    const legend = new Legend(store);
    legend.begin();
    expect(legend.fresh([3, 9])).toEqual([3, 9]);
    expect(legend.fresh([3])).toEqual([3]); // the Bomb burst: the Spark line stays, the Bomb's goes with its marble
    expect(store.data.get('ab-alone.roguelite.met')).toBeUndefined(); // met only once the fight is over
  });

  it('marks the kinds seen as met at the end of the fight, so the next fight shows only the new ones', () => {
    const store = memoryStorage();
    const first = new Legend(store);
    first.begin();
    first.fresh([3, 9]);
    first.end();
    expect(store.data.get('ab-alone.roguelite.met')).toBe('3,9');
    const next = new Legend(store);
    next.begin();
    expect(next.fresh([3, 10])).toEqual([10]);
    next.end();
    expect(store.data.get('ab-alone.roguelite.met')).toBe('3,9,10');
    next.end(); // nothing more to save
    expect(store.data.get('ab-alone.roguelite.met')).toBe('3,9,10');
  });

  it('works with a blocked storage: every kind is new', () => {
    const legend = new Legend(null);
    legend.begin();
    expect(legend.fresh([2])).toEqual([2]);
    legend.end();
    legend.begin();
    expect(legend.fresh([2])).toEqual([2]);
  });
});
