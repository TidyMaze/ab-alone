import { DEFAULT_RATING, formatRating, getRankTier, update1v1Elo, updateBattleRoyaleElo } from './elo';
import { verifyMatchOutcome, type MatchReport, type MatchWinner } from './matchmaking';
import { recordRival } from './leaderboard';
import type { Report } from './moverecord';

export const RANKED_STORAGE_KEY = 'ab-alone.ranked';
export const MAX_MATCH_HISTORY = 50;

export type RankedMode = '1v1' | 'royale';
export type RankedStore = Pick<Storage, 'getItem' | 'setItem'> | null;

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

export function loadRankedProfile(store: RankedStore): RankedProfile {
  try {
    const raw = store?.getItem(RANKED_STORAGE_KEY);
    if (!raw) return defaultRankedProfile();

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
    // Malformed JSON or blocked storage: fall through to default profile
  }

  return defaultRankedProfile();
}

export function saveRankedProfile(store: RankedStore, profile: RankedProfile): void {
  try {
    store?.setItem(RANKED_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
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

export function recordRankedMatch(store: RankedStore, match: NewMatchInput): RankedProfile {
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

/** Formats an Elo rating change with explicit sign (#711). */
export function formatDelta(delta: number): string {
  return `${delta >= 0 ? `+${delta}` : delta} Elo`;
}

/** Renders the ranked HUD line: rank badge, optional queue window, and optional post-match Elo delta (#711). */
export function rankedHudHtml(
  rating: number,
  options: { queueWindow?: number; delta?: number; result?: 'waiting' | 'refused' } = {},
): string {
  const result =
    options.result === 'waiting'
      ? ' <span class="rank-result" data-result="waiting">Waiting for the opponent report</span>'
      : options.result === 'refused'
        ? ' <span class="rank-result" data-result="refused">Not rated: the reports differ</span>'
        : '';
  const queue = options.queueWindow !== undefined ? ` <span class="rank-queue">Queue ±${options.queueWindow}</span>` : '';
  const delta =
    options.delta !== undefined
      ? ` <span class="rank-delta" data-sign="${options.delta >= 0 ? 'up' : 'down'}">${formatDelta(options.delta)}</span>`
      : '';
  return `<div class="ranked">${renderRankBadge(rating)}${queue}${delta}${result}</div>`;
}

/** What a signed report says, from its own seat: who won, as the reporter or the opponent. */
function reportOf(r: Report, other: Report): MatchReport {
  const winner: MatchWinner = r.status === 3 ? 'draw' : r.status === r.side ? 'reporter' : 'opponent';
  return { matchId: r.game, reporterPeerId: r.pub, opponentPeerId: other.pub, stateHash: r.hash, winner };
}

/**
 * Settles a finished 1v1 ranked match from the two signed reports, ours and the opponent's (#1317). Both must agree
 * (same game, board and result, two colours, two keys) and ours must carry our stored rating. A mismatch rates nothing
 * and returns null. The opponent's own rating, as it signed it, sets our Elo change.
 */
export function settleRanked1v1(
  store: RankedStore,
  mine: Report,
  theirs: Report,
): { profile: RankedProfile; delta: number } | null {
  const current = loadRankedProfile(store);
  if (mine.rating !== current.rating1v1 || mine.side === theirs.side || mine.pub === theirs.pub) return null;
  if (!verifyMatchOutcome(reportOf(mine, theirs), reportOf(theirs, mine))) return null;
  const actualScore = mine.status === 3 ? 0.5 : mine.status === mine.side ? 1 : 0;
  const elo = update1v1Elo(current.rating1v1, theirs.rating, actualScore);
  const profile = recordRankedMatch(store, {
    mode: '1v1',
    delta: elo.deltaA,
    newRating: elo.ratingA,
    opponentsCount: 1,
  });
  recordRival(store, theirs.pub, theirs.rating, Date.now());
  return { profile, delta: elo.deltaA };
}

/** Settles a finished Battle Royale ranked match from final standings and updates stored Royale Elo (#711). */
export function settleRankedRoyale(
  store: RankedStore,
  standings: readonly { seat: number; place: number }[],
  you: number,
  botRating = DEFAULT_RATING,
): { profile: RankedProfile; delta: number } {
  const current = loadRankedProfile(store);
  const placements = standings.map((s) => ({
    id: String(s.seat),
    rating: s.seat === you ? current.ratingRoyale : botRating,
    rank: s.place,
  }));
  const deltas = updateBattleRoyaleElo(placements);
  const ours = deltas.get(String(you))!;
  const myPlace = standings.find((s) => s.seat === you)!.place;
  const profile = recordRankedMatch(store, {
    mode: 'royale',
    delta: ours.delta,
    newRating: ours.newRating,
    placement: myPlace,
    opponentsCount: standings.length - 1,
  });
  return { profile, delta: ours.delta };
}
