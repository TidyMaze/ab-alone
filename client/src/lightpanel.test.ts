// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { lightPanel } from './lightpanel';

describe('lightPanel (?lights)', () => {
  const scene = (): { scene: THREE.Scene; key: THREE.DirectionalLight; lamp: THREE.PointLight; neon: THREE.MeshStandardMaterial } => {
    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.name = 'key';
    const lamp = new THREE.PointLight(0x38e8ff, 2.25);
    lamp.position.set(-13, 11, -17.5);
    const neon = new THREE.MeshStandardMaterial({ emissive: 0x38e8ff, emissiveIntensity: 5.5 });
    const tube = new THREE.Mesh(new THREE.BoxGeometry(), neon);
    tube.name = 'corner-neon-nw';
    const twin = new THREE.Mesh(new THREE.BoxGeometry(), neon); // the same material: one slider
    twin.name = 'corner-neon-ne';
    const wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); // no neon: no slider
    scene.add(key, lamp, tube, twin, wall);
    return { scene, key, lamp, neon };
  };

  it('gives every light and every neon tube its own power slider, named or placed', () => {
    const panel = lightPanel(scene().scene);
    expect(panel.id).toBe('light-panel');
    expect([...panel.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'key 2',
      'PointLight 38e8ff (-13, 11, -17.5) 2.25',
      'corner-neon-nw 5.5',
    ]);
    const input = panel.querySelector('input')!;
    expect([input.type, input.min, input.max, input.value]).toEqual(['range', '0', '10', '2']);
    expect(panel.querySelectorAll('input')[2]!.max).toBe('16.5'); // three times a strong neon
  });

  it('sets the power as the slider moves, and shows it', () => {
    const { scene: s, lamp, neon } = scene();
    const panel = lightPanel(s);
    const [, lampSlider, neonSlider] = panel.querySelectorAll('input');
    lampSlider!.value = '4';
    lampSlider!.dispatchEvent(new Event('input'));
    neonSlider!.value = '1.5';
    neonSlider!.dispatchEvent(new Event('input'));
    expect(lamp.intensity).toBe(4);
    expect(neon.emissiveIntensity).toBe(1.5);
    expect(panel.querySelectorAll('output')[1]!.textContent).toBe('4');
  });

  it('rebuilds into the same panel, the old sliders gone', () => {
    const panel = lightPanel(scene().scene);
    expect(lightPanel(new THREE.Scene(), panel)).toBe(panel);
    expect(panel.children).toHaveLength(0);
  });
});
