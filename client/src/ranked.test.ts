// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultRankedProfile,
  loadRankedProfile,
  recordRankedMatch,
  renderRankBadge,
  saveRankedProfile,
  type RankedProfile,
} from './ranked';

describe('ranked profile and badges (#687)', () => {
  let store: Storage;

  beforeEach(() => {
    localStorage.clear();
    store = localStorage;
  });

  describe('persistence', () => {
    it('returns default profile with 1200 ratings when storage is empty', () => {
      const profile = loadRankedProfile(store);
      expect(profile).toEqual({
        version: 1,
        rating1v1: 1200,
        ratingRoyale: 1200,
        matches: [],
      });
    });

    it('recovers gracefully from malformed stored JSON', () => {
      store.setItem('ab-alone.ranked', 'invalid-json{{');
      const profile = loadRankedProfile(store);
      expect(profile).toEqual(defaultRankedProfile());
    });

    it('falls back to default values when version 1 object has missing fields', () => {
      store.setItem('ab-alone.ranked', JSON.stringify({ version: 1 }));
      const profile = loadRankedProfile(store);
      expect(profile).toEqual(defaultRankedProfile());
    });

    it('generates auto id and timestamp when recording a match', () => {
      const updated = recordRankedMatch(store, {
        mode: '1v1',
        delta: 10,
        newRating: 1210,
        opponentsCount: 1,
      });

      expect(updated.matches[0]!.id).toMatch(/^match_/);
      expect(typeof updated.matches[0]!.timestamp).toBe('number');
    });

    it('saves and loads profile accurately', () => {
      const profile: RankedProfile = {
        version: 1,
        rating1v1: 1350,
        ratingRoyale: 1420,
        matches: [
          {
            id: 'm1',
            timestamp: 1700000000000,
            mode: '1v1',
            delta: 16,
            newRating: 1350,
            opponentsCount: 1,
          },
        ],
      };
      saveRankedProfile(store, profile);

      const loaded = loadRankedProfile(store);
      expect(loaded).toEqual(profile);
    });

    it('records 1v1 ranked match and updates 1v1 rating', () => {
      const updated = recordRankedMatch(store, {
        mode: '1v1',
        delta: 24,
        newRating: 1224,
        opponentsCount: 1,
        timestamp: 1000,
      });

      expect(updated.rating1v1).toBe(1224);
      expect(updated.ratingRoyale).toBe(1200);
      expect(updated.matches).toHaveLength(1);
      expect(updated.matches[0]).toMatchObject({
        mode: '1v1',
        delta: 24,
        newRating: 1224,
        opponentsCount: 1,
        timestamp: 1000,
      });
    });

    it('records Battle Royale ranked match with placement and updates BR rating', () => {
      const updated = recordRankedMatch(store, {
        mode: 'royale',
        delta: 35,
        newRating: 1235,
        placement: 1,
        opponentsCount: 5,
      });

      expect(updated.rating1v1).toBe(1200);
      expect(updated.ratingRoyale).toBe(1235);
      expect(updated.matches[0]!.placement).toBe(1);
      expect(updated.matches[0]!.opponentsCount).toBe(5);
    });

    it('caps stored match history to the latest 50 matches', () => {
      for (let i = 0; i < 55; i++) {
        recordRankedMatch(store, {
          mode: '1v1',
          delta: 1,
          newRating: 1200 + i,
          opponentsCount: 1,
        });
      }

      const loaded = loadRankedProfile(store);
      expect(loaded.matches).toHaveLength(50);
      expect(loaded.matches[loaded.matches.length - 1]!.newRating).toBe(1200 + 54);
    });
  });

  describe('renderRankBadge', () => {
    it('renders full rank badge with styling, label and formatted score', () => {
      const html = renderRankBadge(1250);
      expect(html).toContain('class="rank-badge"');
      expect(html).toContain('data-tier="silver"');
      expect(html).toContain('Silver');
      expect(html).toContain('1250');
      expect(html).toContain('style="--tier-color: #c0c0c0"');
    });

    it('renders compact rank badge with icon and score only', () => {
      const html = renderRankBadge(1650, true);
      expect(html).toContain('class="rank-badge rank-badge-compact"');
      expect(html).toContain('data-tier="diamond"');
      expect(html).toContain('1650');
      expect(html).toContain('Diamond');
    });
  });
});
