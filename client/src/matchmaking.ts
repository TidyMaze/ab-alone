export const DEFAULT_INITIAL_WINDOW = 100;
export const DEFAULT_EXPAND_STEP = 50;
export const DEFAULT_EXPAND_INTERVAL_MS = 10_000;
export const DEFAULT_MAX_WINDOW = 500;

/** Computes the matchmaking tolerance window based on elapsed queue time. */
export function toleranceWindow(
  queuedMs: number,
  initialWindow = DEFAULT_INITIAL_WINDOW,
  expandStep = DEFAULT_EXPAND_STEP,
  expandIntervalMs = DEFAULT_EXPAND_INTERVAL_MS,
  maxWindow = DEFAULT_MAX_WINDOW,
): number {
  const steps = Math.floor(Math.max(0, queuedMs) / expandIntervalMs);
  const calculated = initialWindow + steps * expandStep;
  return Math.min(maxWindow, calculated);
}

/** Determines if two players can be matched based on mutual rating tolerance. */
export function canMatch(
  ratingA: number,
  ratingB: number,
  windowA: number,
  windowB: number,
): boolean {
  const diff = Math.abs(ratingA - ratingB);
  return diff <= Math.min(windowA, windowB);
}

export type MatchWinner = 'reporter' | 'opponent' | 'draw';

export interface MatchReport {
  readonly matchId: string;
  readonly reporterPeerId: string;
  readonly opponentPeerId: string;
  readonly stateHash: string;
  readonly winner: MatchWinner;
}

/** Verifies that both peers reported identical state hash, match ID, and complementary results. */
export function verifyMatchOutcome(reportA: MatchReport, reportB: MatchReport): boolean {
  if (reportA.matchId !== reportB.matchId) return false;
  if (reportA.stateHash !== reportB.stateHash) return false;
  if (reportA.reporterPeerId !== reportB.opponentPeerId) return false;
  if (reportB.reporterPeerId !== reportA.opponentPeerId) return false;

  if (reportA.winner === 'draw') {
    return reportB.winner === 'draw';
  }
  if (reportA.winner === 'reporter') {
    return reportB.winner === 'opponent';
  }
  return reportB.winner === 'reporter';
}

export interface RankedQueueCandidate {
  readonly peerId: string;
  readonly rating: number;
  readonly queuedAt: number;
}

/** Finds the best available peer matching the player rating within mutual tolerance. */
export function findMatch(
  self: RankedQueueCandidate,
  candidates: readonly RankedQueueCandidate[],
  now = Date.now(),
): RankedQueueCandidate | null {
  const selfWindow = toleranceWindow(now - self.queuedAt);

  const matched: Array<{ candidate: RankedQueueCandidate; diff: number }> = [];

  for (const candidate of candidates) {
    if (candidate.peerId === self.peerId) continue;

    const candidateWindow = toleranceWindow(now - candidate.queuedAt);
    if (canMatch(self.rating, candidate.rating, selfWindow, candidateWindow)) {
      matched.push({
        candidate,
        diff: Math.abs(self.rating - candidate.rating),
      });
    }
  }

  if (matched.length === 0) return null;

  matched.sort((a, b) => a.diff - b.diff);
  return matched[0]!.candidate;
}
