import type * as THREE from 'three/webgpu';

/** The panel's groups, in order: the lights of the scene itself, then the neon tubes' glow and light, then the lamps. */
const GROUPS = ['Key & fill', 'Neon glow', 'Neon tube lights', 'Prop lamps', 'Room lamps'] as const;

/**
 * The tuning panel of ?lights: one power slider per light of the scene (key, fill, accents, room lamps; the lights of
 * one name, a neon tube's row, share one) and per neon tube (a mesh named `*neon*`, its emissive intensity), read from
 * the scene as it is now, grouped by kind in folding sections, each lamp by name. Rebuilt into `panel` when the props
 * are drawn again, since that replaces their lights. With `onAim`, each slider has a button that points the camera at
 * its light, the middle of a row, in the world.
 */
export function lightPanel(
  scene: THREE.Object3D,
  panel: HTMLElement = document.createElement('div'),
  onAim?: (at: THREE.Vector3) => void,
): HTMLElement {
  panel.id = 'light-panel';
  panel.replaceChildren();
  const dials = new Map<string, { group: (typeof GROUPS)[number]; get: () => number; sets: ((v: number) => void)[]; objects: THREE.Object3D[] }>();
  const seen = new Set<object>();
  scene.traverse((o) => {
    const light = o as THREE.Light;
    const neon = (o as THREE.Mesh).isMesh && o.name.includes('neon') ? ((o as THREE.Mesh).material as THREE.MeshStandardMaterial) : null;
    if (!light.isLight && (!neon || seen.has(neon))) return;
    if (neon) seen.add(neon);
    const { x, y, z } = o.position;
    const name = o.name || `${o.type} ${light.color.getHexString()} (${x}, ${y}, ${z})`;
    const set = (v: number): void => void (neon ? (neon.emissiveIntensity = v) : (light.intensity = v));
    const group =
      neon ? GROUPS[1]
      : o.parent === scene ? GROUPS[0]
      : name.includes('neon') ? GROUPS[2]
      : o.parent!.name === 'bay_lights' ? GROUPS[4]
      : GROUPS[3];
    const dial = dials.get(name);
    if (dial) {
      dial.sets.push(set);
      dial.objects.push(o);
    } else dials.set(name, { group, get: () => (neon ? neon.emissiveIntensity : light.intensity), sets: [set], objects: [o] });
  });
  const sorted = [...dials].sort(([a, da], [b, db]) => GROUPS.indexOf(da.group) - GROUPS.indexOf(db.group) || (da.group === GROUPS[0] ? 0 : a.localeCompare(b)));
  const sections = new Map<string, HTMLDetailsElement>();
  for (const [name, { group, get, sets, objects }] of sorted) {
    const value = Object.assign(document.createElement('output'), { textContent: String(get()) });
    const input = Object.assign(document.createElement('input'), {
      type: 'range',
      min: '0',
      max: String(Math.max(10, get() * 3)),
      step: '0.05',
      value: String(get()),
    });
    input.setAttribute('aria-label', `${name} power`);
    input.addEventListener('input', () => {
      for (const set of sets) set(Number(input.value));
      value.textContent = input.value;
    });
    const label = document.createElement('label');
    label.append(`${name} `, value, input);
    if (onAim) {
      const aim = Object.assign(document.createElement('button'), { type: 'button', textContent: '◎' });
      aim.setAttribute('aria-label', `Point the camera at ${name}`);
      aim.addEventListener('click', () => {
        const at = objects[0]!.position.clone().set(0, 0, 0);
        for (const o of objects) at.add(o.getWorldPosition(o.position.clone()));
        onAim(at.divideScalar(objects.length));
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
