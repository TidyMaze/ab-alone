import { describe, expect, it } from 'vitest';
import { bossSeatFromHash, coopFromHash, creatorFromHash, fingerprint, inviteUrl, newRoomId, roomFromHash, royaleFromHash, royaleUrl } from './invite';

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

  it('fingerprints a key with its first 8 base64url characters of SHA-256 (#1323)', async () => {
    expect(await fingerprint('abc')).toBe('ungWv48B');
    expect(await fingerprint('abd')).toMatch(/^[\w-]{8}$/);
    expect(await fingerprint('abd')).not.toBe('ungWv48B');
  });

  it('puts the fingerprint of the creator key last in every invite and reads it back, apart from the room (#1323)', () => {
    const page = 'https://x.github.io/ab-alone/#old';
    const versus = inviteUrl(page, 'abc_DEF-123', undefined, 'ungWv48B');
    expect(versus).toBe('https://x.github.io/ab-alone/#room=abc_DEF-123&key=ungWv48B');
    expect(roomFromHash(new URL(versus).hash)).toBe('abc_DEF-123');
    expect(creatorFromHash(new URL(versus).hash)).toBe('ungWv48B');
    const coop = inviteUrl(page, 'r', { boss: 'echo', seed: 7 }, 'a-b_cdef');
    expect(coop).toBe('https://x.github.io/ab-alone/#room=r&boss=echo&seed=7&key=a-b_cdef');
    expect(coopFromHash(new URL(coop).hash)).toEqual({ room: 'r', boss: 'echo', seed: 7 });
    expect(creatorFromHash(new URL(coop).hash)).toBe('a-b_cdef');
    const royale = royaleUrl(page, 'r', 'ungWv48B');
    expect(royale).toBe('https://x.github.io/ab-alone/#royale=r&key=ungWv48B');
    expect(royaleFromHash(new URL(royale).hash)).toBe('r');
    expect(creatorFromHash(new URL(royale).hash)).toBe('ungWv48B');
  });

  it('finds no fingerprint in an older link, and no invite with a malformed one (#1323)', () => {
    for (const hash of ['', '#room=r', '#room=r&boss=echo&seed=7', '#royale=r']) expect(creatorFromHash(hash)).toBeUndefined();
    expect(roomFromHash('#room=r&key=short')).toBeNull();
    expect(roomFromHash('#room=r&key=ungWv48B9')).toBeNull();
    expect(coopFromHash('#room=r&key=ungWv48B&boss=echo&seed=7')).toBeNull();
    expect(royaleFromHash('#royale=r&key=a+b/cdef')).toBeNull();
  });

  it('marks an invite whose boss is played by the joiner, apart from a co-op and a versus invite (#1316)', () => {
    const url = inviteUrl('https://x.github.io/ab-alone/', 'abc', { boss: 'hull', seed: 7 }, 'AAAAAAAA', true);
    expect(new URL(url).hash).toBe('#room=abc&boss=hull&seed=7&seat=boss&key=AAAAAAAA');
    expect(bossSeatFromHash(new URL(url).hash)).toEqual({ room: 'abc', boss: 'hull', seed: 7 });
    expect(bossSeatFromHash('#room=abc&boss=hull&seed=7&seat=boss')).toEqual({ room: 'abc', boss: 'hull', seed: 7 });
    expect(creatorFromHash(new URL(url).hash)).toBe('AAAAAAAA');
    expect(coopFromHash(new URL(url).hash)).toBeNull();
    expect(roomFromHash(new URL(url).hash)).toBeNull();
    expect(bossSeatFromHash('#room=abc&boss=hull&seed=7&key=AAAAAAAA')).toBeNull();
    expect(bossSeatFromHash('#room=abc&seat=boss')).toBeNull();
    expect(bossSeatFromHash('#room=abc&boss=hull&seed=4294967296&seat=boss')).toBeNull();
    expect(bossSeatFromHash('#room=abc&boss=hull&seed=007&seat=boss')).toBeNull();
    expect(bossSeatFromHash('')).toBeNull();
  });
});
