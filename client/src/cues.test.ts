// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EdgeWatch, EndWatch, OutWatch, PhaseWatch, clickable } from './cues';

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

  it('is silent for a draw and for a game still running, and does not count them', () => {
    const watch = new EndWatch();
    const game = {};
    expect(watch.fresh(game, 'draw')).toBeNull();
    expect(watch.fresh(game, undefined)).toBeNull();
    expect(watch.fresh(game, 'win')).toBe('win');
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
