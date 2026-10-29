import type * as THREE from 'three/webgpu';

/** The panel's groups, in order: the lights of the scene itself, the neon tubes' glow and light, the lamps, the bloom. */
const GROUPS = ['Key & fill', 'Neon glow', 'Neon tube lights', 'Prop lamps', 'Bloom'] as const;

/** A lamp's family: its name without the side or number that tells it from its likes (`corner-neon-nw light`, `pedestal-neon-2 light`). */
export const family = (name: string): string => name.replace(/-(\d+|[nsew]{1,2}|north|south|top)(?=( light)?$)/, '');

/** A setting with no light of its own, such as the bloom's strength: a slider of the Bloom group, tuned by its name. */
export interface Knob {
  name: string;
  uniform: { value: number };
  max: number;
}

interface Dial {
  group: (typeof GROUPS)[number];
  get: () => number;
  sets: ((v: number) => void)[];
  /** The lights of one name, by name: one lamp each (a neon tube's row is one). */
  lamps: Map<string, THREE.Object3D[]>;
  max?: number;
}

/** Every family of lights and neon tubes of the scene as it is now, then the knobs, by name. */
function dials(scene: THREE.Object3D, knobs: readonly Knob[]): Map<string, Dial> {
  const all = new Map<string, Dial>();
  const seen = new Set<object>();
  scene.traverse((o) => {
    const light = o as THREE.Light;
    const neon = (o as THREE.Mesh).isMesh && o.name.includes('neon') ? ((o as THREE.Mesh).material as THREE.MeshStandardMaterial) : null;
    if (!light.isLight && (!neon || seen.has(neon))) return;
    if (neon) seen.add(neon);
    const { x, y, z } = o.position;
    const name = o.name || `${o.type} ${light.color.getHexString()} (${x}, ${y}, ${z})`;
    const group =
      neon ? GROUPS[1]
      : o.parent === scene ? GROUPS[0]
      : name.includes('neon') ? GROUPS[2]
      : GROUPS[3];
    const dial = all.get(family(name)) ?? {
      group,
      get: () => (neon ? neon.emissiveIntensity : light.intensity),
      sets: [],
      lamps: new Map<string, THREE.Object3D[]>(),
    };
    dial.sets.push((v) => void (neon ? (neon.emissiveIntensity = v) : (light.intensity = v)));
    dial.lamps.set(name, [...(dial.lamps.get(name) ?? []), o]);
    all.set(family(name), dial);
  });
  for (const { name, uniform, max } of knobs)
    all.set(name, { group: 'Bloom', get: () => uniform.value, sets: [(v) => void (uniform.value = v)], lamps: new Map(), max });
  return all;
}

/** The settings menu's light sliders, each in percent of the tuned power: the bloom, the neon tubes' glow, the lights. */
export type Level = 'bloom' | 'lamps' | 'lights';
export const LEVELS: readonly Level[] = ['bloom', 'lamps', 'lights'];

// The power each scaled thing had before the sliders, and the power they gave it: a power changed since (the tuning
// when the lights are made again, ?lights) is the new one to scale.
const powers = new WeakMap<object, { base: number; set: number }>();
function scale<K extends string>(o: Record<K, number>, key: K, percent: number): void {
  const was = powers.get(o);
  const base = was?.set === o[key] ? was.base : o[key];
  o[key] = (base * percent) / 100;
  powers.set(o, { base, set: o[key] });
}

/** Scales every point, rect area and spot light (the key and the fill are spots), every neon tube's glow and the bloom
 *  by the settings' sliders, from the power each had before them: twice the same levels give the same scene. The room's
 *  reflection (envMap) lights the marbles whatever the lamps, so it follows the lights too: at 0 they go dark. */
export function scalePower(scene: THREE.Object3D, levels: Readonly<Record<Level, number>>, bloom?: { value: number }): void {
  scene.traverse((o) => {
    const look = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
    if ((o as THREE.PointLight).isPointLight || (o as THREE.RectAreaLight).isRectAreaLight || (o as THREE.SpotLight).isSpotLight)
      scale(o as THREE.Light, 'intensity', levels.lights);
    else if ((o as THREE.Mesh).isMesh && o.name.includes('neon')) scale(look, 'emissiveIntensity', levels.lamps);
    else if ((o as THREE.Mesh).isMesh && look.envMap) scale(look, 'envMapIntensity', levels.lights);
  });
  if (bloom) scale(bloom, 'value', levels.bloom);
}

/** Sets each family of lights and neon tubes, and each knob, that `tuning` names (lighttuning.ts), as its slider would. */
export function applyTuning(scene: THREE.Object3D, tuning: Readonly<Record<string, number>>, knobs: readonly Knob[] = []): void {
  for (const [kind, { sets }] of dials(scene, knobs)) if (kind in tuning) for (const set of sets) set(tuning[kind]!);
}

/**
 * The tuning panel of ?lights: one power slider per family of lights (key, fill, the prop lamps: `family`) and of
 * neon tubes (a mesh named `*neon*`, its emissive intensity), read from the scene as it is now, grouped by kind in
 * folding sections, each family by name, then one per knob (the bloom). Rebuilt into `panel` when the props are drawn
 * again, since that replaces their lights. With `onAim`, each light's slider has a button that points the camera at one
 * lamp of the family, the next at each press (a lamp: the lights of one name, the middle of a neon tube's row).
 */
export function lightPanel(
  scene: THREE.Object3D,
  panel: HTMLElement = document.createElement('div'),
  onAim?: (at: THREE.Vector3) => void,
  knobs: readonly Knob[] = [],
): HTMLElement {
  panel.id = 'light-panel';
  panel.replaceChildren();
  const sorted = [...dials(scene, knobs)].sort(
    ([a, da], [b, db]) => GROUPS.indexOf(da.group) - GROUPS.indexOf(db.group) || (da.group === GROUPS[0] ? 0 : a.localeCompare(b)),
  );
  const sections = new Map<string, HTMLDetailsElement>();
  for (const [kind, { group, get, sets, lamps, max = Math.max(100, get() * 20) }] of sorted) {
    const name = lamps.size > 1 ? `${kind} ×${lamps.size}` : kind;
    const value = Object.assign(document.createElement('output'), { textContent: String(get()) });
    const input = Object.assign(document.createElement('input'), {
      type: 'range',
      min: '0',
      max: String(max),
      step: String(max / 2000),
      value: String(get()),
    });
    input.setAttribute('aria-label', `${name} power`);
    input.addEventListener('input', () => {
      for (const set of sets) set(Number(input.value));
      value.textContent = input.value;
    });
    const label = document.createElement('label');
    label.append(`${name} `, value, input);
    if (onAim && lamps.size) {
      const aim = Object.assign(document.createElement('button'), { type: 'button', textContent: '◎' });
      aim.setAttribute('aria-label', `Point the camera at ${kind}`);
      const each = [...lamps.values()];
      let next = 0;
      aim.addEventListener('click', () => {
        const lamp = each[next++ % each.length]!;
        const at = lamp[0]!.position.clone().set(0, 0, 0);
        for (const o of lamp) at.add(o.getWorldPosition(o.position.clone()));
        onAim(at.divideScalar(lamp.length));
      });
      label.append(aim); // after the slider: a click on the name still goes to the slider
    }
    let section = sections.get(group);
    if (!section) {
      section = Object.assign(document.createElement('details'), { open: true });
      section.append(document.createElement('summary'));
      sections.set(group, section);
      panel.append(section);
    }
    section.append(label);
  }
  for (const [group, section] of sections) section.querySelector('summary')!.textContent = `${group} (${section.querySelectorAll('label').length})`;
  return panel;
}
