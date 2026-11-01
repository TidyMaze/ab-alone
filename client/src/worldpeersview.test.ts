// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { axialTo3D } from './board';
import { edgeSpot, PeersLayer } from './worldpeersview';

describe('edgeSpot', () => {
  it('is inside when the point is on screen', () => {
    expect(edgeSpot(0.2, -0.5, 0.5, 1).inside).toBe(true);
    expect(edgeSpot(1, -1, 0.5, 1).inside).toBe(true); // on the border still counts
  });

  it('puts a point off to the right on the right edge, arrow pointing right', () => {
    const s = edgeSpot(2, 0, 0.5, 1.5);
    expect(s.inside).toBe(false);
    expect(s.left).toBeCloseTo(94, 5); // margin 0.88 -> (0.88 + 1) / 2
    expect(s.top).toBeCloseTo(50, 5);
    expect(s.angle).toBeCloseTo(0, 5);
  });

  it('keeps the direction of a point above and to the left, the screen being wider than high', () => {
    const s = edgeSpot(-2, 1.5, 0.5, 2);
    expect(s.left).toBeCloseTo(6, 5); // both axes scaled by 0.88 / 2: x = -0.88, y = 0.66
    expect(s.top).toBeCloseTo(17, 5);
    // up and to the left on the screen: the angle points to the upper left, in CSS (y down) between -pi and -pi / 2
    expect(s.angle).toBeLessThan(-Math.PI / 2);
    expect(s.angle).toBeGreaterThan(-Math.PI);
  });

  it('a point behind the camera is mirrored, so its arrow points away from the view', () => {
    const s = edgeSpot(0.5, 0.2, 1.5, 1);
    expect(s.inside).toBe(false);
    expect(s.left).toBeLessThan(50);
    expect(s.top).toBeGreaterThan(50);
  });

  it('a point dead behind the centre points down', () => {
    const s = edgeSpot(0, 0, 2, 1);
    expect(s.inside).toBe(false);
    expect(s.angle).toBeCloseTo(Math.PI / 2, 5);
    expect(s.top).toBeCloseTo(94, 5);
  });
});

function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 1000);
  camera.position.set(0, 10, 10);
  camera.lookAt(0, 0, 0);
  const root = document.createElement('div');
  const tile = (q: number, r: number) => (Math.abs(q) > 20 || Math.abs(r) > 20 ? undefined : { terrain: 'grass' as const, height: 1, biome: 'meadow' as const });
  const layer = new PeersLayer(scene, camera, { tile } as never, root);
  return { scene, camera, root, layer };
}

describe('PeersLayer', () => {
  it('stands a marker on each peer in view and draws no edge indicator for it', () => {
    const { scene, root, layer } = setup();
    layer.update([{ peer: 'a', cell: [1, 0] }], [0, 0]);
    const mesh = scene.getObjectByName('peers') as THREE.InstancedMesh;
    expect(mesh.count).toBe(1);
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(axialTo3D(1, 0).x, 5);
    expect(p.z).toBeCloseTo(axialTo3D(1, 0).z, 5);
    expect(p.y).toBeGreaterThan(0);
    expect(root.children).toHaveLength(0);
    expect(root.hidden).toBe(true);
  });

  it('shows an edge indicator with the distance in tiles for a peer out of view, and no marker on unloaded ground', () => {
    const { scene, root, layer } = setup();
    layer.update([{ peer: 'far', cell: [200, 0] }], [0, 0]);
    expect((scene.getObjectByName('peers') as THREE.InstancedMesh).count).toBe(0); // no tile there: no marker
    expect(root.hidden).toBe(false);
    expect(root.children).toHaveLength(1);
    const edge = root.children[0] as HTMLElement;
    expect(edge.textContent).toContain('200');
    expect(edge.getAttribute('aria-label')).toBe('Another hero, 200 tiles away');
    expect(edge.style.left).not.toBe('');
  });

  it('says one tile in the singular, reuses its elements, and drops the ones it no longer needs', () => {
    const { root, layer } = setup();
    layer.update([{ peer: 'a', cell: [0, -25] }], [0, -24]);
    expect(root.children[0]!.getAttribute('aria-label')).toBe('Another hero, 1 tile away');
    const first = root.children[0];
    layer.update(
      [
        { peer: 'a', cell: [0, -25] },
        { peer: 'b', cell: [200, 0] },
      ],
      [0, -24],
    );
    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toBe(first);
    layer.update([], [0, 0]);
    expect(root.children).toHaveLength(0);
    expect(root.hidden).toBe(true);
  });

  it('writes the page marks the browser checks read, and frees the marker and the indicators on dispose', () => {
    const { scene, root, layer } = setup();
    layer.update(
      [
        { peer: 'a', cell: [1, 0] },
        { peer: 'b', cell: [200, 0] },
      ],
      [0, 0],
    );
    expect(root.dataset.peers).toBe('2');
    expect(root.dataset.edges).toBe('200');
    layer.dispose();
    expect(scene.getObjectByName('peers')).toBeUndefined();
    expect(root.children).toHaveLength(0);
    expect(root.hidden).toBe(true);
    expect(root.dataset.peers).toBeUndefined();
  });

  it('reports a change of what it draws, and none when the same list comes again', () => {
    const { layer } = setup();
    expect(layer.update([{ peer: 'a', cell: [1, 0] }], [0, 0])).toBe(true);
    expect(layer.update([{ peer: 'a', cell: [1, 0] }], [0, 0])).toBe(false);
    expect(layer.update([{ peer: 'a', cell: [2, 0] }], [0, 0])).toBe(true);
  });
});
