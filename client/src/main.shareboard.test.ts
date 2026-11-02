// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { boot } from './test/harness';

// The opt-in for the shared ranked board on the harness (#1287): asked at the first ranked entry, unticked, nothing sent.
const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const shown = (): boolean => !byId('board-optin').hidden;
const key = (name: string, shiftKey = false): void =>
  void byId('board-optin').dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
const tick = (): void => {
  byId<HTMLInputElement>('optin-box').checked = true;
  byId('optin-box').dispatchEvent(new Event('change'));
};

describe('shared board opt-in', () => {
  it('asks at the first ranked entry, unticked, with the decided text; Join needs the tick and stores a choice, a name and a key', async () => {
    const game = await boot('?bot=off&board&net=hook');
    game.openModes();
    byId('ranked').click();
    await game.settle();
    expect(shown()).toBe(true);
    expect(byId('optin-text').textContent).toContain('public and permanent');
    expect(byId('optin-text').textContent).not.toContain('16 or older');
    expect(byId<HTMLInputElement>('optin-box').checked).toBe(false);
    expect(byId<HTMLButtonElement>('optin-yes').disabled).toBe(true);
    expect(byId<HTMLAnchorElement>('optin-notice').href).toContain('docs/privacy.md');
    expect(document.activeElement).toBe(byId('optin-name'));
    byId<HTMLInputElement>('optin-name').value = 'x'.repeat(30);
    tick();
    expect(byId<HTMLButtonElement>('optin-yes').disabled).toBe(false);
    byId('optin-yes').click();
    await vi.waitFor(() => expect(localStorage.getItem('ab-alone.board-key')).not.toBeNull());
    expect(shown()).toBe(false);
    expect(JSON.parse(localStorage.getItem('ab-alone.board-consent')!)).toEqual({ v: 1, choice: 'joined' });
    expect(localStorage.getItem('ab-alone.board-name')).toHaveLength(16);
  });

  it('Keep ranked local and Escape store a decline, and it is not asked again', async () => {
    const game = await boot('?bot=off&board&net=hook');
    for (const leave of [() => byId('optin-no').click(), () => key('Escape')]) {
      localStorage.removeItem('ab-alone.board-consent');
      game.openModes();
      byId('ranked').click();
      await game.settle();
      expect(shown()).toBe(true);
      key('Tab');
      expect(document.activeElement).toBe(byId('optin-box'));
      key('Tab', true);
      expect(document.activeElement).toBe(byId('optin-name'));
      key('a');
      expect(shown()).toBe(true);
      leave();
      await game.settle();
      expect(shown()).toBe(false);
      expect(JSON.parse(localStorage.getItem('ab-alone.board-consent')!)).toEqual({ v: 1, choice: 'declined' });
      expect(localStorage.getItem('ab-alone.board-key')).toBeNull();
    }
    game.openModes();
    byId('ranked').click();
    await game.settle();
    expect(shown()).toBe(false);
  });

  it('the pad walks it: the D-pad stays inside the dialog', async () => {
    const game = await boot('?bot=off&board&net=hook');
    let pads: unknown[] = [];
    Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
    const tap = (button: number): void => {
      for (const held of [[button], []]) {
        pads = [{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held.includes(i), value: held.includes(i) ? 1 : 0 })) }];
        game.frame();
      }
    };
    game.openModes();
    byId('ranked').click();
    await game.settle();
    tap(15);
    expect(byId('board-optin').contains(document.activeElement)).toBe(true);
    Reflect.deleteProperty(navigator, 'getGamepads');
    byId('optin-no').click();
  });

  it('is off without ?board, for a real player as for an automated page: no dialog, no buttons, no key, nothing stored', async () => {
    for (const webdriver of [false, true]) {
      const game = await boot('?bot=off&net=hook', { webdriver });
      game.openModes();
      byId('ranked').click();
      await game.settle();
      expect(shown()).toBe(false);
      game.openModes();
      byId('leaderboard').click();
      expect(byId('board-share').hidden).toBe(true);
      expect(byId('board').hidden).toBe(false);
      expect(Object.keys(localStorage).filter((k) => k.startsWith('ab-alone.board-'))).toEqual([]);
    }
  });

  it('the board dialog joins, then New key changes the key and Leave the board stores a signed retire and clears the consent', async () => {
    const game = await boot('?bot=off&board');
    game.openModes();
    byId('leaderboard').click();
    expect(byId('board-share-state').textContent).toContain('not on the shared board');
    expect(byId('board-leave').hidden).toBe(true);
    byId('board-join').click();
    expect(shown()).toBe(true);
    byId<HTMLInputElement>('optin-name').value = 'Ada';
    tick();
    byId('optin-yes').click();
    await vi.waitFor(() => expect(byId('board-share-state').textContent).toContain('as "Ada"'));
    expect(byId('board-join').hidden).toBe(true);
    const first = localStorage.getItem('ab-alone.board-key');
    byId('board-newkey').click();
    await vi.waitFor(() => expect(localStorage.getItem('ab-alone.board-key')).not.toBe(first));
    byId('board-leave').click();
    await vi.waitFor(() => expect(byId('board-share-state').textContent).toContain('not on the shared board'));
    const retires = JSON.parse(localStorage.getItem('ab-alone.board-retire')!) as { v: number; events: { kind: string }[] };
    expect(retires.events).toHaveLength(1);
    expect(retires.events[0]!.kind).toBe('retire');
    expect((JSON.parse(localStorage.getItem('ab-alone.board-consent')!) as { choice: string }).choice).toBe('declined');
  });

  it('sends nothing to a relay', async () => {
    const sockets = vi.fn();
    vi.stubGlobal('WebSocket', sockets);
    const game = await boot('?bot=off&board&net=hook');
    game.openModes();
    byId('ranked').click();
    await game.settle();
    tick();
    byId('optin-yes').click();
    await vi.waitFor(() => expect(localStorage.getItem('ab-alone.board-key')).not.toBeNull());
    byId('leaderboard').click();
    byId('board-leave').click();
    await vi.waitFor(() => expect(localStorage.getItem('ab-alone.board-retire')).not.toBeNull());
    expect(sockets).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
