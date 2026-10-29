import * as THREE from 'three/webgpu';
import { If } from 'three/tsl';

// The few shader operators used here: three's types leave the lighting nodes untyped.
type Op = THREE.Node & { addAssign(v: number): Op; length(): Op; lessThan(v: Op): Op; equal(v: number): Op; or(v: Op): Op };
type LightData = Parameters<THREE.LightsNode['setupDirectLight']>[2];

/**
 * WebGL's stand-in for clustered lighting (#882): a pixel shades a point light only inside its cutoff distance, where
 * the light adds exactly nothing anyway. The picture is the same and the GPU skips most of the 76 lights' work.
 */
class CulledLightsNode extends THREE.LightsNode {
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
