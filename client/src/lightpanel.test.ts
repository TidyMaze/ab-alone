// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { applyTuning, lightPanel, scalePower } from './lightpanel';

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
    const props = new THREE.Group();
    props.add(lamp);
    scene.add(key, props, tube, twin, wall);
    return { scene, key, lamp, neon };
  };

  it('gives every light and every neon tube its own power slider, named or placed', () => {
    const panel = lightPanel(scene().scene);
    expect(panel.id).toBe('light-panel');
    expect([...panel.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'key 2',
      'corner-neon 5.5',
      'PointLight 38e8ff (-13, 11, -17.5) 2.25',
    ]);
    const input = panel.querySelector('input')!;
    expect([input.type, input.min, input.max, input.value]).toEqual(['range', '0', '100', '2']);
    expect(panel.querySelectorAll('input')[1]!.max).toBe('110'); // 20 times a strong neon
  });

  it('groups the sliders by kind, each group open and folding, its lamps by name', () => {
    const s = scene().scene;
    const prop = (name: string): THREE.PointLight => Object.assign(new THREE.PointLight(), { name });
    const props = new THREE.Group();
    props.add(prop('viewportRimLight'), prop('emergencyLight'), prop('corner-neon-nw light'));
    s.add(props, Object.assign(new THREE.SpotLight(), { name: 'fill' }));
    const panel = lightPanel(s);
    const groups = [...panel.querySelectorAll('details')];
    expect([...groups[0]!.querySelectorAll('label')].map((l) => l.firstChild!.textContent)).toEqual(['key ', 'fill ']); // as the scene has them
    expect(groups.map((g) => [g.open, g.querySelector('summary')!.textContent])).toEqual([
      [true, 'Scene lights (2)'],
      [true, 'Neon glow (1)'],
      [true, 'Neon tube lights (1)'],
      [true, 'Prop lamps (3)'],
    ]);
    expect([...groups[3]!.querySelectorAll('label')].map((l) => l.firstChild!.textContent)).toEqual(['emergencyLight ', 'PointLight 38e8ff (-13, 11, -17.5) ', 'viewportRimLight ']);
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

  it('merges a family of lamps (one per side or number) into one slider, its button going from one to the next', () => {
    const s = new THREE.Scene();
    const at = <T extends THREE.Object3D>(o: T, name: string, x: number): T => Object.assign(o, { name }).translateX(x);
    const tubes = [at(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissiveIntensity: 5.5 })), 'corner-neon-nw', 1),
      at(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissiveIntensity: 5.5 })), 'corner-neon-ne', 2)];
    const props = new THREE.Group();
    props.add(
      at(new THREE.PointLight(), 'pedestal-neon-0 light', 5), at(new THREE.PointLight(), 'pedestal-neon-0 light', 7),
      at(new THREE.PointLight(), 'pedestal-neon-1 light', 9),
    );
    s.add(...tubes, props);
    s.updateMatrixWorld();
    const aimed: number[] = [];
    const panel = lightPanel(s, undefined, (p) => aimed.push(p.x));
    expect([...panel.querySelectorAll('label')].map((l) => l.firstChild!.textContent)).toEqual([
      'corner-neon ×2 ',
      'pedestal-neon light ×2 ',
    ]);
    const [corner, pedestal] = panel.querySelectorAll('label');
    const slider = corner!.querySelector('input')!;
    slider.value = '40';
    slider.dispatchEvent(new Event('input'));
    expect(tubes.map((t) => (t.material as THREE.MeshStandardMaterial).emissiveIntensity)).toEqual([40, 40]);
    const aim = pedestal!.querySelector('button')!;
    aim.click(); // the first bar, the middle of its row
    aim.click(); // the second bar
    aim.click(); // the first again
    expect(aimed).toEqual([6, 9, 6]);
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
    expect(aim.getAttribute('aria-label')).toBe('Point the camera at neon-column light');
    aim.click();
    expect(aimed).toEqual([[10, 2, 0]]);
    expect(lightPanel(s).querySelector('button')).toBeNull(); // no camera to point: no button
  });

  it('has a button that opens the scene in the three.js Editor, after the sliders, when it has somewhere to open it (#872)', () => {
    const opened: string[] = [];
    const panel = lightPanel(scene().scene, undefined, () => {}, [], () => opened.push('editor'));
    const button = panel.lastElementChild as HTMLButtonElement;
    expect([button.tagName, button.textContent, button.getAttribute('aria-label')]).toEqual(['BUTTON', 'Open in three.js Editor', null]);
    button.click();
    expect(opened).toEqual(['editor']);
    expect(lightPanel(scene().scene).querySelector('button.editor')).toBeNull();
  });

  it('sets the tuned power of each family, and leaves the others as they are', () => {
    const { scene: s, key, lamp, neon } = scene();
    const twin = new THREE.PointLight(0x38e8ff, 2.25);
    twin.name = 'corner-neon-ne light';
    const row = new THREE.PointLight(0x38e8ff, 2.25);
    row.name = 'corner-neon-nw light';
    s.add(twin, row);
    applyTuning(s, { key: 0, 'corner-neon': 110, 'corner-neon light': 100, 'gone lamp': 7 });
    expect([key.intensity, neon.emissiveIntensity, twin.intensity, row.intensity]).toEqual([0, 110, 100, 100]);
    expect(lamp.intensity).toBe(2.25); // not tuned
  });

  it('adds the bloom knobs last, without an aim button, tuned by name like the lights', () => {
    const { scene: s } = scene();
    const strength = { value: 0.175 };
    const knobs = [{ name: 'bloom strength', uniform: strength, max: 2 }];
    const panel = lightPanel(s, undefined, () => {}, knobs);
    const bloom = [...panel.querySelectorAll('details')].at(-1)!;
    expect(bloom.querySelector('summary')!.textContent).toBe('Bloom (1)');
    expect(bloom.querySelector('button')).toBeNull();
    const slider = bloom.querySelector('input')!;
    expect([slider.max, slider.step, slider.value]).toEqual(['2', '0.001', '0.175']);
    slider.value = '0.5';
    slider.dispatchEvent(new Event('input'));
    expect(strength.value).toBe(0.5);
    applyTuning(s, { 'bloom strength': 0.8 }, knobs);
    expect(strength.value).toBe(0.8);
  });

  it('rebuilds into the same panel, the old sliders gone', () => {
    const panel = lightPanel(scene().scene);
    expect(lightPanel(new THREE.Scene(), panel)).toBe(panel);
    expect(panel.children).toHaveLength(0); // no light, no group
  });
});

describe('scalePower, the settings light sliders', () => {
  const scene = () => {
    const s = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 2);
    const fill = new THREE.AmbientLight(0xffffff, 0.5);
    const lamp = new THREE.PointLight(0x38e8ff, 2);
    const panel = new THREE.RectAreaLight(0xffffff, 4);
    const neon = new THREE.MeshStandardMaterial({ emissiveIntensity: 6 });
    const tube = new THREE.Mesh(new THREE.BoxGeometry(), neon);
    tube.name = 'corner-neon-nw';
    const twin = new THREE.Mesh(new THREE.BoxGeometry(), neon); // the same material: scaled once
    twin.name = 'corner-neon-ne';
    const wall = new THREE.MeshStandardMaterial({ emissiveIntensity: 1 });
    s.add(key, fill, lamp, panel, tube, twin, new THREE.Mesh(new THREE.BoxGeometry(), wall));
    return { s, key, fill, lamp, panel, neon, wall, bloom: { value: 0.06 } };
  };

  it('scales the point and rect area lights, the neon glow and the bloom, never a directional, a spot or an ambient light or another glow', () => {
    const { s, key, fill, lamp, panel, neon, wall, bloom } = scene();
    scalePower(s, { bloom: 300, lamps: 50, lights: 200 }, bloom);
    expect([lamp.intensity, panel.intensity, neon.emissiveIntensity, bloom.value]).toEqual([4, 8, 3, 0.18]);
    expect([key.intensity, fill.intensity, wall.emissiveIntensity]).toEqual([2, 0.5, 1]);
    scalePower(s, { bloom: 300, lamps: 0, lights: 200 }); // no bloom: the rest still scales
    expect(neon.emissiveIntensity).toBe(0);
  });

  it('scales the environment light of what reflects the room with the lights: at 0 a white marble goes dark too', () => {
    const { s } = scene();
    const env = new THREE.Texture();
    const marble = new THREE.MeshPhysicalMaterial({ envMap: env, envMapIntensity: 0.8 });
    const plain = new THREE.MeshStandardMaterial({ envMapIntensity: 0.8 }); // no envMap: nothing to scale
    s.add(new THREE.Mesh(new THREE.SphereGeometry(), marble), new THREE.Mesh(new THREE.SphereGeometry(), marble), new THREE.Mesh(new THREE.BoxGeometry(), plain));
    scalePower(s, { bloom: 100, lamps: 100, lights: 0 });
    expect([marble.envMapIntensity, plain.envMapIntensity]).toEqual([0, 0.8]);
    scalePower(s, { bloom: 100, lamps: 100, lights: 150 });
    expect(marble.envMapIntensity).toBeCloseTo(1.2);
  });

  it('scales from the power it found, again and again, until something else sets it', () => {
    const { s, lamp, neon } = scene();
    scalePower(s, { bloom: 100, lamps: 0, lights: 200 });
    scalePower(s, { bloom: 100, lamps: 150, lights: 200 });
    expect([lamp.intensity, neon.emissiveIntensity]).toEqual([4, 9]); // not 8, not 0
    lamp.intensity = 3; // the tuning when the lights are made again, or ?lights
    scalePower(s, { bloom: 100, lamps: 100, lights: 50 });
    expect([lamp.intensity, neon.emissiveIntensity]).toEqual([1.5, 6]);
  });
});
