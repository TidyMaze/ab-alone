import { schnorr, utils } from '@noble/secp256k1';
import { afterEach, describe, expect, it, vi } from 'vitest';
import banned from './bannedkeys.json';
import banSig from './bannedkeys.sig.json';
import { OWNER_PUB, banDigest, signBanList, verifyBanList, type BanList, type BanSig } from './banverify';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const pubOf = (secret: Uint8Array): string => hex(schnorr.getPublicKey(secret));
const list: BanList = { v: 1, banned: [{ pub: 'a'.repeat(43), reason: 'two signals', date: '2026-11-05' }] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the signed ban list (#1287, docs/specs/multiplayer.md section 7)', () => {
  it('accepts a list signed by the key it names, and returns its banned keys', async () => {
    const secret = utils.randomSecretKey();
    const sig = await signBanList(list, hex(secret));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect([...(await verifyBanList(list, sig, pubOf(secret)))]).toEqual(['a'.repeat(43)]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not depend on the order of the keys in the file', async () => {
    const secret = utils.randomSecretKey();
    const sig = await signBanList(list, hex(secret));
    const reordered = { banned: list.banned, v: 1 };
    expect((await verifyBanList(reordered, sig, pubOf(secret))).size).toBe(1);
  });

  it('rejects a tampered list: one changed reason empties the ban list and warns once', async () => {
    const secret = utils.randomSecretKey();
    const sig = await signBanList(list, hex(secret));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const forged: BanList = { v: 1, banned: [{ pub: 'a'.repeat(43), reason: 'changed', date: '2026-11-05' }] };
    expect((await verifyBanList(forged, sig, pubOf(secret))).size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a list signed by another key than the owner key', async () => {
    const owner = utils.randomSecretKey();
    const other = utils.randomSecretKey();
    const sig = await signBanList(list, hex(other));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await verifyBanList(list, sig, pubOf(owner))).size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing signature, and a malformed one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await verifyBanList(list, undefined, OWNER_PUB)).size).toBe(0);
    expect((await verifyBanList(list, { version: 1, pubkey: OWNER_PUB, sig: 'not hex' }, OWNER_PUB)).size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('digests the canonical JSON: the same bytes for any key order, a different digest for another list', async () => {
    const a = await banDigest({ v: 1, banned: [] });
    expect(hex(await banDigest({ banned: [], v: 1 }))).toBe(hex(a));
    expect(hex(await banDigest({ v: 2, banned: [] }))).not.toBe(hex(a));
    expect(hex(await banDigest({ v: null, banned: [null, [1, { z: 1, y: 2 }]] }))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the shipped bannedkeys.json carries a valid signature by OWNER_PUB', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shipped = await verifyBanList(banned, banSig as BanSig);
    expect(shipped.size).toBe((banned as BanList).banned.length);
    expect(warn).not.toHaveBeenCalled();
  });
});
