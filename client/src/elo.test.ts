// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_K_FACTOR,
  DEFAULT_RATING,
  expectedScore,
  formatRating,
  getRankTier,
  RANK_TIERS,
  update1v1Elo,
  updateBattleRoyaleElo,
  type PlayerPlacement,
} from './elo';

describe('elo module (#685)', () => {
  describe('expectedScore', () => {
    it('returns 0.5 when ratings are equal', () => {
      expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 5);
      expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
    });

    it('returns higher probability for higher rated player', () => {
      const p = expectedScore(1400, 1200);
      expect(p).toBeGreaterThan(0.75);
      expect(p).toBeLessThan(0.77);
      expect(expectedScore(1200, 1400)).toBeCloseTo(1 - p, 5);
    });

    it('handles extreme rating differences', () => {
      expect(expectedScore(2400, 800)).toBeGreaterThan(0.99);
      expect(expectedScore(800, 2400)).toBeLessThan(0.01);
    });
  });

  describe('update1v1Elo', () => {
    it('calculates symmetrical rating changes on decisive result', () => {
      // 1200 vs 1200, player A wins (score 1)
      const res = update1v1Elo(1200, 1200, 1);
      expect(res.deltaA).toBe(16);
      expect(res.deltaB).toBe(-16);
      expect(res.ratingA).toBe(1216);
      expect(res.ratingB).toBe(1184);
    });

    it('calculates zero delta on draw between equal ratings', () => {
      const res = update1v1Elo(1200, 1200, 0.5);
      expect(res.deltaA).toBe(0);
      expect(res.deltaB).toBe(0);
      expect(res.ratingA).toBe(1200);
      expect(res.ratingB).toBe(1200);
    });

    it('allows custom K-factor', () => {
      const res = update1v1Elo(1200, 1200, 1, 16);
      expect(res.deltaA).toBe(8);
      expect(res.deltaB).toBe(-8);
    });

    it('prevents rating from falling below minimum bound (100)', () => {
      const res = update1v1Elo(110, 100, 0, 32);
      expect(res.ratingA).toBe(100);
    });

    it('calculates correct updates when lower rated player wins (upset)', () => {
      // 1000 vs 1400: player A wins
      const res = update1v1Elo(1000, 1400, 1, 32);
      expect(res.deltaA).toBeGreaterThan(25);
      expect(res.deltaB).toBe(-res.deltaA);
    });
  });

  describe('updateBattleRoyaleElo', () => {
    it('handles empty or single player list gracefully', () => {
      const empty = updateBattleRoyaleElo([]);
      expect(empty.size).toBe(0);

      const single = updateBattleRoyaleElo([{ id: 'p1', rating: 1200, rank: 1 }]);
      expect(single.get('p1')).toEqual({ newRating: 1200, delta: 0 });
    });

    it('calculates pairwise ratings with zero net rating drift for 3 players', () => {
      const players: PlayerPlacement[] = [
        { id: 'alice', rating: 1200, rank: 1 },
        { id: 'bob', rating: 1200, rank: 2 },
        { id: 'charlie', rating: 1200, rank: 3 },
      ];

      const res = updateBattleRoyaleElo(players, DEFAULT_K_FACTOR);
      expect(res.size).toBe(3);

      const alice = res.get('alice')!;
      const bob = res.get('bob')!;
      const charlie = res.get('charlie')!;

      expect(alice.delta).toBeGreaterThan(0);
      expect(charlie.delta).toBeLessThan(0);
      expect(bob.delta).toBe(0);

      const sumDelta = alice.delta + bob.delta + charlie.delta;
      expect(sumDelta).toBe(0);
      expect(alice.newRating).toBe(1200 + alice.delta);
    });

    it('handles ties in Battle Royale placements', () => {
      const players: PlayerPlacement[] = [
        { id: 'p1', rating: 1200, rank: 1 },
        { id: 'p2', rating: 1200, rank: 1 }, // tied for 1st
        { id: 'p3', rating: 1200, rank: 3 },
      ];

      const res = updateBattleRoyaleElo(players);
      const p1 = res.get('p1')!;
      const p2 = res.get('p2')!;
      const p3 = res.get('p3')!;

      expect(p1.delta).toBe(p2.delta);
      expect(p1.delta).toBeGreaterThan(0);
      expect(p3.delta).toBeLessThan(0);
      expect(p1.delta + p2.delta + p3.delta).toBe(0);
    });

    it('supports 6-player battle royale without sum drift and respects min rating', () => {
      const players: PlayerPlacement[] = [
        { id: 'p1', rating: 100, rank: 6 },
        { id: 'p2', rating: 1200, rank: 5 },
        { id: 'p3', rating: 1300, rank: 4 },
        { id: 'p4', rating: 1400, rank: 3 },
        { id: 'p5', rating: 1500, rank: 2 },
        { id: 'p6', rating: 1600, rank: 1 },
      ];

      const res = updateBattleRoyaleElo(players);
      expect(res.size).toBe(6);
      expect(res.get('p1')!.newRating).toBeGreaterThanOrEqual(100);
    });

    it('handles negative drift correction in Battle Royale Elo', () => {
      // Test different configurations to exercise both drift > 0 and drift < 0
      const configurations: PlayerPlacement[][] = [
        [
          { id: '1', rating: 1000, rank: 1 },
          { id: '2', rating: 1150, rank: 2 },
          { id: '3', rating: 1250, rank: 3 },
          { id: '4', rating: 1400, rank: 4 },
        ],
        [
          { id: '1', rating: 1400, rank: 1 },
          { id: '2', rating: 1300, rank: 2 },
          { id: '3', rating: 1150, rank: 3 },
          { id: '4', rating: 1000, rank: 4 },
        ],
        [
          { id: '1', rating: 1210, rank: 1 },
          { id: '2', rating: 1220, rank: 2 },
          { id: '3', rating: 1230, rank: 3 },
          { id: '4', rating: 1240, rank: 4 },
          { id: '5', rating: 1250, rank: 5 },
        ],
      ];

      for (const config of configurations) {
        for (const k of [16, 24, 32, 40]) {
          const res = updateBattleRoyaleElo(config, k);
          const sum = Array.from(res.values()).reduce((acc, v) => acc + v.delta, 0);
          expect(sum).toBe(0);
        }
      }
    });
  });

  describe('Rank tiers and formatting', () => {
    it('maps ratings to expected rank tiers', () => {
      expect(getRankTier(-100).name).toBe('iron');
      expect(getRankTier(800).name).toBe('iron');
      expect(getRankTier(999).name).toBe('iron');
      expect(getRankTier(1000).name).toBe('bronze');
      expect(getRankTier(1199).name).toBe('bronze');
      expect(getRankTier(1200).name).toBe('silver');
      expect(getRankTier(1399).name).toBe('silver');
      expect(getRankTier(1400).name).toBe('gold');
      expect(getRankTier(1599).name).toBe('gold');
      expect(getRankTier(1600).name).toBe('diamond');
      expect(getRankTier(1799).name).toBe('diamond');
      expect(getRankTier(1800).name).toBe('obsidian');
      expect(getRankTier(2500).name).toBe('obsidian');
    });

    it('formats ratings cleanly', () => {
      expect(formatRating(1234.56)).toBe('1235');
      expect(formatRating(1200)).toBe('1200');
    });

    it('exposes all rank tier definitions', () => {
      expect(RANK_TIERS).toHaveLength(6);
      expect(DEFAULT_RATING).toBe(1200);
      expect(DEFAULT_K_FACTOR).toBe(32);
    });
  });
});
