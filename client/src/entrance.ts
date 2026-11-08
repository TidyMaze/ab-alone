// The entrance beat of a boss fight (#1551, motion.md story 9; it replaces the lair's push-in of #1519): for about a second and a half the
// boss arrives in its space. The camera comes from the boss's side of the board and settles on the play view, the light of the space rises
// from dark, and a card names the boss and its deck. The fight is live from its first frame: the beat never delays a press or a key, and the
// first one ends it on the final framing and the full light. Reduced motion has none. Each boss has its own camera move and side (bossspace.ts).
import { clampDistance, clampPolar, type View } from './camera';

/** The length of the beat, in ms. */
export const ENTRANCE_MS = 1500;
/** The light is full at this share of the beat, so the board is lit while the card fades. */
const LIGHT_BY = 0.8;

/** The four camera moves: an orbit round the board, a drop from high above, a rise from low, a pull out from close. */
export type Beat = 'orbit' | 'drop' | 'rise' | 'pull';
export const BEATS: readonly Beat[] = ['orbit', 'drop', 'rise', 'pull'];

/** What a boss row says of its beat: the move, the side the camera starts on (degrees round the board, negative to the right, at most 90)
 * and the share of the light the fight starts with. */
export interface EntranceSpec {
  beat: Beat;
  side: number;
  dark: number;
}

/** Where each move starts, from the final framing: the share of the side it turns by, the polar angle it adds (a smaller polar is higher up)
 * and the share of the distance it starts at. */
const START: Record<Beat, { turn: number; polar: number; far: number }> = {
  orbit: { turn: 1, polar: -0.1, far: 1.15 },
  drop: { turn: 0.25, polar: -0.55, far: 1.4 },
  rise: { turn: 0.25, polar: 0.4, far: 0.8 },
  pull: { turn: 0.5, polar: 0, far: 0.6 },
};

/** The view `elapsed` ms into the beat of a fight framed at `final`: from the start pose of the move to `final`, eased out and clamped in time
 * (before the start: the start pose; from `ENTRANCE_MS` on: `final` itself). */
export function entranceView(final: View, { beat, side }: EntranceSpec, elapsed: number): View {
  const t = Math.min(1, Math.max(0, elapsed / ENTRANCE_MS));
  if (t >= 1) return final;
  const k = 1 - (1 - t) ** 3; // ease out, 0 at the start, 1 at the end
  const from = START[beat];
  const [azimuth, polar, distance] = [final.azimuth + ((side * from.turn * Math.PI) / 180), clampPolar(final.polar + from.polar), clampDistance(final.distance * from.far)];
  return {
    azimuth: azimuth + (final.azimuth - azimuth) * k,
    polar: polar + (final.polar - polar) * k,
    distance: distance + (final.distance - distance) * k,
  };
}

/** The share of the fight's light `elapsed` ms into the beat: `dark` at the start, 1 from `LIGHT_BY` of the beat on. */
export function entranceLight({ dark }: EntranceSpec, elapsed: number): number {
  const t = Math.min(1, Math.max(0, elapsed / (ENTRANCE_MS * LIGHT_BY)));
  return dark + (1 - dark) * t * t * (3 - 2 * t);
}

/** The lines of the card: the boss and its deck. */
export function entranceCard(name: string, deck: string): { name: string; deck: string } {
  return { name, deck: `${deck[0]!.toUpperCase()}${deck.slice(1)} deck` };
}

/** The beat as the page plays it: started by a fight, read each frame, ended by the time or by the first input. */
export class Entrance {
  private at = 0;
  private spec: EntranceSpec | null = null;

  /** Whether a beat is running: the page draws its frames until it ends. */
  get active(): boolean {
    return this.spec !== null;
  }

  /** The move that runs, for the page's marker; empty when none. */
  get name(): Beat | '' {
    return this.spec?.beat ?? '';
  }

  /** A fight starts at `now` (ms) with the row of its boss (null: a fight with no beat). Reduced motion has none. */
  start(now: number, spec: EntranceSpec | null, reduced: boolean): void {
    this.spec = reduced ? null : spec;
    this.at = now;
  }

  /** The frame at `now` (ms): the beat ends once its time is over. */
  step(now: number): void {
    if (this.spec && now - this.at >= ENTRANCE_MS) this.spec = null;
  }

  /** The view to draw at `now`, eased from the start pose to `final`, the view that is current. `null` when none runs: the page draws `final`. */
  frame(final: View, now: number): View | null {
    return this.spec && entranceView(final, this.spec, now - this.at);
  }

  /** The share of the fight's light to draw at `now`: 1 when no beat runs. */
  light(now: number): number {
    return this.spec ? entranceLight(this.spec, now - this.at) : 1;
  }

  /** A press or a key at once: ends the beat on the final framing. Returns whether one was running, so the page draws that framing. */
  snap(): boolean {
    const was = this.spec !== null;
    this.spec = null;
    return was;
  }
}
