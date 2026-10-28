import type * as THREE from 'three/webgpu';

/**
 * The tuning panel of ?lights: one power slider per light of the scene (key, fill, accents, room lamps) and per neon
 * tube (a mesh named `*neon*`, its emissive intensity), read from the scene as it is now. Rebuilt into `panel` when the
 * props are drawn again, since that replaces their lights.
 */
export function lightPanel(scene: THREE.Object3D, panel: HTMLElement = document.createElement('div')): HTMLElement {
  panel.id = 'light-panel';
  panel.replaceChildren();
  const seen = new Set<object>();
  scene.traverse((o) => {
    const light = o as THREE.Light;
    const neon = (o as THREE.Mesh).isMesh && o.name.includes('neon') ? ((o as THREE.Mesh).material as THREE.MeshStandardMaterial) : null;
    const target = light.isLight ? light : neon;
    if (!target || seen.has(target)) return;
    seen.add(target);
    const get = (): number => (neon ? neon.emissiveIntensity : light.intensity);
    const set = (v: number): void => void (neon ? (neon.emissiveIntensity = v) : (light.intensity = v));
    const { x, y, z } = o.position;
    const name = o.name || `${o.type} ${light.color.getHexString()} (${x}, ${y}, ${z})`;
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
      set(Number(input.value));
      value.textContent = input.value;
    });
    const label = document.createElement('label');
    label.append(`${name} `, value, input);
    panel.append(label);
  });
  return panel;
}
