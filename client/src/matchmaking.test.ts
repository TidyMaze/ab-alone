// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  canMatch,
  findMatch,
  toleranceWindow,
  verifyMatchOutcome,
  type MatchReport,
  type RankedQueueCandidate,
} from './matchmaking';

describe('matchmaking and hash-verification (#689)', () => {
  describe('toleranceWindow', () => {
    it('returns initial window at 0 elapsed time', () => {
      expect(toleranceWindow(0)).toBe(100);
      expect(toleranceWindow(-500)).toBe(100);
      expect(toleranceWindow(5_000)).toBe(100);
    });

    it('expands tolerance over elapsed time intervals', () => {
      expect(toleranceWindow(10_000)).toBe(150);
      expect(toleranceWindow(20_000)).toBe(200);
      expect(toleranceWindow(35_000)).toBe(250);
    });

    it('clamps tolerance window to maximum cap', () => {
      expect(toleranceWindow(100_000, 100, 50, 10_000, 400)).toBe(400);
    });
  });

  describe('canMatch', () => {
    it('allows match when ratings fall within mutual tolerance windows', () => {
      // Diff = 80, windows = 100, 100 -> matches
      expect(canMatch(1200, 1280, 100, 100)).toBe(true);
    });

    it('rejects match when rating diff exceeds one player window', () => {
      // Diff = 120, player A window = 150, but player B window = 100 -> rejects
      expect(canMatch(1200, 1320, 150, 100)).toBe(false);
      expect(canMatch(1200, 1320, 100, 150)).toBe(false);
    });

    it('allows exact boundary match', () => {
      expect(canMatch(1200, 1300, 100, 100)).toBe(true);
    });
  });

  describe('verifyMatchOutcome', () => {
    const reportA: MatchReport = {
      matchId: 'match_123',
      reporterPeerId: 'peer_a',
      opponentPeerId: 'peer_b',
      stateHash: 'hash_abc_1',
      winner: 'reporter',
    };

    it('accepts valid agreeing reports on decisive result', () => {
      const reportB: MatchReport = {
        matchId: 'match_123',
        reporterPeerId: 'peer_b',
        opponentPeerId: 'peer_a',
        stateHash: 'hash_abc_1',
        winner: 'opponent',
      };

      expect(verifyMatchOutcome(reportA, reportB)).toBe(true);

      // And reverse (player A lost, player B won)
      const lossA: MatchReport = { ...reportA, winner: 'opponent' };
      const winB: MatchReport = { ...reportB, winner: 'reporter' };
      expect(verifyMatchOutcome(lossA, winB)).toBe(true);

      // Rejects if player A reported loss but player B reported loss too
      const lossB: MatchReport = { ...reportB, winner: 'opponent' };
      expect(verifyMatchOutcome(lossA, lossB)).toBe(false);
    });

    it('accepts valid agreeing reports on draw', () => {
      const drawA: MatchReport = { ...reportA, winner: 'draw' };
      const drawB: MatchReport = {
        matchId: 'match_123',
        reporterPeerId: 'peer_b',
        opponentPeerId: 'peer_a',
        stateHash: 'hash_abc_1',
        winner: 'draw',
      };

      expect(verifyMatchOutcome(drawA, drawB)).toBe(true);
    });

    it('rejects mismatching state hashes (desync or cheat attempt)', () => {
      const reportB: MatchReport = {
        matchId: 'match_123',
        reporterPeerId: 'peer_b',
        opponentPeerId: 'peer_a',
        stateHash: 'hash_different_spoofed',
        winner: 'opponent',
      };

      expect(verifyMatchOutcome(reportA, reportB)).toBe(false);
    });

    it('rejects conflicting claims (both claim win)', () => {
      const reportB: MatchReport = {
        matchId: 'match_123',
        reporterPeerId: 'peer_b',
        opponentPeerId: 'peer_a',
        stateHash: 'hash_abc_1',
        winner: 'reporter', // Both claim they won
      };

      expect(verifyMatchOutcome(reportA, reportB)).toBe(false);
    });

    it('rejects mismatched match IDs or peer identities', () => {
      const wrongId: MatchReport = {
        matchId: 'match_456',
        reporterPeerId: 'peer_b',
        opponentPeerId: 'peer_a',
        stateHash: 'hash_abc_1',
        winner: 'opponent',
      };
      expect(verifyMatchOutcome(reportA, wrongId)).toBe(false);

      const wrongPeer: MatchReport = {
        matchId: 'match_123',
        reporterPeerId: 'peer_b',
        opponentPeerId: 'wrong',
        stateHash: 'hash_abc_1',
        winner: 'opponent',
      };
      expect(verifyMatchOutcome(reportA, wrongPeer)).toBe(false);

      const wrongOtherPeer: MatchReport = {
        matchId: 'match_123',
        reporterPeerId: 'wrong',
        opponentPeerId: 'peer_a',
        stateHash: 'hash_abc_1',
        winner: 'opponent',
      };
      expect(verifyMatchOutcome(reportA, wrongOtherPeer)).toBe(false);
    });
  });

  describe('findMatch', () => {
    it('returns null when candidates list is empty or contains only self', () => {
      const self: RankedQueueCandidate = { peerId: 'me', rating: 1200, queuedAt: 1000 };
      expect(findMatch(self, [], 1000)).toBeNull();
      expect(findMatch(self, [self], 1000)).toBeNull();
    });

    it('finds best matching candidate with closest rating', () => {
      const self: RankedQueueCandidate = { peerId: 'me', rating: 1200, queuedAt: 0 };
      const candidates: RankedQueueCandidate[] = [
        { peerId: 'c1', rating: 1280, queuedAt: 0 },
        { peerId: 'c2', rating: 1220, queuedAt: 0 }, // closer!
        { peerId: 'c3', rating: 1500, queuedAt: 0 }, // out of window
      ];

      const match = findMatch(self, candidates, 0);
      expect(match).not.toBeNull();
      expect(match?.peerId).toBe('c2');
    });

    it('returns null when all candidates exceed window', () => {
      const self: RankedQueueCandidate = { peerId: 'me', rating: 1200, queuedAt: 0 };
      const candidates: RankedQueueCandidate[] = [
        { peerId: 'c1', rating: 1450, queuedAt: 0 },
        { peerId: 'c2', rating: 950, queuedAt: 0 },
      ];

      expect(findMatch(self, candidates, 0)).toBeNull();
    });
  });
});
