// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import page from '../index.html?raw';

// The page's controls, in their places (#839, #1032, docs/specs/thumb-dock.md): the thumb dock at the bottom holds the
// game's controls in order, the Game modes sheet above it starts with the update banner, and the top column keeps the
// cog, the lobby controls and the invite link.
const doc = new DOMParser().parseFromString(page, 'text/html');
const children = (id: string): string[] => [...doc.getElementById(id)!.children].map((el) => el.id);

describe('The page controls', () => {
  it('the thumb dock holds the game controls in order: Retry, Rematch, Goal, New game, View, Hint, Replay, the replay steps, Modes, Auto-play', () => {
    expect(children('dock')).toEqual([
      'boss-retry',
      'rematch',
      'boss-goal',
      'new-game',
      'reset-view',
      'hint',
      'replay',
      'dock-replay',
      'modes',
      'auto-play',
    ]);
  });

  it('the replay steps are the dock review: First, Previous, Next, Last, Live', () => {
    expect(children('dock-replay')).toEqual(['replay-first', 'replay-prev', 'replay-next', 'replay-last', 'replay-live']);
  });

  it('the top column keeps the cog, the Hold, Start, Invite and Back to the ship controls, and the invite link', () => {
    expect(children('online')).toEqual(['settings-box', 'group-game', 'auto-reason', 'import-file', 'invite-label', 'invite-row']);
    expect(children('group-game')).toEqual(['royale-hold', 'royale-start', 'royale-invite', 'ship-back']);
  });

  it('the Game modes sheet starts with the update banner, then the modes', () => {
    expect(children('mode-menu')[0]).toBe('update');
    expect(children('mode-menu')).toContain('play-online');
  });

  it('put Copy beside the invite link', () => {
    expect(children('invite-row')).toEqual(['invite', 'invite-copy']);
  });
});
