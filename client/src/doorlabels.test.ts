import { describe, expect, it } from 'vitest';
import { DECK_NAMES } from './deck';
import { FALLBACK, MODE_LABELS, PLACE_LABELS, TERMINAL_LABELS, modeLabel, placeSign, terminalLabel, type Label } from './doorlabels';
import { roomsOf } from './hub';
import { roomLabel } from './hubview';
import { LORE } from './lore';
import { placeTitle } from './placetransition';
import { SECRETS } from './story';
import { BOSS_IDS } from './tally';

// The in-world names of the Hub's doors and terminals and of the Open world's towns and gates (#1547, docs/specs/ui.md section 4.5): a name of the
// ship, and under it a short plain line that says what the door does. One table, one fallback.

const ALL: readonly Label[] = [...Object.values(MODE_LABELS), ...Object.values(TERMINAL_LABELS), ...Object.values(PLACE_LABELS), FALLBACK];

describe('the door labels', () => {
  it('name each mode of the ship, with a plain line that says what it does', () => {
    expect(MODE_LABELS).toEqual({
      hotseat: { name: 'Crew table', line: '2 players, one screen', short: 'Hot-seat' },
      bot: { name: 'House table', line: "play the ship's bot", short: 'Bot' },
      online: { name: 'Comms desk', line: '1v1 online match', short: 'Online' },
      royale: { name: 'Arena', line: 'battle royale', short: 'Royale' },
      medals: { name: 'Medal wall', line: 'medals and best turns', short: 'Medals' },
      daily: { name: 'Morning count', line: 'the boss of the day', short: 'Daily' },
      run: { name: 'Mining cut', line: 'rogue-lite run, 3 acts', short: 'Run' },
      together: { name: 'Shift crew', line: 'co-op against a boss', short: 'Co-op' },
      ranked: { name: 'Clamp list', line: 'ranked 1v1 online', short: 'Ranked' },
      world: { name: 'Airlock', line: 'walk the open world', short: 'World' },
      trainer: { name: 'Table zero', line: 'drill: waves of the bot', short: 'Trainer' },
    });
  });

  it('give every terminal the name of its own entry, and no lore entry the fallback', () => {
    const log = 'read the log';
    expect(TERMINAL_LABELS).toEqual({
      'mess-house-rule': { name: "Captain's order", line: log, short: 'Order' },
      'mess-corner-table': { name: 'Galley log', line: log, short: 'Galley' },
      'cargo-assay': { name: 'Assay note', line: log, short: 'Assay' },
      'cargo-loadmaster': { name: "Loadmaster's log", line: log, short: 'Loadmaster' },
      'furnace-power': { name: 'Maintenance tag', line: log, short: 'Tag' },
      'furnace-watch-song': { name: 'Locker door', line: log, short: 'Locker' },
      'chapel-door': { name: 'Chapel notice', line: log, short: 'Notice' },
      'chapel-sermon': { name: 'Sermon notes', line: log, short: 'Sermon' },
      'bridge-clamp': { name: 'Clamp notice', line: log, short: 'Clamp notice' },
      'bridge-last-orders': { name: "Captain's console", line: log, short: 'Console' },
    });
    expect(Object.keys(TERMINAL_LABELS).sort()).toEqual(LORE.map(({ id }) => id).sort());
    for (const { id } of LORE) expect(terminalLabel(id), id).not.toBe(FALLBACK);
  });

  it('fall back to one tested line for a door with no name of its own, never to an empty plate', () => {
    expect(FALLBACK).toEqual({ name: "Ship's door", line: 'a room of the Ballast', short: 'Door' });
    expect(terminalLabel('a-log-nobody-named')).toBe(FALLBACK);
    expect(modeLabel('a-room-nobody-named')).toBe(FALLBACK);
    expect(modeLabel('bot')).toBe(MODE_LABELS.bot);
  });

  it('leave no field empty, and keep a plate short enough to sit on the deck', () => {
    for (const { name, line, short } of ALL) {
      expect(name.length).toBeGreaterThan(0);
      expect(line.length).toBeGreaterThan(0);
      expect(short.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(17);
      expect(line.length).toBeLessThanOrEqual(30);
      expect(short.length).toBeLessThanOrEqual(13);
    }
  });

  it('hold no secret word of the story at any stage (world.md section 12.2)', () => {
    const texts = [
      ...ALL.flatMap(({ name, line, short }) => [name, line, short]),
      placeSign('town', ''),
      placeSign('dungeon', ''),
      placeSign('tower', 'The Echo'),
      ...DECK_NAMES.flatMap((deck) => roomsOf(deck).flatMap(({ door }) => [true, false].flatMap((won) => { const { name, state, short } = roomLabel(deck, door, won && door.kind === 'boss' ? [door.boss] : [], {}); return [name, state, short]; }))),
    ];
    for (let stage = 1; stage <= 7; stage++) {
      for (const { word, from } of SECRETS) {
        if (stage < from) for (const text of texts) expect(text, `stage ${stage}`).not.toMatch(word);
      }
    }
  });
});

describe('the signage of a town, a gate and a tower (#1547)', () => {
  it('names a town a muster point and a gate a mining cut, with what they open', () => {
    expect(PLACE_LABELS).toEqual({
      town: { name: 'Muster point', line: 'the Hub', short: 'Muster' },
      dungeon: { name: 'Mining cut', line: 'Rogue-lite run', short: 'Cut' },
    });
    expect(placeSign('town', '')).toBe('Muster point · the Hub');
    expect(placeSign('dungeon', '')).toBe('Mining cut · Rogue-lite run');
  });

  it('names a tower by its boss, and falls back to the ship door when no boss is known', () => {
    expect(placeSign('tower', 'The Echo')).toBe('The Echo');
    expect(placeSign('tower', '')).toBe(FALLBACK.name);
  });

  it('is the title of the place transition', () => {
    expect(placeTitle('tower', 'The Hull')).toBe('The Hull');
    expect(placeTitle('town', '')).toBe('Muster point · the Hub');
    expect(placeTitle('dungeon', '')).toBe('Mining cut · Rogue-lite run');
  });
});

describe('the boss doors', () => {
  it('say the seat of the deck, which opens the next lift, and a station, which never locks one', () => {
    expect(roomLabel('mess', { kind: 'boss', boss: 'echo' }, [])).toEqual({ name: 'The Echo', state: 'boss, Mess seat', short: 'Echo', mark: '' });
    expect(roomLabel('mess', { kind: 'boss', boss: 'dual' }, [])).toEqual({ name: 'The Dual Room', state: 'boss, Mess station', short: 'Dual Room', mark: '' });
    expect(roomLabel('bridge', { kind: 'boss', boss: 'ballast' }, [])).toMatchObject({ state: 'boss, Bridge seat' });
    expect(roomLabel('cargo', { kind: 'boss', boss: 'swarm' }, [])).toMatchObject({ state: 'boss, Cargo station' });
  });

  it('name every boss of the roster on its own deck', () => {
    const doors = DECK_NAMES.flatMap((deck) => roomsOf(deck).flatMap(({ door }) => (door.kind === 'boss' ? [door.boss] : [])));
    expect([...doors].sort()).toEqual([...BOSS_IDS].sort());
  });
});
