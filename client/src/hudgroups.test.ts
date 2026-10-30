// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import page from '../index.html?raw';

// The HUD buttons in `#online`, grouped by what they do, in this order (#839, docs/specs/ui.md "HUD buttons"): the
// cog, the view (Reset view, Cam), the game (its controls), the tools, then Game modes with its menu, and the invite
// link last, where the room it opens is announced.
const doc = new DOMParser().parseFromString(page, 'text/html');
const children = (id: string): string[] => [...doc.getElementById(id)!.children].map((el) => el.id);

describe('The HUD buttons', () => {
  it('are ordered in groups: the cog, the view, the game, the tools, Game modes, the invite link', () => {
    expect(children('online')).toEqual([
      'update',
      'settings-box',
      'group-view',
      'group-game',
      'daily-card',
      'tools',
      'auto-reason',
      'modes',
      'mode-menu',
      'import-file',
      'invite-label',
      'invite-row',
    ]);
  });

  it('keep the view together: Reset view alone, Free camera is a settings item (#938)', () => {
    expect(children('group-view')).toEqual(['reset-view']);
  });

  it('keep the game controls together: New game, Rematch, Goal, Retry, Hold, Start, Invite, Back to the ship', () => {
    expect(children('group-game')).toEqual([
      'new-game',
      'rematch',
      'boss-goal',
      'boss-retry',
      'royale-hold',
      'royale-start',
      'royale-invite',
      'ship-back',
    ]);
  });

  it('keep the tools together: Hint, Replay, Auto-play', () => {
    expect(children('tools')).toEqual(['hint', 'replay', 'auto-play']);
  });

  it('put Copy beside the invite link', () => {
    expect(children('invite-row')).toEqual(['invite', 'invite-copy']);
  });
});
