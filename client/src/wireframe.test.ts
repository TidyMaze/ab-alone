import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WireframeManager } from './wireframe';

describe('WireframeManager', () => {
  it('starts inactive', () => {
    const wm = new WireframeManager();
    expect(wm.active).toBe(false);
  });

  it('enables wireframe on meshes and creates helpers for point, directional, and spot lights', () => {
    const wm = new WireframeManager();
    const scene = new THREE.Scene();

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ wireframe: false }));
    const multiMatMesh = new THREE.Mesh(new THREE.BoxGeometry(), [
      new THREE.MeshStandardMaterial({ wireframe: true }),
      new THREE.MeshBasicMaterial({ wireframe: false }),
    ]);
    const pLight = new THREE.PointLight(0xff0000, 1, 10);
    const dLight = new THREE.DirectionalLight(0x00ff00, 1);
    const sLight = new THREE.SpotLight(0x0000ff, 1);
    const rawObj = new THREE.Object3D();
    scene.add(mesh, multiMatMesh, pLight, dLight, sLight, rawObj);

    wm.enable(scene);
    expect(wm.active).toBe(true);
    expect((mesh.material as THREE.MeshStandardMaterial).wireframe).toBe(true);
    expect(((multiMatMesh.material as THREE.Material[])[0] as THREE.MeshStandardMaterial).wireframe).toBe(true);

    // Helpers group attached to scene
    expect(scene.children).toContain(wm.helpersGroup);
    // PointLightHelper + DirectionalLightHelper + SpotLightHelper created
    expect(wm.helpersGroup.children.length).toBe(3);

    // Calling enable when already active is a no-op
    wm.enable(scene);
    expect(wm.active).toBe(true);
  });

  it('restores original wireframe state and disposes helpers on disable', () => {
    const wm = new WireframeManager();
    const scene = new THREE.Scene();

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ wireframe: false }));
    const pLight = new THREE.PointLight(0xff0000, 1, 10);
    scene.add(mesh, pLight);

    wm.enable(scene);
    expect((mesh.material as THREE.MeshStandardMaterial).wireframe).toBe(true);

    // Add a multi-material helper mock to ensure array material branch in disposal is covered
    const multiMatHelper = new THREE.Mesh(new THREE.BoxGeometry(), [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ]);
    wm.helpersGroup.add(multiMatHelper);

    wm.disable(scene);
    expect(wm.active).toBe(false);
    expect((mesh.material as THREE.MeshStandardMaterial).wireframe).toBe(false);
    expect(scene.children).not.toContain(wm.helpersGroup);
    expect(wm.helpersGroup.children.length).toBe(0);

    // Calling disable when already inactive is a no-op
    wm.disable(scene);
    expect(wm.active).toBe(false);

    // Enabling a second time uses existing origWireframe
    wm.enable(scene);
    expect(wm.active).toBe(true);
  });

  it('toggles active state', () => {
    const wm = new WireframeManager();
    const scene = new THREE.Scene();

    expect(wm.toggle(scene)).toBe(true);
    expect(wm.active).toBe(true);

    expect(wm.toggle(scene)).toBe(false);
    expect(wm.active).toBe(false);
  });
});
