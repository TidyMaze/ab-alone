// Audit (defensive): what the client must refuse when stored or imported data is hostile. Each test fails today.
// Bounds named here (1e6 cells, 100 lairs, 10000 rating) are the auditor's picks; the fixer may choose others.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { boardHtml, buildBoard, loadRivals, MAX_RIVALS, ratingHistory } from './leaderboard';
import { loadRankedProfile, MAX_MATCH_HISTORY } from './ranked';
import { joinBoard, readRetires } from './shareboard';
import { decodeGame } from './savegame';
import { parseResult } from './boardfeed';
import { decodeWorld } from './openworldsave';
import { decodeDiscovered } from './openworlddiscovered';
import { loadProgress } from './progress';

const store = (v: Record<string, string>) => ({ getItem: (k: string) => v[k] ?? null, setItem: (k: string, s: string) => void (v[k] = s) });
const PUB = 'A'.repeat(43);
const profile = (matches: unknown[], extra: object = {}) =>
  store({ 'ab-alone.ranked': JSON.stringify({ version: 1, rating1v1: 1000, ratingRoyale: 1000, matches, ...extra }) });

describe('ranked profile in localStorage', () => {
  it('S1a a rating of 1e999 (Infinity) is dropped', () => {
    const p = loadRankedProfile(store({ 'ab-alone.ranked': '{"version":1,"rating1v1":1e999,"ratingRoyale":1000,"matches":[]}' }));
    expect(Number.isFinite(p.rating1v1)).toBe(true);
  });
  it('S1b a negative rating is dropped', () => {
    const p = loadRankedProfile(store({ 'ab-alone.ranked': '{"version":1,"rating1v1":1000,"ratingRoyale":-1e30,"matches":[]}' }));
    expect(p.ratingRoyale).toBeGreaterThanOrEqual(0);
  });
  it('S2a matches are cut to MAX_MATCH_HISTORY on load', () => {
    const p = loadRankedProfile(profile(Array.from({ length: 5000 }, () => ({ mode: '1v1', newRating: 1000 }))));
    expect(p.matches.length).toBeLessThanOrEqual(MAX_MATCH_HISTORY);
  });
  it('S2b a null match does not stop the board from opening (ratingHistory)', () => {
    const p = loadRankedProfile(profile([null, 7]));
    expect(() => ratingHistory(p.matches)).not.toThrow();
  });
  it('S3 board history cannot inject HTML from a stored newRating', () => {
    const p = loadRankedProfile(profile([{ mode: '1v1', newRating: '<img src=x onerror=alert(1)>' }]));
    expect(boardHtml(buildBoard(1000, []), ratingHistory(p.matches))).not.toContain('<img');
  });
});

describe('rivals in localStorage', () => {
  const rivals = (list: object[]) => store({ 'ab-alone.ranked.rivals': JSON.stringify({ version: 1, rivals: list }) });
  it('S4a the list is cut to MAX_RIVALS on load', () => {
    expect(loadRivals(rivals(Array.from({ length: 5000 }, () => ({ pub: PUB, rating: 1000, timestamp: 1 })))).length).toBeLessThanOrEqual(MAX_RIVALS);
  });
  it('S4b an Infinity rating is dropped', () => {
    const raw = `{"version":1,"rivals":[{"pub":"${PUB}","rating":1e999,"timestamp":1}]}`; // JSON.stringify would write null
    expect(loadRivals(store({ 'ab-alone.ranked.rivals': raw })).every((r) => Number.isFinite(r.rating))).toBe(true);
  });
  it('S4c a pub that is not a 43 char base64url key is dropped', () => {
    expect(loadRivals(rivals([{ pub: 'x'.repeat(100000), rating: 1, timestamp: 1 }])).length).toBe(0);
  });
});

describe('board retire list', () => {
  it('S5a malformed retire events are dropped', () => {
    const s = store({ 'ab-alone.board-retire': '{"v":1,"events":[null,5,"x"]}' });
    expect(readRetires(s).every((e) => e && typeof e.pub === 'string')).toBe(true);
  });
  it('S5b joining the board does not throw on a poisoned retire list', async () => {
    const s = store({ 'ab-alone.board-retire': '{"v":1,"events":[null]}' });
    await expect(joinBoard(s, 'me')).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('game file import', () => {
  it.each([-1, 1.5, 2 ** 40, 1e999])('S6 boss seed %s is refused (u32 only, as the MCP schema)', (seed) => {
    expect(decodeGame({ version: 1, mode: 'local', boss: 'stalker', seed, moves: [] })).toBeNull();
  });
});

describe('signed results from a relay', () => {
  const ok = { v: 1, game: 'g', black: { pub: PUB, name: 'a' }, white: { pub: 'B'.repeat(43), name: 'b' }, moves: [], status: 1, ejected: [0, 0], ts: 1, sigs: { black: 's', white: 's' } };
  it('S7a a pub of 10000 characters is refused', () => {
    expect(parseResult(JSON.stringify({ ...ok, black: { pub: 'x'.repeat(10000), name: 'a' } }))).toBeNull();
  });
  it('S7b a game id of 100000 characters is refused', () => {
    expect(parseResult(JSON.stringify({ ...ok, game: 'g'.repeat(100000) }))).toBeNull();
  });
  it('S8a a move value outside int32 is refused', () => {
    expect(parseResult(JSON.stringify({ ...ok, moves: [[2 ** 40, 0, 0, 0, 0, 0, 0, 0]] }))).toBeNull();
  });
  it('S8b ts 1e300 is refused', () => {
    expect(parseResult(JSON.stringify({ ...ok, ts: 1e300 }))).toBeNull();
  });
});

describe('Open world save in IndexedDB', () => {
  beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => {}));
  const save = { version: 1, seed: 5, record: 4, yaw: 0, hero: [0, 0], troop: [], broken: [], lairs: [], discovered: [], fight: { removed: [], added: [], beaten: 0 }, savedAt: 1 };
  it('S9a a hero at 2^52 is refused', () => {
    expect(decodeWorld({ ...save, hero: [2 ** 52, -(2 ** 52)] }, 5, 1)).toBeNull();
  });
  it('S9b a lair number 2^52 is not trusted: no lair beaten, the rest kept (#1661)', () => {
    expect(decodeWorld({ ...save, lairs: [2 ** 52] }, 5, 1)).toMatchObject({ lairs: [], hero: [0, 0] });
  });
  it('S9c beaten 2^52 is not trusted: a fresh fight (#1661)', () => {
    expect(decodeWorld({ ...save, fight: { ...save.fight, beaten: 2 ** 52 } }, 5, 1)).toMatchObject({ fight: save.fight });
  });
  it('S10a a troop scattered far from the hero is not trusted: no troop (#1661)', () => {
    expect(decodeWorld({ ...save, troop: [[900, 900], [-900, 5]] }, 5, 1)).toMatchObject({ troop: [] });
  });
  it('S10b 200000 broken cells are not trusted: none broken (#1661)', () => {
    expect(decodeWorld({ ...save, broken: Array.from({ length: 200000 }, (_, i) => [i, i]) }, 5, 1)).toMatchObject({ broken: [] });
  });
  it('S11 50000 discovered chunks are refused', () => {
    const bits = btoa(String.fromCharCode(...new Uint8Array(CHUNK_BYTES)));
    expect(decodeDiscovered(Array.from({ length: 50000 }, (_, i) => [i, 0, bits]))).toBeNull();
  });
});
// bytes of one chunk bitset (openworlddiscovered.ts CHUNK*CHUNK/8), read from a saved record the code itself accepts
const CHUNK_BYTES = (() => {
  for (let n = 1; n < 4096; n++) if (decodeDiscovered([[0, 0, btoa(String.fromCharCode(...new Uint8Array(n)))]])) return n;
  throw new Error('no chunk size found');
})();

describe('hub progress', () => {
  it('S12 beaten keeps known boss ids only, once each', () => {
    const p = loadProgress(store({ 'ab-alone.progress': JSON.stringify({ version: 1, deck: 'mess', cell: [0, 0], beaten: ['<b>', 'nobody', ...Array(50000).fill('x')] }) }));
    expect(p.beaten.length).toBeLessThan(100);
  });
});
