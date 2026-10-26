// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { logOf } from './audiologs';
import { boot, type Game } from './test/harness';

// The audio log player (#516, world.md section 4): while the player reads the deck console, Play log plays the deck's
// audio log on the voice bus, music and ambience ducked under it; Skip log stops it at any time, and the game goes on
// meanwhile. Its transcript shows line by line, on by default, with a saved Transcript toggle beside Sound.

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const button = (): HTMLButtonElement => byId('log-button') as HTMLButtonElement;
const transcript = (): HTMLElement => byId('transcript');
const toggle = (): HTMLElement => byId('setting-transcript');
const data = (): DOMStringMap => document.body.dataset;
const key = (k: string): void => void dispatchEvent(new KeyboardEvent('keydown', { key: k }));
const log = logOf('mess');

/** A page whose console shows its first entry: the fonts are in. */
async function ready(stored: Record<string, string> = {}): Promise<Game> {
  const booting = boot('?bot=off');
  for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
  const game = await booting;
  await game.settle();
  game.frame();
  return game;
}

/** Opens the reader and plays the deck's log. */
function play(): void {
  key('t');
  button().click();
}

describe('main.ts, the audio log player (#516)', () => {
  it('the reader offers the deck log; it plays with its transcript line by line, then ends by itself', async () => {
    const game = await ready();
    expect(button().hidden).toBe(true); // off the console there is nothing to play
    key('t');
    expect([button().hidden, button().textContent]).toEqual([false, 'Play log']);
    button().click();
    expect(data().log).toBe('mess-first-game');
    expect(button().textContent).toBe('Skip log');
    expect(game.hook('__ducked')).toBe(true);
    expect(transcript().hidden).toBe(true); // the first line comes 1 s in
    game.frame(1000);
    expect([transcript().hidden, transcript().textContent]).toEqual([false, log.lines[0]!.text]);
    game.frame(4000);
    expect(transcript().textContent).toBe(log.lines[1]!.text);
    key('Escape'); // the log goes on off the console, its Skip button with it
    expect([button().hidden, data().log]).toEqual([false, 'mess-first-game']);
    game.frame((log.seconds - 5) * 1000 - 16);
    expect(data().log).toBe('mess-first-game');
    game.frame(16);
    expect(data().log).toBeUndefined();
    expect([button().hidden, transcript().hidden]).toEqual([true, true]);
    expect(game.hook('__ducked')).toBe(false);
  });

  it('Skip log stops it at any time, and a move lands while it plays', async () => {
    const game = await ready();
    play();
    key('Escape');
    game.click(0, 2);
    game.click(0, 1);
    expect(game.turn()).toContain('White');
    expect(data().log).toBe('mess-first-game');
    game.frame(2000);
    button().click();
    expect(data().log).toBeUndefined();
    expect([button().hidden, transcript().hidden]).toEqual([true, true]);
    expect(game.hook('__ducked')).toBe(false);
    key('t'); // the reader offers it again
    expect(button().textContent).toBe('Play log');
  });

  it('the Transcript toggle shares the Sound row, on by default; off, it hides the line and is saved', async () => {
    const game = await ready();
    expect(toggle().parentElement).toBe(byId('setting-sound').parentElement);
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Transcript');
    play();
    game.frame(1000);
    game.openSettings();
    toggle().click();
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('ab-alone.transcript')).toBe('off');
    expect(transcript().hidden).toBe(true);
    game.frame(4000);
    expect(transcript().hidden).toBe(true);
    expect(data().log).toBe('mess-first-game'); // the log still plays
    toggle().click();
    expect([transcript().hidden, transcript().textContent]).toEqual([false, log.lines[1]!.text]);
    expect(localStorage.getItem('ab-alone.transcript')).toBe('on');
  });

  it('a saved Transcript off holds after a reload', async () => {
    const game = await ready({ 'ab-alone.transcript': 'off' });
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    play();
    game.frame(1000);
    expect(transcript().hidden).toBe(true);
  });

  it('plays the log of the deck in play', async () => {
    const game = await ready();
    game.hook('__deck', 'bridge');
    play();
    expect(data().log).toBe('bridge-crew-count');
  });

  it('suspends the sound while the tab is hidden and resumes it when shown again (#728)', async () => {
    const game = await boot('?bot=off', { audio: true });
    await game.settle();
    dispatchEvent(new PointerEvent('pointerdown'));
    expect(game.hook('__audio')).toBe('running');
    const hidden = vi.spyOn(document, 'hidden', 'get');
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(game.hook('__audio')).toBe('suspended');
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(game.hook('__audio')).toBe('running');
    hidden.mockRestore();
  });

  it('sounds on the voice bus once audio runs, the voice slider at 0 silences it', async () => {
    const game = await boot('?bot=off', { audio: true });
    await game.settle();
    game.frame();
    dispatchEvent(new PointerEvent('pointerdown')); // the gesture that makes the audio context
    expect(game.hook('__audio')).toBe('running');
    play();
    expect(data().logSound).toBe('voice');
    button().click();
    const slider = byId('volume-voice') as HTMLInputElement;
    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    button().click();
    expect(data().logSound).toBe('none');
  });
});
