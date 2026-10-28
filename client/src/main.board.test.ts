// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { encodeMove, groupTargets, moveForClick, parseMoves, type Axial } from './board';
import { RIM_LIGHT } from './frame';
import { generateKeys } from './moverecord';
import { OnlineSession } from './session';
import { BOSS_IDS } from './tally';
import { boot, type Game } from './test/harness';

// The board drawing and the HUD of main.ts (#451): the materials and skins, the steel frame and its rim light, the
// boss phase notches, the tally marks, refresh, the ghosts and the HUD plate, with their browser hooks. The scene the
// page draws is caught when main.ts builds it, so a test reads what the renderer would draw.

type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/** Catches the scene main.ts builds: call before boot. */
function catchScene(): () => THREE.Scene {
  let scene: THREE.Scene | null = null;
  const add = THREE.Object3D.prototype.add;
  const spy = vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    if (this instanceof THREE.Scene && this.name === 'abalone-scene') scene = this;
    else if (this instanceof THREE.Scene && !scene) scene = this;
    return add.apply(this, objects);
  });
  onTestFinished(() => spy.mockRestore());
  return () => scene!;
}

/** The parts of the drawn scene: the groups follow the steel frame (plate, near rim, far rim) in the order main.ts
 * adds them. */
function parts(scene: THREE.Scene) {
  const meshes = scene.children.filter((c): c is Mesh => c instanceof THREE.Mesh);
  const [plate, near, far] = meshes.filter((m) => m.geometry instanceof THREE.ExtrudeGeometry);
  const at = scene.children.indexOf(far!);
  const [notches, tally1, tally2, marbles, ghosts] = scene.children.slice(at + 1, at + 6) as THREE.Group[];
  const discs = meshes.filter((m) => m.geometry instanceof THREE.CylinderGeometry);
  const spheres = (group: THREE.Object3D): Mesh[] =>
    group.children.filter((c): c is Mesh => c instanceof THREE.Mesh && c.geometry instanceof THREE.SphereGeometry);
  return {
    plate: plate!,
    near: near!,
    far: far!,
    notches: notches!,
    tallies: [tally1!, tally2!],
    marbles: marbles!,
    ghosts: ghosts!,
    discs,
    spheres,
  };
}

/** The marbles drawn on the board: the shells (MeshStandardMaterial) or the glass (MeshPhysicalMaterial). */
const isGlass = (m: Mesh): boolean => m.material instanceof THREE.MeshPhysicalMaterial;
function drawn(scene: THREE.Scene): { shells: Mesh[]; glass: Mesh[] } {
  const { marbles, spheres } = parts(scene);
  return { shells: spheres(marbles).filter((m) => !isGlass(m)), glass: spheres(marbles).filter(isGlass) };
}

/** Plays one move of the side to move by two clicks: the marble on `from` (the first single-marble move when none)
 * one step toward `to` (its first target when none). Returns the two cells. The slide ends before it returns. */
function step(game: Game, from?: Axial, to?: Axial): [Axial, Axial] {
  const cell = from ?? game.hook<{ cells: Axial[] }[]>('__legal').find((m) => m.cells.length === 1)!.cells[0]!;
  game.click(...cell);
  const target = to ?? game.hook<{ cell: Axial }[]>('__targets')[0]!.cell;
  game.click(...target);
  game.frame(2000);
  return [cell, target];
}

type Play = (from?: Axial, to?: Axial) => Promise<[Axial, Axial]>;

/** Plays a marble of each side out and back twice: the start position comes back a third time, a draw. */
async function repeat(black: Play, white: Play): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const [b, bt] = await black();
    const [w, wt] = await white();
    await black(bt, b);
    await white(wt, w);
  }
}
const both = (game: Game): Play => async (from, to) => step(game, from, to);

function setting(id: string): void {
  document.getElementById(`setting-${id}`)!.click();
}

function startBoss(game: Game, id: (typeof BOSS_IDS)[number]): void {
  game.openModes();
  document.getElementById('boss-fight')!.click();
  (document.getElementById('boss-list')!.children[BOSS_IDS.indexOf(id)] as HTMLButtonElement).click();
}

/** Moves the pointer over a cell of the board, or off it when `cell` is null. */
function hoverOver(game: Game, cell: Axial | null): void {
  const { x, y } = cell ? game.hook<{ x: number; y: number }>('__cellToScreen', ...cell) : { x: 1, y: 1 };
  document.querySelector('body > canvas')!.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
}

/** Lets the page work until `done` holds: crypto and the bot answer on later tasks. */
async function until(game: Game, done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i++) await game.settle();
  expect(done()).toBe(true);
}

describe('main.ts board and HUD', () => {
  it('lights the deck with the key lamp and its accents, and sets the dim bulkhead frame far behind the board', async () => {
    const scene = catchScene();
    await boot('?bot=off');
    const lights = scene().children.filter((c) => c instanceof THREE.Light);
    expect(lights.map((l) => l.type)).toEqual(['AmbientLight', 'DirectionalLight', 'DirectionalLight', 'PointLight']);
    const decor = scene().children.find(
      (c) => c instanceof THREE.Group && c.children.length > 0 && c.children.every((m) => m instanceof THREE.Mesh && m.geometry instanceof THREE.BoxGeometry),
    )!;
    expect(decor.children.every((part) => part.position.z === -23.2)).toBe(true);
  });

  it('dresses the cells, the frame and the enemy shells in the loaded textures, the glass with its core', async () => {
    const scene = catchScene();
    await boot('?bot=off');
    const { discs, plate, near } = parts(scene());
    expect(discs).toHaveLength(91); // the 61, then ring 5 for The Ballast Mind (#564)
    expect(discs.filter((d) => d.visible)).toHaveLength(61);
    expect(discs[0]!.material.map).toBeInstanceOf(THREE.Texture);
    expect(discs[0]!.material.normalMap).toBeInstanceOf(THREE.Texture);
    // The cell beds keep the deck texture's own colour and stay matte: a dark metal tint turned them black, and the
    // marbles no longer read 3:1 against them (#787).
    expect(discs[0]!.material.color.getHex()).toBe(0xffffff);
    expect(discs[0]!.material.metalness).toBe(0);
    expect(plate.material.map).toBeInstanceOf(THREE.Texture);
    expect(near.material.map).toBeInstanceOf(THREE.Texture);
    const { shells, glass } = drawn(scene());
    expect([shells.length, glass.length]).toEqual([14, 14]);
    expect(shells[0]!.material.normalMap).toBeInstanceOf(THREE.Texture); // the scarab ridges
    expect(shells[0]!.children).toHaveLength(0);
    expect(glass[0]!.children).toHaveLength(1); // its cyan core
  });

  it('draws The Ballast Mind on its radius 5 board (#564): 85 discs round six void pillars, a frame of radius 5', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    const shown = (): number => parts(scene()).discs.filter((d) => d.visible).length;
    startBoss(game, 'ballast');
    expect(shown()).toBe(85);
    expect(game.hook('__frame')).toMatchObject({ radius: 5, holes: 6 });
    const { shells, glass } = drawn(scene());
    expect(shells.length + glass.length).toBe(30);
    // A marble of ring 5 moves by two clicks, like any other.
    const ring5 = game.hook<{ cells: Axial[] }[]>('__legal').find((m) => m.cells.length === 1 && Math.abs(m.cells[0]![0]) === 5)!;
    step(game, ring5.cells[0]);
    expect(game.hook('__plies')).toBe(1);
    startBoss(game, 'echo'); // back on 61 cells, ring 5 hides again
    expect(shown()).toBe(61);
    expect(game.hook('__frame')).toMatchObject({ radius: 4, holes: 0 });
  });

  it('swaps the cells normal map with the albedo on a deck change (#440)', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    const { discs } = parts(scene());
    const initialNormal = discs[0]!.material.normalMap;
    expect(initialNormal).toBeInstanceOf(THREE.Texture);
    game.hook('__deck', 'cargo');
    await vi.waitFor(() => expect(discs[0]!.material.normalMap).not.toBe(initialNormal));
    expect(discs[0]!.material.normalMap).toBeInstanceOf(THREE.Texture);
  });

  it('disables airborne particles under automation by default (#443)', async () => {
    const scene = catchScene();
    await boot('?bot=off', { webdriver: true });
    const points = scene().children.find((c): c is THREE.Points => c instanceof THREE.Points);
    expect(points?.visible ?? false).toBe(false);
  });

  it('draws airborne particles outside the board volume per deck, off under clear board (#443)', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off', { webdriver: false });
    const points = scene().children.find((c): c is THREE.Points => c instanceof THREE.Points)!;
    expect(points).toBeDefined();
    expect(points.visible).toBe(true);

    // Every particle position is outside the board volume (never over a cell or marble)
    const pos = points.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const dist = Math.hypot(x, z);
      expect(dist >= 5.0 || y > 2.0 || y < -0.3, `particle ${i} at (${x}, ${y}, ${z}) inside board`).toBe(true);
    }

    // Switching to Bridge (which has 0 particles): visible becomes false
    game.hook('__deck', 'bridge');
    await vi.waitFor(() => expect(points.visible).toBe(false));

    // Switching back to Mess: visible becomes true
    game.hook('__deck', 'mess');
    await vi.waitFor(() => expect(points.visible).toBe(true));

    // Toggling clear board: particles turn off
    game.openSettings();
    document.getElementById('setting-clear-board')!.click();
    await vi.waitFor(() => expect(points.visible).toBe(false));
  });

  it('keeps the flat steel look when the textures fail to load', async () => {
    // A texture made by the loader cannot take its colour space: the load fails as a missing file would.
    onTestFinished(() => void Reflect.deleteProperty(THREE.Texture.prototype, 'colorSpace'));
    Object.defineProperty(THREE.Texture.prototype, 'colorSpace', {
      configurable: true,
      set(value: string) {
        if (new Error().stack!.includes('loadAsync')) throw new Error('no such file');
        Object.defineProperty(this, 'colorSpace', { value, writable: true, configurable: true, enumerable: true });
      },
    });
    const scene = catchScene();
    const game = await boot('?bot=off');
    const { discs, plate, near } = parts(scene());
    expect(discs[0]!.material.map).toBeNull();
    expect(discs[0]!.material.normalMap).toBeNull();
    expect(discs[0]!.material.color.getHex()).toBe(0x4a5258);
    expect(plate.material.map).toBeNull();
    expect(near.material.map).toBeNull();
    expect(drawn(scene()).shells[0]!.material.normalMap).toBeNull();
    expect(game.hook('__frame')).toMatchObject({ drawn: true });
  });

  it('dresses the Black shells in the next skin at each press, glowing skins lit, a seen skin reused', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    const black = (): Mesh => drawn(scene()).shells[0]!;
    const scarab = black().material;
    game.openSettings();
    setting('shell-skin'); // Obsidian
    expect(black().material).not.toBe(scarab);
    expect(black().material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(black().material.emissiveMap).toBeNull();
    setting('shell-skin'); // Slag crust glows
    expect(black().material.emissiveMap).toBe(black().material.map);
    expect(black().material.emissiveIntensity).toBe(0.4);
    for (let i = 0; i < 8; i++) setting('shell-skin'); // round to Scarab ridges
    expect(black().material).toBe(scarab);
    setting('shell-skin');
    const obsidian = black().material;
    for (let i = 0; i < 10; i++) setting('shell-skin');
    expect(black().material).toBe(obsidian);
  });

  it('dresses the glass in the next glass skin at each press, its pattern and its own core light', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    const white = (): Mesh => drawn(scene()).glass[0]!; // local play: White wears the glass
    const core = (): number => (white().children[0] as Mesh).material.color.getHex();
    const smoked = white().material;
    const cyan = core();
    expect(smoked.map).toBeNull();
    game.openSettings();
    setting('glass-skin'); // Frost: its pattern on a white base
    expect(white().material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(white().material.color.getHex()).toBe(0xffffff);
    expect(core()).toBe(cyan);
    for (let i = 0; i < 5; i++) setting('glass-skin'); // Lantern core lights its own core
    expect(core()).toBe(0xf2c27a);
    for (let i = 0; i < 4; i++) setting('glass-skin'); // round to Smoked glass
    expect(white().material).toBe(smoked);
    expect(core()).toBe(cyan);
  });

  it('dims the cyan core a step per marble lost, the same after a reload, never dark, full on a new game (#506)', async () => {
    const indexedDB = new IDBFactory();
    const scene = catchScene();
    const game = await boot('?nodes=100', { indexedDB });
    const core = (): THREE.Material => (drawn(scene()).glass[0]!.children[0] as Mesh).material;
    expect(document.body.dataset.core).toBe('1.00');
    expect(core().opacity).toBe(1);
    await game.hook<Promise<number>>('__playTurns', 20, [4]); // the player marches one way, the bot pushes two off
    expect(game.hud()).toContain('Black ejected 2/6');
    expect(document.body.dataset.core).toBe('0.80');
    expect(core().opacity).toBeCloseTo(0.8, 10);
    step(game); // a move of the player's own, saved with the hook's plies before it
    await game.settle();
    const again = await boot('?nodes=100', { indexedDB });
    expect(again.hook('__plies')).toBe(42);
    expect(again.hud()).toContain('Black ejected 3/6'); // the bot's reply pushed one more off
    expect(document.body.dataset.core).toBe('0.70');
    expect(core().opacity).toBeCloseTo(0.7, 10);
    await again.hook<Promise<number>>('__playTurns', 10, [4]); // three more off: the game is lost
    expect(again.hud()).toContain('Black ejected 6/6');
    expect(document.body.dataset.core).toBe('0.40');
    document.getElementById('new-game')!.click();
    document.getElementById('new-game')!.click(); // confirmed
    expect(document.body.dataset.core).toBe('1.00');
    expect(core().opacity).toBe(1);
  });

  it('draws the frame round the board and lights the rim at the end of the side to move', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    expect(game.hook('__frame')).toEqual({ radius: 4, holes: 0, drawn: true, lit: { near: RIM_LIGHT.shell, far: 0 } });
    expect(document.body.dataset.rim).toBe('near');
    const before = parts(scene()).plate.geometry;
    step(game);
    expect(game.hook('__frame')).toMatchObject({ lit: { near: 0, far: RIM_LIGHT.glass } });
    expect(document.body.dataset.rim).toBe('far');
    expect(parts(scene()).plate.geometry).toBe(before); // the same board: the frame is not rebuilt
  });

  it('puts the rim light out and shows the end banner once the game is drawn', async () => {
    const game = await boot('?bot=off');
    expect(document.body.dataset.over).toBeUndefined();
    await repeat(both(game), both(game));
    expect(document.body.dataset.over).toBe('draw');
    expect(document.body.dataset.rim).toBe('off');
    expect(game.hook('__frame')).toMatchObject({ lit: { near: 0, far: 0 } });
    expect(game.hud()).toContain('Draw');
  });

  it('scratches a tally mark per marble lost, and ends a lost game on the banner and the score', async () => {
    const game = await boot('?nodes=100');
    await game.hook<Promise<number>>('__playTurns', 30, [4]); // the player marches one way, the bot pushes six off
    expect(document.body.dataset.over).toBe('loss');
    expect(game.hud()).toContain('You lose');
    expect(game.hud()).toContain('White ejected 0/6 · Black ejected 6/6');
    expect(game.hook('__tally')).toEqual([
      { marked: 6, slots: 6 },
      { marked: 0, slots: 6 },
    ]);
  });

  it('draws no phase notch outside a boss fight, and the phase notches and threshold glyph in one', async () => {
    const game = await boot('?bot=off');
    expect(game.hook('__notches')).toEqual({ lit: 0, dark: 0, glyph: false });
    startBoss(game, 'echo');
    const notches = game.hook<{ lit: number; dark: number; glyph: boolean }>('__notches');
    expect(notches.glyph).toBe(true);
    expect(notches.lit + notches.dark).toBeGreaterThan(0);
  });

  it('scratches six tally slots per side in a 1v1 and in The Choir', async () => {
    const game = await boot('?bot=off');
    expect(game.hook('__tally')).toEqual([
      { marked: 0, slots: 6 },
      { marked: 0, slots: 6 },
    ]);
    startBoss(game, 'choir');
    expect(game.hook('__tally')).toEqual([
      { marked: 0, slots: 6 },
      { marked: 0, slots: 6 },
    ]);
  });

  it('counts in the hooks only what the scene draws', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    startBoss(game, 'echo');
    const { notches, tallies, plate } = parts(scene());
    scene().remove(notches, ...tallies);
    expect(game.hook('__notches')).toEqual({ lit: 0, dark: 0, glyph: false });
    expect(game.hook('__tally')).toEqual([
      { marked: 0, slots: 0 },
      { marked: 0, slots: 0 },
    ]);
    plate.visible = false;
    expect(game.hook('__frame')).toMatchObject({ drawn: false });
  });

  it('gives each marble its own turn, carried by its slide, and the first turns back in a new game', async () => {
    const game = await boot('?bot=off');
    const cell = game.hook<{ cells: Axial[] }[]>('__legal').find((m) => m.cells.length === 1)!.cells[0]!;
    const start = game.hook<number[]>('__marbleTurn', ...cell);
    expect(start).toHaveLength(4);
    const [, to] = step(game, cell);
    expect(game.hook('__marbleTurn', ...cell)).toBeNull(); // an empty cell
    expect(game.hook('__marbleTurn', ...to)).not.toEqual(start); // rolled on its way
    const newGame = document.getElementById('new-game')!;
    newGame.click();
    newGame.click(); // confirmed
    expect(game.hook('__plies')).toBe(0);
    expect(game.hook('__marbleTurn', ...cell)).toEqual(start);
  });

  it('draws the hovered move as ghost marbles, and none off the board', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off');
    const mv = game.hook<{ cells: Axial[] }[]>('__legal').find((m) => m.cells.length === 1)!;
    game.click(...mv.cells[0]!);
    const target = game.hook<{ cell: Axial }[]>('__targets')[0]!.cell;
    hoverOver(game, target);
    const ghosts = parts(scene()).ghosts;
    expect(document.body.dataset.ghosts).toBe('1');
    expect(ghosts.children).toHaveLength(1);
    hoverOver(game, target); // the same cell: nothing to redraw
    expect(ghosts.children).toHaveLength(1);
    hoverOver(game, null);
    expect(document.body.dataset.ghosts).toBe('0');
    expect(ghosts.children).toHaveLength(0);
  });

  it("shows Tally's line of the mode at the start of a match, gone after the first move", async () => {
    const local = await boot('?bot=off');
    expect(local.hud()).toContain('Mess: two crews, one table. Ledger open.');
    step(local);
    expect(local.hud()).not.toContain('Ledger open');
    const bot = await boot('?nodes=1');
    expect(bot.hud()).toContain('Mess: one seat filled. The other is counted.');
    startBoss(bot, 'hull');
    expect(bot.hud()).toContain('Hull: rim on file.');
    await bot.settle(); // the bot's pending answers arrive before the test ends
  });

  it('adds the flat HUD to the plate while its setting is on', async () => {
    const game = await boot('?bot=off');
    const plain = game.hud();
    expect(plain).not.toContain('Turn: Black');
    game.openSettings();
    setting('flat-hud');
    expect(game.hud()).toContain('Turn: BlackEjected: Black 0/6, White 0/6');
    setting('flat-hud');
    expect(game.hud()).toBe(plain);
  });

  it('opens holes in the frame where The Hull makes cells vanish', async () => {
    const scene = catchScene();
    const game = await boot('?nodes=1');
    startBoss(game, 'hull');
    await game.hook<Promise<number>>('__playTurns', 6, [0, 1, 2, 3, 4, 5]); // a crack at ply 8, its cell gone at ply 11
    const vanished = Number(document.body.dataset.vanished);
    expect(vanished).toBeGreaterThan(0);
    expect(game.hook('__frame')).toMatchObject({ holes: vanished, drawn: true });
    expect(parts(scene()).discs.filter((d) => !d.visible)).toHaveLength(vanished + 30); // ring 5 is off this board (#564)
    await game.settle();
  });

  it('shows the online mode on the plate, and the rematch asks once an online game is over', async () => {
    const game = await boot('?bot=off');
    document.getElementById('play-online')!.click();
    await until(game, () => document.body.dataset.seat === 'player');
    expect(game.hud()).toContain('Link: two crews, one ledger. Both counted.');
    // The opponent: a second session on the other end of the room, with its own engine.
    const { Engine, engine_version } = await import('abalone-wasm');
    const theirs = new Engine();
    const them = new OnlineSession({
      game: game.room()!,
      side: 2,
      engine: engine_version(),
      keys: await generateKeys(),
      transport: game.peer()!,
      judge: {
        to_move: () => theirs.to_move(),
        play: (mv) => theirs.play(mv),
        status: () => theirs.status(),
        restart: () => {},
      },
      onMove: () => {},
      onRefuse: () => {},
    });
    await until(game, () => document.body.dataset.opponent === 'here');
    const rematch = document.getElementById('rematch')!;
    expect(rematch.hidden).toBe(true);
    const white: Play = async (from, to) => {
      const moves = parseMoves(theirs.legal_moves());
      const cell = from ?? moves.find((m) => m.cells.length === 1)!.cells[0]!;
      const target = to ?? groupTargets(moves, [cell])[0]!.cell;
      const record = encodeMove(moveForClick(moves, [cell], target)!);
      const plies = game.hook<number>('__plies');
      theirs.play(Int32Array.from(record));
      await them.send(record);
      await until(game, () => game.hook<number>('__plies') === plies + 1);
      game.frame(2000);
      return [cell, target];
    };
    const black: Play = async (from, to) => {
      const cells = step(game, from, to);
      await until(game, () => theirs.to_move() === 2); // our move reached them
      return cells;
    };
    await repeat(black, white);
    expect(document.body.dataset.over).toBe('draw');
    expect(rematch.hidden).toBe(false);
    rematch.click();
    await until(game, () => game.hud().includes('You asked for a rematch. Waiting for White...'));
  });

  it('shows the online mode to a player invited in a room, still waiting for a seat', async () => {
    const game = await boot('?bot=off#room=abcdefgh');
    await until(game, () => document.body.dataset.seat === 'pending');
    expect(game.room()).toBe('abcdefgh');
    expect(game.hud()).toContain('Link: two crews, one ledger. Both counted.');
  });

  it('draws target arrows without adding dynamic PointLights to avoid shader recompilation stalls (#777)', async () => {
    const game = await boot('?bot=off');
    const legal = game.hook<{ cells: Axial[] }[]>('__legal');
    const marble = legal.find((m) => m.cells.length === 1)!.cells[0]!;
    game.click(...marble);
    const targets = game.hook<{ cell: Axial }[]>('__targets');
    expect(targets.length).toBeGreaterThan(0);
    const marbles = game.hook<THREE.Group>('__marbles');
    const lights = marbles.children.filter((child) => child instanceof THREE.PointLight);
    expect(lights.length).toBe(0);
  });

  it('draws the target arrows dark on their luminous ring, so they read 3:1 on the lit cells (#787)', async () => {
    const game = await boot('?bot=off');
    const legal = game.hook<{ cells: Axial[] }[]>('__legal');
    game.click(...legal.find((m) => m.cells.length === 1)!.cells[0]!);
    const arrow = game.hook<THREE.Group>('__marbles').children.find(
      (child) => child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial,
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    expect(arrow!.material.color.getHex()).toBe(0x0b0d0f);
  });
});
