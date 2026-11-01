// The Open world mode (docs/specs/openworld.md): the world of a seed, the hero in it, and the view that draws them, as one
// thing main.ts switches on and off. It draws itself with the page's renderer while it is on, and the page's board stays
// untouched.
import type * as THREE from 'three/webgpu';
import { DIRECTIONS, type Axial } from './board';
import { arrowCell } from './hubview';
import { blocked, breakable, chunkOf, Hero, neighbours, same, World } from './openworld';
import { FightState, readPush } from './openworldfight';
import { GLIDE_MS, NUDGE_MS, slowBy, type Pace } from './openworldglide';
import type { WorldSave, WorldSaves } from './openworldsave';
import type { MarbleSkins } from './openworldstripe';
import { endingLine } from './tally';
import { MARBLES } from './trainer';
import { MAX_REACH, OpenWorldView, type Played, type PropModels, wrapPi } from './openworldview';

/** The push of a step, the bridge's `world_push` (docs/specs/openworld.md section 4): the seed, the hero's cell then the troop's,
 * the enemies near the hero, the broken cells (#1154), all `q, r` pairs; its answer is empty when no push is legal (`readPush`). */
export type TroopPush = (seed: number, troop: Int32Array, enemies: Int32Array, broken: Int32Array) => Int32Array;

/** The walk of the hero to a far cell, the bridge's `world_path` (docs/specs/openworld.md section 4): the seed, the cell the hero
 * stands on, the cell asked for, the cells it cannot enter (enemies, lairs) and the broken cells (#1154), as `q, r` pairs; its answer
 * is the cells to walk, the start left out, empty when there is no way. */
export type WalkPath = (seed: number, from: Axial, to: Axial, blocked: Int32Array, broken: Int32Array) => Int32Array;

/** The enemies near the hero that a walk goes round: the radius of the path search. */
const PATH_REACH = 40;

/** The enemies within this many cells of the hero are the ones a push can reach. */
export const PUSH_REACH = 10;


/** The cells as the bridge takes them: `q, r` pairs. */
const flat = (cells: readonly Axial[]): Int32Array => Int32Array.from(cells.flat());

/** The diagonal cell of each vertical arrow and horizontal arrow held together, in the axial steps of `neighbours`: up is
 * -z on screen (the camera looks down the -z way), so these are the four diagonals of the hex grid. */
const DIAGONAL: Record<string, Record<string, Axial>> = {
  ArrowUp: { ArrowLeft: [0, -1], ArrowRight: [1, -1] },
  ArrowDown: { ArrowLeft: [-1, 1], ArrowRight: [0, 1] },
};

/** The cell a diagonal of two held arrows rolls to: one vertical and one horizontal arrow, both held; `null` otherwise. */
export function heldCell([q, r]: Axial, held: ReadonlySet<string>): Axial | null {
  const vertical = ['ArrowUp', 'ArrowDown'].filter((k) => held.has(k));
  const horizontal = ['ArrowLeft', 'ArrowRight'].filter((k) => held.has(k));
  if (vertical.length !== 1 || horizontal.length !== 1) return null;
  const [dq, dr] = DIAGONAL[vertical[0]!]![horizontal[0]!]!;
  return [q + dq, r + dr];
}

/** Whether two opposite arrows are held together: they cancel, so the hero stays put. */
const opposed = (held: ReadonlySet<string>): boolean =>
  (held.has('ArrowUp') && held.has('ArrowDown')) || (held.has('ArrowLeft') && held.has('ArrowRight'));

/** The camera turns by a step of Q or E, and by a px of a right-button drag, in radians (#1026). */
export const TURN_STEP = Math.PI / 3;
/** The camera rests at this angle plus a multiple of TURN_STEP, so screen up runs along a straight line of hexes, not the zigzag between
 * two (#1254). The default is the one that rolls up to the north-east, as the keyboard always did on an even row. */
export const REST_OFFSET = Math.PI / 6;
export const DEFAULT_YAW = -REST_OFFSET;
/** The resting angle nearest to `yaw`. */
export const restYaw = (yaw: number): number => Math.round((yaw - REST_OFFSET) / TURN_STEP) * TURN_STEP + REST_OFFSET;
export const ORBIT_PER_PX = Math.PI / 360;
const TURNS = new Map<string, number>([
  ['q', TURN_STEP],
  ['Q', TURN_STEP],
  ['e', -TURN_STEP],
  ['E', -TURN_STEP],
]);
/** The screen direction of each arrow key, x to the right and y up: a diagonal is the sum of its two. */
const SCREEN = new Map<string, [number, number]>([
  ['ArrowUp', [0, 1]],
  ['ArrowDown', [0, -1]],
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
]);

/** The angle of a step on the ground, in radians, from the x axis towards the far side (the layout of `axialTo3D`, where screen up
 * is -z, so the screen is the ground at yaw 0). */
const groundAngle = ([dq, dr]: Axial): number => Math.atan2(-((Math.sqrt(3) / 2) * dr), dq + dr / 2);
/** The gap between two angles in radians, from 0 to pi. */
const gapOf = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
};

/** The intent of the held arrows: their ground angle at the camera's yaw (radians, as `groundAngle`); `null` for no arrow or for
 * opposite arrows. */
function intentOf(held: ReadonlySet<string>, yaw: number): number | null {
  const arrows = [...held].filter((key) => SCREEN.has(key));
  if (arrows.length === 0 || opposed(held)) return null;
  const [x, y] = arrows.reduce(([sx, sy], key) => [sx + SCREEN.get(key)![0], sy + SCREEN.get(key)![1]], [0, 0]);
  return Math.atan2(y, x) + yaw;
}

/** The hex step of the held arrows in the yaw of the camera (#1026, docs/specs/openworld.md section 4). The held arrows are a screen
 * direction (the sum of the two of a diagonal), and the hero rolls to the neighbour of the hex grid that the camera shows nearest to
 * it: a neighbour at ground angle `a` shows at `a - yaw`, so the one nearest to `direction + yaw` is taken. A tie (the zigzag of an
 * odd or even row, or a yaw at the middle of two neighbours) takes the step the keyboard takes at yaw 0, as it always did; for Left or
 * Right alone it takes the neighbour that leans up on the screen (#1273). `null`
 * for no arrow or for opposite arrows. */
export function stepOf(at: Axial, held: ReadonlySet<string>, yaw: number): Axial | null {
  const want = intentOf(held, yaw);
  if (want === null) return null;
  const arrows = [...held].filter((key) => SCREEN.has(key));
  const fallback = arrows.length === 1 ? arrowCell(at, arrows[0]!)! : heldCell(at, held)!;
  const fallbackAngle = groundAngle([fallback[0] - at[0], fallback[1] - at[1]]);
  // A pure sideways intent (Left or Right alone) breaks a tie toward the neighbour that leans up on the screen (#1273).
  const sideways = arrows.length === 1 && (arrows[0] === 'ArrowLeft' || arrows[0] === 'ArrowRight');
  let best = DIRECTIONS[0]!;
  let bestScore = [Infinity, Infinity];
  for (const dir of DIRECTIONS) {
    const tie = sideways ? -Math.sin(groundAngle(dir) - yaw) : gapOf(groundAngle(dir), fallbackAngle);
    const score = [Math.round(gapOf(groundAngle(dir), want) * 1e9), Math.round(tie * 1e9)];
    if (score[0]! < bestScore[0]! || (score[0] === bestScore[0] && score[1]! < bestScore[1]!)) {
      best = dir;
      bestScore = score;
    }
  }
  return [at[0] + best[0], at[1] + best[1]];
}

/** The semi-auto step (#1137, docs/specs/openworld.md section 4): the cell of `stepOf` when `free` takes it, else the free one of its
 * two side neighbours (60 degrees off) that the intent follows best, a tie going to the lower direction index; the blocked straight cell when none is
 * free (a wall, a lake, a cliff), and then the hero leans as before; `null` for no intent. `free` tells whether the hero can enter a cell. */
export function steerStep(at: Axial, held: ReadonlySet<string>, yaw: number, free: (cell: Axial) => boolean): Axial | null {
  const straight = stepOf(at, held, yaw);
  if (!straight || free(straight)) return straight;
  const ahead = groundAngle([straight[0] - at[0], straight[1] - at[1]]);
  const want = intentOf(held, yaw)!;
  let best = straight;
  let bestGap = Infinity;
  for (const dir of DIRECTIONS) {
    const side = Math.abs(gapOf(groundAngle(dir), ahead) - Math.PI / 3) < 1e-6;
    const cell: Axial = [at[0] + dir[0], at[1] + dir[1]];
    const gap = Math.round(gapOf(groundAngle(dir), want) * 1e9);
    if (side && gap < bestGap && free(cell)) {
      best = cell;
      bestGap = gap;
    }
  }
  return best;
}

/** The turn of the camera a twist of two fingers makes, from the angle the two fingers made to the new one: the shortest way. */
export const twistOf = (prev: number, next: number): number => wrapPi(next - prev);

export class OpenWorldMode {
  active = false;
  hero: Hero | null = null;
  private view: OpenWorldView | null = null;
  private world: World | null = null;
  /** The seed of the world entered, the enemies as the pushes left them, and the pushes played so far. */
  private seed = 0;
  private fight = new FightState();
  private pushes = 0;
  /** The boss lairs of the world entered, by number, and the numbers of the ones beaten (#1170). */
  private lairs: Axial[] = [];
  private beaten: number[] = [];
  private dirty = false;
  /** Whether the world changed since its last save, and how many saves the page has stored (`openworldSaved`, #968). */
  private unsaved = false;
  private writes = 0;
  /** The time of the last frame, in ms: the camera's ease runs on the time between frames. */
  private clock = 0;
  /** The arrow keys held down: a vertical and a horizontal one together roll a diagonal. */
  private readonly held = new Set<string>();
  /** The arrows the stick holds (#1025): they count as held keys do. */
  private pad: readonly string[] = [];
  /** The time of the next step while an arrow is held, in ms: the frame loop makes it (#1059), Infinity while none is. */
  private nextStep = Infinity;
  /** Whether the last step was one of a held walk, so the next one takes over its speed instead of starting from rest (#1065). */
  private cruising = false;
  /** The cells of the walk to a far cell (#1137) still to take, the next first; empty when no such walk is on. */
  private route: Axial[] = [];
  /** The props are read once for the page: every entry reuses them. */
  private modelsOnce?: Promise<PropModels>;

  /** `load` reads a chunk of a seed's world, `models` the low-poly and the detailed props: the first draw does not wait for them.
   * `reduced` tells whether the page asks for reduced motion, which holds the water still. `push` plays the troop's push. */
  constructor(
    private readonly load: (seed: number, cx: number, cy: number) => Uint8Array,
    private readonly loadEnemies: (seed: number, cx: number, cy: number) => Int32Array,
    private readonly models: () => Promise<PropModels>,
    private readonly reduced: () => boolean,
    private readonly push: TroopPush,
    private readonly saves: WorldSaves,
    /** The boss lairs of a seed's world: `q, r` pairs (the bridge's `world_lairs`), and what starts a lair, given its seed and number. */
    private readonly lairsOf: (seed: number) => Int32Array = () => new Int32Array(),
    private readonly onLair: (seed: number, lair: number) => void = () => {},
    /** The skins of the ship the marbles wear, read when a world opens (#1176): none draws the plain looks. */
    private readonly skins?: () => Promise<MarbleSkins>,
    /** The medals the player holds and the bosses there are, read from the shared medal store when a world opens (#1171). */
    private readonly medals: () => { have: number; total: number } = () => ({ have: 0, total: 0 }),
    /** Tally's line for the HUD when a world opens, empty when it has been shown already (#1171). */
    private readonly tally: () => string = () => '',
    /** The path of a walk to a far cell, the bridge's `world_path` (#1137): none gives no way. */
    private readonly path: WalkPath = () => new Int32Array(),
    /** Whether steering is on (the Settings item, #1137): the held arrows slide round obstacles and a far tap walks there. */
    private readonly steering: () => boolean = () => true,
  ) {}

  /** Opens the world of `seed`: its saved state when `resume` (the default) and a save of this version is there, else the spawn.
   * The save is read before the first draw, and the seed is remembered as the last world played (#968). */
  async open(seed: number, width: number, height: number, resume = true): Promise<void> {
    const saved = resume ? await this.saves.load(seed) : null;
    this.enter(seed, width, height, saved, await this.skins?.());
    void this.saves.remember(seed);
  }

  /** Enters the world of `seed` with the hero, the troop and the fight of `saved` (a save of this seed), or on the spawn. */
  enter(seed: number, width: number, height: number, saved: WorldSave | null = null, skins?: MarbleSkins): void {
    this.flush(); // the world left (another seed entered over it) is saved first
    this.view?.dispose();
    this.seed = seed;
    const world = new World(
      (cx, cy) => this.load(seed, cx, cy),
      (cx, cy) => this.loadEnemies(seed, cx, cy),
    );
    this.world = world;
    if (saved) world.restore(saved.broken); // before any cell is read: the broken obstacles stay broken (#1147)
    this.fight = saved ? FightState.fromJSON(saved.fight) : new FightState();
    this.pushes = 0;
    const flatLairs = this.lairsOf(seed);
    this.lairs = Array.from({ length: flatLairs.length / 2 }, (_, i): Axial => [flatLairs[2 * i]!, flatLairs[2 * i + 1]!]);
    this.beaten = saved ? [...saved.lairs] : [];
    const view = new OpenWorldView(world, this.fight, skins);
    view.useFlatTops(this.lowTier()); // the low tier draws a ground cell no neighbour lies below as its top alone (#1234)
    this.hero = new Hero(world, this.fight);
    if (saved) {
      this.hero.at = saved.hero;
      this.hero.troop = saved.troop;
    }
    this.view = view;
    view.resize(width, height);
    view.turnTo(saved ? restYaw(saved.yaw) : DEFAULT_YAW); // the camera opens at the angle the world was left at, or the default (#1026, #1254)
    view.show(this.hero.at, this.hero.troop);
    view.setLairs(this.lairs, this.beaten);
    const medals = document.getElementById('openworld-medals'); // the HUD's medal count (#1171)
    if (medals) {
      const { have, total } = this.medals();
      medals.textContent = `Medals ${have} / ${total}`;
    }
    this.showTally(true);
    this.active = true;
    this.refreshMode();
    this.dirty = true;
    this.mark(String(seed));
    this.modelsOnce ??= this.models();
    void this.modelsOnce.then((models) => {
      if (this.view !== view) return; // left before the models arrived
      view.useModels(this.lowTier() ? { ...models, high: {} } : models); // the low tier draws the low-poly props everywhere, no detailed set (#1234)
      this.dirty = true;
      this.mark(String(seed)); // the detailed props drawn now are published too (#989)
    });
  }

  /** The scene drawn now, none outside the mode: the render-cost readout counts its lights (#1234). */
  get scene(): THREE.Scene | null {
    return this.view?.scene ?? null;
  }

  leave(): void {
    this.flush();
    this.active = false;
    this.held.clear();
    this.view?.dispose();
    this.view = null;
    this.world = null;
    this.dirty = false;
    this.pad = [];
    this.route = [];
    this.nextStep = Infinity;
    this.cruising = false;
    delete document.body.dataset.openworldRoute;
    delete document.body.dataset.openworld;
    delete document.body.dataset.openworldAt;
    delete document.body.dataset.openworldTroop;
    delete document.body.dataset.openworldEnemies;
    delete document.body.dataset.openworldBeaten;
    delete document.body.dataset.openworldPush;
    delete document.body.dataset.openworldZoom;
    delete document.body.dataset.openworldYaw;
    delete document.body.dataset.openworldBroken;
    delete document.body.dataset.openworldLairs;
    delete document.body.dataset.openworldLairsBeaten;
    delete document.body.dataset.openworldDrawn;
    delete document.body.dataset.openworldAnim;
    delete document.body.dataset.openworldGlide;
    delete document.body.dataset.openworldParticles;
    delete document.body.dataset.openworldMotion;
  }

  /** The New world control (#1021): the world entered is left without its save, which is discarded, and a random world is entered
   * on the spawn in its place. Returns its seed, which the page shows and the URL takes. */
  async newWorld(width: number, height: number): Promise<number> {
    const left = this.seed;
    this.unsaved = false; // the world left is discarded, not saved again
    await this.saves.discard(left);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    await this.open(seed, width, height, false);
    return seed;
  }

  /** What the camera draws now (the browser checks read it, #1103). */
  camera(): ReturnType<OpenWorldView['probe']> {
    return this.view!.probe();
  }

  /** The enemy marbles near the hero now, the pushed ones where they stand (the browser checks read them). */
  enemies(): Axial[] {
    return this.fight.enemiesAround(this.world!, this.hero!.at, PUSH_REACH);
  }

  /** Tally's line in the HUD (#1171): the ending once every lair is beaten (#1175), else the page's line (`fresh`: asked for, which
   * may use it up). */
  private showTally(fresh: boolean): void {
    const tally = document.getElementById('openworld-tally');
    if (!tally) return;
    const over = this.lairs.length > 0 && this.beaten.length >= this.lairs.length;
    tally.textContent = over ? endingLine(MARBLES) : fresh ? this.tally() : '';
  }

  /** A test fixture (webdriver pages only, docs/specs/openworld.md section 6): the hero on `hero`, the troop on `troop`, and the
   * enemies of the loaded square replaced by `enemies`, none pushed; `beaten` (#1175) sets the lairs beaten. */
  fixture({ hero, troop, enemies, beaten }: { hero: Axial; troop: Axial[]; enemies: Axial[]; beaten?: number[] }): void {
    this.view!.snap();
    if (beaten) {
      this.beaten = [...beaten];
      this.view!.setLairs(this.lairs, this.beaten);
      this.showTally(false);
      this.persist();
    }
    this.hero!.at = hero;
    this.hero!.troop = troop;
    this.view!.show(hero, troop); // first: the loaded square may keep its centre, which the enemies are hidden around (#1046)
    const [cx, cy] = this.view!.centreChunk;
    this.fight.reset();
    this.fight.hide(this.world!, cx, cy, MAX_REACH);
    this.fight.apply([], enemies, []);
    this.view!.updateEnemies();
    this.dirty = true;
    this.mark(document.body.dataset.openworld!);
  }

  /** Shows the steering mode in the HUD (#1137), and drops a walk when steering is off: called when a world opens and when the
   * Settings item changes. */
  refreshMode(): void {
    if (!this.active) return;
    const on = this.steering();
    if (!on) this.cancelWalk();
    const line = document.getElementById('openworld-mode');
    if (line) line.textContent = on ? 'Steering on: the hero goes round obstacles, tap a far cell to walk there.' : 'Steering off: one step at a time.';
  }

  /** A new window size: the view follows it, and the zoom it may have been clamped to is published (#976). */
  resize(width: number, height: number): void {
    this.view?.snap();
    this.view?.resize(width, height);
    this.dirty = true;
    if (this.active) this.mark(document.body.dataset.openworld!);
  }

  /** An arrow key rolls the hero one cell, or on the diagonal while a vertical and a horizontal arrow are both held;
   * opposite arrows held together do nothing. The first arrow down steps at once, then the held arrows step on their own
   * cadence (`beat`, #1059): the system's key repeat (`repeat`) is ignored. Escape leaves. Reports whether the key was the mode's. */
  key(key: string, repeat = false): boolean {
    if (key === 'Escape') return this.leave(), true;
    this.cancelWalk(); // any key ends a walk to a far cell (#1137)
    if (key === 'r' || key === 'R') return this.turn(DEFAULT_YAW - this.view!.yaw), true; // back to the default angle (#1026)
    const turn = TURNS.get(key);
    if (turn !== undefined) return this.turn(turn), true;
    if (!SCREEN.has(key)) return false;
    if (!repeat) this.arrows(() => this.held.add(key));
    return true;
  }

  /** The camera's yaw round the hero, in radians: the stick reads its drag in it (`heldKeys`). */
  get yaw(): number {
    return this.view!.yaw;
  }

  /** The stick (#1025, #1026) holds the arrows of its drag, none when the thumb lets go: the hero steps by them on the cadence of the
   * held arrows, as by the keys (#1059). Nothing while the mode is off. */
  hold(keys: readonly string[]): void {
    if (!this.active) return;
    if (keys.length > 0) this.route = []; // the stick takes over from a walk to a far cell (#1137)
    this.arrows(() => (this.pad = [...keys]));
  }

  /** Ends a walk to a far cell (#1137): a key, a drag of the camera or the stick. The step under way finishes. */
  cancelWalk(): void {
    if (this.route.length === 0) return;
    this.arrows(() => (this.route = []));
    this.mark(document.body.dataset.openworld!);
  }

  /** Turns the camera by `by` radians round the hero: the Q and E keys, a right-button drag (`orbit`) and a twist. The view eases to
   * the new angle, and the angle is saved with the world (#1026). */
  turn(by: number): void {
    this.view!.turn(by);
    this.dirty = true;
    this.persist();
    this.mark(document.body.dataset.openworld!);
  }

  /** Settles the camera on the nearest resting angle (30 degrees plus a multiple of 60): a drag or a twist turns freely while held, and ends here (#1251, #1254). */
  settle(): void {
    this.turn(restYaw(this.view!.yaw) - this.view!.yaw);
  }

  /** A drag of the right button by `px` pixels to the right turns the camera by ORBIT_PER_PX a px (#1026). */
  orbit(px: number): void {
    this.turn(px * ORBIT_PER_PX);
  }

  /** An arrow key let go; no argument (the window lost focus) lets go of all of them. The walk ends with the last one: the step
   * under way finishes, and no step follows (#1059). */
  release(key?: string): void {
    this.arrows(() => {
      if (key === undefined) {
        this.held.clear();
        this.pad = [];
      } else this.held.delete(key);
    });
  }

  /** A press at `x`, `y` pixels of a `width` x `height` screen rolls the hero onto the cell under it when it is next to it; with
   * steering on, a far cell is walked to, round the obstacles (#1137). */
  press(x: number, y: number, width: number, height: number): void {
    const [nx, ny] = [(x / width) * 2 - 1, 1 - (y / height) * 2];
    const near = this.view!.pick(nx, ny);
    if (!this.steering() || !same(near, this.hero!.at)) return void this.roll(near);
    const target = this.view!.pickGround(nx, ny);
    if (target && !same(target, this.hero!.at) && !neighbours(this.hero!.at).some((n) => same(n, target))) this.walkTo(target);
    else this.roll(near);
  }

  /** Walks the hero to the far cell `to` (#1137): the bridge finds the way round the obstacles, and the hero takes it one cell a
   * glide, at the steady speed of a held walk. Nothing when there is no way. */
  private walkTo(to: Axial): void {
    const hero = this.hero!;
    const lairs = this.lairs.flat();
    const blocked = Int32Array.from([...this.fight.enemiesAround(this.world!, hero.at, PATH_REACH).flat(), ...lairs]);
    const cells = this.path(this.seed, hero.at, to, blocked, flat(this.world!.broken));
    const route = Array.from({ length: cells.length / 2 }, (_, i): Axial => [cells[2 * i]!, cells[2 * i + 1]!]);
    if (route.length > 0) this.arrows(() => (this.route = route));
  }

  /** Zooms the Open world camera by `scale`: more than 1 further out, less than 1 closer (#976). */
  zoom(scale: number): void {
    this.view!.snap();
    this.view!.zoomBy(scale);
    this.dirty = true;
    this.mark(document.body.dataset.openworld!);
  }

  /** Eases the camera toward the hero's column top, then draws the scene when something changed since the last draw (the ease
   * included, until it settles), and every frame while a lake is in view and motion is on. `now` is the frame time in ms. Returns
   * whether it drew: the FPS readout counts the frames really rendered (#1064). */
  frame(render: (scene: THREE.Scene, camera: THREE.Camera) => void, now = performance.now()): boolean {
    if (!this.view) return false; // left: nothing to draw
    this.flush(); // at most one save a frame, of the state the frame ends on (#968)
    const seconds = (now - this.clock) / 1000;
    this.clock = now;
    const reduced = this.reduced();
    if (this.view!.ease(seconds, reduced)) this.dirty = true;
    if (this.view!.easeYaw(seconds, reduced)) this.dirty = true; // the turn eases to its goal, as the height does (#1026)
    this.beat(now); // the held arrows walk on, one step per GLIDE_MS: before the tick, so the step begun is drawn by this frame (#1065)
    if (!this.view) return false; // the step walked onto a lair and left the mode
    if (this.view!.tick(now)) this.dirty = true; // the marbles of a push in between their cells, drawn every frame (#967)
    this.anim();
    if (this.view!.offsets(now)) this.dirty = true; // the camera's punch, pan ease and shake, on top of the follow (#1103)
    const sparks = this.view!.sparkle(now, reduced, this.lowTier()); // the particles of the biome (#1110): they keep the scene live while any drifts
    this.countSparks();
    const moving = !reduced && !this.lowTier() && this.view!.hasWater; // the low tier holds the glow of the lake still: no frame drawn for it (#1234)
    const loops = this.view!.animate(now, reduced || this.lowTier()); // the foam, the ripples and the trees' sway (#1101, #1102)
    this.countMotion();
    if (!this.dirty && !moving && !sparks && !loops) return false;
    this.dirty = false;
    this.view!.glow(moving ? now : 0);
    render(this.view!.scene, this.view!.camera);
    this.view!.drain(); // what this frame replaced is no longer in use by it (#1017)
    return true;
  }

  /** Changes the arrows held, by the keys or by the stick. The first arrow down steps the hero at once, and the cadence starts; no
   * arrow left held stops it (#1059). A second arrow changes the direction on the next step, with no step of its own. */
  private arrows(update: () => void): void {
    const idle = this.idle();
    update();
    if (this.idle()) {
      this.nextStep = Infinity;
      if (!idle) this.stop(performance.now()); // the walk ends: the step under way slows to a rest (#1065)
    } else if (idle) {
      const now = performance.now();
      this.nextStep = now + GLIDE_MS;
      this.stepHeld(now);
    }
  }

  /** The walk stops at `now` (ms), by a release, a blocked step or arrows that cancel: the next step starts from rest, and the glide
   * under way slows to a rest on its cell, on time (#1065). */
  private stop(now: number): void {
    if (this.cruising && !this.reduced()) this.view!.panEnd(now); // the follow settles with the walk (#1103)
    this.cruising = false;
    this.view!.brake(now);
  }

  /** Whether no arrow is held, by a key or by the stick. */
  private idle(): boolean {
    return this.held.size === 0 && this.pad.length === 0 && this.route.length === 0;
  }

  /** The cadence of the held arrows: one step every GLIDE_MS, made by the frame loop at `now` (ms), never by a key repeat (#1059).
   * The schedule keeps its own clock, so a frame late by part of a step does not stretch the walk: the average is one cell per
   * GLIDE_MS, whatever the refresh rate. More than a step behind (a hidden tab), it restarts from the frame. */
  private beat(now: number): void {
    if (now < this.nextStep) return;
    const late = now - this.nextStep > GLIDE_MS;
    // A step is made at its due time, not at the frame that makes it: the glides chain end to end whatever the frame rate (#1065).
    const due = late ? now : this.nextStep;
    this.nextStep = due + GLIDE_MS;
    if (late) this.cruising = false; // a hidden tab: the walk starts again from rest
    this.stepHeld(due);
  }

  /** One step in the direction of the arrows held now (`stepOf`), made at `at` (ms): a blocked one slides round the obstacle (`steerStep`), and leans
   * the hero (`lean`) only when no side is free; arrows that cancel stop the walk. */
  private stepHeld(at: number): void {
    if (this.held.size === 0 && this.pad.length === 0) return this.stepRoute(at);
    const free = ([q, r]: Axial): boolean => {
      const tile = this.world!.tile(q, r);
      return !!tile && (!blocked(tile) || breakable(this.world!, q, r)) && !this.fight.occupied(this.world!, q, r);
    };
    const keys = new Set([...this.held, ...this.pad]);
    const to = this.steering() ? steerStep(this.hero!.at, keys, this.view!.yaw, free) : stepOf(this.hero!.at, keys, this.view!.yaw);
    if (to) this.roll(to, at, this.cruising ? 'walk' : 'start');
    else this.stop(at);
  }

  /** The next cell of the walk to a far cell (#1137), at `at` (ms), by the same `Hero.step` as any step: a refused step ends the walk,
   * and so does its last cell. */
  private stepRoute(at: number): void {
    const to = this.route.shift()!;
    const moved = this.roll(to, at, this.cruising ? 'walk' : 'start');
    if (!moved) this.route = [];
    if (this.route.length > 0) return;
    if (this.active) this.mark(document.body.dataset.openworld!);
    this.nextStep = Infinity;
    if (moved) this.stop(at);
  }

  /** The hero steps to `to`, at `at` (ms); `pace` is the pace of its glide: a `tap` (a press on the screen) eases out, the steps of
   * the held arrows keep one speed (#1065). */
  private roll(to: Axial, at = performance.now(), pace: Pace = 'tap'): boolean {
    const lair = this.lairs.findIndex((cell) => same(cell, to));
    if (lair >= 0 && neighbours(this.hero!.at).some((n) => same(n, to))) return this.enterLair(lair), false;
    const from = this.hero!.at;
    if (!this.hero!.step(to)) return this.lean(to, at), false;
    if (pace === 'start' && !this.reduced()) this.view!.panFor(from, to, at); // the follow eases in at the first step of a walk (#1103)
    this.cruising = pace !== 'tap';
    if (this.hero!.smashed) this.view!.smash(to, this.hero!.smashed, at, this.reduced()); // an obstacle broken on the way (#1147)
    this.view!.snap(); // a step during a push's animation ends it first (#967)
    const now = this.reduced() ? null : at;
    if (now !== null) this.view!.puff(now); // dust from the cell it leaves (#1110)
    if (now !== null) this.view!.ripple(from, this.hero!.at, now, this.lowTier()); // a ring on the water next to it (#1101)
    this.view!.show(this.hero!.at, this.hero!.troop, now === null ? undefined : { now, span: GLIDE_MS * slowBy(), pace }); // the step glides (#1040)
    const played = this.troopPush();
    this.view!.updateEnemies();
    if (played && now !== null) {
      this.view!.playPush(played, now, slowBy()); // the push lunges once the step has landed
      const landed = now + GLIDE_MS * slowBy();
      this.view!.punch(landed); // the camera feels the push (#1103)
      if (played.push.ejected.length > 0) this.view!.shake(landed); // and shakes when an enemy is ejected
    } else if (played) this.view!.show(this.hero!.at, this.hero!.troop); // reduced motion: the marbles jump
    this.dirty = true;
    this.persist();
    this.mark(document.body.dataset.openworld!);
    return true;
  }

  /** The hero walks onto the lair `lair` (#1170): the world is saved with the hero on the lair's entrance, the cell it came from, and
   * left; the page starts the boss fight. */
  private enterLair(lair: number): void {
    const seed = this.seed;
    this.persist();
    this.leave();
    this.onLair(seed, lair);
  }

  /** A blocked step leans the hero toward the cell it cannot take, and back: nothing under reduced motion (#1040). */
  private lean(to: Axial, at: number): void {
    this.stop(at);
    if (!this.reduced()) this.view!.nudge(this.hero!.at, to, at, NUDGE_MS * slowBy());
  }

  /** The troop's attack after a step: the bridge plays the legal push, if there is one, on the hero, the troop and the enemies near
   * the hero. The hero and the troop take the cells it gives (the hero's first), the enemies are kept in the fight. Returns the push
   * as it was played, from the cells before it, for its animation; `null` when no push was legal. */
  private troopPush(): Played | null {
    const enemies = this.enemies();
    const from = [this.hero!.at, ...this.hero!.troop];
    const pushed = readPush(this.push(this.seed, flat(from), flat(enemies), flat(this.world!.broken)));
    if (!pushed) return null;
    this.fight.apply(enemies, pushed.enemies, pushed.ejected);
    const [hero, ...troop] = pushed.troop;
    this.hero!.at = hero!;
    this.hero!.troop = troop;
    this.pushes++;
    return { from, foes: enemies, push: pushed };
  }

  /** Marks the world as changed: it is saved by the next frame, or when the mode is left. */
  private persist(): void {
    this.unsaved = true;
  }

  /** Saves the world as it is now, when it changed since the last save. The write is not waited for: a storage that fails is no
   * game error, and the save is counted (`openworldSaved`) only once it is stored. */
  private flush(): void {
    if (!this.unsaved) return;
    this.unsaved = false;
    const { at, troop } = this.hero!;
    void this.saves.put(this.seed, at, troop, this.fight, this.view!.yaw, this.world!.broken, this.beaten).then((stored) => {
      if (stored) document.body.dataset.openworldSaved = String(++this.writes);
    });
  }

  /** The mark of a push being drawn (`openworldAnim`, for the browser checks): set while the view draws it, removed otherwise. */
  private anim(): void {
    if (this.view?.animating) document.body.dataset.openworldAnim = '1';
    else delete document.body.dataset.openworldAnim;
    // The mark of a glide (#1040), for the browser checks only: the hero's drawn place while its marbles move, removed once they land.
    if (!navigator.webdriver) return;
    if (this.view?.gliding) document.body.dataset.openworldGlide = `${this.view.focusPoint.x.toFixed(2)},${this.view.focusPoint.z.toFixed(2)},${this.view.heroY.toFixed(3)}`;
    else delete document.body.dataset.openworldGlide;
  }

  /** Whether the page is on the low quality tier, where the effects of the water and the trees are off (#1101). */
  private lowTier(): boolean {
    return document.body.dataset.tier === 'low';
  }

  /** What moves (`openworldMotion`: `water`, `trees`, both or empty), for the browser checks only. */
  private countMotion(): void {
    if (!navigator.webdriver) return;
    if (document.body.dataset.openworldMotion !== this.view!.alive) document.body.dataset.openworldMotion = this.view!.alive;
  }

  /** The particles drawn (`openworldParticles`), for the browser checks only: written when the count changes. */
  private countSparks(): void {
    if (!navigator.webdriver) return;
    const count = String(this.view!.sparkCount);
    if (document.body.dataset.openworldParticles !== count) document.body.dataset.openworldParticles = count;
  }

  private mark(seed: string): void {
    this.anim();
    document.body.dataset.openworld = seed;
    const shown = document.getElementById('openworld-seed'); // the HUD's seed, to read or share (#1021)
    if (shown) shown.textContent = seed;
    document.body.dataset.openworldAt = this.hero!.at.join(',');
    document.body.dataset.openworldTroop = this.hero!.troop.map((c) => c.join(',')).join(' ');
    document.body.dataset.openworldEnemies = String(this.view!.enemyCount);
    document.body.dataset.openworldBeaten = String(this.fight.beaten);
    document.body.dataset.openworldPush = String(this.pushes);
    document.body.dataset.openworldZoom = String(this.view!.zoom);
    document.body.dataset.openworldRoute = String(this.route.length); // the cells of a walk to a far cell still to take (#1137)
    document.body.dataset.openworldBroken = String(this.world!.broken.length); // the obstacles broken (#1147)
    document.body.dataset.openworldLairs = this.lairs.map((c) => c.join(',')).join(' ');
    document.body.dataset.openworldLairsBeaten = this.beaten.join(' ');
    document.body.dataset.openworldYaw = String(Math.round((this.view!.yaw * 180) / Math.PI)); // the turn, in degrees (#1026)
    document.body.dataset.openworldDrawn = JSON.stringify(this.view!.drawn);
  }
}
