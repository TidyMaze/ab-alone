import { GENESIS, hashRecord, signMove, verifyRecord, type Keys, type MoveRecord } from './moverecord';

export type Verdict =
  | { ok: true }
  | { ok: false; reason: 'wrong-game' | 'replayed' | 'out-of-order' | 'bad-chain' | 'wrong-key' | 'bad-signature' };

/** The hash-chained, signed list of moves of one game, seen from one side. */
export class MoveLog {
  private records: MoveRecord[] = [];
  head = GENESIS;

  constructor(
    private readonly game: string,
    private readonly ownPub: string,
  ) {}

  get length(): number {
    return this.records.length;
  }

  /** Signs our next move and appends it. */
  async sign(keys: Keys, move: number[]): Promise<MoveRecord> {
    const rec = await signMove(keys, { game: this.game, seq: this.length, prev: this.head, move });
    await this.append(rec);
    return rec;
  }

  /** The records from `seq` on, for a peer that has only the ones before it. */
  from(seq: number): MoveRecord[] {
    return this.records.slice(seq);
  }

  /** Checks a record from the other side. Does not append: the caller replays it first. */
  async verify(r: MoveRecord): Promise<Verdict> {
    const refuse = (reason: Extract<Verdict, { ok: false }>['reason']): Verdict => ({ ok: false, reason });
    if (r.game !== this.game) return refuse('wrong-game');
    if (r.seq < this.length) return refuse('replayed');
    if (r.seq > this.length) return refuse('out-of-order');
    if (r.prev !== this.head) return refuse('bad-chain');
    // Who may move is the session's seat table, this only keeps our own records from echoing back.
    if (r.pub === this.ownPub) return refuse('wrong-key');
    return (await verifyRecord(r)) ? { ok: true } : refuse('bad-signature');
  }

  async append(r: MoveRecord): Promise<void> {
    this.records.push(r);
    this.head = await hashRecord(r);
  }
}
