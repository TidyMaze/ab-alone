// The owner's signature of the ranked ban list (`bannedkeys.json`, #1287, docs/specs/multiplayer.md section 7). A PR can only be
// trusted once the list carries a BIP-340 Schnorr signature by the owner key below: the same scheme as the Nostr events. The private
// key lives in the owner's macOS keychain (service `ab-alone-banlist-signing`) and never in the repo; `scripts/sign-banlist.ts` signs.
import { etc, schnorr } from '@noble/secp256k1';

/** The owner's public key (x-only, hex). The ban list is accepted only when signed by its private key. */
export const OWNER_PUB = '84544de656d24feba950bd83569a61c0477db2a25f1cf99516abd0043dfb62f6';

/** The version the owner signs now. */
export const BAN_VERSION = 2;

/** The lowest signed version accepted: an owner-signed pair below it (an old list replayed) is rejected. Raise it with each rollback fix. */
export const MIN_BAN_VERSION = 2;

export interface BanList {
  readonly v: number;
  readonly banned: readonly { readonly pub: string; readonly reason: string; readonly date: string }[];
}

/** `bannedkeys.sig.json`: the signature of the canonical JSON of `{ version, list }`, with the key that made it. */
export interface BanSig {
  readonly version: number;
  readonly pubkey: string;
  readonly sig: string;
}

/** The canonical JSON: keys sorted at every level, no spaces, so a re-indented or re-ordered file keeps its signature. */
const sortKeys = (_: string, v: unknown): unknown =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v;
export const canonical = (value: unknown): string => JSON.stringify(value, sortKeys);

/** The SHA-256 of the canonical JSON of `{ version, list }`: the 32 bytes the owner signs. Needs WebCrypto (a secure origin). */
export const banDigest = async (version: number, list: unknown): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical({ version, list }))));

/** Signs `{ version, list }` with the owner's private key (hex). Used by `scripts/sign-banlist.ts` only. */
export async function signBanList(list: unknown, secretHex: string, version: number = BAN_VERSION): Promise<BanSig> {
  const secret = etc.hexToBytes(secretHex);
  return { version, pubkey: etc.bytesToHex(schnorr.getPublicKey(secret)), sig: etc.bytesToHex(await schnorr.signAsync(await banDigest(version, list), secret)) };
}

/** True when the signature verifies against `owner` over `{ version, list }` and its signed version is at least `minVersion`. */
export async function isSignedBy(list: unknown, sig: unknown, owner: string = OWNER_PUB, minVersion: number = MIN_BAN_VERSION): Promise<boolean> {
  try {
    const { version, sig: hexSig } = sig as BanSig;
    if (typeof version !== 'number' || version < minVersion) return false;
    return await schnorr.verifyAsync(etc.hexToBytes(hexSig), await banDigest(version, list), etc.hexToBytes(owner));
  } catch {
    return false; // a missing or malformed signature is a rejection, never a crash
  }
}

/** The banned keys of `list` when its signature verifies against `owner`; otherwise no key is banned, and one console warning says why. */
export async function verifyBanList(list: unknown, sig: unknown, owner: string = OWNER_PUB): Promise<ReadonlySet<string>> {
  if (!globalThis.crypto?.subtle) {
    console.warn('ban list not verified: no WebCrypto (insecure origin)');
    return new Set();
  }
  if (await isSignedBy(list, sig, owner)) return new Set((list as BanList).banned.map((b) => b.pub));
  console.warn('bannedkeys.json: the owner signature is missing, too old or does not verify, the ban list is empty');
  return new Set();
}
