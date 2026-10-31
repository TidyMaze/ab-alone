// The particles of the Open world (#1110, docs/specs/openworld-animation.md sections 1 and 6): pollen, leaves, snow and heat dust
// drifting round the hero by biome, and the dust puff under a step. One pool of a fixed size, each slot a particle whose pose is a pure
// function of the time (its origin, its speed and its birth), so it is unit-tested; the view draws the pool as one instanced mesh.
import type { Biome } from './openworld';

/** The pool's size: 64 on a desktop, 24 on a touch phone. */
export const CAP_DESKTOP = 64;
export const CAP_PHONE = 24;
/** The cap for this device. */
export const capFor = (): number => (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? CAP_PHONE : CAP_DESKTOP);

/** What one kind of particle does: `rate` born a second, each lives `life` ms; it starts `lift` to `lift + spread` above the hero's
 * ground, moves up `rise` cells a second (negative falls) and sways `sway` cells sideways; `size` is its radius in cells. */
export interface Look {
  rate: number;
  life: number;
  lift: number;
  spread: number;
  rise: number;
  sway: number;
  size: number;
  colour: number;
}

/** The ambient particles by biome, born within `RADIUS` cells of the hero. The badlands have none. */
export const AMBIENT: Partial<Record<Biome, Look>> = {
  meadow: { rate: 5, life: 4000, lift: 0.1, spread: 1.2, rise: 0.1, sway: 0.25, size: 0.07, colour: 0xffe27a },
  forest: { rate: 3, life: 6000, lift: 2.2, spread: 0.6, rise: -0.35, sway: 0.4, size: 0.07, colour: 0xd9822b },
  tundra: { rate: 8, life: 5000, lift: 2.4, spread: 0.8, rise: -0.45, sway: 0.15, size: 0.07, colour: 0xffffff },
  desert: { rate: 4, life: 3000, lift: 0.05, spread: 0.5, rise: 0.15, sway: 0.3, size: 0.05, colour: 0xe0b878 },
};

/** The dust puff of a step: `count` grains thrown outward from the cell the hero leaves, gone within `life` ms. */
export const PUFF = {
  count: 5,
  speed: 0.7,
  look: { rate: 0, life: 350, lift: 0, spread: 0, rise: 0.25, sway: 0, size: 0.08, colour: 0xcdbf9e } satisfies Look,
};

/** How far from the hero the ambient particles are born, in cells (the spec's radius of 6). */
const RADIUS = 6;
/** The longest gap between two frames that owes particles, in ms: a hidden tab does not burst on return. */
const MAX_GAP = 250;
/** The shares of a life spent fading in and fading out. */
const FADE_IN = 0.15;
const FADE_OUT = 0.25;

/** The pose of a particle, written by `pose`: its place, its radius (0 at the ends of its life) and its colour. */
export interface ParticlePose {
  x: number;
  y: number;
  z: number;
  s: number;
  colour: number;
}

export class ParticlePool {
  private readonly ox: Float32Array;
  private readonly oy: Float32Array;
  private readonly oz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly sway: Float32Array;
  private readonly phase: Float32Array;
  private readonly size: Float32Array;
  private readonly colour: Uint32Array;
  private readonly born: Float64Array;
  private readonly life: Float32Array;
  private last = -Infinity;
  private owed = 0;
  private seed = 2463534242;

  constructor(readonly cap: number) {
    this.ox = new Float32Array(cap);
    this.oy = new Float32Array(cap);
    this.oz = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.sway = new Float32Array(cap);
    this.phase = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.colour = new Uint32Array(cap);
    this.born = new Float64Array(cap);
    this.life = new Float32Array(cap);
  }

  /** The next number in `[0, 1)`: a xorshift, so a pool is the same every run and allocates nothing. */
  private random(): number {
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }

  /** How many particles are alive at `now` (ms). */
  alive(now: number): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (now - this.born[i]! < this.life[i]!) n++;
    return n;
  }

  /** Writes the pose of slot `i` at `now` into `out`; false when the slot holds no live particle. */
  pose(i: number, now: number, out: ParticlePose): boolean {
    const age = now - this.born[i]!;
    const life = this.life[i]!;
    if (!(age < life)) return false;
    const fade = Math.min(1, age / (life * FADE_IN), (life - age) / (life * FADE_OUT));
    const t = age / 1000;
    out.x = this.ox[i]! + this.vx[i]! * t + this.sway[i]! * Math.sin(this.phase[i]! + age / 700);
    out.y = this.oy[i]! + this.vy[i]! * t;
    out.z = this.oz[i]! + this.vz[i]! * t;
    out.s = this.size[i]! * fade;
    out.colour = this.colour[i]!;
    return true;
  }

  /** Puts a particle of `look` at the place and speed given, in the first free slot; false (nothing born) when the pool is full. */
  private spawn(look: Look, x: number, y: number, z: number, now: number, vx: number, vz: number): boolean {
    for (let i = 0; i < this.cap; i++) {
      if (now - this.born[i]! < this.life[i]!) continue;
      this.ox[i] = x;
      this.oy[i] = y;
      this.oz[i] = z;
      this.vx[i] = vx;
      this.vy[i] = look.rise;
      this.vz[i] = vz;
      this.sway[i] = look.sway;
      this.phase[i] = this.random() * 2 * Math.PI;
      this.size[i] = look.size;
      this.colour[i] = look.colour;
      this.born[i] = now;
      this.life[i] = look.life;
      return true;
    }
    return false;
  }

  /** Born by the frame at `now` (ms): the particles `look` owes since the last frame, round `hero`. No look, no new particle: those
   * alive finish their life. */
  step(now: number, hero: { x: number; y: number; z: number }, look: Look | undefined): void {
    const gap = Math.min(MAX_GAP, now - this.last);
    this.last = now;
    if (!look) {
      this.owed = 0;
      return;
    }
    this.owed += (look.rate * gap) / 1000;
    for (; this.owed >= 1; this.owed--) {
      const angle = this.random() * 2 * Math.PI;
      const far = Math.sqrt(this.random()) * RADIUS;
      this.spawn(look, hero.x + Math.cos(angle) * far, hero.y + look.lift + this.random() * look.spread, hero.z + Math.sin(angle) * far, now, 0, 0);
    }
  }

  /** The dust puff of a step: `PUFF.count` grains thrown outward from (`x`, `y`, `z`) at `now`. */
  puff(x: number, y: number, z: number, now: number): void {
    for (let k = 0; k < PUFF.count; k++) {
      const angle = ((k + this.random()) / PUFF.count) * 2 * Math.PI;
      this.spawn(PUFF.look, x, y, z, now, Math.cos(angle) * PUFF.speed, Math.sin(angle) * PUFF.speed);
    }
  }

  /** Ends every particle at once: reduced motion and a far zoom draw none. */
  clear(): void {
    this.life.fill(0);
    this.owed = 0;
  }
}
