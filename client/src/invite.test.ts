import { describe, expect, it } from 'vitest';
import { coopFromHash, inviteUrl, newRoomId, roomFromHash, royaleFromHash, royaleUrl } from './invite';

describe('invite links', () => {
  it('makes a url safe room id from random bytes', () => {
    const id = newRoomId((b) => b.fill(255));
    expect(id).toMatch(/^[\w-]{22}$/);
    expect(newRoomId((b) => b.fill(0))).not.toBe(id);
  });

  it('puts the room in the url hash and reads it back', () => {
    const url = inviteUrl('https://x.github.io/ab-alone/?net=p2p#old', 'abc_DEF-123');
    expect(url).toBe('https://x.github.io/ab-alone/?net=p2p#room=abc_DEF-123');
    expect(roomFromHash(new URL(url).hash)).toBe('abc_DEF-123');
  });

  it('finds no room when the hash is empty, foreign or malformed', () => {
    expect(roomFromHash('')).toBeNull();
    expect(roomFromHash('#other=1')).toBeNull();
    expect(roomFromHash('#room=')).toBeNull();
    expect(roomFromHash('#room=a b')).toBeNull();
  });

  it('puts the boss and the seed of a co-op fight next to the room and reads them back', () => {
    const url = inviteUrl('https://x.github.io/ab-alone/#old', 'abc_DEF-123', { boss: 'echo', seed: 4294967295 });
    expect(url).toBe('https://x.github.io/ab-alone/#room=abc_DEF-123&boss=echo&seed=4294967295');
    expect(coopFromHash(new URL(url).hash)).toEqual({ room: 'abc_DEF-123', boss: 'echo', seed: 4294967295 });
    expect(coopFromHash('#room=r&boss=hull&seed=0')).toEqual({ room: 'r', boss: 'hull', seed: 0 });
  });

  it('keeps a co-op invite apart from a versus invite', () => {
    expect(roomFromHash('#room=r&boss=echo&seed=7')).toBeNull();
    expect(coopFromHash('#room=r')).toBeNull();
  });

  it('finds no co-op fight in a malformed hash', () => {
    expect(coopFromHash('')).toBeNull();
    expect(coopFromHash('#room=r&boss=&seed=7')).toBeNull();
    expect(coopFromHash('#room=r&seed=7&boss=echo')).toBeNull();
    expect(coopFromHash('#room=r&boss=echo&seed=')).toBeNull();
    expect(coopFromHash('#room=r&boss=echo&seed=-1')).toBeNull();
    expect(coopFromHash('#room=r&boss=echo&seed=07')).toBeNull();
    expect(coopFromHash('#room=r&boss=echo&seed=1.5')).toBeNull();
    expect(coopFromHash('#room=r&boss=echo&seed=4294967296')).toBeNull();
  });

  it('puts a battle royale room in its own hash and reads it back, apart from the other invites (#504)', () => {
    const url = royaleUrl('https://x.github.io/ab-alone/#old', 'abc_DEF-123');
    expect(url).toBe('https://x.github.io/ab-alone/#royale=abc_DEF-123');
    expect(royaleFromHash(new URL(url).hash)).toBe('abc_DEF-123');
    expect(roomFromHash(new URL(url).hash)).toBeNull();
    for (const hash of ['', '#royale=', '#royale=a b', '#room=r']) expect(royaleFromHash(hash)).toBeNull();
  });
});
