// The opt-in before any online connection (#1338, docs/specs/multiplayer.md section 7, docs/privacy.md): shown once,
// Accept is stored. Pure functions and the decided text only: main.ts builds the dialog.
import { read, write, type Store } from './quality';

const CONSENT_KEY = 'ab-alone.online-consent';

/** The text decided in docs/specs/multiplayer.md section 7, word for word. */
export const CONSENT_TEXT =
  'Online play connects you directly to other players. They, the STUN servers (Google, Cloudflare) and the Nostr relays can see your IP address. ' +
  'Your public name, a random key and your moves or position are visible to the players in your room. ' +
  'Anything other players already received cannot be taken back. I am 16 or older.';

export const PRIVACY_URL = 'https://github.com/TidyMaze/ab-alone/blob/main/docs/privacy.md';

export const consentGiven = (store: Store): boolean => read(store, CONSENT_KEY) === 'accepted';
export const writeConsent = (store: Store): void => write(store, CONSENT_KEY, 'accepted');

/** Whether going online must ask first: not accepted yet. Not for `?net=hook`, the e2e transport that touches no network, and
 * not in an automated browser (navigator.webdriver) unless `?consent` asks for it, as the specs that prove the dialog do. */
export const consentNeeded = (store: Store, search: string, automated: boolean): boolean => {
  const query = new URLSearchParams(search);
  if (consentGiven(store) || query.get('net') === 'hook') return false;
  return !automated || query.has('consent');
};
