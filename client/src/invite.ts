/** Random url safe room id, 16 bytes. `fill` is crypto.getRandomValues in the browser. */
export function newRoomId(fill: (bytes: Uint8Array<ArrayBuffer>) => void): string {
  const bytes = new Uint8Array(16);
  fill(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function inviteUrl(page: string, room: string): string {
  const url = new URL(page);
  url.hash = `room=${room}`;
  return url.toString();
}

export function roomFromHash(hash: string): string | null {
  const m = /^#room=([\w-]+)$/.exec(hash);
  return m ? m[1]! : null;
}
