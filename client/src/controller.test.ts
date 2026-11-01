// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { type Spot as HubSpot } from './hub';
import { HUB_BOARD } from './hubview';
import { SceneRenderer } from './scene';
import { HubController, type ModeController } from './controller';

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

describe('ModeController & HubController (#633)', () => {
  let hub: HubController;
  const initialSpot: HubSpot = { deck: 'mess', cell: [0, 0] };

  beforeEach(() => {
    document.body.dataset.hub = '';
    delete document.body.dataset.hubHover;
    delete document.body.dataset.lifts;
    hub = new HubController(initialSpot);
  });

  it('implements ModeController contract', () => {
    const controller: ModeController = hub;
    expect(controller.id).toBe('hub');
    expect(typeof controller.enter).toBe('function');
    expect(typeof controller.exit).toBe('function');
  });

  it('enters hub and updates DOM dataset', () => {
    const spot: HubSpot = { deck: 'cargo', cell: [1, -1] };
    hub.enter(spot);
    expect(hub.at).toEqual(spot);
    expect(hub.hover).toBeNull();
    expect(hub.bumped).toBe('');
    expect(document.body.dataset.hub).toBe('cargo 1,-1');
  });

  it('exits hub and clears DOM datasets', () => {
    hub.enter(initialSpot);
    hub.onPointerMove([1, 0]);
    expect(document.body.dataset.hubHover).toBe('1,0');

    hub.exit();
    expect(hub.hover).toBeNull();
    expect(document.body.dataset.hub).toBeUndefined();
    expect(document.body.dataset.hubHover).toBeUndefined();
    expect(document.body.dataset.lifts).toBeUndefined();
  });

  it('handles pointer hover transitions', () => {
    hub.enter(initialSpot);

    // Initial hover
    const changed1 = hub.onPointerMove([1, -1]);
    expect(changed1).toBe(true);
    expect(hub.hover).toEqual([1, -1]);
    expect(document.body.dataset.hubHover).toBe('1,-1');

    // Identical hover does not trigger change
    const changed2 = hub.onPointerMove([1, -1]);
    expect(changed2).toBe(false);

    // Hover moves away
    const changed3 = hub.onPointerMove(null);
    expect(changed3).toBe(true);
    expect(hub.hover).toBeNull();
    expect(document.body.dataset.hubHover).toBeUndefined();
  });

  it('handles pointer leave event', () => {
    hub.enter(initialSpot);
    hub.onPointerMove([0, 1]);

    const changed1 = hub.onPointerLeave();
    expect(changed1).toBe(true);
    expect(hub.hover).toBeNull();
    expect(document.body.dataset.hubHover).toBeUndefined();

    // Leaving when already null returns false
    const changed2 = hub.onPointerLeave();
    expect(changed2).toBe(false);
  });

  it('handles keyboard arrow navigation', () => {
    hub.enter(initialSpot);

    // Reading console disables navigation
    expect(hub.onKeyDown('ArrowUp', true)).toBeNull();

    // Valid arrow returns neighbor
    const to = hub.onKeyDown('ArrowUp', false);
    expect(to).toEqual([1, -1]);

    // Non-arrow key returns null
    expect(hub.onKeyDown('Enter', false)).toBeNull();
  });

  it('handles cell click to walk or bump', () => {
    hub.enter({ deck: 'mess', cell: [0, 0] });

    // Step to valid adjacent empty cell [1, 0]
    const step1 = hub.onCellClick([1, 0], []);
    expect(step1.stepped).toBe(true);
    expect(hub.at.cell).toEqual([1, 0]);
    expect(hub.bumped).toBe('');

    // Step to locked lift cell [0, -3] from afar: cannot step
    const step2 = hub.onCellClick([0, -3], []);
    expect(step2.stepped).toBe(false);
  });

  it('generates HUD HTML', () => {
    hub.enter(initialSpot);
    const html = hub.hud();
    expect(html).toContain('Hub · Mess');
  });

  it('draws hub frame and door glyphs into scene renderer', () => {
    const renderer = createMockRenderer();
    const sr = new SceneRenderer({ renderer });
    const discs: THREE.Mesh[] = [];
    for (let i = 0; i < HUB_BOARD.length; i++) {
      discs.push(new THREE.Mesh(new THREE.BufferGeometry()));
    }

    const sfxMock = { setTension: vi.fn() };
    const playerMarble = new THREE.Mesh();
    hub.draw(sr, discs, sfxMock, [], playerMarble);

    expect(sr.marbles.children.length).toBeGreaterThan(0);
    expect(sfxMock.setTension).toHaveBeenCalledWith(0);
    expect(document.body.dataset.lifts).toContain('locked');
    expect(document.body.dataset.hub).toBe('mess 0,0');

    // Draw with beaten boss to test open lift branch
    hub.draw(sr, discs, sfxMock, ['echo'], playerMarble);
    expect(document.body.dataset.lifts).toContain('open');
  });

  it('draws the boss door open with its seal once the deck boss is beaten (#1249)', () => {
    const sr = new SceneRenderer({ renderer: createMockRenderer() });
    const discs = HUB_BOARD.map(() => new THREE.Mesh(new THREE.BufferGeometry()));
    hub.enter(initialSpot);
    hub.draw(sr, discs, { setTension: vi.fn() }, [], new THREE.Mesh());
    expect(sr.marbles.getObjectByName('beaten-seal')).toBeUndefined();
    hub.draw(sr, discs, { setTension: vi.fn() }, ['echo'], new THREE.Mesh());
    expect(sr.marbles.getObjectByName('beaten-seal')).toBeDefined();
  });

  it('puts each label plate on the window just south of its cell centre (#1249)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-cell="2,0"></div><div data-cell="-1,2"></div>';
    hub.placeLabels(root, (q, r) => ({ x: q * 100, y: r * 10 }));
    const [boss, lift] = [...root.children] as HTMLElement[];
    expect([boss!.style.left, boss!.style.top]).toEqual(['180px', '4px']);
    expect([lift!.style.left, lift!.style.top]).toEqual(['-120px', '24px']);
  });
});
