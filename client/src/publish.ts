// The write side of the shared ranked board (#1287, docs/specs/multiplayer.md section 7): one Nostr event per result, sent to the three
// relays. Called only with a result both seats signed. The Nostr event is signed with a throwaway key made for this one event: it
// names nobody (the seats' signatures inside the content say who played), and two events never share an author.
import { schnorr, utils } from '@noble/secp256k1';
import { RELAYS, TAG, type Socket, type SharedResult } from './boardfeed';

const TIMEOUT_MS = 8000;
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export interface NostrEvent {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: 1;
  readonly tags: string[][];
  readonly content: string;
  readonly sig: string;
}

/** The NIP-01 event of a result: kind 1, tagged for the board, signed with a fresh throwaway key. */
export async function resultEvent(result: SharedResult, nowS: number): Promise<NostrEvent> {
  const secret = utils.randomSecretKey();
  const pubkey = hex(schnorr.getPublicKey(secret));
  const tags = [['t', TAG]];
  const content = JSON.stringify(result);
  const id = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([0, pubkey, nowS, 1, tags, content]))));
  return { id: hex(id), pubkey, created_at: nowS, kind: 1, tags, content, sig: hex(await schnorr.signAsync(id, secret)) };
}

/** Sends `event` to one relay and answers whether it said OK. Ends at the answer, an error, a close, a rate limit notice or 8 s. */
export function sendEvent(open: (url: string) => Socket, url: string, event: NostrEvent): Promise<boolean> {
  return new Promise((resolve) => {
    let sock: Socket;
    try {
      sock = open(url);
    } catch {
      resolve(false);
      return;
    }
    let over = false;
    const end = (ok: boolean): void => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      sock.close();
      resolve(ok);
    };
    const timer = setTimeout(() => end(false), TIMEOUT_MS);
    sock.addEventListener('open', () => sock.send(JSON.stringify(['EVENT', event])));
    sock.addEventListener('message', (e) => {
      let m: unknown;
      try {
        m = JSON.parse(e.data!);
      } catch {
        return;
      }
      if (Array.isArray(m) && m[0] === 'OK' && m[1] === event.id) end(m[2] === true);
      else if (Array.isArray(m) && m[0] === 'NOTICE') end(false); // rate-limited or not: back off, one try per relay
    });
    for (const type of ['error', 'close']) sock.addEventListener(type, () => end(false));
  });
}

/** Publishes a result both seats signed to the relays; the number of relays that accepted it. Never throws. */
export async function publishResult(open: (url: string) => Socket, result: SharedResult, nowS: number, relays: readonly string[] = RELAYS): Promise<number> {
  try {
    const event = await resultEvent(result, nowS);
    return (await Promise.all(relays.map((url) => sendEvent(open, url, event)))).filter(Boolean).length;
  } catch {
    return 0; // the event could not be made: nothing was sent
  }
}
