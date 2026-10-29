import * as THREE from 'three/webgpu';

/** From the gantry bar's middle down to the middle of the can. */
const DROP = 0.9;
const CAN = { radius: 0.4, length: 0.6 };
/** The lens glows: bright enough to read as a lit lamp from the free camera, in the colour of its light. */
const LENS_GLOW = 4;

/**
 * A spotlight hung under a gantry (#864): a short arm, a can and a lens, the can turned on the board's centre. The
 * light leaves from the lens and aims at the origin, the middle of the board (a spotlight's target is there by default).
 * The decay and the distance are 0, so the light has no falloff: its power reads as a directional light's.
 */
export class GantryLamp {
  readonly light: THREE.SpotLight;
  readonly fixture = new THREE.Group();
  private readonly can = new THREE.Group();
  private readonly lens: THREE.Mesh;
  private readonly glass = new THREE.MeshStandardMaterial({ color: 0x000000, emissiveIntensity: LENS_GLOW });

  constructor(name: string, cone: { angle: number; penumbra: number }) {
    this.light = new THREE.SpotLight();
    this.light.name = name;
    this.light.angle = cone.angle;
    this.light.penumbra = cone.penumbra;
    this.light.decay = 0;
    this.light.distance = 0;
    this.fixture.name = `${name} fixture`; // not a neon: no glow slider in ?lights

    const steel = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.5, metalness: 0.6 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, DROP, 0.1), steel);
    arm.position.y = DROP / 2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(CAN.radius, CAN.radius * 0.8, CAN.length, 16).rotateX(Math.PI / 2), steel);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(CAN.radius * 0.85, 16), this.glass);
    this.lens.name = 'lens';
    this.lens.position.z = CAN.length / 2 + 0.01; // the can looks down +Z (Object3D.lookAt)
    this.can.add(body, this.lens);
    this.fixture.add(arm, this.can);
  }

  /** Hangs under `gantry`, whose position main.ts has set, the lens turned on the board, and sends the light from the lens. */
  hang(gantry: THREE.Object3D): void {
    this.fixture.position.copy(gantry.position);
    this.fixture.position.y -= DROP;
    this.can.lookAt(0, 0, 0);
    this.lens.getWorldPosition(this.light.position);
  }

  /** The light's colour; the lens glows in it. */
  tint(color: number): void {
    this.light.color.set(color);
    this.glass.emissive.set(color);
  }
}
