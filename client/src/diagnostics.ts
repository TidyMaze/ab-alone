// The diagnostics of the page (docs/specs/tech.md section 10): the events main.ts reports, the counters, and the
// text Copy diagnostics exports with the game. Nothing leaves the browser unless the player copies it.
import { Logger, scrub, type Sink } from './logger';
import type { MoveRecord } from './moverecord';
import { NetCounters } from './netcounters';
import type { ConnectionState } from './transport';

/** What is being played: the ruleset and the move log, enough to replay it. */
export interface GameInfo {
  mode: 'local' | 'bot' | 'boss' | 'online';
  layout: 'standard';
  boss?: { id: string; seed: number };
  online?: { game: string; side: number; role: string };
  toMove: number;
  status: number;
  moves: number[][]; // every move record played, both sides, oldest first
  signed?: MoveRecord[]; // online: the signed log of the game, public keys only
}

export function gameInfo(o: {
  bot: boolean; // a bot answers the human (no ?bot=off)
  fight: { id: string; seed: number } | null;
  online: { game: string; side: number; role: string; signed: MoveRecord[] } | null;
  toMove: number;
  status: number;
  moves: number[][];
}): GameInfo {
  return {
    mode: o.online ? 'online' : o.fight ? 'boss' : o.bot ? 'bot' : 'local',
    layout: 'standard',
    ...(o.fight && { boss: { ...o.fight } }),
    ...(o.online && { online: { game: o.online.game, side: o.online.side, role: o.online.role } }),
    toMove: o.toMove,
    status: o.status,
    moves: o.moves.map((m) => [...m]),
    ...(o.online && { signed: [...o.online.signed] }),
  };
}

/** JSON one key per line, with each item of an array on one compact line: one move or one event per line. */
export function layout(value: unknown, pad = ''): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => `${pad}  ${JSON.stringify(v)}`).join(',\n')}\n${pad}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const fields = Object.entries(value);
    if (fields.length === 0) return '{}';
    return `{\n${fields.map(([k, v]) => `${pad}  ${JSON.stringify(k)}: ${layout(v, `${pad}  `)}`).join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}

/** What one frame costs to render (#851): plain numbers read from `renderer.info`, the scene and the quality tier. */
export interface RenderCost {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pointLights: number;
  tier: string;
  pixelRatio: number;
}

/** The render cost as one `name: value` line each, for Copy diagnostics and the browser checks. */
export function renderCostText(c: RenderCost): string {
  return [
    `draw calls: ${c.calls}`,
    `triangles: ${c.triangles}`,
    `geometries: ${c.geometries}`,
    `textures: ${c.textures}`,
    `point lights: ${c.pointLights}`,
    `tier: ${c.tier}`,
    `pixel ratio: ${c.pixelRatio}`,
  ].join('\n');
}

/** Writes `text` to the clipboard. False when the browser refuses, or has no Clipboard API (not a secure page). */
export async function copyText(text: string, clipboard: Pick<Clipboard, 'writeText'> | undefined): Promise<boolean> {
  try {
    await clipboard!.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The events main.ts reports, in the log and in the counters. */
export class Diagnostics {
  readonly log: Logger;
  readonly net: NetCounters;

  constructor(now: () => number, out: Sink) {
    this.log = new Logger(now, out);
    this.net = new NetCounters(now);
  }

  /** An online game starts its transport. */
  connecting(): void {
    this.net.connecting();
    this.log.log('info', 'net', { state: 'connecting' });
  }

  netState(state: ConnectionState): void {
    this.net.state(state);
    this.log.log('info', 'net', { state });
  }

  /** The joiner's signaling timer fired. */
  timeout(): void {
    if (this.net.timeout()) this.log.log('warn', 'net', { failure: 'signaling-timeout' });
  }

  joinError(message: string): void {
    this.log.log('warn', 'net', { failure: this.net.joinError(message), message });
  }

  /** The session refused a message from a peer. */
  refused(reason: string): void {
    if (this.net.refuse(reason)) this.log.log('error', 'desync', { reason });
    else this.log.log('warn', 'refused', { reason });
  }

  /** The side `side` had no legal move after ply `ply`: its turn passed (#1301). */
  passed(side: number, ply: number): void {
    this.log.log('info', 'pass', { side, ply });
  }

  botSearch(ms: number, search: { nodes: number } | { boss: string }): void {
    this.log.log('info', 'bot-search', { ms: Math.round(ms), ...search });
  }

  /** The Copy diagnostics text: JSON, without any private key. */
  text(o: { build: string; exported: string; environment: Record<string, unknown>; renderCost: string; game: GameInfo }): string {
    return layout(
      scrub({
        app: 'ab-alone',
        ...o,
        counters: this.net.counts,
        dropped: this.log.dropped,
        events: this.log.entries,
      }),
    );
  }
}
