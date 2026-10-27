import { describe, expect, it } from 'vitest';
import { BLAST_MS, BLAST_RADIUS, BLAST_SHARDS, BOSS_CODE, FLASH_MS, blastAt, martyrText, parseBlast, parseMartyr } from './martyr';

describe('parseMartyr', () => {
  it('reads the announced cell of the bridge, none when empty', () => {
    expect(parseMartyr([2, -3])).toEqual([2, -3]);
    expect(parseMartyr([])).toBeNull();
  });
});

describe('martyrText', () => {
  it('announces the explosion while a martyr waits', () => {
    expect(martyrText([0, 0])).toBe('Martyr marked: it explodes at the end of the next boss turn');
    expect(martyrText(null)).toBe('');
  });
});

describe('parseBlast', () => {
  it('is the cell of the boss marble the last ply removed', () => {
    expect(parseBlast([1, 0, 1, 2, -1, BOSS_CODE])).toEqual([2, -1]);
  });

  it('is none when the ply removed no boss marble', () => {
    expect(parseBlast([])).toBeNull();
    expect(parseBlast([1, 0, 1])).toBeNull();
  });
});

describe('blastAt', () => {
  it('flashes, then throws a ring of shards out and fades both', () => {
    const start = blastAt(0, false);
    expect(start).toMatchObject({ shardRadius: 0, flashOpacity: expect.closeTo(0.9, 5), done: false });
    const mid = blastAt(BLAST_MS / 2, false);
    expect(mid.shardRadius).toBeGreaterThan(0);
    expect(mid.shardRadius).toBeLessThan(BLAST_RADIUS);
    expect(mid.flashOpacity).toBeLessThan(start.flashOpacity);
    expect(mid.shardLift).toBeGreaterThan(0);
    expect(mid.shardOpacity).toBeGreaterThan(0);
    const end = blastAt(BLAST_MS, false);
    expect(end).toMatchObject({ shardRadius: BLAST_RADIUS, flashOpacity: 0, shardOpacity: 0, done: true });
    expect(blastAt(-5, false).done).toBe(false);
  });

  it('is a static flash with reduced motion: no shards, the full flash fading', () => {
    const start = blastAt(0, true);
    expect(start.flashRadius).toBe(blastAt(FLASH_MS / 2, true).flashRadius);
    expect(start).toMatchObject({ shardOpacity: 0, done: false });
    expect(blastAt(FLASH_MS / 2, true).flashOpacity).toBeLessThan(start.flashOpacity);
    expect(blastAt(FLASH_MS, true).done).toBe(true);
  });

  it('has a handful of shards', () => {
    expect(BLAST_SHARDS).toBeGreaterThanOrEqual(6);
  });
});
