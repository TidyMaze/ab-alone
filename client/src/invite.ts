const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Random url safe room id, 16 bytes. `fill` is crypto.getRandomValues in the browser. */
export function newRoomId(fill: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  const bytes = new Uint8Array(16);
  fill(bytes);
  return base64url(bytes);
}

/** The fingerprint of the creator's public key in an invite link (#1323): the first 8 base64url characters of the
 * SHA-256 of `pub`, 48 bits. Another key with the same fingerprint takes about 2^48 key pairs to find, days of GPU time,
 * while a link waits minutes to be opened; and the link grows by only 13 characters. A joiner binds seat 1 only to it. */
export async function fingerprint(pub: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pub));
  return base64url(new Uint8Array(digest)).slice(0, 8);
}

/** The fingerprint of the creator's key, last in an invite of any kind; undefined for an older link that has none. */
export function creatorFromHash(hash: string): string | undefined {
  return /^#(?:room|royale)=.*&key=([\w-]{8})$/.exec(hash)?.[1];
}

/** The boss and seed of a co-op fight (docs/specs/coop-boss.md section 4). */
export interface CoopFight {
  boss: string;
  seed: number;
}

/** The invite link of a room; a co-op room also carries its boss and seed, and `key` is the creator's fingerprint. */
export function inviteUrl(page: string, room: string, fight?: CoopFight, key?: string): string {
  const url = new URL(page);
  url.hash = `room=${room}` + (fight ? `&boss=${fight.boss}&seed=${fight.seed}` : '') + (key ? `&key=${key}` : '');
  return url.toString();
}

/** The room of a versus invite, null for anything else (a co-op invite included). */
export function roomFromHash(hash: string): string | null {
  const m = /^#room=([\w-]+)(?:&key=[\w-]{8})?$/.exec(hash);
  return m ? m[1]! : null;
}

/** The room, boss and seed of a co-op invite, null for anything else. The seed is an unsigned 32-bit number. */
export function coopFromHash(hash: string): ({ room: string } & CoopFight) | null {
  const m = /^#room=([\w-]+)&boss=([\w-]+)&seed=(0|[1-9]\d{0,9})(?:&key=[\w-]{8})?$/.exec(hash);
  const seed = Number(m?.[3]);
  return m && seed <= 0xffffffff ? { room: m[1]!, boss: m[2]!, seed } : null;
}

/** The invite link of an online battle royale room (#504), with the creator's fingerprint `key`. */
export function royaleUrl(page: string, room: string, key?: string): string {
  const url = new URL(page);
  url.hash = `royale=${room}` + (key ? `&key=${key}` : '');
  return url.toString();
}

/** The room of a battle royale invite, null for anything else. */
export function royaleFromHash(hash: string): string | null {
  const m = /^#royale=([\w-]+)(?:&key=[\w-]{8})?$/.exec(hash);
  return m ? m[1]! : null;
}
