// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CountWatch, EdgeWatch, EndWatch, OutWatch, PhaseWatch, STEP_GAP_MS, SelectionWatch, StepWatch, clickable, turnBack } from './cues';

// #1570: which game event plays which cue. The choice is pure, so main.ts only calls it.

describe('EndWatch, a win or a loss sounds once per game', () => {
  it('sounds the end of a game once, not on the next redraw', () => {
    const watch = new EndWatch();
    const game = {};
    expect(watch.fresh(game, 'win')).toBe('win');
    expect(watch.fresh(game, 'win')).toBeNull();
  });

  it('sounds a loss, and the end of the next game', () => {
    const watch = new EndWatch();
    expect(watch.fresh({}, 'loss')).toBe('loss');
    expect(watch.fresh({}, 'win')).toBe('win');
  });

  it('is silent for a game still running, and does not count it', () => {
    const watch = new EndWatch();
    const game = {};
    expect(watch.fresh(game, undefined)).toBeNull();
    expect(watch.fresh(game, 'win')).toBe('win');
  });

  it('a draw sounds its own cue once per game (#1570)', () => {
    const watch = new EndWatch();
    const game = {};
    expect(watch.fresh(game, 'draw')).toBe('draw');
    expect(watch.fresh(game, 'draw')).toBeNull();
  });

  it('the win of a boss fight is the boss death and not a win: one sound for the moment, the loss of it stays a loss', () => {
    const watch = new EndWatch();
    expect(watch.fresh({}, 'win', true)).toBe('boss-death');
    expect(watch.fresh({}, 'loss', true)).toBe('loss');
    expect(watch.fresh({}, 'draw', true)).toBe('draw');
    expect(watch.fresh({}, 'win', false)).toBe('win');
  });
});

describe('PhaseWatch, a boss phase change sounds when the phase moves', () => {
  it('is silent on the first sight of a game, sounds a new phase once', () => {
    const watch = new PhaseWatch();
    const game = {};
    expect(watch.changed(game, 0)).toBe(false);
    expect(watch.changed(game, 0)).toBe(false);
    expect(watch.changed(game, 1)).toBe(true);
    expect(watch.changed(game, 1)).toBe(false);
    expect(watch.changed(game, 2)).toBe(true);
  });

  it('starts over with the next game: its first phase is silent, even a later one', () => {
    const watch = new PhaseWatch();
    watch.changed({}, 1);
    expect(watch.changed({}, 2)).toBe(false);
  });
});

describe('PhaseWatch, also for the phase of the day of the Open world', () => {
  it('moves by name: the first sight is silent, day to dusk sounds once', () => {
    const watch = new PhaseWatch();
    const world = {};
    expect(watch.changed(world, 'day')).toBe(false);
    expect(watch.changed(world, 'day')).toBe(false);
    expect(watch.changed(world, 'dusk')).toBe(true);
    expect(watch.changed(world, 'dusk')).toBe(false);
    expect(watch.changed({}, 'night')).toBe(false); // another world, another first sight
  });
});

describe('CountWatch, a count that rises in the same game sounds (the relics of a run, the round of a royale)', () => {
  it('is silent on the first sight, sounds each rise once, and starts over with the next game', () => {
    const watch = new CountWatch();
    const run = {};
    expect(watch.rose(run, 2)).toBe(false);
    expect(watch.rose(run, 2)).toBe(false);
    expect(watch.rose(run, 3)).toBe(true);
    expect(watch.rose(run, 3)).toBe(false);
    expect(watch.rose({}, 4)).toBe(false);
  });

  it('does not sound a fall', () => {
    const watch = new CountWatch();
    const run = {};
    watch.rose(run, 3);
    expect(watch.rose(run, 1)).toBe(false);
    expect(watch.rose(run, 2)).toBe(true);
  });
});

describe('SelectionWatch, a selection sounds when it changes, not on a redraw (#1570)', () => {
  it('sounds a new selection once, however often the plate is drawn', () => {
    const watch = new SelectionWatch();
    expect(watch.changed([])).toBe(false);
    expect(watch.changed([[0, 0]])).toBe(true);
    expect(watch.changed([[0, 0]])).toBe(false);
    expect(watch.changed([[0, 0], [1, 0]])).toBe(true);
  });

  it('is silent when a selection is cleared, by a move or an Escape, and sounds the same cells again after', () => {
    const watch = new SelectionWatch();
    watch.changed([[0, 0]]);
    expect(watch.changed([])).toBe(false);
    expect(watch.changed([[0, 0]])).toBe(true);
  });
});

describe('StepWatch, the hero steps no faster than one cue per step of a walk at normal speed (#1570)', () => {
  it('sounds a step, then waits for the gap, which is under a normal step of 140 ms', () => {
    const watch = new StepWatch();
    expect(STEP_GAP_MS).toBeLessThan(140);
    expect(watch.due(1000)).toBe(true);
    expect(watch.due(1000 + STEP_GAP_MS - 1)).toBe(false);
    expect(watch.due(1000 + STEP_GAP_MS)).toBe(true);
  });

  it('a step skipped does not push the next one back', () => {
    const watch = new StepWatch();
    watch.due(0);
    watch.due(50);
    expect(watch.due(STEP_GAP_MS)).toBe(true);
  });

  it('a walk at cruising speed (a step every 90 ms) sounds one step in two, not all', () => {
    const watch = new StepWatch();
    const heard = Array.from({ length: 10 }, (_, i) => watch.due(i * 90)).filter(Boolean).length;
    expect(heard).toBe(5);
  });
});

describe('turnBack, the turn comes back to the player after a move of the other side (#1570)', () => {
  it('is true when the player is to move in a running game, outside a replay', () => {
    expect(turnBack(1, 1, 0, false)).toBe(true);
  });

  it('is false when the other side is to move, the game is over, or a Replay is open', () => {
    expect(turnBack(2, 1, 0, false)).toBe(false);
    expect(turnBack(1, 1, 1, false)).toBe(false);
    expect(turnBack(1, 1, 0, true)).toBe(false);
  });
});

describe('OutWatch, a royale marble set eliminated', () => {
  it('is silent on the first sight of a game, even with seats already out', () => {
    const watch = new OutWatch();
    expect(watch.fresh({}, [2, 3])).toBe(false);
  });

  it('sounds once for the seats that just went out, however many, not on a redraw', () => {
    const watch = new OutWatch();
    const game = {};
    expect(watch.fresh(game, [])).toBe(false);
    expect(watch.fresh(game, [3])).toBe(true);
    expect(watch.fresh(game, [3])).toBe(false);
    expect(watch.fresh(game, [3, 1, 4])).toBe(true); // two at once: one cue, no noise
    expect(watch.fresh(game, [3, 1, 4])).toBe(false);
  });

  it('starts over with the next game', () => {
    const watch = new OutWatch();
    watch.fresh({}, [3]);
    expect(watch.fresh({}, [3, 4])).toBe(false);
  });
});

describe('EdgeWatch, a rogue-lite reward sounds when it appears', () => {
  it('sounds when it comes up, not while it stays, and again for the next one', () => {
    const watch = new EdgeWatch();
    expect(watch.entered(false)).toBe(false);
    expect(watch.entered(true)).toBe(true);
    expect(watch.entered(true)).toBe(false);
    expect(watch.entered(false)).toBe(false);
    expect(watch.entered(true)).toBe(true);
  });
});

describe('clickable, the UI click', () => {
  const html = (markup: string): Element => {
    document.body.innerHTML = markup;
    return document.body.querySelector('[data-hit]')!;
  };

  it('is a button, or something inside one', () => {
    expect(clickable(html('<button data-hit>New</button>'))).toBe(true);
    expect(clickable(html('<button><span data-hit>New</span></button>'))).toBe(true);
  });

  it('is not the board, a slider, text, nor nothing', () => {
    expect(clickable(html('<canvas data-hit></canvas>'))).toBe(false);
    expect(clickable(html('<input type="range" data-hit>'))).toBe(false);
    expect(clickable(html('<p data-hit>text</p>'))).toBe(false);
    expect(clickable(null)).toBe(false);
    expect(clickable(window)).toBe(false);
  });

  it('is not a button that has its own sound: a node of the rogue-lite map, or Start, which picks one', () => {
    expect(clickable(html('<button data-hit data-node="3">Fight</button>'))).toBe(false);
    expect(clickable(html('<button data-node="1"><i data-hit></i></button>'))).toBe(false);
    expect(clickable(html('<button id="run-start" data-hit>Start</button>'))).toBe(false);
  });
});
