import { renderRankBadge, type RankedStore } from './ranked';

/** The 1v1 leaderboard a no-server game can show today (#1287): you, among the opponents whose signed reports you
 * settled a ranked match with. Their rating is the one they signed in that match, so it is "as last seen", not live. */
export const RIVALS_STORAGE_KEY = 'ab-alone.ranked.rivals';
export const MAX_RIVALS = 100;

export interface Rival {
  readonly pub: string;
  readonly rating: number;
  readonly timestamp: number;
}

export interface BoardRow {
  readonly rank: number;
  readonly name: string;
  readonly rating: number;
  readonly me: boolean;
}

const isRival = (x: unknown): x is Rival => {
  const r = x as Rival | null;
  return !!r && typeof r.pub === 'string' && typeof r.rating === 'number' && typeof r.timestamp === 'number';
};

export function loadRivals(store: RankedStore): Rival[] {
  try {
    const parsed = JSON.parse(store?.getItem(RIVALS_STORAGE_KEY) ?? 'null') as { version?: number; rivals?: unknown } | null;
    if (parsed?.version === 1 && Array.isArray(parsed.rivals)) return parsed.rivals.filter(isRival);
  } catch {
    // Malformed JSON or blocked storage: no opponents known
  }
  return [];
}

/** Remembers an opponent after a settled match: one row per key, the latest signed rating, the newest last. */
export function recordRival(store: RankedStore, pub: string, rating: number, timestamp: number): void {
  const rivals = [...loadRivals(store).filter((r) => r.pub !== pub), { pub, rating, timestamp }].slice(-MAX_RIVALS);
  try {
    store?.setItem(RIVALS_STORAGE_KEY, JSON.stringify({ version: 1, rivals }));
  } catch {}
}

/** Highest rating first; on a tie you rank above the opponent. */
export function buildBoard(myRating: number, rivals: readonly Rival[]): BoardRow[] {
  const rows = [
    { name: 'You', rating: myRating, me: true },
    ...rivals.map((r) => ({ name: `Player ${r.pub.slice(0, 6)}`, rating: r.rating, me: false })),
  ];
  rows.sort((a, b) => b.rating - a.rating || Number(b.me) - Number(a.me));
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/** The ratings after your last 1v1 matches (royale is not in it), oldest first, ten at most (#1287). */
export function ratingHistory(matches: readonly { readonly mode: string; readonly newRating: number }[], max = 10): number[] {
  return matches.filter((m) => m.mode === '1v1').slice(-max).map((m) => m.newRating);
}

export function boardHtml(rows: readonly BoardRow[], history: readonly number[] = []): string {
  const mine = rows.find((r) => r.me)!;
  const body = rows
    .map(
      (r) =>
        `<tr${r.me ? ' data-me="true" aria-current="true"' : ''}><td>${r.rank}</td><td>${r.name}</td><td>${renderRankBadge(r.rating, true)}</td></tr>`,
    )
    .join('');
  const empty = rows.length === 1 ? '<p>Play a ranked match to meet opponents.</p>' : '';
  const trail = history.length
    ? `<ol id="board-history" aria-label="Your rating over your last matches">${history.map((r) => `<li>${r}</li>`).join('')}</ol>`
    : '';
  return `<p id="board-position">Your position: ${mine.rank} of ${rows.length}</p><table><thead><tr><th>#</th><th>Player</th><th>Rating</th></tr></thead><tbody>${body}</tbody></table>${empty}${trail}`;
}
