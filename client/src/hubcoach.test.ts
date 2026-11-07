import { describe, expect, it } from 'vitest';
import { roomsOf } from './hub';
import { entryConfirmDue, entryName, HUB_COACH, hubCoachDue, WALK_LESSON, hubHelpOn, markEntered, markHubCoachDone, needsConfirm } from './hubcoach';
import type { Store } from './quality';
import { SECRETS } from './story';

// The first minutes in the Hub (#1522, docs/specs/ui.md section 4.7): a coach line that says how to move, which goes once the player
// rolled, and a one-tap confirm the first time a mode is entered from the Hub.

const memory = (): NonNullable<Store> => {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};

describe('the coach line of the Hub', () => {
  it('is the one lesson of the roll (#1604), in plain words, with no secret word of a later stage', () => {
    expect(HUB_COACH).toBe(WALK_LESSON);
    expect(WALK_LESSON).toBe('Tap or click a next cell to roll. The arrow keys or the stick do the same.');
    for (const { word } of SECRETS) expect(WALK_LESSON).not.toMatch(word);
  });

  it('is due to a new player until the first roll, then never again, and not to one who beat a boss', () => {
    const store = memory();
    expect(hubCoachDue(store, [])).toBe(true);
    expect(hubCoachDue(store, ['echo'])).toBe(false);
    markHubCoachDone(store);
    expect(store.getItem('ab-alone.hubcoach')).toBe('done');
    expect(hubCoachDue(store, [])).toBe(false);
    expect(hubCoachDue(null, [])).toBe(true); // no storage: it shows, and comes back
  });
});

describe('the entry confirm', () => {
  it('is due until the player entered a mode once, and not to a player who beat a boss', () => {
    const store = memory();
    expect(entryConfirmDue(store, [])).toBe(true);
    expect(entryConfirmDue(store, ['echo'])).toBe(false);
    markEntered(store);
    expect(store.getItem('ab-alone.entered')).toBe('yes');
    expect(entryConfirmDue(store, [])).toBe(false);
  });

  it('asks for every room that starts a mode and for no other', () => {
    const asked = roomsOf('mess').filter(({ door }) => needsConfirm(door)).map(({ door }) => door.kind);
    expect(asked.sort()).toEqual(['boss', 'boss', 'bot', 'daily', 'hotseat', 'online', 'royale', 'world']);
    const free = roomsOf('mess').filter(({ door }) => !needsConfirm(door)).map(({ door }) => door.kind);
    expect(free.sort()).toEqual(['lift', 'medals', 'terminal', 'terminal']);
  });

  it('names the mode: a boss by its name, a table by its plate and its plain line', () => {
    const name = (kind: string, deck: 'mess' | 'cargo' = 'mess') => entryName(deck, roomsOf(deck).find(({ door }) => door.kind === kind)!.door);
    expect(name('boss')).toBe('The Echo');
    expect(name('bot')).toBe("House table (play the ship's bot)");
    expect(name('royale')).toBe('Arena (battle royale)');
  });
});

describe('the hook of the automated browser', () => {
  it('shows both for a player, and for an automated browser only when ?firstrun asks', () => {
    expect(hubHelpOn('', false)).toBe(true);
    expect(hubHelpOn('', true)).toBe(false);
    expect(hubHelpOn('?bot=off', true)).toBe(false);
    expect(hubHelpOn('?firstrun', true)).toBe(true);
  });
});
