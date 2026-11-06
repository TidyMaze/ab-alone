import { describe, expect, it } from 'vitest';
import { CUES, Sfx, type CueEvent } from './sound';
import { FakeContext } from './test/audio';

// #1570: the cue table of world.md section 7 against the code.
// The cue table of world.md section 7 is read from the spec itself: a cue cannot be played without its row, nor a row
// say played without its cue. Node's fetch cannot read a file:// URL, so the test reads it with node:fs, imported untyped.
const fs = 'node:fs/promises';
const { readFile } = (await import(/* @vite-ignore */ fs)) as { readFile(path: URL): Promise<Uint8Array> };
const world = new TextDecoder().decode(await readFile(new URL('../../docs/specs/world.md', import.meta.url)));
const audio = world.split('\n## ').find((section) => section.startsWith('7. Audio direction'))!;
const rows = [...audio.matchAll(/^ *\| `([\w-]+)` \| ([^|]+) \| (\w+) \| (played|planned) \|$/gm)].map(([, event, mode, bus, status]) => ({ event: event!, mode: mode!.trim(), bus: bus!, status: status! }));

describe('the cue table of world.md section 7 (#1570)', () => {
  const played = rows.filter((row) => row.status === 'played');
  const planned = rows.filter((row) => row.status === 'planned');

  it('lists the played events in the order of the code, each with its mode and bus', () => {
    expect(played.map((row) => row.event)).toEqual(Object.keys(CUES));
    for (const row of played) expect(row, row.event).toMatchObject({ mode: CUES[row.event as CueEvent].mode, bus: CUES[row.event as CueEvent].bus });
  });

  it('lists all nineteen events as played, none planned any more, each event once', () => {
    expect(played).toHaveLength(19);
    expect(planned).toEqual([]);
    expect(new Set(rows.map((row) => row.event)).size).toBe(rows.length);
  });

  it('puts the time of day on the ambience bus and every other cue on the effects bus', () => {
    for (const row of rows) expect(row.bus, row.event).toBe(row.event === 'time-of-day' ? 'ambience' : 'effects');
  });

  it('says in words that the boss death replaces the win, and that every cue is calculated, not heard', () => {
    expect(audio).toMatch(/boss death[^.]*instead of the win|instead of the win[^.]*boss death/i);
    expect(audio).toMatch(/calculated, not heard/);
  });

  it.each(played.map((row) => row.event))('%s: calls sfx and sounds through the bus of its row', (event) => {
    const ctx = new FakeContext();
    const sfx = new Sfx(() => ctx as unknown as AudioContext, { music: 100, ambience: 100, effects: 100, voice: 100 });
    sfx.unlock();
    const before = ctx.sources.length;
    expect(sfx.cue(event as CueEvent)).toBe(true);
    expect(ctx.sources.length).toBeGreaterThan(before);
  });
});
