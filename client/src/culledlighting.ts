import * as THREE from 'three/webgpu';
import { If, Loop, directPointLight, positionView, renderGroup, uniform, uniformArray } from 'three/tsl';

// The few shader operators used here: three's types leave the lighting nodes untyped.
type Op = THREE.Node & {
  addAssign(v: number): Op;
  length(): Op;
  lessThan(v: Op): Op;
  equal(v: number): Op;
  or(v: Op): Op;
  sub(v: Op): Op;
  toVar(): Op;
  element(i: THREE.Node): Op;
  xyz: Op;
  w: Op;
};
type LightData = Parameters<THREE.LightsNode['setupDirectLight']>[2];
type Context = { lightingModel: { direct(data: object, builder: unknown): void }; reflectedLight: object; positionView?: Op };
// three's types still name the light vector `lightViewPosition`; the function reads `lightVector`.
const pointLight = directPointLight as unknown as (data: { color: Op; lightVector: Op; cutoffDistance: Op; decayExponent: Op }) => object;

/** The point lights the shader loop has room for: 2 vec4 each in the render uniform block, 4 KB for 128 (#921). */
export const MAX_LOOP_LIGHTS = 128;
/** A light the loop shades: a point light with no shadow and no colour node of its own, as three's lights are built. */
const loopable = (light: THREE.Light): light is THREE.PointLight =>
  (light as THREE.PointLight).isPointLight === true && !light.castShadow && !(light as { colorNode?: unknown }).colorNode;

const position = new THREE.Vector3();
const color = new THREE.Color();
const NO_SHADOW = { light: {}, shadowNode: null };

/**
 * The point lights in one shader loop over uniform arrays (#921). Three gives each light its own copy of the light code:
 * with the 76 lights each lit shader grew to about 200 KB and software WebGL took 17 s to compile a page. Each light
 * is three's point light (directPointLight, the lighting model's direct), with the cutoff branch of #882.
 */
class PointLightLoopNode extends THREE.Node {
  readonly lights: THREE.PointLight[] = [];
  readonly positions = Array.from({ length: MAX_LOOP_LIGHTS }, () => new THREE.Vector4());
  readonly colors = Array.from({ length: MAX_LOOP_LIGHTS }, () => new THREE.Vector4());
  readonly count = uniform(0, 'int').setGroup(renderGroup);
  private readonly positionsNode = uniformArray(this.positions, 'vec4').setGroup(renderGroup) as unknown as Op;
  private readonly colorsNode = uniformArray(this.colors, 'vec4').setGroup(renderGroup) as unknown as Op;

  constructor() {
    super();
    this.updateType = THREE.NodeUpdateType.RENDER;
  }

  // As three's point light: its position in the camera's view and its cutoff, its colour times intensity and its decay.
  override update(frame: Parameters<THREE.Node['update']>[0]): undefined {
    const camera = frame.camera!;
    this.count.value = this.lights.length;
    this.lights.forEach((light, i) => {
      position.setFromMatrixPosition(light.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      this.positions[i]!.set(position.x, position.y, position.z, light.distance);
      color.copy(light.color).multiplyScalar(light.intensity);
      this.colors[i]!.set(color.r, color.g, color.b, light.decay);
    });
  }

  override setup(builder: THREE.NodeBuilder): undefined {
    const { lightingModel, reflectedLight, positionView: surface } = builder.context as unknown as Context;
    Loop(this.count, ({ i }) => {
      const at = this.positionsNode.element(i).toVar(); // one read of each array per light
      const light = this.colorsNode.element(i).toVar();
      const lightVector = at.xyz.sub(surface ?? (positionView as unknown as Op)).toVar();
      const cutoff = at.w;
      If(cutoff.equal(0).or(lightVector.length().lessThan(cutoff)), () => {
        const data = pointLight({ color: light.xyz, lightVector, cutoffDistance: cutoff, decayExponent: light.w });
        lightingModel.direct({ ...data, lightNode: NO_SHADOW, reflectedLight }, builder);
      });
    });
  }
}

/**
 * WebGL's stand-in for clustered lighting (#882): a pixel shades a point light only inside its cutoff distance, where
 * the light adds exactly nothing anyway. The picture is the same and the GPU skips most of the 76 lights' work. The
 * point lights go through one loop (#921); a light past its room keeps a node and a branch of its own.
 */
class CulledLightsNode extends THREE.LightsNode {
  readonly loop = new PointLightLoopNode();
  private readonly builtin: THREE.Light[] = [];

  override setLights(lights: THREE.Light[]): this {
    this.loop.lights.length = 0;
    this.builtin.length = 0;
    for (const light of lights) {
      if (loopable(light) && this.loop.lights.length < MAX_LOOP_LIGHTS) this.loop.lights.push(light);
      else this.builtin.push(light);
    }
    return super.setLights(lights);
  }

  // Only these get a light node of their own, and only these make the shader's key: the looped lights can change freely.
  override getBuiltinLights(): THREE.Light[] {
    return this.builtin;
  }

  override setupLightsNode(builder: THREE.NodeBuilder): THREE.LightingNode[] {
    return [...super.setupLightsNode(builder), this.loop as unknown as THREE.LightingNode];
  }

  override setupLights(builder: THREE.NodeBuilder, lightNodes: Parameters<THREE.LightsNode['setupLights']>[1]): void {
    const { directDiffuse, directSpecular } = (builder.context as { reflectedLight: Record<string, Op> }).reflectedLight;
    directDiffuse!.addAssign(0); // declared before the lights' branches, so their sums outlive them
    directSpecular!.addAssign(0);
    super.setupLights(builder, lightNodes);
  }

  override setupDirectLight(builder: THREE.NodeBuilder, lightNode: THREE.Node, lightData: LightData): void {
    const point = lightNode as THREE.PointLightNode;
    if (!(point.light as THREE.PointLight).isPointLight) return super.setupDirectLight(builder, lightNode, lightData);
    const cutoff = point.cutoffDistanceNode as Op;
    If(cutoff.equal(0).or((point.getLightVector(builder) as Op).length().lessThan(cutoff)), () => {
      super.setupDirectLight(builder, lightNode, lightData);
    });
  }
}

export class CulledLighting extends THREE.Lighting {
  override createNode(lights: THREE.Light[] = []): THREE.LightsNode {
    return new CulledLightsNode().setLights(lights);
  }
}
