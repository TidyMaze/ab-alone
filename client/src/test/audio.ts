// A fake AudioContext for the tests (sound.test.ts, the main.ts harness): every node records how it is wired and how
// its params are automated.
import { expect, vi } from 'vitest';

type Event = [method: string, value: number, time: number];
export class FakeParam {
  value = 0;
  events: Event[] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push(['exp', v, t]);
  }
  setTargetAtTime(v: number, t: number, tau: number) {
    this.events.push(['target', v, t]);
    expect(tau).toBeGreaterThan(0);
  }
}
export class FakeNode {
  outputs: FakeNode[] = [];
  connect<T extends FakeNode>(to: T): T {
    this.outputs.push(to);
    return to;
  }
}
export class FakeGain extends FakeNode {
  gain = new FakeParam();
}
export class FakeFilter extends FakeNode {
  type = '';
  Q = new FakeParam();
  frequency = new FakeParam();
}
export class FakeSource extends FakeNode {
  times: number[] = [];
  start(t: number) {
    this.times.push(t);
  }
  stop(t: number) {
    this.times.push(t);
  }
}
export class FakeOscillator extends FakeSource {
  type = '';
  frequency = new FakeParam();
}
export class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
}
export class FakeBuffer {
  data: Float32Array;
  constructor(
    public channels: number,
    length: number,
    public rate: number,
  ) {
    this.data = new Float32Array(length);
  }
  getChannelData(i: number) {
    expect(i).toBeLessThan(this.channels);
    return this.data;
  }
}
export class FakeContext {
  currentTime = 5;
  sampleRate = 8000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  buffers: FakeBuffer[] = [];
  resumed = 0;
  rejection: Promise<void> | null = null;
  constructor(
    public state: 'suspended' | 'running' = 'running',
    private failResume = false,
  ) {}
  resume() {
    this.resumed++;
    if (this.failResume) {
      this.rejection = Promise.reject(new Error('closed'));
      vi.spyOn(this.rejection, 'catch');
      return this.rejection;
    }
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBiquadFilter() {
    return new FakeFilter();
  }
  createOscillator() {
    const o = new FakeOscillator();
    this.sources.push(o);
    return o;
  }
  createBufferSource() {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
  createBuffer(channels: number, length: number, rate: number) {
    const b = new FakeBuffer(channels, length, rate);
    this.buffers.push(b);
    return b;
  }
}
