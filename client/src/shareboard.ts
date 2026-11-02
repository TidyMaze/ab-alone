// The opt-in for the shared ranked board (#1287, docs/privacy.md): its own purpose, apart from the online consent (consent.ts).
// This slice sends nothing: it holds the choice, a random board key made by the world key's code, a pseudonym, and the signed
// `retire` event kept for the slice that publishes. Every record is versioned.
import { b64, ED, signedBy, type Keys } from './moverecord';
import { read, write, type Store } from './quality';
import { storedKeys } from './worldevents';

const CHOICE_KEY = 'ab-alone.board-consent';
const BOARD_KEY = 'ab-alone.board-key';
const NAME_KEY = 'ab-alone.board-name';
const RETIRE_KEY = 'ab-alone.board-retire';
/** Raise it when the text below changes: an older answer then counts for nothing and the box is asked again. */
export const BOARD_VERSION = 2;
/** The retire record has its own version: a text change must never hide a retire already signed. */
const RETIRE_VERSION = 1;
export const NAME_MAX = 16;

/** The text decided by the legal role on #1287: public, permanent, third party relays, no erasure, a name that is not you, 16+. */
export const BOARD_TEXT =
  'The shared ranked board publishes your ranked results, a random key and the name you pick on public Nostr relays run by third parties (nos.lol, relay.piazza.today, relay.bitmacro.cloud). ' +
  'Opening the board connects your browser to these relays, which see your IP address. ' +
  'It is public and permanent: we cannot delete it, and the relays keep what they keep. Leaving the board stops new results, it does not erase old ones. ' +
  'Pick a name that does not identify you.';

export type BoardChoice = 'joined' | 'declined';

export interface RetireEvent {
  readonly v: 1;
  readonly kind: 'retire';
  readonly pub: string;
  /** Seconds since 1970, signed. */
  readonly at: number;
  readonly sig: string;
}

export function readChoice(store: Store): BoardChoice | null {
  try {
    const saved = JSON.parse(read(store, CHOICE_KEY) ?? '') as { v?: number; choice?: string };
    if (saved.v === BOARD_VERSION && (saved.choice === 'joined' || saved.choice === 'declined')) return saved.choice;
  } catch {
    // no record, or one that does not parse: not asked yet
  }
  return null;
}

export const writeChoice = (store: Store, choice: BoardChoice): void =>
  write(store, CHOICE_KEY, JSON.stringify({ v: BOARD_VERSION, choice }));

/** The whole feature is behind `?board`, off for everyone else (unfinished work, nothing is published yet). */
export const boardFlag = (search: string): boolean => new URLSearchParams(search).has('board');

/** Whether ranked entry must ask first: the flag is on and there is no answer yet. */
export const boardAskNeeded = (store: Store, search: string): boolean => boardFlag(search) && readChoice(store) === null;

/** A pseudonym: no control characters, spaces collapsed, 16 characters at most (by code point). */
export const cleanName = (raw: string): string =>
  // eslint-disable-next-line no-control-regex
  [...raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('');

export const readBoardName = (store: Store): string => cleanName(read(store, NAME_KEY) ?? '');

export const boardKeys = (store: Store): Promise<Keys> => storedKeys(store, BOARD_KEY);

const retirePayload = (pub: string, at: number): Uint8Array<ArrayBuffer> => {
  const bytes = new TextEncoder().encode(`ab-alone.retire.v1\n${pub}\n${at}`);
  return new Uint8Array(bytes);
};

export async function signRetire(keys: Keys, at: number): Promise<RetireEvent> {
  const sig = await crypto.subtle.sign(ED, keys.priv, retirePayload(keys.pub, at));
  return { v: 1, kind: 'retire', pub: keys.pub, at, sig: b64(sig) };
}

export const verifyRetire = (e: RetireEvent): Promise<boolean> => signedBy(e.pub, e.sig, retirePayload(e.pub, e.at));

/** The retire events made and not yet published (the next slice publishes them). */
export function readRetires(store: Store): RetireEvent[] {
  try {
    const saved = JSON.parse(read(store, RETIRE_KEY) ?? '') as { v?: number; events?: RetireEvent[] };
    if (saved.v === RETIRE_VERSION && Array.isArray(saved.events)) return saved.events;
  } catch {
    // none
  }
  return [];
}

/** Joins: the choice, the name and a key. A key that was retired is never reused: the board would ignore it. */
export async function joinBoard(store: Store, name: string): Promise<string> {
  write(store, NAME_KEY, cleanName(name));
  const keys = await boardKeys(store);
  const pub = readRetires(store).some((e) => e.pub === keys.pub) ? (await freshKey(store)).pub : keys.pub;
  writeChoice(store, 'joined');
  return pub;
}

/** Leaves: builds and stores the signed `retire` for the current key (nothing is sent), then clears the consent. */
async function retireCurrent(store: Store, nowMs: number): Promise<RetireEvent> {
  const event = await signRetire(await boardKeys(store), Math.floor(nowMs / 1000));
  write(store, RETIRE_KEY, JSON.stringify({ v: RETIRE_VERSION, events: [...readRetires(store), event] }));
  return event;
}

async function freshKey(store: Store): Promise<Keys> {
  write(store, BOARD_KEY, '');
  return boardKeys(store);
}

export async function leaveBoard(store: Store, nowMs: number): Promise<RetireEvent> {
  const event = await retireCurrent(store, nowMs);
  writeChoice(store, 'declined');
  return event;
}

/** A fresh board key. The old one is retired first, as Leave does (a signed `retire`, stored, not sent), so it can never be left behind unretired. */
export async function newKey(store: Store, nowMs: number): Promise<Keys> {
  await retireCurrent(store, nowMs);
  return freshKey(store);
}
