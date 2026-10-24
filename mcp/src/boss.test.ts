import { describe, expect, test } from 'vitest';
import { bossState, resultName, type BossLike } from './boss';
import { bossIds, newEncounter } from './engine';

/** Plays the agent's first legal move, then the boss reply, until `done` holds or 30 rounds pass. */
function playUntil(encounter: ReturnType<typeof newEncounter>, done: () => boolean) {
  for (let round = 0; round < 30 && !done(); round++) {
    encounter.play(encounter.legal_moves().slice(0, 8));
    encounter.play(encounter.boss_move());
  }
  expect(done()).toBe(true);
}

/** A real encounter whose getters in `data` return the given records instead of the engine's. */
function withData(encounter: BossLike, data: Partial<Record<keyof BossLike, number[]>>): BossLike {
  return new Proxy(encounter, {
    get(target, key) {
      const records = data[key as keyof BossLike];
      if (records) return () => Int32Array.from(records);
      const member = Reflect.get(target, key);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
}

// One case per boss of the engine: what its getters show as in `tell` and `marks` (docs/specs/mcp.md section 4.3).
const CASES: Record<string, () => void> = {
  echo() {
    // No board special and no marks: its twist is the announced reply, in legal_moves (game.test.ts).
    expect(bossState('echo', newEncounter('echo', 0))).toEqual({
      id: 'echo',
      name: 'The Echo',
      phase: 0,
      phases: 3,
      tell: null,
      marks: [],
      result: 'playing',
    });
  },

  hull() {
    const hull = newEncounter('hull', 0);
    // Encounter.tell() is 0, the crack tick: a special with no more specific kind.
    expect(bossState('hull', hull)).toMatchObject({
      name: 'The Hull',
      tell: { kind: 'special', cells: [], text: 'board special 0 fires after the next ply' },
      marks: [],
    });
    playUntil(hull, () => hull.cracks().length > 0);
    const [q, r, left] = hull.cracks();
    expect(bossState('hull', hull).marks).toEqual([{ kind: 'crack', cell: `(${q},${r})`, value: left }]);
  },

  choir() {
    const state = bossState('choir', newEncounter('choir', 0));
    expect(state.name).toBe('The Choir');
    // The Alto moves first. Each army mark carries its code: 0 Alto, 1 Tenor, 2 Bass.
    expect(state.marks.map((mark) => mark.kind)).toEqual(Array(12).fill('army'));
    expect(state.marks.map((mark) => mark.value).sort()).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]);
    const alto = state.marks.filter((mark) => mark.value === 0).map((mark) => mark.cell);
    expect(state.tell).toEqual({ kind: 'next_army', cells: alto, text: 'the Alto army moves next' });
  },

  chaplain() {
    const chaplain = newEncounter('chaplain', 0);
    expect(bossState('chaplain', chaplain)).toMatchObject({
      name: 'The Chaplain',
      tell: { kind: 'special', cells: [], text: 'board special 1 fires after the next ply' },
      marks: [],
    });
    // Marbles that flip win over the special id, converted marbles are marks with no value.
    const state = bossState('chaplain', withData(chaplain, { flips: [0, 0, 1, -1], converted: [2, -3] }));
    expect(state.tell).toEqual({
      kind: 'flip',
      cells: ['(0,0)', '(1,-1)'],
      text: 'these marbles of yours become boss marbles after the boss turn unless they move',
    });
    expect(state.marks).toEqual([{ kind: 'converted', cell: '(2,-3)' }]);
  },
};

describe('boss state (docs/specs/mcp.md section 4.3)', () => {
  test('boss result codes, as words', () => {
    expect([0, 1, 2].map(resultName)).toEqual(['playing', 'won', 'lost']);
  });

  test('every boss of the engine has its case', () => {
    expect(Object.keys(CASES)).toEqual(bossIds());
  });

  test.each(bossIds())('%s maps its engine data to tell and marks', (id) => {
    CASES[id]!();
  });
});
