import { describe, expect, it } from 'vitest';
import { inviteUrl, newRoomId, roomFromHash } from './invite';

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
});
