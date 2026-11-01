// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { gamepad, nextFocus, REPEAT_DELAY, REPEAT_EVERY, type PadAction } from './gamepad';

// The gamepad poller (#1252) on a fake pad of the standard layout: 17 buttons, 4 axes.
const A = 0, B = 1, LB = 4, RB = 5, LT = 6, RT = 7, VIEW = 8, START = 9, R3 = 11, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

function fakePad(pressed: number[] = [], axes = [0, 0, 0, 0], values: Record<number, number> = {}, extra: Partial<Gamepad> = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: values[i] ?? (pressed.includes(i) ? 1 : 0) }));
  return { connected: true, mapping: 'standard', axes, buttons, ...extra } as unknown as Gamepad;
}

let pads: (Gamepad | null)[] = [];
function plugIn(): void {
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
}
afterEach(() => {
  Reflect.deleteProperty(navigator, 'getGamepads');
  pads = [];
});

/** A poller and the actions it gave, one call per frame at `now`. */
function poller(): { poll: (now: number, pad?: Gamepad | null) => void; got: PadAction[]; walks: PadAction[] } {
  plugIn();
  const got: PadAction[] = [];
  const walks: PadAction[] = []; // the walk of the stick, every frame: kept apart
  const poll = gamepad((a) => (a.kind === 'walk' ? walks : got).push(a));
  return {
    got,
    walks,
    poll: (now, pad) => {
      if (pad !== undefined) pads = [pad];
      poll(now);
    },
  };
}
const kinds = (got: PadAction[]): string[] => got.map((a) => a.kind);

describe('the gamepad poller', () => {
  it('a press of A, B, Start, LB or RB gives its action once, on the press', () => {
    const { poll, got } = poller();
    const pairs: [number, string][] = [[A, 'confirm'], [B, 'back'], [START, 'menu'], [LB, 'prev'], [RB, 'next']];
    let now = 0;
    for (const [button, kind] of pairs) {
      poll((now += 16), fakePad([button]));
      poll((now += 16), fakePad([button])); // still held: no second action
      poll((now += 16), fakePad());
      expect(got.pop()).toEqual({ kind });
      expect(got).toEqual([]);
    }
  });

  it('LB and RB repeat while held, after a delay, then at a steady rate; A, B and Start never repeat', () => {
    const { poll, got } = poller();
    poll(0, fakePad([RB, A]));
    poll(REPEAT_DELAY - 1, fakePad([RB, A]));
    expect(kinds(got)).toEqual(['confirm', 'next']);
    poll(REPEAT_DELAY, fakePad([RB, A]));
    poll(REPEAT_DELAY + REPEAT_EVERY - 1, fakePad([RB, A]));
    poll(REPEAT_DELAY + REPEAT_EVERY, fakePad([RB, A]));
    expect(kinds(got)).toEqual(['confirm', 'next', 'next', 'next']);
  });

  it('the D-pad aims: the nearest of the 6 board directions and a focus step, up and left back, down and right on', () => {
    const { poll, got } = poller();
    const aim = (buttons: number[]): PadAction => {
      poll(0, fakePad(buttons));
      poll(0, fakePad());
      return got.pop()!;
    };
    expect(aim([RIGHT])).toEqual({ kind: 'move', hex: 0, step: 1 }); // east
    expect(aim([LEFT])).toEqual({ kind: 'move', hex: 1, step: -1 }); // west
    expect(aim([UP, RIGHT])).toEqual({ kind: 'move', hex: 2, step: 1 }); // north-east
    expect(aim([DOWN, LEFT])).toEqual({ kind: 'move', hex: 3, step: 1 }); // south-west
    expect(aim([UP, LEFT])).toEqual({ kind: 'move', hex: 4, step: -1 }); // north-west
    expect(aim([DOWN, RIGHT])).toEqual({ kind: 'move', hex: 5, step: 1 }); // south-east
    expect(aim([UP])).toMatchObject({ step: -1 });
    expect(aim([DOWN])).toMatchObject({ step: 1 });
  });

  it('the left stick aims past its dead zone, the D-pad first; a turn to another direction aims again at once', () => {
    const { poll, got } = poller();
    poll(0, fakePad([], [0.3, -0.3, 0, 0])); // in the dead zone
    expect(got).toEqual([]);
    poll(16, fakePad([], [0.8, -0.1, 0, 0])); // right, a little up: east
    poll(32, fakePad([], [0.9, 0, 0, 0])); // still east: held
    expect(got).toEqual([{ kind: 'move', hex: 0, step: 1 }]);
    poll(48, fakePad([], [0.5, -0.8, 0, 0])); // up and right: north-east
    expect(got.pop()).toEqual({ kind: 'move', hex: 2, step: -1 }); // mostly up: back
    poll(64, fakePad([LEFT], [0.5, -0.8, 0, 0])); // the D-pad wins
    expect(got.pop()).toEqual({ kind: 'move', hex: 1, step: -1 });
  });

  it('View gives the map once, on the press, and never repeats (#1411)', () => {
    const { poll, got } = poller();
    poll(0, fakePad([VIEW]));
    poll(REPEAT_DELAY + 10 * REPEAT_EVERY, fakePad([VIEW]));
    expect(kinds(got)).toEqual(['map']);
  });

  it('R3 gives a reset once, on the press', () => {
    const { poll, got } = poller();
    poll(0, fakePad([R3]));
    poll(16, fakePad([R3]));
    poll(32, fakePad());
    expect(got).toEqual([{ kind: 'reset' }]);
  });

  it('the aim walks every frame it is held, with its stick vector, and gives a rest when it lets go (#1252)', () => {
    const { poll, walks } = poller();
    poll(0, fakePad([], [0.3, 0, 0, 0])); // in the dead zone: nothing, no rest either
    poll(16, fakePad([], [0.8, -0.2, 0, 0]));
    poll(32, fakePad([], [0.9, 0, 0, 0]));
    poll(48, fakePad());
    poll(64, fakePad());
    poll(80, fakePad([DOWN]));
    expect(walks).toEqual([
      { kind: 'walk', x: 0.8, y: -0.2 },
      { kind: 'walk', x: 0.9, y: 0 },
      { kind: 'walk', x: 0, y: 0 },
      { kind: 'walk', x: 0, y: 1 },
    ]);
  });

  it('a pad that disconnects while the aim is held lets the walk go', () => {
    const { poll, walks } = poller();
    poll(0, fakePad([], [1, 0, 0, 0]));
    poll(16, null);
    poll(32, null);
    expect(walks).toEqual([{ kind: 'walk', x: 1, y: 0 }, { kind: 'walk', x: 0, y: 0 }]);
  });

  it('a held aim repeats like LB and RB', () => {
    const { poll, got } = poller();
    poll(0, fakePad([DOWN]));
    poll(REPEAT_DELAY, fakePad([DOWN]));
    expect(got).toHaveLength(2);
  });

  it('the right stick orbits by the time of the frame, past its dead zone', () => {
    const { poll, got } = poller();
    poll(0, fakePad([], [0, 0, 1, 0])); // the first frame has no time yet
    poll(16, fakePad([], [0, 0, 1, -0.5]));
    poll(1000, fakePad([], [0, 0, 1, 0])); // a long frame counts as 50 ms
    poll(1016, fakePad([], [0, 0, 0.1, 0.1])); // in the dead zone
    expect(got).toEqual([
      { kind: 'orbit', dx: 0, dy: 0 },
      { kind: 'orbit', dx: 1 * 0.3 * 16, dy: -0.5 * 0.3 * 16 },
      { kind: 'orbit', dx: 1 * 0.3 * 50, dy: 0 },
    ]);
  });

  it('the right trigger zooms in, the left one out, by the time of the frame', () => {
    const { poll, got } = poller();
    poll(0, fakePad());
    poll(100, fakePad([], undefined, { [RT]: 1 }));
    poll(116, fakePad([], undefined, { [LT]: 1 }));
    poll(132, fakePad([], undefined, { [LT]: 0.05 })); // a light touch: nothing
    expect(got).toHaveLength(2);
    expect((got[0] as { scale: number }).scale).toBeCloseTo(Math.exp(-0.05 * 2));
    expect((got[1] as { scale: number }).scale).toBeCloseTo(Math.exp(0.016 * 2));
  });

  it('no Gamepad API, no pad, a pad gone or not of the standard layout: nothing happens', () => {
    const got: PadAction[] = [];
    gamepad((a) => got.push(a))(0); // jsdom has no navigator.getGamepads
    const { poll } = poller();
    poll(0, null);
    poll(16, fakePad([A], undefined, undefined, { mapping: '' }));
    poll(32, fakePad([A], undefined, undefined, { connected: false }));
    expect(got).toEqual([]);
  });

  it('a pad that disconnects while held gives nothing, and a press after it reconnects counts again', () => {
    const { poll, got } = poller();
    poll(0, fakePad([RB]));
    poll(16, null);
    poll(REPEAT_DELAY + 16, null);
    expect(kinds(got)).toEqual(['next']);
    poll(REPEAT_DELAY + 32, fakePad([RB]));
    expect(kinds(got)).toEqual(['next', 'next']);
  });
});

describe('the focus step', () => {
  it('walks the shown, enabled tab stops in page order and wraps at both ends', () => {
    document.body.innerHTML = `
      <button id="a">a</button>
      <button id="b" disabled>b</button>
      <div hidden><button id="c">c</button></div>
      <button id="d" tabindex="-1">d</button>
      <button id="e">e</button>
      <canvas id="f" tabindex="0"></canvas>`;
    const $ = (id: string): HTMLElement => document.getElementById(id)!;
    Object.assign($('e'), { checkVisibility: () => false }); // hidden by the style sheet
    expect(nextFocus($('a'), 1)).toBe($('f'));
    expect(nextFocus($('f'), 1)).toBe($('a'));
    expect(nextFocus($('a'), -1)).toBe($('f'));
    expect(nextFocus(null, 1)).toBe($('a'));
    expect(nextFocus(null, -1)).toBe($('f'));
    const root = document.createElement('div'); // a dialog keeps the focus in it (#1293)
    root.innerHTML = '<button id="g">g</button><button id="h">h</button>';
    document.body.append(root);
    expect(nextFocus($('h'), 1, root)).toBe($('g'));
    expect(nextFocus($('a'), -1, root)).toBe($('h'));
    document.body.innerHTML = '';
    expect(nextFocus(document.body, 1)).toBe(document.body);
  });
});
