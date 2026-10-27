import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { nextRenderMode, RENDER_MODE_NAMES, RenderModeManager } from './rendermode';

describe('RenderModeManager', () => {
  it('defines nextRenderMode cycling normal -> clay -> wireframe -> normal', () => {
    expect(nextRenderMode('normal')).toBe('clay');
    expect(nextRenderMode('clay')).toBe('wireframe');
    expect(nextRenderMode('wireframe')).toBe('normal');
    expect(RENDER_MODE_NAMES).toEqual({
      normal: 'Normal',
      clay: 'Clay',
      wireframe: 'Wireframe',
    });
  });

  it('starts in normal mode and cycle transitions correctly', () => {
    const root = new THREE.Group();
    const mgr = new RenderModeManager();
    expect(mgr.mode).toBe('normal');

    expect(mgr.cycle(root)).toBe('clay');
    expect(mgr.mode).toBe('clay');

    expect(mgr.cycle(root)).toBe('wireframe');
    expect(mgr.mode).toBe('wireframe');

    expect(mgr.cycle(root)).toBe('normal');
    expect(mgr.mode).toBe('normal');
  });

  it('setMode to same mode is a no-op', () => {
    const root = new THREE.Group();
    const mgr = new RenderModeManager();
    mgr.setMode(root, 'normal');
    expect(mgr.mode).toBe('normal');
  });

  it('applies clay materials to meshes, distinguishing black, white, and neutral props', () => {
    const root = new THREE.Group();
    const neutralMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const neutralMesh = new THREE.Mesh(new THREE.BoxGeometry(), neutralMat);
    neutralMesh.name = 'Ship_Deck_Floor';

    const blackMesh = new THREE.Mesh(new THREE.SphereGeometry(), blackMat);
    blackMesh.name = 'marble_black_0';

    const whiteMesh = new THREE.Mesh(new THREE.SphereGeometry(), whiteMat);
    whiteMesh.name = 'marble_white_0';

    root.add(neutralMesh, blackMesh, whiteMesh);

    const mgr = new RenderModeManager();
    mgr.setMode(root, 'clay');
    expect(mgr.mode).toBe('clay');

    expect(neutralMesh.material).toBe(mgr.clayMaterial);
    expect(blackMesh.material).toBe(mgr.darkClayMaterial);
    expect(whiteMesh.material).toBe(mgr.lightClayMaterial);

    expect(neutralMesh.userData.origMaterial).toBe(neutralMat);
    expect(blackMesh.userData.origMaterial).toBe(blackMat);
    expect(whiteMesh.userData.origMaterial).toBe(whiteMat);

    // Switching back to normal restores original materials
    mgr.setMode(root, 'normal');
    expect(neutralMesh.material).toBe(neutralMat);
    expect(blackMesh.material).toBe(blackMat);
    expect(whiteMesh.material).toBe(whiteMat);
    expect(neutralMesh.userData.origMaterial).toBeUndefined();
  });

  it('supports multi-material meshes in clay mode and restores them', () => {
    const root = new THREE.Group();
    const mat1 = new THREE.MeshStandardMaterial();
    const mat2 = new THREE.MeshBasicMaterial();
    const multiMesh = new THREE.Mesh(new THREE.BoxGeometry(), [mat1, mat2]);
    multiMesh.name = 'kiosk_prop';
    root.add(multiMesh);

    const mgr = new RenderModeManager();
    mgr.setMode(root, 'clay');
    expect(multiMesh.material).toBe(mgr.clayMaterial);
    expect(multiMesh.userData.origMaterial).toEqual([mat1, mat2]);

    mgr.setMode(root, 'normal');
    expect(multiMesh.material).toEqual([mat1, mat2]);
  });

  it('transitions from clay to wireframe, restoring original materials and adding wireframe with light helpers', () => {
    const root = new THREE.Group();
    const origMat = new THREE.MeshStandardMaterial({ wireframe: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), origMat);
    mesh.name = 'wall';

    const multiOrigMat1 = new THREE.MeshStandardMaterial({ wireframe: true });
    const multiOrigMat2 = new THREE.MeshBasicMaterial({ wireframe: false });
    const multiMesh = new THREE.Mesh(new THREE.BoxGeometry(), [multiOrigMat1, multiOrigMat2]);
    multiMesh.name = 'multi';

    const point = new THREE.PointLight(0xffaa00);
    const dir = new THREE.DirectionalLight(0xffffff);
    const spot = new THREE.SpotLight(0x00aaff);
    root.add(mesh, multiMesh, point, dir, spot);

    const mgr = new RenderModeManager();
    // 1. Enter clay
    mgr.setMode(root, 'clay');
    expect(mesh.material).toBe(mgr.clayMaterial);
    expect(multiMesh.material).toBe(mgr.clayMaterial);

    // 2. Transition directly to wireframe
    mgr.setMode(root, 'wireframe');
    expect(mgr.mode).toBe('wireframe');
    expect(mesh.material).toBe(origMat);
    expect(multiMesh.material).toEqual([multiOrigMat1, multiOrigMat2]);
    expect(origMat.wireframe).toBe(true);
    expect(multiOrigMat1.wireframe).toBe(true);

    // Light helpers created in helpersGroup
    expect(mgr.helpersGroup.parent).toBe(root);
    expect(mgr.helpersGroup.children).toHaveLength(3);

    // Add a mock multi-material helper to cover array disposal in teardownWireframe
    const multiMatHelper = new THREE.Mesh(new THREE.BoxGeometry(), [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ]);
    mgr.helpersGroup.add(multiMatHelper);

    // 3. Transition to normal restores wireframe flag and disposes helpers
    mgr.setMode(root, 'normal');
    expect(origMat.wireframe).toBe(false);
    expect(multiOrigMat1.wireframe).toBe(true);
    expect(mgr.helpersGroup.parent).toBeNull();
    expect(mgr.helpersGroup.children).toHaveLength(0);

    // 4. Re-enter wireframe when origWireframe is already defined
    mgr.setMode(root, 'wireframe');
    expect(origMat.wireframe).toBe(true);
    mgr.setMode(root, 'normal');
    expect(origMat.wireframe).toBe(false);
  });
});
