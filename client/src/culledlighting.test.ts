// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { uniform, vec3 } from 'three/tsl';
import { describe, expect, it, vi } from 'vitest';

// The branches the lights node opens, kept to check what they wrap.
const branches: { condition: THREE.Node; body: () => void }[] = [];
vi.mock('three/tsl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three/tsl')>()),
  If: (condition: THREE.Node, body: () => void) => void branches.push({ condition, body }),
}));
const { CulledLighting } = await import('./culledlighting');

describe('CulledLighting (#882)', () => {
  const node = (): THREE.LightsNode => new CulledLighting().createNode([]);

  it('makes a lights node for the lights it is given', () => {
    const light = new THREE.PointLight();
    const made = new CulledLighting().createNode([light]);
    expect(made).toBeInstanceOf(THREE.LightsNode);
    expect(made.getLights()).toEqual([light]);
  });

  it('declares the direct light sums before the lights, so the sums outlive each light\'s branch', () => {
    const order: string[] = [];
    const sum = (name: string): { addAssign: (v: number) => void } => ({ addAssign: (v) => void order.push(`${name} += ${v}`) });
    const builder = { context: { reflectedLight: { directDiffuse: sum('diffuse'), directSpecular: sum('specular') } } };
    const light = { build: () => void order.push('light') };
    node().setupLights(builder as never, [light as never]);
    expect(order).toEqual(['diffuse += 0', 'specular += 0', 'light']);
  });

  it('shades a point light only inside a branch on its cutoff distance', () => {
    const shade = vi.spyOn(THREE.LightsNode.prototype, 'setupDirectLight').mockImplementation(() => {});
    const point = { light: new THREE.PointLight(), cutoffDistanceNode: uniform(8), getLightVector: () => vec3(1, 2, 3) };
    const data = { lightColor: vec3(1) };
    branches.length = 0;
    node().setupDirectLight({} as never, point as never, data as never);
    expect(shade).not.toHaveBeenCalled();
    expect(branches).toHaveLength(1);
    expect(branches[0]!.condition.isNode).toBe(true);
    branches[0]!.body();
    expect(shade).toHaveBeenCalledWith({}, point, data);
    shade.mockRestore();
  });

  it('shades any other light as three does, with no branch', () => {
    const shade = vi.spyOn(THREE.LightsNode.prototype, 'setupDirectLight').mockImplementation(() => {});
    const other = { light: new THREE.DirectionalLight() };
    branches.length = 0;
    node().setupDirectLight({} as never, other as never, {} as never);
    expect(shade).toHaveBeenCalledWith({}, other, {});
    expect(branches).toHaveLength(0);
    shade.mockRestore();
  });
});
