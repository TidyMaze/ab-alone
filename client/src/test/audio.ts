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
  inputs: FakeNode[] = [];
  connect<T extends FakeNode>(to: T): T {
    this.outputs.push(to);
    to.inputs?.push(this); // an AudioParam has no inputs list
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
  offsets: (number | undefined)[] = [];
  start(t: number, offset?: number) {
    this.times.push(t);
    this.offsets.push(offset);
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
  loopStart = 0;
  loopEnd = 0;
}
export class FakePanner extends FakeNode {
  pan = new FakeParam();
}
export class FakeConvolver extends FakeNode {
  buffer: FakeBuffer | null = null;
}
export class FakeBuffer {
  channelData: Float32Array[];
  constructor(
    public channels: number,
    public length: number,
    public rate: number,
  ) {
    this.channelData = Array.from({ length: channels }, () => new Float32Array(length));
  }
  get sampleRate(): number {
    return this.rate;
  }
  /** The first channel. */
  get data(): Float32Array {
    return this.channelData[0]!;
  }
  get numberOfChannels(): number {
    return this.channels;
  }
  get duration(): number {
    return this.length / this.rate;
  }
  getChannelData(i: number) {
    expect(i).toBeLessThan(this.channels);
    return this.channelData[i]!;
  }
}
export class FakeContext {
  currentTime = 5;
  sampleRate = 8000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  fetch = vi.fn(async (_url: string) => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }));
  gains: FakeGain[] = [];
  buffers: FakeBuffer[] = [];
  panners: FakePanner[] = [];
  convolvers: FakeConvolver[] = [];
  resumed = 0;
  suspended = 0;
  rejection: Promise<void> | null = null;
  constructor(
    public state: 'suspended' | 'running' = 'running',
    private failResume = false,
  ) {
    globalThis.fetch = this.fetch as unknown as typeof fetch; // the audio files: a fetch that always loads (#1575)
  }
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
  suspend() {
    this.suspended++;
    this.state = 'suspended';
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
  createStereoPanner() {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createConvolver() {
    const c = new FakeConvolver();
    this.convolvers.push(c);
    return c;
  }
  /** The audio file decoded: 1000 samples at the context rate, silence at both ends, a tone in between (#1575). */
  decodeAudioData(_data: ArrayBuffer): Promise<AudioBuffer> {
    const b = new FakeBuffer(1, 1000, this.sampleRate);
    b.data.fill(0.5, 100, 900);
    return Promise.resolve(b as unknown as AudioBuffer);
  }
  /** The file tracks once decoded: their buffer sources, not the noise of the synthesized layers. */
  get tracks(): FakeBufferSource[] {
    return this.sources.filter((s): s is FakeBufferSource => s instanceof FakeBufferSource && s.buffer !== null && !this.buffers.includes(s.buffer));
  }
}
