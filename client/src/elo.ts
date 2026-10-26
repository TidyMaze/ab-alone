export const DEFAULT_RATING = 1200;
export const DEFAULT_K_FACTOR = 32;
export const MIN_RATING = 100;

export type RankTierName = 'iron' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'obsidian';

export interface RankTier {
  readonly name: RankTierName;
  readonly label: string;
  readonly minRating: number;
  readonly badgeColor: string;
}

export const RANK_TIERS: readonly RankTier[] = [
  { name: 'iron', label: 'Iron', minRating: 0, badgeColor: '#6e7681' },
  { name: 'bronze', label: 'Bronze', minRating: 1000, badgeColor: '#b08d57' },
  { name: 'silver', label: 'Silver', minRating: 1200, badgeColor: '#c0c0c0' },
  { name: 'gold', label: 'Gold', minRating: 1400, badgeColor: '#ffd700' },
  { name: 'diamond', label: 'Diamond', minRating: 1600, badgeColor: '#b9f2ff' },
  { name: 'obsidian', label: 'Obsidian', minRating: 1800, badgeColor: '#9d4edd' },
];

/** Computes expected score for player A facing player B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export interface Elo1v1Result {
  readonly ratingA: number;
  readonly ratingB: number;
  readonly deltaA: number;
  readonly deltaB: number;
}

/** Updates ratings for a standard 1v1 match (actualScoreA: 1 for win, 0.5 for draw, 0 for loss). */
export function update1v1Elo(
  ratingA: number,
  ratingB: number,
  actualScoreA: number,
  kFactor = DEFAULT_K_FACTOR,
): Elo1v1Result {
  const expA = expectedScore(ratingA, ratingB);
  const deltaA = Math.round(kFactor * (actualScoreA - expA));
  const deltaB = deltaA === 0 ? 0 : -deltaA;

  const newRatingA = Math.max(MIN_RATING, ratingA + deltaA);
  const newRatingB = Math.max(MIN_RATING, ratingB + deltaB);

  return {
    ratingA: newRatingA,
    ratingB: newRatingB,
    deltaA,
    deltaB,
  };
}

export interface PlayerPlacement {
  readonly id: string;
  readonly rating: number;
  readonly rank: number;
}

export interface EloPlayerDelta {
  readonly newRating: number;
  readonly delta: number;
}

/** Updates ratings for a multiplayer Battle Royale match using pairwise decomposition. */
export function updateBattleRoyaleElo(
  players: readonly PlayerPlacement[],
  kFactor = DEFAULT_K_FACTOR,
): Map<string, EloPlayerDelta> {
  const result = new Map<string, EloPlayerDelta>();
  const n = players.length;

  if (n === 0) return result;
  if (n === 1) {
    const single = players[0]!;
    result.set(single.id, { newRating: single.rating, delta: 0 });
    return result;
  }

  const kPair = kFactor / (n - 1);
  const rawDeltas: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pA = players[i]!;
      const pB = players[j]!;

      const expA = expectedScore(pA.rating, pB.rating);
      const expB = 1 - expA;

      const scoreA = pA.rank < pB.rank ? 1 : pA.rank === pB.rank ? 0.5 : 0;
      const scoreB = 1 - scoreA;

      const deltaPairA = kPair * (scoreA - expA);
      const deltaPairB = kPair * (scoreB - expB);

      rawDeltas[i]! += deltaPairA;
      rawDeltas[j]! += deltaPairB;
    }
  }

  // Round deltas while preserving zero sum
  const roundedDeltas = rawDeltas.map(Math.round);
  let drift = roundedDeltas.reduce((acc, d) => acc + d, 0);

  if (drift !== 0) {
    const errors = rawDeltas.map((raw, idx) => ({ idx, err: raw - roundedDeltas[idx]! }));
    if (drift > 0) {
      // Over positive: decrement the delta with largest negative error (rounded up too much)
      errors.sort((a, b) => a.err - b.err);
      for (let k = 0; k < drift && k < errors.length; k++) {
        roundedDeltas[errors[k]!.idx]! -= 1;
      }
    } else {
      // Over negative: increment the delta with largest positive error
      errors.sort((a, b) => b.err - a.err);
      for (let k = 0; k < -drift && k < errors.length; k++) {
        roundedDeltas[errors[k]!.idx]! += 1;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const p = players[i]!;
    const delta = roundedDeltas[i]!;
    const newRating = Math.max(MIN_RATING, p.rating + delta);
    result.set(p.id, { newRating, delta });
  }

  return result;
}

/** Resolves rank tier for a given rating. */
export function getRankTier(rating: number): RankTier {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    const tier = RANK_TIERS[i]!;
    if (rating >= tier.minRating) return tier;
  }
  return RANK_TIERS[0]!;
}

/** Formats rating for UI display. */
export function formatRating(rating: number): string {
  return String(Math.round(rating));
}
