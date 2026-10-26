import { DEFAULT_RATING, formatRating, getRankTier } from './elo';

export const RANKED_STORAGE_KEY = 'ab-alone.ranked';
export const MAX_MATCH_HISTORY = 50;

export type RankedMode = '1v1' | 'royale';

export interface RankedMatchRecord {
  readonly id: string;
  readonly timestamp: number;
  readonly mode: RankedMode;
  readonly delta: number;
  readonly newRating: number;
  readonly placement?: number;
  readonly opponentsCount: number;
}

export interface RankedProfile {
  readonly version: 1;
  readonly rating1v1: number;
  readonly ratingRoyale: number;
  readonly matches: readonly RankedMatchRecord[];
}

export function defaultRankedProfile(): RankedProfile {
  return {
    version: 1,
    rating1v1: DEFAULT_RATING,
    ratingRoyale: DEFAULT_RATING,
    matches: [],
  };
}

export function loadRankedProfile(store: Storage): RankedProfile {
  const raw = store.getItem(RANKED_STORAGE_KEY);
  if (!raw) return defaultRankedProfile();

  try {
    const parsed = JSON.parse(raw) as Partial<RankedProfile>;
    if (parsed && parsed.version === 1) {
      return {
        version: 1,
        rating1v1: typeof parsed.rating1v1 === 'number' ? parsed.rating1v1 : DEFAULT_RATING,
        ratingRoyale: typeof parsed.ratingRoyale === 'number' ? parsed.ratingRoyale : DEFAULT_RATING,
        matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      };
    }
  } catch {
    // Malformed JSON: fall through to default profile
  }

  return defaultRankedProfile();
}

export function saveRankedProfile(store: Storage, profile: RankedProfile): void {
  store.setItem(RANKED_STORAGE_KEY, JSON.stringify(profile));
}

export interface NewMatchInput {
  readonly id?: string;
  readonly timestamp?: number;
  readonly mode: RankedMode;
  readonly delta: number;
  readonly newRating: number;
  readonly placement?: number;
  readonly opponentsCount: number;
}

export function recordRankedMatch(store: Storage, match: NewMatchInput): RankedProfile {
  const current = loadRankedProfile(store);
  const matchRecord: RankedMatchRecord = {
    id: match.id ?? `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: match.timestamp ?? Date.now(),
    mode: match.mode,
    delta: match.delta,
    newRating: match.newRating,
    placement: match.placement,
    opponentsCount: match.opponentsCount,
  };

  const nextMatches = [...current.matches, matchRecord].slice(-MAX_MATCH_HISTORY);
  const nextProfile: RankedProfile = {
    version: 1,
    rating1v1: match.mode === '1v1' ? match.newRating : current.rating1v1,
    ratingRoyale: match.mode === 'royale' ? match.newRating : current.ratingRoyale,
    matches: nextMatches,
  };

  saveRankedProfile(store, nextProfile);
  return nextProfile;
}

/** Renders an HTML rank badge pill with tier color, label, and formatted score. */
export function renderRankBadge(rating: number, compact = false): string {
  const tier = getRankTier(rating);
  const score = formatRating(rating);
  const cls = compact ? 'rank-badge rank-badge-compact' : 'rank-badge';

  return `<span class="${cls}" data-tier="${tier.name}" style="--tier-color: ${tier.badgeColor}" title="${tier.label} (${score})"><span class="rank-tier">${tier.label}</span><span class="rank-score">${score}</span></span>`;
}
