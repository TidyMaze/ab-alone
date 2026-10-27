import { describe, expect, test } from 'vitest';
import { bossState, resultName, type BossLike } from './boss';
import { BOARD_CELLS } from './board';
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

  ballast() {
    const ballast = newEncounter('ballast', 0);
    expect(bossState('ballast', ballast)).toEqual({
      id: 'ballast',
      name: 'The Ballast Mind',
      phase: 0,
      phases: 3,
      tell: null,
      marks: [],
      result: 'playing',
    });
    // In P2/P3 it reuses cracks and flips
    const state = bossState('ballast', withData(ballast, { cracks: [0, -5, 8], flips: [1, 2] }));
    expect(state.marks).toEqual([{ kind: 'crack', cell: '(0,-5)', value: 8 }]);
    expect(state.tell).toEqual({
      kind: 'flip',
      cells: ['(1,2)'],
      text: 'these marbles of yours become boss marbles after the boss turn unless they move',
    });
  },

  alien() {
    const alien = newEncounter('alien', 0);
    // Encounter.tell() is 0, the countdown at the end of the player turn.
    expect(bossState('alien', alien)).toMatchObject({
      name: 'The Alien',
      tell: { kind: 'special', cells: [], text: 'board special 0 fires after the next ply' },
      marks: [],
    });
    playUntil(alien, () => alien.eggs().length > 0);
    const [q, r, left] = alien.eggs();
    // An egg is a mark with the player turns left before it hatches.
    expect(bossState('alien', alien).marks).toEqual([{ kind: 'egg', cell: `(${q},${r})`, value: left }]);
  },

  railyard() {
    // No train at the start: the first one is announced at the end of the player's turn 1, seen on turn 2.
    const railyard = newEncounter('railyard', 3);
    // Each cell of the line is a mark with the player turns left before the train passes; Encounter.tell() is 0, the
    // count down at the end of the player turn.
    expect(bossState('railyard', railyard)).toMatchObject({
      name: 'The Rail Yard',
      tell: { kind: 'special', cells: [], text: 'board special 0 fires after the next ply' },
      marks: [],
    });
    // A train on the diagonal q + r = 0, from (4, -4) to (-4, 4), announced 5 turns ahead.
    const diagonal = [4, 3, 2, 1, 0, -1, -2, -3, -4].map((q) => ({ kind: 'train', cell: `(${q},${-q})`, value: 5 }));
    expect(bossState('railyard', withData(railyard, { trains: [22, 5, 4, -4, -4, 4] })).marks).toEqual(diagonal);
    const row = bossState('railyard', withData(railyard, { trains: [4, 2, 4, 0, -4, 0] }));
    expect(row.marks.map((mark) => mark.cell)).toEqual([4, 3, 2, 1, 0, -1, -2, -3, -4].map((q) => `(${q},0)`));
  },

  magnetizer() {
    const magnetizer = newEncounter('magnetizer', 0);
    // No special after the first ply: the first polarity comes after the player's 2nd turn.
    expect(bossState('magnetizer', magnetizer)).toMatchObject({ name: 'The Magnetizer', tell: null, marks: [] });
    playUntil(magnetizer, () => magnetizer.polarities().some((s) => s !== 0));
    const i = magnetizer.polarities().findIndex((s) => s !== 0);
    const [q, r] = BOARD_CELLS[i]!;
    // A polarity is a mark on the player marble, 1 for + and -1 for −.
    expect(bossState('magnetizer', magnetizer).marks).toEqual([
      { kind: 'polarity', cell: `(${q},${r})`, value: magnetizer.polarities()[i] },
    ]);
  },

  pulsar() {
    // Seed 2: the first pulsar pushes NW, its first pulse after the player's 3rd turn. No marks: a pulsar is off the
    // board.
    const pulsar = newEncounter('pulsar', 2);
    expect(bossState('pulsar', pulsar)).toMatchObject({ name: 'The Pulsar', marks: [] });
    expect(bossState('pulsar', pulsar).tell).toEqual({
      kind: 'pulse',
      cells: [],
      text: 'a pulse pushes every line NW after 3 of your turns, force 2: groups smaller than the force move one cell, the first group as big resists and shields the rest',
    });
    expect(bossState('pulsar', withData(pulsar, { pulsar: [0, 1, 0] })).tell!.text).toMatch(/^a pulse pushes every line E after 1 of your turns, force infinite:/);
  },

  overseer() {
    const overseer = newEncounter('overseer', 0);
    // The vents are marks; the neurotoxin clock is the tell, before the bare special id of every ply.
    const vents = ['(-3,-1)', '(4,-1)', '(-4,0)', '(4,0)', '(-4,1)', '(3,1)'];
    expect(bossState('overseer', overseer)).toMatchObject({
      name: 'The Overseer',
      tell: { kind: 'neurotoxin', cells: [], text: 'the boss wins at the end of your turn in 40 turns unless you win first' },
      marks: vents.map((cell) => ({ kind: 'incinerator', cell })),
    });
    playUntil(overseer, () => overseer.turns_left() === 38);
    expect(bossState('overseer', overseer).tell?.text).toContain('in 38 turns');
    expect(bossState('overseer', withData(overseer, { incinerators: [] })).marks).toEqual([]);
  },

  assembly() {
    // Seed 1: the centre belt first runs toward +q. In P1 only it runs; its 9 cells are marks with the direction.
    const assembly = newEncounter('assembly', 1);
    const row = (r: number, qs: number[], value: number) => qs.map((q) => ({ kind: 'belt', cell: `(${q},${r})`, value }));
    const centre = row(0, [-4, -3, -2, -1, 0, 1, 2, 3, 4], 1);
    expect(bossState('assembly', assembly)).toMatchObject({
      name: 'The Assembly Line',
      tell: { kind: 'belt_reverse', cells: [], text: 'the centre belt reverses after 5 of your turns' },
      marks: centre,
    });
    // A made-up state: the centre belt runs toward -q, the upper one toward +q, and announced slots are marks on their cells.
    const p3 = withData(assembly, { belts: [3, 0, -4, 9, -1, 2, 6, -1, -3, 8, 1, 0, -1, 1, -4, 8, 0, 0, 7] });
    expect(bossState('assembly', p3).tell!.text).toBe('the centre belt reverses after 3 of your turns');
    expect(bossState('assembly', p3).marks).toEqual([
      ...row(0, [-4, -3, -2, -1, 0, 1, 2, 3, 4], -1),
      { kind: 'strike', cell: '(2,0)' },
      ...row(-1, [-3, -2, -1, 0, 1, 2, 3, 4], 1),
      { kind: 'strike', cell: '(3,1)' },
    ]);
  },

  core() {
    const core = newEncounter('core', 0);
    // No charge and no event ahead in P1: no marks, and the bare special id of every ply.
    expect(bossState('core', core)).toMatchObject({
      name: 'The Unstable Core',
      tell: { kind: 'special', cells: [], text: 'board special 0 fires after the next ply' },
      marks: [],
    });
    // A marble on a centre cell is charged at the end of its turn: a mark with its charges.
    core.play(Int32Array.from([1, 4, 0, 2, 0, 0, 0, 0])); // (0, 2) to (0, 1)
    expect(bossState('core', core).marks).toEqual([{ kind: 'charge', cell: '(0,1)', value: 1 }]);
    const state = (unstable: number[]) => bossState('core', withData(core, { unstable })).tell;
    expect(state([1, 1, -1, -1])).toEqual({ kind: 'core', cells: [], text: 'the core collapses after your move: the marbles on the 7 centre cells are ejected' });
    expect(state([0, 0, 2, 1])!.text).toBe('a shockwave shoves every marble of wedge 2 one cell outward after your move');
    expect(state([0, 0, -1, 2])!.text).toBe('a shockwave hits the busiest wedge after 2 of your turns');
    expect(state([0, 0, -1, -1])!.kind).toBe('special');
  },
};

describe('boss state (docs/specs/mcp.md section 4.3)', () => {
  test('boss result codes, as words', () => {
    expect([0, 1, 2].map(resultName)).toEqual(['playing', 'won', 'lost']);
  });

  test('The Ballast Mind joins the boss list (#572), The Alien (#588), The Rail Yard (#626), The Magnetizer (#645), The Pulsar (#675), The Overseer (#635) The Assembly Line (#744) and The Unstable Core (#751) are in', () => {
    expect(bossIds()).toEqual(['echo', 'hull', 'choir', 'chaplain', 'ballast', 'alien', 'railyard', 'magnetizer', 'pulsar', 'overseer', 'assembly', 'core']);
  });

  test('every boss of the engine has its case', () => {
    expect(Object.keys(CASES)).toEqual(bossIds());
  });

  test.each(bossIds())('%s maps its engine data to tell and marks', (id) => {
    CASES[id]!();
  });
});
