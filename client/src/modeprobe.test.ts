import { describe, expect, it } from 'vitest';
import { createModeProbe } from './modeprobe';

// #1582: the probe times a mode's entry, from the call that starts it to the first frame drawn after it, on a test build only.
describe('createModeProbe (#1582)', () => {
  it('records the time from begin to the first drawn frame, once per entry', () => {
    let t = 1000;
    const probe = createModeProbe(() => t);
    probe.begin('boss');
    t = 1180;
    probe.drawn();
    t = 1300;
    probe.drawn(); // a later frame is not the entry's first
    expect(probe.samples()).toEqual({ boss: [180] });
  });

  it('keeps each mode apart and a second entry of the same mode is its own sample', () => {
    let t = 0;
    const probe = createModeProbe(() => t);
    probe.begin('arena');
    t = 50;
    probe.drawn();
    probe.begin('world');
    t = 90;
    probe.drawn();
    probe.begin('arena');
    t = 100;
    probe.drawn();
    expect(probe.samples()).toEqual({ arena: [50, 10], world: [40] });
  });

  it('a frame with no entry pending records nothing', () => {
    const probe = createModeProbe(() => 5);
    probe.drawn();
    expect(probe.samples()).toEqual({});
  });

  it('a new entry before the first frame replaces the pending one', () => {
    let t = 0;
    const probe = createModeProbe(() => t);
    probe.begin('run');
    t = 30;
    probe.begin('boss');
    t = 45;
    probe.drawn();
    expect(probe.samples()).toEqual({ boss: [15] });
  });

  it('reads the page clock by default', () => {
    const probe = createModeProbe();
    probe.begin('world');
    probe.drawn();
    const [ms] = probe.samples().world!;
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('records each mark as its offset from the entry, and keeps them after the frame', () => {
    let t = 100;
    const probe = createModeProbe(() => t);
    probe.begin('world');
    t = 130;
    probe.mark('built');
    t = 180;
    probe.mark('compiled');
    t = 200;
    probe.drawn();
    expect(probe.marks()).toEqual({ built: 30, compiled: 80 });
  });

  it('a new entry clears the marks of the last one only when it begins', () => {
    let t = 0;
    const probe = createModeProbe(() => t);
    probe.begin('world');
    t = 10;
    probe.mark('built');
    probe.drawn();
    expect(probe.marks()).toEqual({ built: 10 });
    probe.begin('boss');
    expect(probe.marks()).toEqual({});
  });

  it('a mark with no entry pending is dropped, and reset clears the marks', () => {
    const probe = createModeProbe(() => 0);
    probe.mark('built');
    expect(probe.marks()).toEqual({});
    probe.begin('world');
    probe.mark('built');
    probe.drawn();
    probe.reset();
    expect(probe.marks()).toEqual({});
  });

  it('reset empties the samples', () => {
    const probe = createModeProbe(() => 0);
    probe.begin('run');
    probe.drawn();
    probe.reset();
    expect(probe.samples()).toEqual({});
  });
});
