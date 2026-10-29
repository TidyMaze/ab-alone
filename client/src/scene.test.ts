// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { BOARD_CELLS, RADIUS, VANISHED, cellIndex } from './board';
import { resetView, type View } from './camera';
import { DECK_PARTICLES } from './deck';
import { DECKS } from './light';
import { DECK_ATMOSPHERES } from './roomloader';
import { createBloomPipeline, FRAME_LOOK, SceneRenderer, type NotchRow } from './scene';

function createMockRenderer(): THREE.WebGPURenderer {
  const canvas = document.createElement('canvas');
  return {
    domElement: canvas,
    backend: { isWebGPUBackend: false },
    toneMapping: 0,
    toneMappingExposure: 1,
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
    expect(lights).toEqual([]);
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

  it('slides the picture right by the aside of the view, in half widths, never while reading, bug #695', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    sr.frameCamera(1000, 800);
    sr.applyView({ ...resetView(), aside: 0.2 }, null, { tier: 'high', clear: false, deck: 'mess' });
    expect(sr.cellToScreen(0, 0, 1000, 800).x).toBeCloseTo(600);
    sr.applyView({ ...resetView(), aside: 0.2 }, resetView(), { tier: 'high', clear: false, deck: 'mess' });
    expect(sr.camera.view!.offsetX).toBe(0);
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

  it('draws frame geometry and caches unchanged shapes', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    const board = new Uint8Array(BOARD_CELLS.length);
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
    const hullBoard = new Uint8Array(BOARD_CELLS.length);
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

  it('constructs with defaults when options are omitted', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    expect(sr.camera.aspect).toBeGreaterThan(0);
  });

  it('draws tally marks on the rim', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    const board = new Uint8Array(BOARD_CELLS.length);
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
});
