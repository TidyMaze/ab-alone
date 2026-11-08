// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeys } from './moverecord';
import {
  BOARD_TEXT, BOARD_VERSION, publishAllowed, publishFlag, boardAskNeeded, boardKeys, cleanName, joinBoard, leaveBoard, newKey, readChoice, readBoardName, readRetires,
  signRetire, verifyRetire, writeChoice,
} from './shareboard';
import { worldKeys } from './worldevents';

const memory = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) } as Storage;
};
afterEach(() => vi.unstubAllGlobals());

describe('the board opt-in (#1287)', () => {
  it('writing to the relays needs ?board=publish, plain ?board does not', () => {
    expect([publishFlag('?board=publish'), publishFlag('?board'), publishFlag(''), publishFlag('?board=1')]).toEqual([true, false, false, false]);
  });

  it('says what the law asks: public, permanent, third party relays, no deletion, a name that is not you, 16+', () => {
    expect(BOARD_VERSION).toBe(5); // the answers given before the transfer sentence are asked again
    expect(BOARD_TEXT).toContain('your ranked results (with the moves of each game and your opponent\'s key and name), a random key');
    expect(BOARD_TEXT).toContain('Opening the board connects your browser to these relays, which see your IP address. It is public');
    for (const word of ['public and permanent', 'third parties', 'cannot delete', 'does not identify you', 'relay.piazza.today', 'You must be 16 or older.', 'deletes your board key and your name', 'the copies already on the relays stay']) {
      expect(BOARD_TEXT).toContain(word);
    }
    // #1287, GDPR art. 49(1)(a): the transfer outside the EEA rests on this consent, so the player is told of it here.
    expect(BOARD_TEXT).toContain('The relays may be outside the European Economic Area, in a country without an EU adequacy decision, where your data may have less legal protection; we do not check their operators. You consent to this transfer.');
  });

  it('is asked until answered, and an answer of another version counts for nothing', () => {
    const store = memory();
    expect(readChoice(store)).toBeNull();
    expect(boardAskNeeded(store)).toBe(true);
    writeChoice(store, 'declined');
    expect(readChoice(store)).toBe('declined');
    expect(boardAskNeeded(store)).toBe(false);
    store.setItem('ab-alone.board-consent', JSON.stringify({ v: BOARD_VERSION + 1, choice: 'joined' }));
    expect(readChoice(store)).toBeNull();
    store.setItem('ab-alone.board-consent', JSON.stringify({ v: BOARD_VERSION, choice: 'maybe' }));
    expect(readChoice(store)).toBeNull();
    store.setItem('ab-alone.board-consent', 'garbage');
    expect(readChoice(store)).toBeNull();
  });

  it('is asked by default, for everyone: no flag is needed', () => {
    expect(boardAskNeeded(memory())).toBe(true);
  });

  it('cuts a pseudonym to 16 characters, without control characters or runs of spaces', () => {
    expect(cleanName('  a\u0000b \n  c  ')).toBe('a b c');
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
    expect(cleanName('😀'.repeat(20))).toBe('😀'.repeat(16));
    expect(readBoardName(memory())).toBe('');
  });

  it('makes a board key of its own, kept, and never the world key', async () => {
    const store = memory();
    const board = await boardKeys(store);
    expect((await boardKeys(store)).pub).toBe(board.pub);
    expect((await worldKeys(store)).pub).not.toBe(board.pub);
    expect(store.getItem('ab-alone.world-key')).not.toBe(store.getItem('ab-alone.board-key'));
  });

  it('signs a retire that verifies, and fails once the key, the time or the signature is changed', async () => {
    const keys = await generateKeys();
    const e = await signRetire(keys, 1_800_000_000);
    expect(e).toMatchObject({ v: 1, kind: 'retire', pub: keys.pub, at: 1_800_000_000 });
    expect(await verifyRetire(e)).toBe(true);
    expect(await verifyRetire({ ...e, at: e.at + 1 })).toBe(false);
    expect(await verifyRetire({ ...e, pub: (await generateKeys()).pub })).toBe(false);
    expect(await verifyRetire({ ...e, sig: 'x' })).toBe(false);
  });

  it('joins with a cleaned name, leaves with a stored signed retire, and clears the consent', async () => {
    const store = memory();
    const pub = await joinBoard(store, 'Ada  Lovelace the very first');
    expect(readChoice(store)).toBe('joined');
    expect(readBoardName(store)).toHaveLength(16);
    await joinBoard(store, 'Mr Edging');
    expect(readBoardName(store)).toBe(''); // a filtered pun (#1652) joins with no name
    expect(readRetires(store)).toEqual([]);
    const retire = await leaveBoard(store, 1_800_000_000_999);
    expect(retire.pub).toBe(pub);
    expect(retire.at).toBe(1_800_000_000);
    expect(await verifyRetire(retire)).toBe(true);
    expect(readRetires(store)).toEqual([retire]);
    expect(readChoice(store)).toBe('declined');
    expect(store.getItem('ab-alone.board-key')).toBe(''); // erased by Leave
    expect(store.getItem('ab-alone.board-name')).toBe(''); // the name too (#1287)
  });

  it('publishes a result only with ?board=publish and while the consent is still joined: a Leave during the wait publishes nothing', async () => {
    const store = memory();
    await joinBoard(store, 'a');
    expect(publishAllowed(store, '?board=publish')).toBe(true);
    expect(publishAllowed(store, '?board')).toBe(false);
    await leaveBoard(store, 1000);
    expect(publishAllowed(store, '?board=publish')).toBe(false);
  });

  it('a retire record kept under the first board version still counts: its key is never reused and Leave keeps it', async () => {
    const store = memory();
    const keys = await boardKeys(store);
    const old = await signRetire(keys, 1_800_000_000);
    store.setItem('ab-alone.board-retire', JSON.stringify({ v: 1, events: [old] })); // written before BOARD_VERSION became 3
    expect(readRetires(store)).toEqual([old]);
    const pub = await joinBoard(store, 'a');
    expect(pub).not.toBe(keys.pub);
    await leaveBoard(store, 1_800_000_001_000);
    expect(readRetires(store)[0]).toEqual(old);
    expect(readRetires(store)).toHaveLength(2);
  });

  it('never rejoins with a retired key, and New key makes a fresh one', async () => {
    const store = memory();
    const first = await joinBoard(store, 'a');
    await leaveBoard(store, 1000);
    const second = await joinBoard(store, 'a');
    expect(second).not.toBe(first);
    const third = (await newKey(store, 1_800_000_000_000)).pub;
    expect(third).not.toBe(second);
    // New key retires the old key first, as Leave does: it can never be retired afterwards
    const retires = readRetires(store);
    expect(retires.map((e) => e.pub)).toEqual([first, second]);
    expect(await verifyRetire(retires[1]!)).toBe(true);
    expect(retires[1]!.at).toBe(1_800_000_000);
    expect(readChoice(store)).toBe("joined");
    await leaveBoard(store, 2000);
    expect(readRetires(store)).toHaveLength(3);
  });

  it('reads no retire from a broken record', () => {
    const store = memory();
    store.setItem('ab-alone.board-retire', 'x');
    expect(readRetires(store)).toEqual([]);
    store.setItem('ab-alone.board-retire', JSON.stringify({ v: 9, events: [] }));
    expect(readRetires(store)).toEqual([]);
  });

  it('sends nothing: no fetch, no socket, no beacon', async () => {
    const fetchSpy = vi.fn();
    const socket = vi.fn();
    const beacon = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('WebSocket', socket);
    vi.stubGlobal('XMLHttpRequest', socket);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const store = memory();
    await joinBoard(store, 'a');
    await leaveBoard(store, 5);
    await newKey(store, 6);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'sendBeacon');
  });
});
