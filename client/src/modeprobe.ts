// The mode-entry probe (#1582): the time from the call that starts a mode (arena, world, run, boss) to the first frame drawn after it.
// main.ts creates one only in a test build (testHooks), so a player's page never times anything.

export type ProbeMode = 'arena' | 'world' | 'run' | 'boss';

export interface ModeProbe {
  /** An entry starts now: the next drawn frame ends it. A second entry before that frame replaces the first. */
  begin(mode: ProbeMode): void;
  /** A frame was drawn: it ends the pending entry, if any, and records its time in milliseconds. */
  drawn(): void;
  /** A point inside the pending entry, its offset in ms from the entry's start (the build, the compile). */
  mark(label: string): void;
  /** The recorded times per mode, in entry order. */
  samples(): Partial<Record<ProbeMode, number[]>>;
  /** The marks of the last entry drawn, by label. */
  marks(): Record<string, number>;
  reset(): void;
}

export function createModeProbe(clock: () => number = () => performance.now()): ModeProbe {
  let pending: { mode: ProbeMode; at: number } | null = null;
  let times: Partial<Record<ProbeMode, number[]>> = {};
  let stamps: Record<string, number> = {};
  let last: Record<string, number> = {};
  return {
    begin(mode) {
      pending = { mode, at: clock() };
      stamps = {};
      last = {};
    },
    mark(label) {
      if (pending) stamps[label] = clock() - pending.at;
    },
    drawn() {
      if (!pending) return;
      (times[pending.mode] ??= []).push(clock() - pending.at);
      pending = null;
      last = stamps;
    },
    samples: () => times,
    marks: () => last,
    reset() {
      pending = null;
      times = {};
      stamps = {};
      last = {};
    },
  };
}
