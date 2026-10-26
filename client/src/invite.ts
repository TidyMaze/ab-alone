/** Random url safe room id, 16 bytes. `fill` is crypto.getRandomValues in the browser. */
export function newRoomId(fill: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  const bytes = new Uint8Array(16);
  fill(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The boss and seed of a co-op fight (docs/specs/coop-boss.md section 4). */
export interface CoopFight {
  boss: string;
  seed: number;
}

/** The invite link of a room; a co-op room also carries its boss and seed. */
export function inviteUrl(page: string, room: string, fight?: CoopFight): string {
  const url = new URL(page);
  url.hash = `room=${room}` + (fight ? `&boss=${fight.boss}&seed=${fight.seed}` : '');
  return url.toString();
}

/** The room of a versus invite, null for anything else (a co-op invite included). */
export function roomFromHash(hash: string): string | null {
  const m = /^#room=([\w-]+)$/.exec(hash);
  return m ? m[1]! : null;
}

/** The room, boss and seed of a co-op invite, null for anything else. The seed is an unsigned 32-bit number. */
export function coopFromHash(hash: string): ({ room: string } & CoopFight) | null {
  const m = /^#room=([\w-]+)&boss=([\w-]+)&seed=(0|[1-9]\d{0,9})$/.exec(hash);
  const seed = Number(m?.[3]);
  return m && seed <= 0xffffffff ? { room: m[1]!, boss: m[2]!, seed } : null;
}
