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
    const bay = new THREE.Group();
    bay.name = 'bay_lights';
    bay.add(lamp);
    scene.add(key, bay, tube, twin, wall);
    return { scene, key, lamp, neon };
  };

  it('gives every light and every neon tube its own power slider, named or placed', () => {
    const panel = lightPanel(scene().scene);
    expect(panel.id).toBe('light-panel');
    expect([...panel.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'key 2',
      'corner-neon-nw 5.5',
      'PointLight 38e8ff (-13, 11, -17.5) 2.25',
    ]);
    const input = panel.querySelector('input')!;
    expect([input.type, input.min, input.max, input.value]).toEqual(['range', '0', '10', '2']);
    expect(panel.querySelectorAll('input')[1]!.max).toBe('16.5'); // three times a strong neon
  });

  it('groups the sliders by kind, each group open and folding, its lamps by name', () => {
    const s = scene().scene;
    const prop = (name: string): THREE.PointLight => Object.assign(new THREE.PointLight(), { name });
    const props = new THREE.Group();
    props.add(prop('viewportRimLight'), prop('emergencyLight'), prop('corner-neon-nw light'));
    s.add(props, Object.assign(new THREE.AmbientLight(), { name: 'fill (ambient)' }));
    const panel = lightPanel(s);
    const groups = [...panel.querySelectorAll('details')];
    expect([...groups[0]!.querySelectorAll('label')].map((l) => l.firstChild!.textContent)).toEqual(['key ', 'fill (ambient) ']); // as the scene has them
    expect(groups.map((g) => [g.open, g.querySelector('summary')!.textContent])).toEqual([
      [true, 'Key & fill (2)'],
      [true, 'Neon glow (1)'],
      [true, 'Neon tube lights (1)'],
      [true, 'Prop lamps (2)'],
      [true, 'Room lamps (1)'],
    ]);
    expect([...groups[3]!.querySelectorAll('label')].map((l) => l.firstChild!.textContent)).toEqual(['emergencyLight ', 'viewportRimLight ']);
  });

  it('sets the power as the slider moves, and shows it', () => {
    const { scene: s, lamp, neon } = scene();
    const panel = lightPanel(s);
    const [, neonSlider, lampSlider] = panel.querySelectorAll('input');
    lampSlider!.value = '4';
    lampSlider!.dispatchEvent(new Event('input'));
    neonSlider!.value = '1.5';
    neonSlider!.dispatchEvent(new Event('input'));
    expect(lamp.intensity).toBe(4);
    expect(neon.emissiveIntensity).toBe(1.5);
    expect(panel.querySelectorAll('output')[2]!.textContent).toBe('4');
  });

  it('gives the lights of one name (the row of a neon tube) one slider, which moves them all', () => {
    const s = new THREE.Scene();
    const row = [new THREE.PointLight(0x38e8ff, 1.5), new THREE.PointLight(0x38e8ff, 1.5)];
    for (const light of row) light.name = 'corner-neon-nw light';
    s.add(...row);
    const panel = lightPanel(s);
    expect(panel.querySelectorAll('input')).toHaveLength(1);
    const slider = panel.querySelector('input')!;
    slider.value = '3';
    slider.dispatchEvent(new Event('input'));
    expect(row.map((l) => l.intensity)).toEqual([3, 3]);
  });

  it('points the camera at a light, at the middle of a row, where it is in the world', () => {
    const s = new THREE.Scene();
    const row = [new THREE.PointLight(), new THREE.PointLight()];
    row[0]!.position.set(0, 1, 0);
    row[1]!.position.set(0, 3, 0);
    for (const light of row) light.name = 'neon-column-wn light';
    const props = new THREE.Group();
    props.position.set(10, 0, 0);
    props.add(...row);
    s.add(props);
    s.updateMatrixWorld();
    const aimed: number[][] = [];
    const panel = lightPanel(s, undefined, (p) => aimed.push(p.toArray()));
    const aim = panel.querySelector('button')!;
    expect(aim.getAttribute('aria-label')).toBe('Point the camera at neon-column-wn light');
    aim.click();
    expect(aimed).toEqual([[10, 2, 0]]);
    expect(lightPanel(s).querySelector('button')).toBeNull(); // no camera to point: no button
  });

  it('rebuilds into the same panel, the old sliders gone', () => {
    const panel = lightPanel(scene().scene);
    expect(lightPanel(new THREE.Scene(), panel)).toBe(panel);
    expect(panel.children).toHaveLength(0); // no light, no group
  });
});
