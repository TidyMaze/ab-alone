import { GENESIS, hashRecord, signMove, verifyRecord, type Keys, type MoveRecord } from './moverecord';

export type Verdict =
  | { ok: true }
  | { ok: false; reason: 'wrong-game' | 'replayed' | 'out-of-order' | 'bad-chain' | 'wrong-key' | 'bad-signature' };

/** The hash-chained, signed list of moves of one game, seen from one side. */
export class MoveLog {
  private records: MoveRecord[] = [];
  private peer: string | null = null;
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

  /** Checks a record from the other side. Does not append: the caller replays it first. */
  async verify(r: MoveRecord): Promise<Verdict> {
    const refuse = (reason: Extract<Verdict, { ok: false }>['reason']): Verdict => ({ ok: false, reason });
    if (r.game !== this.game) return refuse('wrong-game');
    if (r.seq < this.length) return refuse('replayed');
    if (r.seq > this.length) return refuse('out-of-order');
    if (r.prev !== this.head) return refuse('bad-chain');
    // The first remote key is pinned, later records must come from the same one.
    if (r.pub === this.ownPub || (this.peer !== null && r.pub !== this.peer)) return refuse('wrong-key');
    return (await verifyRecord(r)) ? { ok: true } : refuse('bad-signature');
  }

  async append(r: MoveRecord): Promise<void> {
    if (r.pub !== this.ownPub) this.peer ??= r.pub;
    this.records.push(r);
    this.head = await hashRecord(r);
  }
}
