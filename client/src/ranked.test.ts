// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultRankedProfile,
  formatDelta,
  loadRankedProfile,
  rankedHudHtml,
  recordRankedMatch,
  renderRankBadge,
  saveRankedProfile,
  settleRanked1v1,
  settleRankedRoyale,
  type RankedProfile,
} from './ranked';
import { update1v1Elo } from './elo';
import type { Report } from './moverecord';

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

    it('handles null or throwing storage gracefully', () => {
      expect(loadRankedProfile(null)).toEqual(defaultRankedProfile());
      expect(() => saveRankedProfile(null, defaultRankedProfile())).not.toThrow();
      const bad = {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      };
      expect(loadRankedProfile(bad)).toEqual(defaultRankedProfile());
      expect(() => saveRankedProfile(bad, defaultRankedProfile())).not.toThrow();
    });
  });

  describe('rankedHudHtml and match settlement (#711)', () => {
    it('formats positive, zero and negative rating deltas', () => {
      expect(formatDelta(16)).toBe('+16 Elo');
      expect(formatDelta(0)).toBe('+0 Elo');
      expect(formatDelta(-16)).toBe('-16 Elo');
    });

    it('renders the HUD line with badge, optional queue window and optional rating delta', () => {
      expect(rankedHudHtml(1200)).toContain('class="ranked"');
      expect(rankedHudHtml(1200, { queueWindow: 150 })).toContain('<span class="rank-queue">Queue ±150</span>');
      expect(rankedHudHtml(1216, { delta: 16 })).toContain('<span class="rank-delta" data-sign="up">+16 Elo</span>');
      expect(rankedHudHtml(1184, { delta: -16 })).toContain('<span class="rank-delta" data-sign="down">-16 Elo</span>');
    });

    it('says when a ranked result waits for the opponent report or was refused (#1317)', () => {
      expect(rankedHudHtml(1200, { result: 'waiting' })).toContain('<span class="rank-result" data-result="waiting">Waiting for the opponent report</span>');
      expect(rankedHudHtml(1200, { result: 'refused' })).toContain('<span class="rank-result" data-result="refused">Not rated: the reports differ</span>');
      expect(rankedHudHtml(1200)).not.toContain('rank-result');
    });

    const report = (side: number, status: number, rating: number, hash = 'h', game = 'g'): Report => ({
      kind: 'report',
      game,
      hash,
      status,
      side,
      rating,
      pub: `key${side}`,
      sig: 's',
    });

    it('settles a 1v1 ranked match (win, loss, draw) from both sides reports, with the opponent real rating (#1317)', () => {
      const win = settleRanked1v1(store, report(1, 1, 1200), report(2, 1, 1200));
      expect(win!.delta).toBe(16);
      expect(win!.profile.rating1v1).toBe(1216);

      // A stronger opponent: the loss costs less than 16.
      const loss = settleRanked1v1(store, report(1, 2, 1216), report(2, 2, 1400));
      expect(loss!.delta).toBe(update1v1Elo(1216, 1400, 0).deltaA);
      expect(loss!.delta).toBeGreaterThan(-16);
      expect(loss!.profile.rating1v1).toBe(1216 + loss!.delta);

      const before = loss!.profile.rating1v1;
      const draw = settleRanked1v1(store, report(2, 3, before), report(1, 3, before));
      expect(draw!.delta).toBe(0);
      expect(draw!.profile.rating1v1).toBe(before);
    });

    it('rates nothing when the two reports differ: hash, game, result, same colour, same key, or a rating that is not our stored one', () => {
      const mine = report(1, 1, 1200);
      for (const theirs of [
        report(2, 1, 1200, 'other'),
        report(2, 1, 1200, 'h', 'other'),
        report(2, 2, 1200), // they say they won too
        report(1, 1, 1200), // the same colour
        { ...report(2, 1, 1200), pub: 'key1' }, // the same key
      ]) {
        expect(settleRanked1v1(store, mine, theirs)).toBeNull();
      }
      expect(settleRanked1v1(store, report(1, 1, 999), report(2, 1, 1200))).toBeNull();
      expect(loadRankedProfile(store)).toEqual(defaultRankedProfile());
    });

    it('settles a Battle Royale ranked match from final standings', () => {
      const standings = [
        { seat: 0, place: 1 },
        { seat: 1, place: 2 },
        { seat: 2, place: 3 },
        { seat: 3, place: 4 },
        { seat: 4, place: 5 },
        { seat: 5, place: 6 },
      ];
      const res = settleRankedRoyale(store, standings, 0);
      expect(res.delta).toBeGreaterThan(0);
      expect(res.profile.ratingRoyale).toBe(1200 + res.delta);
      expect(res.profile.matches.at(-1)?.placement).toBe(1);
    });
  });
});
