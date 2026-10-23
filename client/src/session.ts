import { MoveLog } from './movelog';
import { parseRecord, type Keys, type MoveRecord } from './moverecord';
import type { ConnectionState, Transport } from './transport';

/** The rules engine, the only judge of legality. `play` throws on an illegal move. */
export interface Judge {
  to_move(): number;
  play(mv: Int32Array): void;
}

export interface SessionOptions {
  game: string;
  side: number; // our side: 1 Black, 2 White
  keys: Keys;
  transport: Transport;
  judge: Judge;
  onMove(move: number[]): void; // a verified, legal move from the other side was applied
  onRefuse(reason: string): void; // a move was refused: shown in the HUD
  onState?(state: ConnectionState): void;
}

/** Sends our moves signed and chained, replays the other side's moves through the engine. */
export class OnlineSession {
  private readonly log: MoveLog;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly o: SessionOptions) {
    this.log = new MoveLog(o.game, o.keys.pub);
    o.transport.onRecord((r) => {
      // Verification is async: a queue keeps records handled in arrival order.
      this.queue = this.queue.then(() => this.receive(r));
    });
    o.transport.onState((s) => o.onState?.(s));
  }

  /** The caller already applied `move` to its own engine. */
  async send(move: number[]): Promise<void> {
    this.o.transport.send(await this.log.sign(this.o.keys, move));
  }

  private async receive(raw: MoveRecord): Promise<void> {
    const r = parseRecord(raw);
    if (!r) return this.o.onRefuse('malformed');
    const verdict = await this.log.verify(r);
    if (!verdict.ok) return this.o.onRefuse(verdict.reason);
    if (this.o.judge.to_move() === this.o.side) return this.o.onRefuse('not-their-turn');
    try {
      this.o.judge.play(Int32Array.from(r.move));
    } catch {
      return this.o.onRefuse('illegal');
    }
    await this.log.append(r);
    this.o.onMove(r.move);
  }
}
