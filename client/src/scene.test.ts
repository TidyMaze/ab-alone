// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { RADIUS, VANISHED, cellIndex } from './board';
import { resetView, type View } from './camera';
import { DECK_PARTICLES } from './deck';
import { DECKS } from './light';
import { DECK_ATMOSPHERES } from './roomloader';
import BloomNode from 'three/addons/tsl/display/BloomNode.js';
import { TONAL } from './look';
import { BOARD_LOOKS, TERRACE_LOOK, terraceDeckLook, terraceSpaceLook } from './boardlook';
import { DECK_KEY, NEON, NEON_GLOW, NEON_LIGHT, neonGlow, neonMaterial, neonSkyOf, neonSunPosition, runKey } from './neonlook';
import { TERRACE_EXPOSURE } from './tablezero';
import { ACT_SPACE, BOSS_SPACE } from './bossspace';
import { DECK_PROPS, deckPropColour, deckPropGeometry, deckPropSpot } from './deckprop';
import { createBloomPipeline, FRAME_LOOK, SceneRenderer, TERRACE_CONTRAST, type NotchRow } from './scene';

const ACT1 = { act: 0, elite: false }; // a plain fight of act 1 of a run (#1554)

function createMockRenderer(): THREE.WebGPURenderer {
  const canvas = document.createElement('canvas');
  return {
    domElement: canvas,
    backend: { isWebGPUBackend: false },
    toneMapping: 0,
    toneMappingExposure: 1,
    shadowMap: { enabled: false, type: 0 },
    init: async (): Promise<void> => {},
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    setAnimationLoop: vi.fn(),
  } as unknown as THREE.WebGPURenderer;
}

describe('SceneRenderer (#632)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the last matrices of a hidden object, which nothing draws, until it is shown (#885)', () => {
    const { scene } = new SceneRenderer({ renderer: createMockRenderer(), innerWidth: 1000, innerHeight: 800 });
    const [shown, hidden] = [new THREE.Group(), new THREE.Group()];
    const held = new THREE.Mesh();
    hidden.add(held);
    hidden.visible = false;
    scene.add(shown, hidden);
    for (const o of [shown, hidden, held]) o.position.x = 1;
    scene.updateMatrixWorld();
    expect(shown.matrixWorld.elements[12]).toBe(1);
    expect([hidden.matrixWorld.elements[12], held.matrixWorld.elements[12]]).toEqual([0, 0]);
    hidden.visible = true;
    scene.updateMatrixWorld();
    expect([hidden.matrixWorld.elements[12], held.matrixWorld.elements[12]]).toEqual([1, 2]);
  });

  it('constructs scene, camera, lights, mesh pools and groups', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({
      renderer,
      innerWidth: 1000,
      innerHeight: 800,
      backdrop: new THREE.Texture(),
      deckAlbedo: new THREE.Texture(),
      deckRoughness: new THREE.Texture(),
    });

    expect(sr.scene).toBeInstanceOf(THREE.Scene);
    expect(sr.scene.name).toBe('abalone-scene');
    expect(sr.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(sr.renderer).toBe(renderer);
    expect(sr.backend).toBe('WebGL2');

    // Meshes and groups
    expect(sr.plate).toBeInstanceOf(THREE.Mesh);
    expect(sr.rim.near).toBeInstanceOf(THREE.Mesh);
    expect(sr.rim.far).toBeInstanceOf(THREE.Mesh);
    expect(sr.roomDeck).toBeInstanceOf(THREE.Mesh);
    expect(sr.propsGroup).toBeInstanceOf(THREE.Group);
    expect(sr.notches).toBeInstanceOf(THREE.Group);
    expect(sr.tallies[0]).toBeInstanceOf(THREE.Group);
    expect(sr.tallies[1]).toBeInstanceOf(THREE.Group);
    expect(sr.marbles).toBeInstanceOf(THREE.Group);
    expect(sr.ghosts).toBeInstanceOf(THREE.Group);
    expect(sr.arenaMarbles).toBeInstanceOf(THREE.Group);
    expect(sr.particles).toBeInstanceOf(THREE.Points);
  });

  it('holds as many particles as the busiest deck draws (#880)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    expect(sr.particlePositions.length / 3).toBe(Math.max(...Object.values(DECK_PARTICLES).map((p) => p.count)));
  });

  it('adds no light of its own: the room\'s tubes light the board, no ambient light (#877)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const lights: THREE.Light[] = [];
    sr.scene.traverse((o) => void ((o as THREE.Light).isLight && lights.push(o as THREE.Light)));
    expect(lights.every((l) => l.parent === sr.terrace)).toBe(true); // the terrace's sun and hemisphere only (#1314), hidden in the room
    expect(lights.map((l) => l.type).sort()).toEqual(['DirectionalLight', 'HemisphereLight']);
  });

  it('takes the deck maps once they load, the plate and the rim as the look built with them, and leaves them flat without both (#1603)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const albedo = new THREE.Texture();
    const roughness = new THREE.Texture();
    const plate = sr.plate.material as THREE.MeshStandardMaterial;
    const rims = [sr.rim.near, sr.rim.far].map((rim) => rim.material as THREE.MeshStandardMaterial);
    sr.setDeckMaps(null, roughness);
    sr.setDeckMaps(albedo, null);
    expect([plate.map, ...rims.map((m) => m.map)]).toEqual([null, null, null]);
    sr.setDeckMaps(albedo, roughness);
    expect([plate.map, plate.roughnessMap, plate.roughness, plate.color.getHex()]).toEqual([albedo, roughness, 1, FRAME_LOOK.plate]);
    for (const m of rims) expect([m.map, m.roughnessMap, m.roughness, m.color.getHex()]).toEqual([albedo, roughness, 1, FRAME_LOOK.rim]);
  });

  it('draws the plate and the rim as flat tonal materials in the tonal look, whatever maps it is given (#1138)', () => {
    const map = new THREE.Texture();
    const sr = new SceneRenderer({ renderer: createMockRenderer(), plateAlbedo: map, rimAlbedo: map, tonal: true });
    expect(sr.plate.material.color.getHex()).toBe(TONAL.plate);
    expect(sr.plate.material.map).toBeNull();
    expect(sr.plate.material.emissive.getHex()).toBe(TONAL.plate); // lit from within (look.ts GLOW)
    expect(sr.rim.near.material.color.getHex()).toBe(TONAL.cell);
    expect(sr.rim.near.material.map).toBeNull();
  });

  it('binds alien plate PBR textures to plate and rim when provided (#771)', () => {
    const renderer = createMockRenderer();
    const plateAlbedo = new THREE.Texture();
    const plateRoughness = new THREE.Texture();
    const plateNormal = new THREE.Texture();
    const sr = new SceneRenderer({
      renderer,
      plateAlbedo,
      plateRoughness,
      plateNormal,
    });
    expect(sr.plate.material.map).toBe(plateAlbedo);
    expect(sr.plate.material.roughnessMap).toBe(plateRoughness);
    expect(sr.plate.material.normalMap).toBe(plateNormal);
    expect(sr.plate.material.color.getHex()).toBe(FRAME_LOOK.plateTiles); // dark enough for the cell edges' 3:1 (#787)
    expect(sr.rim.near.material.metalness).toBe(0.65);

    const srNoNormal = new SceneRenderer({
      renderer,
      plateAlbedo,
      plateRoughness: null,
      plateNormal: null,
    });
    expect(srNoNormal.plate.material.normalMap).toBeNull();
    expect(srNoNormal.plate.material.roughnessMap).toBeNull();

    const rimAlbedo = new THREE.Texture();
    const rimRoughness = new THREE.Texture();
    const rimNormal = new THREE.Texture();
    const srWithRim = new SceneRenderer({
      renderer,
      rimAlbedo,
      rimRoughness,
      rimNormal,
    });
    expect(srWithRim.rim.near.material.map).toBe(rimAlbedo);
    expect(srWithRim.rim.near.material.roughnessMap).toBe(rimRoughness);
    expect(srWithRim.rim.near.material.normalMap).toBe(rimNormal);

    const srRimNoNormal = new SceneRenderer({
      renderer,
      rimAlbedo,
      rimRoughness: null,
      rimNormal: null,
    });
    expect(srRimNoNormal.rim.near.material.roughnessMap).toBeNull();
    expect(srRimNoNormal.rim.near.material.normalMap).toBeNull();
  });

  it('the board plate wears the metalness map of its set, tiled like its albedo, at full metalness', () => {
    const renderer = createMockRenderer();
    const plateMetalness = new THREE.Texture();
    const sr = new SceneRenderer({ renderer, plateAlbedo: new THREE.Texture(), plateMetalness });
    expect(sr.plate.material.metalnessMap).toBe(plateMetalness);
    expect(sr.plate.material.metalness).toBe(1);
    expect([plateMetalness.wrapS, plateMetalness.repeat.x, plateMetalness.repeat.y]).toEqual([THREE.RepeatWrapping, 0.15, 0.15]);

    const without = new SceneRenderer({ renderer, plateAlbedo: new THREE.Texture(), plateMetalness: null });
    expect([without.plate.material.metalnessMap, without.plate.material.metalness]).toEqual([null, 0]);
  });

  it('handles WebGPU backend detection', () => {
    const renderer = createMockRenderer();
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend = true;
    const sr = new SceneRenderer({ renderer });
    expect(sr.backend).toBe('WebGPU');
  });

  it('initializes async renderer', async () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    await expect(sr.init()).resolves.toBeUndefined();
  });

  it('frames camera according to window dimensions', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    sr.frameCamera(1200, 800);
    expect(sr.camera.aspect).toBeCloseTo(1200 / 800);
    expect(sr.camera.fov).toBeGreaterThan(0);
  });

  it('applies view and updates camera positioning', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    const view: View = resetView();
    sr.applyView(view, null, { tier: 'high', clear: false, deck: 'mess' });
    expect(sr.camera.position.length()).toBeGreaterThan(0);

    // Reading console screen view
    const consoleDef = {
      position: [-10, 0, 0] as const,
      size: [0.5, 2, 3] as const,
    };
    sr.applyView(view, view, { tier: 'high', clear: false, deck: 'mess', consoleDef });
    expect(sr.camera.position.x).toBeLessThan(0);
  });

  // Held upright too, the board is centred in the window (#1387).
  it('puts the board centre in the middle of the window at any size, bug #957', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    for (const [width, height] of [
      [1280, 720], // desktop
      [375, 812], // phone upright
      [812, 375], // phone sideways
    ] as const) {
      sr.frameCamera(width, height);
      sr.applyView(resetView(), null, { tier: 'high', clear: false, deck: 'mess' });
      expect(sr.cellToScreen(0, 0, width, height).x).toBeCloseTo(width / 2, 6);
      expect(sr.cellToScreen(0, 0, width, height).y).toBeCloseTo(height / 2, 6);
    }
  });

  it('updates atmospheric fog based on tier, clear board, and deck', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    const view = resetView();

    // Fog active on high tier
    sr.updateFog('high', false, view, RADIUS, 'mess');
    expect(sr.scene.fog).toBe(sr.fogObj);
    expect(sr.fogObj.near).toBeGreaterThan(0);
    expect(sr.fogObj.far).toBeGreaterThan(sr.fogObj.near);

    // Fog cleared on clear-board
    sr.updateFog('high', true, view, RADIUS, 'mess');
    expect(sr.scene.fog).toBeNull();
  });

  it('updates airborne particles visibility and material attributes', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });

    // Enabled on high tier
    sr.updateParticles('high', false, false, false, false, 'mess');
    expect(sr.particles.visible).toBe(true);

    // Disabled when motion is reduced or clear board
    sr.updateParticles('high', true, false, false, false, 'mess');
    expect(sr.particles.visible).toBe(false);
  });

  it('animates particles drift and boundary recycling', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    sr.updateParticles('high', false, false, false, false, 'mess');
    expect(sr.particles.visible).toBe(true);

    // Animate across multiple timestamps
    sr.animateParticles(1000, 'mess');
    sr.animateParticles(1050, 'mess');

    // Force an out of bounds particle to verify recycling
    sr.particlePositions[0] = 50;
    sr.animateParticles(1100, 'mess');
    expect(Math.abs(sr.particlePositions[0])).toBeLessThan(25);

    // When invisible, updates timestamp only
    sr.particles.visible = false;
    sr.animateParticles(1200, 'mess');
  });

  it('applies deck lighting and tone mapping exposure', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    sr.applyDeck('furnace');
    expect(sr.renderer.toneMappingExposure).toBe(DECKS.furnace.exposure);

    const mockBay = {
      scene: new THREE.Group(),
      materials: {
        deck: new THREE.MeshStandardMaterial(),
        bulkhead: new THREE.MeshStandardMaterial(),
        grate: new THREE.MeshStandardMaterial(),
      },
    };
    sr.mountBay(mockBay, 'mess');
    sr.applyDeck('bridge');
    expect(sr.currentBay).toBe(mockBay);
    sr.applyDeck('furnace');
  });

  it('glows the neon rim violet while a rogue-lite fight is on, the deck key after (#1554)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    const rimColour = (): number => ((neonGlow([], true).children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex();
    const glowHex = (hex: number): number => new THREE.Color(hex).multiplyScalar(NEON_GLOW / Math.max(...new THREE.Color(hex).toArray())).getHex();
    sr.applyDeck('mess', ACT1);
    expect(rimColour()).toBe(glowHex(NEON.violet));
    sr.applyDeck('mess');
    expect(rimColour()).toBe(glowHex(DECK_KEY.mess.key));
    sr.applyDeck('mess', ACT1);
    sr.setRunFight(null); // leaving a run drops the violet at once, without a new applyDeck (#1554)
    expect(rimColour()).toBe(glowHex(DECK_KEY.mess.key));
    sr.setRunFight({ act: 3, elite: true }); // the map of a later act, then an elite: the run's cue follows at once
    expect(rimColour()).toBe(glowHex(runKey({ act: 3, elite: true }).key));
  });

  it('a rogue-lite flag before any deck, or off the neon look, changes no rim (#1554)', () => {
    const flat = new SceneRenderer({ renderer: createMockRenderer(), devicePixelRatio: 1, webdriver: false });
    expect(() => flat.setRunFight(ACT1)).not.toThrow(); // no neon look: nothing to recolour
    const bare = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    expect(() => bare.setRunFight(ACT1)).not.toThrow(); // no deck applied yet: nothing to recolour
  });

  it('draws frame geometry and caches unchanged shapes', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    const board = new Uint8Array(91);
    board.fill(1, 0, 14);
    board.fill(2, 14, 28);

    const frame1 = sr.drawFrame(board);
    expect(frame1).not.toBeNull();
    expect(sr.plate.geometry.attributes.position!.count).toBeGreaterThan(0);
    expect(sr.rim.near.geometry.attributes.position!.count).toBeGreaterThan(0);
    expect(sr.rim.far.geometry.attributes.position!.count).toBeGreaterThan(0);
    // The plate and the rim have rounded edges, within the same height as square ones: the plate from -0.3 to -0.1,
    // the rim from -0.3 to 0, so the cells and the marbles sit where they did.
    const height = (g: THREE.BufferGeometry): number[] => (g.computeBoundingBox(), [g.boundingBox!.min.y, g.boundingBox!.max.y]);
    for (const g of [sr.plate.geometry, sr.rim.near.geometry]) expect((g as THREE.ExtrudeGeometry).parameters.options.bevelEnabled).toBe(true);
    expect(height(sr.plate.geometry)).toEqual([expect.closeTo(-0.3), expect.closeTo(-0.1)]);
    expect(height(sr.rim.near.geometry)).toEqual([expect.closeTo(-0.3), expect.closeTo(0)]);

    // Same board returns cached null
    const frame2 = sr.drawFrame(board);
    expect(frame2).toBeNull();

    // Board with vanished cell (hole)
    const hullBoard = new Uint8Array(91);
    hullBoard[cellIndex(4, -1)] = VANISHED;
    const holeFrame = sr.drawFrame(hullBoard);
    expect(holeFrame?.holes.length).toBeGreaterThan(0);
  });

  it('lights rim near or far half with emissive color', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    sr.lightRim({ end: 'near', color: 0x22b8cf });
    expect(sr.rim.near.material.emissive.getHex()).toBe(0x22b8cf);
    expect(sr.rim.far.material.emissive.getHex()).toBe(0);

    sr.lightRim(null);
    expect(sr.rim.near.material.emissive.getHex()).toBe(0);
    expect(sr.rim.far.material.emissive.getHex()).toBe(0);
  });

  it('draws boss phase notches on the rim', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    sr.drawNotches(null);
    expect(sr.notches.children).toHaveLength(0);

    const mockRow: NotchRow = {
      notches: [
        { x: 0, z: 3, lit: true },
        { x: 0.2, z: 3, lit: false },
      ],
      glyph: { x: 0.4, z: 3 },
    };
    sr.drawNotches(mockRow);
    expect(sr.notches.children.length).toBeGreaterThanOrEqual(3);
  });

  it('frees the renderer record of the notches a redraw replaces (#1520)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const row: NotchRow = { notches: [{ x: 0, z: 3, lit: true }], glyph: { x: 0.4, z: 3 } };
    sr.drawNotches(row);
    const freed = sr.notches.children.map((mesh) => {
      const seen = vi.fn();
      mesh.addEventListener('dispose', seen);
      return seen;
    });
    sr.drawNotches(null);
    expect(freed.length).toBeGreaterThan(0);
    freed.forEach((seen) => expect(seen).toHaveBeenCalledOnce());
  });

  it('constructs with defaults when options are omitted', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    expect(sr.camera.aspect).toBeGreaterThan(0);
  });

  it('draws tally marks on the rim', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    const board = new Uint8Array(91);
    const frame = sr.drawFrame(board)!;

    const rows = [
      [{ marked: true }, { marked: false }],
      [{ marked: false }],
    ] as const;
    sr.drawTally(frame, rows);
    expect(sr.tallies[0].children.length).toBeGreaterThan(0);
    expect(sr.tallies[1].children.length).toBeGreaterThan(0);

    // Empty / single row fallback
    sr.drawTally(frame, [[]]);

    // Null frame does nothing
    sr.drawTally(null, rows);
  });

  it('mounts spaceship bay assets and applies deck atmosphere', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    const bayScene = new THREE.Group();
    const bay = {
      scene: bayScene,
      materials: {
        deck: new THREE.MeshStandardMaterial(),
        bulkhead: new THREE.MeshStandardMaterial(),
        grate: new THREE.MeshStandardMaterial(),
        trim: new THREE.MeshStandardMaterial(),
      },
      environment: null,
    };
    sr.mountBay(bay, 'mess');
    expect(sr.propsGroup.children).toContain(bayScene);

    // Mounting null does not throw
    sr.mountBay(null, 'mess');
  });

  it('projects axial coordinates to screen pixels', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    sr.frameCamera(1000, 800);
    sr.applyView(resetView(), null, { tier: 'high', clear: false, deck: 'mess' });

    const p = sr.cellToScreen(0, 0, 1000, 800);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(1000);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(800);
  });

  it('projects a point lifted above the board higher on the screen and, off the centre, further out (#1259)', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    sr.frameCamera(1000, 800);
    sr.applyView(resetView(), null, { tier: 'high', clear: false, deck: 'mess' });

    const flat = sr.cellToScreen(-4, 0, 1000, 800);
    const lifted = sr.cellToScreen(-4, 0, 1000, 800, 1, 0.76);
    expect(lifted.y).toBeLessThan(flat.y);
    expect(Math.abs(lifted.x - 500)).toBeGreaterThan(Math.abs(flat.x - 500));
    expect(sr.cellToScreen(-4, 0, 1000, 800, 1, 0)).toEqual(flat);
  });

  it('executes render pass', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    sr.render();
    expect(renderer.render).toHaveBeenCalledWith(sr.scene, sr.camera);

    // Pipeline rendering succeeds
    if (sr.pipeline) {
      const renderMock = vi.fn();
      sr.pipeline.render = renderMock;
      sr.render();
      expect(renderMock).toHaveBeenCalled();
    }
  });

  it('handles pipeline initialization failure gracefully', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    expect(createBloomPipeline(null as any, scene, camera)).toBeNull();

    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    (sr as { pipeline: unknown }).pipeline = null;
    sr.render();
    expect(renderer.render).toHaveBeenCalledWith(sr.scene, sr.camera);
  });

  it('blooms only what is brighter than the lit deck, so the glow is no veil over the board (#787)', () => {
    const pipeline = createBloomPipeline(createMockRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera())!;
    expect((pipeline.outputNode as any).node.bNode.threshold.value).toBe(1);
  });

  it('blurs the bloom at a quarter of the resolution: it is a soft glow, and full-size blur passes cost the most (#781, #844)', () => {
    const pipeline = createBloomPipeline(createMockRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera())!;
    expect((pipeline.outputNode as any).node.bNode.getResolutionScale()).toBe(0.25);
  });

  it('draws no bloom pass when asked not to, FXAA stays (#849)', () => {
    const camera = new THREE.PerspectiveCamera();
    const smooth = createBloomPipeline(createMockRenderer(), new THREE.Scene(), camera, true, 2, false)!;
    expect(smooth.bloom).toBeNull();
    expect((smooth.outputNode as any).constructor.name).toBe('FXAANode');
    expect(createBloomPipeline(createMockRenderer(), new THREE.Scene(), camera, false, 2, false)).toBeNull();
  });

  it('gives the saturation back after the tone map when asked, with FXAA or without (#1314)', () => {
    const camera = new THREE.PerspectiveCamera();
    const [smooth, plain] = [true, false].map((fxaa) => createBloomPipeline(createMockRenderer(), new THREE.Scene(), camera, fxaa, 1, false, 1.12)!);
    expect(smooth!.bloom).toBeNull();
    expect((smooth!.outputNode as any).constructor.name).toBe('FXAANode');
    expect((plain!.outputNode as any).constructor.name).not.toBe('FXAANode'); // the grade alone: no MSAA to replace, no FXAA to ask
    expect(plain!.outputColorTransform).toBe(false);
  });

  it('raises the contrast after the tone map when asked, on its own or with the saturation (#1398)', () => {
    const camera = new THREE.PerspectiveCamera();
    expect(TERRACE_CONTRAST).toBeGreaterThan(1);
    expect(createBloomPipeline(createMockRenderer(), new THREE.Scene(), camera, false, 1, false, 1, 1)).toBeNull(); // neither: no pass
    const [alone, both] = [1, 1.35].map((s) => createBloomPipeline(createMockRenderer(), new THREE.Scene(), camera, false, 1, false, s, TERRACE_CONTRAST)!) as [any, any];
    expect(alone.bloom).toBeNull();
    expect(alone.outputColorTransform).toBe(false);
    expect(both.outputNode).not.toBe(alone.outputNode);
  });

  it('builds no bloom pass for a low tier renderer (#849)', () => {
    const low = new SceneRenderer({ renderer: createMockRenderer(), devicePixelRatio: 1, webdriver: false, bloom: false });
    expect(low.pipeline!.bloom).toBeNull();
    expect(new SceneRenderer({ renderer: createMockRenderer(), devicePixelRatio: 1, webdriver: false }).pipeline!.bloom).not.toBeNull();
  });

  it('ends with FXAA on the tone-mapped picture when asked: no MSAA, the edges stay smooth (#857)', () => {
    const smooth = createBloomPipeline(createMockRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), true)!;
    expect(smooth.outputColorTransform).toBe(false);
    expect((smooth.outputNode as any).constructor.name).toBe('FXAANode');
    const plain = createBloomPipeline(createMockRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera())!;
    expect(plain.outputColorTransform).toBe(true);
  });

  it.each([
    ['a 1x desktop without MSAA', 1, 0, false],
    ['a 1x touch screen with MSAA', 1, 4, true],
    ['a screen drawn at 1.5 or more', 2, 0, true],
  ])('smooths with FXAA on %s only below a ratio of 1.5 and without MSAA (#857)', (_, devicePixelRatio, samples, plain) => {
    const renderer = Object.assign(createMockRenderer(), { samples });
    const { pipeline } = new SceneRenderer({ renderer, devicePixelRatio, webdriver: false });
    expect(pipeline!.outputColorTransform).toBe(plain);
  });

  it('judges the ratio the canvas is drawn at: under automation a Retina window is drawn at 0.5 and smoothed (#857)', () => {
    const { pipeline } = new SceneRenderer({ renderer: createMockRenderer(), devicePixelRatio: 2, webdriver: true });
    expect(pipeline!.outputColorTransform).toBe(false);
  });

  it('blurs the glow every second frame, the last glow staying on screen between two runs: the bloom is a third of a phone\'s frame (#894)', () => {
    const blur = vi.spyOn(BloomNode.prototype, 'updateBefore').mockImplementation(() => {});
    const { bloom } = createBloomPipeline(createMockRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera())!;
    const ran: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const before = blur.mock.calls.length;
      bloom!.updateBefore({} as never);
      ran.push(blur.mock.calls.length > before);
    }
    expect(ran).toEqual([true, false, true, false, true]);
    blur.mockRestore();
  });

  it('blurs the glow on every draw under automation, so one asked draw shows the settled picture (#921)', () => {
    const blur = vi.spyOn(BloomNode.prototype, 'updateBefore').mockImplementation(() => {});
    const runs = (webdriver: boolean) => {
      const { pipeline } = new SceneRenderer({ renderer: createMockRenderer(), webdriver });
      const before = blur.mock.calls.length;
      for (let i = 0; i < 4; i++) pipeline!.bloom!.updateBefore({} as never);
      return blur.mock.calls.length - before;
    };
    expect(runs(true)).toBe(4);
    expect(runs(false)).toBe(2);
    blur.mockRestore();
  });

  it('shows the terrace in place of the room, the plate and the rim, and gives them back (#1314)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const room = sr.scene.background;
    expect([sr.terrace.visible, sr.plate.visible]).toEqual([false, true]);
    sr.setTerrace(true);
    expect([sr.terrace.visible, sr.propsGroup.visible, sr.roomDeck.visible, sr.plate.visible, sr.rim.near.visible, sr.rim.far.visible]).toEqual([true, false, false, false, false, false]);
    expect(sr.camera.far).toBe(300); // the sky dome of the file is 95 away
    sr.setTerrace(true); // nothing redone
    sr.setTerrace(false);
    expect([sr.terrace.visible, sr.propsGroup.visible, sr.roomDeck.visible, sr.plate.visible]).toEqual([false, true, true, true]);
    expect([sr.scene.background, sr.camera.far]).toEqual([room, 100]);
  });

  it('draws the terrace through the graded pipeline, with no bloom, and the room through the bloom one (#1314)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer(), devicePixelRatio: 1, webdriver: false });
    const [flat, room] = [vi.fn(), vi.fn()];
    sr.flatPipeline!.render = flat;
    sr.pipeline!.render = room;
    sr.render();
    sr.setTerrace(true);
    sr.render();
    expect([room.mock.calls.length, flat.mock.calls.length]).toEqual([1, 1]);
  });

  it('wears the neon look on request: black sky, stars once, cold light, a picture with no extra grading (#1424)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    sr.setTerrace(true);
    sr.setNeon();
    sr.setNeon(); // asked again: one set of stars
    expect((sr.scene.background as THREE.Color).getHex()).toBe(NEON.sky);
    expect(sr.terrace.children.filter((c) => c.name === 'starfield')).toHaveLength(1);
    expect([sr.renderer.toneMapping, sr.renderer.toneMappingExposure, sr.sun.intensity]).toEqual([THREE.NoToneMapping, NEON_LIGHT.exposure, NEON_LIGHT.sunIntensity]);
    const plain = new SceneRenderer({ renderer: createMockRenderer(), devicePixelRatio: 1, webdriver: false });
    expect(plain.sun.intensity).not.toBe(NEON_LIGHT.sunIntensity); // nothing changes without the look
  });

  it('dresses the terrace for a lair fight: the light, the sky, the exposure, the tint and the cell edges follow the look, and null gives the terrace back (#1496)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const lit = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x808080 })), { name: 'lit' });
    const dome = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'terrace_solid', color: new THREE.Color().setScalar(1 / TERRACE_EXPOSURE) })), { name: 'dome' });
    const haze = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'terrace_blended', color: 0x123456 })), { name: 'haze' });
    const edges = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ name: 'terrace_edge' })), { name: 'terrace_edges', visible: false });
    const bare = Object.assign(new THREE.Group(), { name: 'bare' }); // not a mesh
    const dishes = Object.assign(new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 3), { name: 'terrace_dishes' });
    for (let i = 0; i < 3; i++) dishes.setColorAt(i, new THREE.Color(1, 1, 1));
    sr.terrace.add(lit, dome, haze, edges, bare, dishes);
    sr.setBoardLook(BOARD_LOOKS.night); // the terrace is not on: nothing is touched yet
    expect(sr.sun.color.getHex()).toBe(TERRACE_LOOK.sun);
    sr.setTerrace(true);
    const night = BOARD_LOOKS.night;
    expect([sr.sun.color.getHex(), sr.sun.intensity]).toEqual([night.sun, night.sunIntensity]);
    expect(sr.sun.position.clone().normalize().y).toBeCloseTo(Math.sin((night.elevation * Math.PI) / 180));
    expect([sr.hemisphere.color.getHex(), sr.hemisphere.groundColor.getHex(), sr.hemisphere.intensity]).toEqual([night.sky, night.ground, night.hemisphere]);
    expect((sr.scene.background as THREE.Color).getHex()).toBe(night.background);
    expect(sr.renderer.toneMappingExposure).toBe(night.exposure);
    expect((lit.material as THREE.MeshStandardMaterial).color.r).toBeCloseTo((0x80 / 255) ** 2.2 * new THREE.Color(night.tint).r, 1);
    expect((dome.material as THREE.MeshBasicMaterial).color.b).toBeGreaterThan(0);
    expect((haze.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x123456); // the haze is nobody's tint
    const cell = new THREE.Color();
    dishes.getColorAt(2, cell);
    expect(cell.getHex()).toBe(night.cell); // the cell tops are multiplied apart from the rest of the board
    expect(edges.visible).toBe(true);
    expect((edges.material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(0xffffff);
    sr.setBoardLook(null); // already so: nothing redone
    sr.setBoardLook(BOARD_LOOKS.day); // another look over it: the tint is of the file's colour, not of the last look
    sr.setBoardLook(null);
    expect([sr.sun.color.getHex(), sr.sun.intensity, sr.renderer.toneMappingExposure]).toEqual([TERRACE_LOOK.sun, TERRACE_LOOK.sunIntensity, TERRACE_EXPOSURE]);
    expect((sr.scene.background as THREE.Color).getHex()).toBe(TERRACE_LOOK.background);
    expect((lit.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x808080);
    expect((dome.material as THREE.MeshBasicMaterial).color.r).toBeCloseTo(1 / TERRACE_EXPOSURE);
    expect(edges.visible).toBe(false);
    dishes.getColorAt(0, cell);
    expect(cell.getHex()).toBe(0xffffff);
  });

  it('puts the look on when the terrace comes on after it was asked for, and leaves the neon look alone (#1496)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    sr.setBoardLook(BOARD_LOOKS.dusk);
    sr.setTerrace(true);
    expect(sr.sun.color.getHex()).toBe(BOARD_LOOKS.dusk.sun);
    const neon = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    neon.setTerrace(true);
    neon.setNeon();
    neon.setBoardLook(BOARD_LOOKS.dusk);
    expect(neon.sun.intensity).toBe(NEON_LIGHT.sunIntensity);
  });

  it('casts the sun shadow on the terrace on the high tier only, and a tier change moves it (#1364)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    expect([sr.renderer.shadowMap.enabled, sr.sun.castShadow]).toEqual([false, false]);
    sr.setTerrace(true, true);
    expect([sr.renderer.shadowMap.enabled, sr.sun.castShadow]).toEqual([true, true]);
    sr.setShadows(false); // the low tier
    expect([sr.renderer.shadowMap.enabled, sr.sun.castShadow]).toEqual([false, false]);
    sr.setShadows(false); // asked again: nothing redone
    expect(sr.sun.castShadow).toBe(false);
    sr.setTerrace(false);
    sr.setTerrace(true); // a page on the low tier: no shadow
    expect(sr.sun.castShadow).toBe(false);
  });

  it('gives the slab, the rim and the posts the deck key under the neon look, and the terrace none (#1551)', () => {
    const neon = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    neon.applyDeck('cargo');
    const slab = neonMaterial('scene_slab_arena') as THREE.MeshStandardMaterial;
    const cargo = slab.color.toArray().join();
    neon.applyDeck('chapel');
    expect(slab.color.toArray().join()).not.toBe(cargo);
    const terrace = new SceneRenderer({ renderer: createMockRenderer(), devicePixelRatio: 1, webdriver: false });
    terrace.applyDeck('cargo');
    expect(slab.color.toArray().join()).not.toBe(cargo); // the terrace leaves the slab alone
  });

  it('gives a boss fight its own sun, sky and rim under the neon look, and the neon light back on the next deck (#1551)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    sr.setTerrace(true);
    sr.setNeon();
    const space = BOSS_SPACE.hull!;
    sr.applyDeck('cargo', null, space);
    expect([sr.sun.color.getHex(), sr.sun.intensity]).toEqual([space.sun, NEON_LIGHT.sunIntensity * space.intensity]);
    expect(sr.sun.position.toArray()).toEqual(neonSunPosition(30, space.elevation, space.azimuth));
    expect((sr.scene.background as THREE.Color).getHex()).toBe(neonSkyOf('cargo', space).getHex());
    sr.applyDeck('mess');
    expect([sr.sun.color.getHex(), sr.sun.intensity]).toEqual([NEON_LIGHT.sun, NEON_LIGHT.sunIntensity]);
    expect((sr.scene.background as THREE.Color).getHex()).toBe(neonSkyOf('mess').getHex());
  });

  it('raises the light of a boss entrance from dark and gives the fight light back exactly, on its end or on a new deck (#1551)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    sr.setTerrace(true);
    sr.setNeon();
    sr.applyDeck('cargo', null, BOSS_SPACE.hull!);
    const [sun, hemisphere] = [sr.sun.intensity, sr.hemisphere.intensity];
    sr.setEntranceLight(0.25);
    expect([sr.sun.intensity, sr.hemisphere.intensity]).toEqual([sun * 0.25, hemisphere * 0.25]);
    sr.setEntranceLight(0.5); // from the light the fight has, not from the dimmed one
    expect([sr.sun.intensity, sr.hemisphere.intensity]).toEqual([sun * 0.5, hemisphere * 0.5]);
    sr.setEntranceLight(1);
    expect([sr.sun.intensity, sr.hemisphere.intensity]).toEqual([sun, hemisphere]);
    sr.setEntranceLight(1); // nothing dimmed: nothing to give back
    expect(sr.sun.intensity).toBe(sun);
    sr.setEntranceLight(0.1);
    sr.applyDeck('mess'); // a new deck while dark: its own light, not a dim one
    expect([sr.sun.intensity, sr.hemisphere.intensity]).toEqual([NEON_LIGHT.sunIntensity, NEON_LIGHT.hemisphere]);
    sr.setEntranceLight(1);
    expect(sr.sun.intensity).toBe(NEON_LIGHT.sunIntensity);
  });

  it('leaves the sun to its owner while no boss space has been on, as the Open world sets it (#1551)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    sr.sun.intensity = 7;
    sr.applyDeck('mess');
    expect(sr.sun.intensity).toBe(7);
  });

  it('scatters the boss space around the board in place of the deck particles, and the deck ones come back (#1551)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const space = BOSS_SPACE.swarm!;
    sr.applyDeck('cargo', null, space);
    sr.updateParticles('high', false, false, false, false, 'cargo');
    expect([sr.particleMaterial.color.getHex(), sr.particleMaterial.size, sr.particleMaterial.opacity, sr.particleGeometry.drawRange.count]).toEqual([space.scatter.color, space.scatter.size, space.scatter.opacity, space.scatter.count]);
    sr.animateParticles(1000, 'cargo');
    sr.animateParticles(1100, 'cargo');
    expect(sr.particles.visible).toBe(true);
    sr.applyDeck('cargo');
    sr.updateParticles('high', false, false, false, false, 'cargo');
    expect(sr.particleGeometry.drawRange.count).toBe(DECK_PARTICLES.cargo.count);
  });

  it('gives a boss fight its own sun and sky on the terrace look, a lair look keeping its own, and the arena light back after (#1551)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const space = BOSS_SPACE.alien!;
    sr.applyDeck('cargo', null, space); // the terrace is not on yet: applied when it comes on
    sr.setTerrace(true);
    expect([sr.sun.color.getHex(), sr.sun.intensity]).toEqual([space.sun, TERRACE_LOOK.sunIntensity * space.intensity]);
    expect((sr.scene.background as THREE.Color).getHex()).not.toBe(TERRACE_LOOK.background);
    sr.applyDeck('cargo', null, space); // the same space again: nothing redone
    sr.applyDeck('mess');
    expect([sr.sun.color.getHex(), sr.sun.intensity]).toEqual([TERRACE_LOOK.sun, TERRACE_LOOK.sunIntensity]);
    expect((sr.scene.background as THREE.Color).getHex()).toBe(terraceDeckLook('mess')!.background); // the Mess's own surround (#1551)
    sr.setBoardLook(BOARD_LOOKS.dusk);
    sr.applyDeck('cargo', null, space);
    expect(sr.sun.color.getHex()).toBe(BOARD_LOOKS.dusk.sun); // a lair's board is the Open world's
    sr.setBoardLook(null);
    expect(sr.sun.color.getHex()).toBe(space.sun); // the lair left: the space under it
    sr.setTerrace(false);
    sr.applyDeck('mess');
    sr.setTerrace(true); // back on the terrace with no space: the arena light, not the last space's
    expect(sr.sun.color.getHex()).toBe(TERRACE_LOOK.sun);
  });

  it('dresses the terrace of the Mess and of the Cargo hold in their own surround, the other decks and the act spaces as they were (#1551)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    sr.setTerrace(true);
    const background = (): number => (sr.scene.background as THREE.Color).getHex();
    sr.applyDeck('mess');
    const mess = background();
    sr.applyDeck('cargo');
    expect([background(), mess]).toEqual([terraceDeckLook('cargo')!.background, terraceDeckLook('mess')!.background]);
    expect(background()).not.toBe(mess);
    sr.applyDeck('furnace');
    expect(background()).toBe(TERRACE_LOOK.background); // a deck with no surround of its own: the arena's
    sr.applyDeck('mess', ACT1, ACT_SPACE.tundra!); // an act of a run: its own space, not the deck's
    expect([sr.sun.color.getHex(), background()]).toEqual([ACT_SPACE.tundra!.sun, terraceSpaceLook(ACT_SPACE.tundra!).background]);
  });

  it('keeps the key of the deck the page opened on when the neon look turns the terrace on (#1551)', () => {
    const boot = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    boot.applyDeck('mess'); // the page's first deck, set before the terrace is on
    boot.setTerrace(true);
    boot.setNeon();
    expect((boot.scene.background as THREE.Color).getHex()).toBe(neonSkyOf('mess').getHex());
  });

  it('keeps a backdrop texture of the room under the neon look, the sky takes the key only without one (#1551)', () => {
    const backdrop = new THREE.Texture();
    const room = new SceneRenderer({ renderer: createMockRenderer(), neon: true, backdrop, devicePixelRatio: 1, webdriver: false });
    room.applyDeck('chapel');
    expect(room.scene.background).toBe(backdrop);
    const sky = new SceneRenderer({ renderer: createMockRenderer(), neon: true, devicePixelRatio: 1, webdriver: false });
    sky.applyDeck('chapel');
    expect((sky.scene.background as THREE.Color).getHex()).toBe(neonSkyOf('chapel').getHex());
  });

  it('lights the turn bar of the side to move on the terrace, none at the end (#1314)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const [black, white] = ['scene_turnbar_black', 'scene_turnbar_white'].map((name) => Object.assign(new THREE.Mesh(), { name }));
    sr.terrace.add(black!, white!);
    sr.lightRim({ end: 'near', color: 0x7fd6e8 });
    expect([black!.visible, white!.visible]).toEqual([true, false]);
    sr.lightRim({ end: 'far', color: 0xd9822b });
    expect([black!.visible, white!.visible]).toEqual([false, true]);
    sr.lightRim(null);
    expect([black!.visible, white!.visible]).toEqual([false, false]);
  });
});

describe('the deck prop of the scene (#1551)', () => {
  const make = (): SceneRenderer => new SceneRenderer({ renderer: createMockRenderer(), innerWidth: 1000, innerHeight: 800 });
  const prop = (sr: SceneRenderer): THREE.Mesh => sr.scene.getObjectByName('deck-prop') as THREE.Mesh;

  it('is one mesh of the scene, one material, hidden until the terrace is on and the board shown', () => {
    const sr = make();
    expect(sr.scene.getObjectsByProperty('name', 'deck-prop')).toHaveLength(1);
    expect(prop(sr).visible).toBe(false); // the room has its own props
    sr.setTerrace(true);
    expect(prop(sr).visible).toBe(true);
    sr.showDeckProp(false, RADIUS, false); // the hub's board
    expect(prop(sr).visible).toBe(false);
    sr.showDeckProp(true, RADIUS, false);
    expect(prop(sr).visible).toBe(true);
    sr.setTerrace(false);
    expect(prop(sr).visible).toBe(false);
  });

  it('takes the shape and the colour of the deck applied, one mesh for all of them', () => {
    const sr = make();
    sr.setTerrace(true);
    for (const deck of ['mess', 'cargo', 'furnace', 'chapel', 'bridge'] as const) {
      sr.applyDeck(deck);
      expect(prop(sr).geometry).toBe(deckPropGeometry(deck));
      expect((prop(sr).material as THREE.MeshBasicMaterial).color.equals(deckPropColour(deck))).toBe(true);
    }
    expect(DECK_PROPS.mess.length).toBeGreaterThan(0);
    expect(sr.scene.getObjectsByProperty('name', 'deck-prop')).toHaveLength(1);
  });

  it('stands at the spot of the board radius and of the window shape', () => {
    const sr = make();
    sr.showDeckProp(true, 5, true);
    const spot = deckPropSpot(5, true);
    expect([prop(sr).position.x, prop(sr).position.z]).toEqual([spot.x, spot.z]);
    sr.showDeckProp(true, RADIUS, false);
    expect(prop(sr).position.x).toBe(deckPropSpot(RADIUS, false).x);
  });
});
