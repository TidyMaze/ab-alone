/** The seats of one room. Each seat is bound to at most one public key, each key to one seat. Seats count from 1. */
export class Seats {
  private pubs: string[];

  constructor(readonly count: number) {
    this.pubs = Array<string>(count).fill('');
  }

  /** Binds a free seat. The same key asking again for its own seat is fine, anything else is refused. */
  claim(seat: number, pub: string): boolean {
    if (!Number.isInteger(seat) || seat < 1 || seat > this.count || pub === '') return false;
    if (this.seatOf(pub) !== 0) return this.seatOf(pub) === seat;
    if (this.pubs[seat - 1] !== '') return false;
    this.pubs[seat - 1] = pub;
    return true;
  }

  /** The key bound to a seat, '' when free. */
  keyOf(seat: number): string {
    return this.pubs[seat - 1] ?? '';
  }

  /** The seat a key holds, 0 when it holds none. */
  seatOf(pub: string): number {
    return this.pubs.indexOf(pub) + 1;
  }

  get full(): boolean {
    return !this.pubs.includes('');
  }

  /** Keys by seat, '' for a free seat. */
  roster(): string[] {
    return [...this.pubs];
  }

  /** Takes the creator's roster as is. A roster of the wrong shape changes nothing. */
  adopt(roster: string[]): boolean {
    const keys = roster.filter((k) => k !== '');
    if (roster.length !== this.count || roster.some((k) => typeof k !== 'string') || new Set(keys).size !== keys.length) {
      return false;
    }
    this.pubs = [...roster];
    return true;
  }
}
