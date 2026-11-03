import { describe, expect, it } from 'vitest';
import { MAX_PLIES, bothSigned, resultPayload, signResult } from './boardfeed';
import { generateKeys, type Keys } from './moverecord';
import { RankedSeal, TS_SLACK_S, parseSeal, signIntro, type Done, type Final, type Intro, type Seal, type Step } from './rankedseal';

// Two seats with a game key and a board key each, talking only through the values the seals return: no relay, no socket.
const [gA, gB, gC, bA, bB] = (await Promise.all([1, 2, 3, 4, 5].map(() => generateKeys()))) as [Keys, Keys, Keys, Keys, Keys];
const moves = [[0, 1, 2, 3, 4, 5, 6, 7]];
const final: Final = { moves, status: 1, ejected: [6, 2] };
let now = 1000;
const seat = (side: 1 | 2, o: Partial<ConstructorParameters<typeof RankedSeal>[0]> = {}): RankedSeal =>
  new RankedSeal({ game: 'g1', side, keys: side === 1 ? gA : gB, board: side === 1 ? bA : bB, name: side === 1 ? 'Ann' : 'Bob', opponent: side === 1 ? gB.pub : gA.pub, nowS: () => now, ...o });
const toBlack = (s: RankedSeal, m: unknown): Promise<Step> => s.receive(m, gB.pub);
const toWhite = (s: RankedSeal, m: unknown): Promise<Step> => s.receive(m, gA.pub);

/** Both intros delivered, both finals in: Black's result message. */
async function opened(): Promise<{ black: RankedSeal; white: RankedSeal; sent: Done }> {
  const black = seat(1);
  const white = seat(2);
  await toBlack(black, await white.intro());
  await toWhite(white, await black.intro());
  await white.finish(final);
  const sent = (await black.finish(final)).send as Done;
  return { black, white, sent };
}

describe('the seats seal a ranked result (#1287)', () => {
  it('Black signs, White checks on its own log and signs, Black completes: both end with the same result that verifies', async () => {
    const { black, white, sent } = await opened();
    expect(sent).toMatchObject({ kind: 'seal', step: 'result', game: 'g1', ts: 1000, pub: gA.pub });
    expect(await black.finish(final)).toEqual({}); // signs once
    const step = await toWhite(white, sent);
    expect(step.result).toBeDefined();
    expect(await bothSigned(step.result!)).toBe(true);
    expect(step.result).toMatchObject({ v: 1, black: { pub: bA.pub, name: 'Ann' }, white: { pub: bB.pub, name: 'Bob' }, moves, status: 1, ejected: [6, 2], ts: 1000 });
    const end = await toBlack(black, step.send);
    expect(end.result).toEqual(step.result);
    expect(await toBlack(black, step.send)).toEqual({}); // done: nothing again
    expect(await toWhite(white, sent)).toEqual({});
  });

  it('the signed payload starts with the domain tag, so a signature for another purpose never verifies as a result', async () => {
    const r = { v: 1 as const, game: 'g', black: { pub: 'a', name: 'A' }, white: { pub: 'b', name: 'B' }, moves, status: 1, ejected: [6, 2] as [number, number], ts: 5 };
    expect(JSON.parse(new TextDecoder().decode(await resultPayload(r)))[0]).toBe('ab-alone.result.v1');
  });

  it('White waits for its own log when Black\'s result comes first, and the intro may come after the final', async () => {
    const black = seat(1);
    const white = seat(2);
    await toBlack(black, await white.intro());
    await toWhite(white, await black.intro());
    const sent = (await black.finish(final)).send as Done;
    const early = seat(2);
    expect(await toWhite(early, sent)).toEqual({}); // no intro, no final yet
    expect(await early.finish(final)).toEqual({});
    expect((await toWhite(early, await black.intro())).result).toBeDefined(); // the intro that completes it
    const late = seat(2);
    await late.finish(final);
    await toWhite(late, sent);
    expect((await toWhite(late, await black.intro())).result).toBeDefined(); // the intro that completes it
  });

  it('a log, a score or a time that differs gives no result, and a time far from White\'s clock is refused', async () => {
    for (const other of [{ ...final, status: 2 }, { ...final, ejected: [5, 2] as [number, number] }, { ...final, moves: [[7, 6, 5, 4, 3, 2, 1, 0]] }]) {
      const { black, sent } = await opened();
      const white = seat(2);
      await toWhite(white, await black.intro());
      await white.finish(other);
      expect(await toWhite(white, sent)).toEqual({});
    }
    for (const [offset, ok] of [[TS_SLACK_S + 1, false], [-TS_SLACK_S - 1, false], [TS_SLACK_S, true], [-TS_SLACK_S, true]] as const) {
      const { white, sent } = await opened();
      now = 1000 + offset;
      expect((await toWhite(white, sent)).result !== undefined).toBe(ok);
      now = 1000;
    }
  });

  it('Black refuses a White signature that does not verify, and a result from a seat that is not the opponent', async () => {
    const { black, white, sent } = await opened();
    const mine = (await toWhite(white, sent)).send as Done;
    expect(await toBlack(black, { ...mine, sig: sent.sig })).toEqual({}); // Black's own signature in White's place
    const lone = await opened();
    expect(await lone.black.receive(mine, gC.pub)).toEqual({}); // sent by a third key
    expect(await lone.black.receive({ ...mine, pub: gC.pub }, gC.pub)).toEqual({});
  });

  it('White refuses a Black signature that is not a signature of the result', async () => {
    const { white, sent } = await opened();
    const forged = await signResult(bB, { v: 1, game: 'g1', black: { pub: bA.pub, name: 'Ann' }, white: { pub: bB.pub, name: 'Bob' }, ...final, ts: 1000 });
    expect(await toWhite(white, { ...sent, sig: forged })).toEqual({});
  });

  it('keeps the opponent\'s board key from its first signed intro only, and refuses a bad one', async () => {
    const black = seat(1);
    const white = seat(2);
    const intro = await white.intro();
    const cases: unknown[] = [
      { ...intro, game: 'other' }, // wrong game
      { ...intro, name: 'Eve' }, // the signature covers the name
      { ...intro, board: bC() }, // and the board key
      await signIntro(gB, { game: 'g1', board: bA.pub, name: 'Bob' }), // the same board key as ours
      await signIntro(gC, { game: 'g1', board: bB.pub, name: 'Bob' }), // signed by a game key that is not the opponent's
      'junk',
      null,
    ];
    for (const c of cases) expect(await black.receive(c, gB.pub)).toEqual({});
    expect(await black.receive(await signIntro(gC, { game: 'g1', board: bB.pub, name: 'Bob' }), gC.pub)).toEqual({}); // right signature, not the opponent
    await toBlack(black, intro);
    await toBlack(black, await signIntro(gB, { game: 'g1', board: bC(), name: 'Mallory' })); // a second intro changes nothing
    const sent = (await black.finish(final)).send as Done;
    const step = await toWhite(white, await black.intro()).then(() => white.finish(final)).then(() => toWhite(white, sent));
    expect(step.result!.white.name).toBe('Bob');
  });

  it('offers no result for a log the board would not read', async () => {
    const black = seat(1);
    await toBlack(black, await seat(2).intro());
    expect(await black.finish({ ...final, moves: Array.from({ length: MAX_PLIES + 1 }, () => [0, 0, 0, 0, 0, 0, 0, 0]) })).toEqual({});
  });

  it('shapes: a clean copy or null, and names are cleaned', async () => {
    const intro: Intro = await signIntro(gA, { game: 'g', board: 'b', name: ' Ann\u0000 '.repeat(9) });
    expect(intro.name).toHaveLength(16);
    expect(parseSeal({ ...intro, extra: 1 })).toEqual(intro);
    const done: Seal = { kind: 'seal', step: 'result', game: 'g', ts: 3, sig: 's', pub: 'p' };
    expect(parseSeal({ ...done, extra: 1 })).toEqual(done);
    const bad: unknown[] = [
      null, 3, 'x', {}, { ...done, kind: 'x' }, { ...done, game: 1 }, { ...done, pub: 1 }, { ...done, sig: 1 }, { ...done, step: 'x' }, { ...done, ts: 1.5 }, { ...done, ts: 'x' },
      { ...intro, board: 1 }, { ...intro, name: 1 },
    ];
    for (const b of bad) expect(parseSeal(b)).toBeNull();
  });
});

function bC(): string {
  return gC.pub; // any other valid key bytes
}
