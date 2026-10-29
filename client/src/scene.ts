import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { pass } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { axialTo3D } from './board';
import { FOV, framing, screenView, viewPosition, type View } from './camera';
import { GantryLamp } from './gantrylamp';
import { DECKS, DECOR, LIGHT } from './light';
import { DECK_PARTICLES, type Deck } from './deck';
import { fogSettings, hasParticles, renderPixelRatio, type Tier } from './quality';
import { FRAME, frameShape, rimHalves, type FrameShape, type Point } from './frame';
import { notchRow } from './notches';
import { applyDeckAtmosphere, createBayLights, recolourBayLights, DECK_ATMOSPHERES, type DeckId, type SpaceshipBayAssets } from './roomloader';
import { ROOM_SURFACE, type StructuralPart } from './room';

export const BONE = 0xd8d4c8;
export const COLORS = { base: 0x0b0d0f, steel: 0x4a5258, cyan: 0x7fd6e8 } as const;
export const FRAME_LOOK = { plate: 0x1f1f1f, plateTiles: 0x808080, rim: 0x5d5d5d } as const;
/** The radius of the rounded edges of the board's plate and rim. */
const FRAME_BEVEL = 0.03;

export type NotchRow = NonNullable<ReturnType<typeof notchRow>>;

export interface SceneRendererOptions {
  /** main.ts makes it first: KTX2Loader asks it which GPU formats it reads (#700). */
  renderer: THREE.WebGPURenderer;
  innerWidth?: number;
  innerHeight?: number;
  devicePixelRatio?: number;
  webdriver?: boolean;
  backdrop?: THREE.Texture | null;
  deckAlbedo?: THREE.Texture | null;
  deckRoughness?: THREE.Texture | null;
  firstDeckMap?: THREE.Texture | null;
  firstDeckNormal?: THREE.Texture | null;
  plateAlbedo?: THREE.Texture | null;
  plateRoughness?: THREE.Texture | null;
  plateNormal?: THREE.Texture | null;
  plateMetalness?: THREE.Texture | null;
  rimAlbedo?: THREE.Texture | null;
  rimRoughness?: THREE.Texture | null;
  rimNormal?: THREE.Texture | null;
}

export interface ViewContext {
  tier: Tier;
  clear: boolean;
  deck: Deck;
  consoleDef?: {
    position: readonly [number, number, number];
    size: readonly [number, number, number, ...number[]];
  };
}

export function createBloomPipeline(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): (THREE.RenderPipeline & { bloom: ReturnType<typeof bloom> }) | null {
  try {
    const pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    const colorNode = scenePass.getTextureNode('output');
    const bloomNode = bloom(colorNode, 0.175, 0.15, 1);
    bloomNode.setResolutionScale(0.25); // a soft glow: a quarter of the resolution is enough (#781, #844)
    pipeline.outputNode = colorNode.add(bloomNode);
    return Object.assign(pipeline, { bloom: bloomNode }); // its strength, radius and threshold tuned with ?lights

  } catch {
    return null;
  }
}

export class SceneRenderer {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGPURenderer;
  readonly backend: 'WebGPU' | 'WebGL2';
  readonly pipeline: ReturnType<typeof createBloomPipeline> = null;

  /** The key and the fill: spotlights under the north and the south gantry, aimed at the board (#864). */
  readonly key: GantryLamp;
  readonly fill: GantryLamp;
  readonly coldRim: THREE.DirectionalLight;
  readonly warmLight: THREE.PointLight;
  readonly decor: THREE.Group;
  readonly decorMaterial: THREE.MeshStandardMaterial;

  readonly fogObj: THREE.Fog;
  readonly particles: THREE.Points;
  readonly particlePositions: Float32Array;
  readonly particleGeometry: THREE.BufferGeometry;
  readonly particlePositionAttr: THREE.BufferAttribute;
  readonly particleMaterial: THREE.PointsMaterial;

  readonly plate: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly rim: {
    near: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    far: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  };
  readonly roomDeck: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly propsGroup: THREE.Group;

  readonly notches: THREE.Group;
  readonly tallies: readonly [THREE.Group, THREE.Group];
  readonly marbles: THREE.Group;
  readonly ghosts: THREE.Group;
  readonly arenaMarbles: THREE.Group;

  readonly grooveGeometry: THREE.BoxGeometry;
  readonly scratchGeometry: THREE.BoxGeometry;
  readonly thresholdGeometry: THREE.BufferGeometry;
  readonly thresholdMarkGeometry: THREE.BufferGeometry;
  readonly grooveMaterial: THREE.MeshBasicMaterial;
  readonly scratchMaterial: THREE.MeshBasicMaterial;

  frame: FrameShape | null = null;
  fogRadius = 4;
  currentBay: SpaceshipBayAssets | null = null;
  bayLights: THREE.Group | null = null; // the bay's lamps (#776), put back by main.ts when it redraws the props (#787)
  private lastParticleNow = 0;

  constructor(options: SceneRendererOptions) {
    const width = options.innerWidth ?? innerWidth;
    const height = options.innerHeight ?? innerHeight;
    const dpr = options.devicePixelRatio ?? devicePixelRatio;
    const webdriver = options.webdriver ?? Boolean(navigator.webdriver);

    this.renderer = options.renderer;
    this.renderer.setPixelRatio(renderPixelRatio(dpr, webdriver));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    const b = (this.renderer.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend;
    this.backend = b ? 'WebGPU' : 'WebGL2';

    this.scene = new THREE.Scene();
    this.scene.name = 'abalone-scene';
    this.scene.background = options.backdrop ?? new THREE.Color(COLORS.base);
    this.scene.environmentIntensity = LIGHT.environment.intensity;

    this.camera = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 100);
    this.frameCamera(width, height);

    this.key = new GantryLamp('key', LIGHT.spots.key);
    const { shadow } = this.key.light;
    this.key.light.castShadow = true;
    shadow.mapSize.set(LIGHT.key.shadow.mapSize, LIGHT.key.shadow.mapSize);
    shadow.camera.near = LIGHT.key.shadow.camera.near;
    shadow.camera.far = LIGHT.key.shadow.camera.far;
    shadow.bias = LIGHT.key.shadow.bias;
    shadow.normalBias = LIGHT.key.shadow.normalBias;
    this.fill = new GantryLamp('fill', LIGHT.spots.fill);

    this.coldRim = new THREE.DirectionalLight(LIGHT.accents.rim.color, LIGHT.accents.rim.intensity);
    this.coldRim.position.set(...LIGHT.accents.rim.position);
    this.coldRim.name = 'cold rim';
    this.warmLight = new THREE.PointLight(LIGHT.accents.warm.color, LIGHT.accents.warm.intensity, LIGHT.accents.warm.distance);
    this.warmLight.name = 'warm accent';
    this.warmLight.position.set(...LIGHT.accents.warm.position);

    this.decorMaterial = new THREE.MeshStandardMaterial({
      color: DECOR.color,
      emissive: 0x38e8ff,
      emissiveIntensity: 5.5,
      roughness: 0.2,
      fog: true,
    });
    this.decor = new THREE.Group();
    for (const x of [-13, -4.5, 4.5, 13]) {
      const neon = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 0.14), this.decorMaterial);
      neon.position.set(x, 14.8, -23.2);
      this.decor.add(neon);
    }

    this.fogObj = new THREE.Fog(DECK_ATMOSPHERES.mess.fogColor, 10, 20);

    const maxParticles = 96;
    this.particleGeometry = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(maxParticles * 3);
    for (let i = 0; i < maxParticles; i++) this.resetParticle(i);
    this.particlePositionAttr = new THREE.BufferAttribute(this.particlePositions, 3);
    this.particleGeometry.setAttribute('position', this.particlePositionAttr);
    this.particleMaterial = new THREE.PointsMaterial({
      size: 0.1,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      fog: false,
    });
    this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.particles.visible = false;

    for (const map of [options.plateAlbedo, options.plateRoughness, options.plateNormal, options.plateMetalness]) {
      if (!map) continue;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(0.15, 0.15);
    }

    // The Metal051A and Onyx013 displacement maps stay out: the plate and the rim are flat slabs whose faces have no
    // vertex inside their outline to move, and the normal map already carries the relief. Onyx013 is stone, with no metalness map.
    const plateMaterial = new THREE.MeshStandardMaterial(
      options.plateAlbedo
        ? {
            map: options.plateAlbedo,
            roughnessMap: options.plateRoughness || null,
            normalMap: options.plateNormal || null,
            ...(options.plateMetalness ? { metalnessMap: options.plateMetalness, metalness: 1 } : {}),
            color: FRAME_LOOK.plateTiles,
            roughness: 0.4,
          }
        : options.deckAlbedo && options.deckRoughness
          ? { map: options.deckAlbedo, roughnessMap: options.deckRoughness, color: FRAME_LOOK.plate }
          : { color: FRAME_LOOK.plate, roughness: 0.8 },
    );
    const rimMaterial = new THREE.MeshStandardMaterial(
      options.rimAlbedo
        ? {
            map: options.rimAlbedo,
            roughnessMap: options.rimRoughness || null,
            normalMap: options.rimNormal || null,
            color: FRAME_LOOK.rim,
            roughness: 0.35,
            metalness: 0.65,
            emissiveIntensity: 0.6,
          }
        : options.plateAlbedo
          ? { map: options.plateAlbedo, roughnessMap: options.plateRoughness || null, color: FRAME_LOOK.rim, roughness: 0.35, metalness: 0.65, emissiveIntensity: 0.6 }
          : options.deckAlbedo && options.deckRoughness
            ? { map: options.deckAlbedo, roughnessMap: options.deckRoughness, color: FRAME_LOOK.rim, metalness: 0.3, emissiveIntensity: 0.6 }
            : { color: COLORS.steel, roughness: 0.5, metalness: 0.3, emissiveIntensity: 0.6 },
    );
    this.plate = new THREE.Mesh(new THREE.BufferGeometry(), plateMaterial);
    this.plate.receiveShadow = true;
    this.rim = {
      near: new THREE.Mesh(new THREE.BufferGeometry(), rimMaterial),
      far: new THREE.Mesh(new THREE.BufferGeometry(), rimMaterial.clone()),
    };
    this.rim.near.receiveShadow = true;
    this.rim.far.receiveShadow = true;

    const roomMaterial = new THREE.MeshStandardMaterial(
      options.deckAlbedo && options.deckRoughness
        ? { map: options.deckAlbedo, roughnessMap: options.deckRoughness, color: ROOM_SURFACE.color, fog: false }
        : { color: ROOM_SURFACE.color, roughness: ROOM_SURFACE.roughness, fog: false },
    );
    this.roomDeck = new THREE.Mesh(new THREE.BoxGeometry(ROOM_SURFACE.width, 0.4, ROOM_SURFACE.depth), roomMaterial);
    this.roomDeck.position.set(0, ROOM_SURFACE.y - 0.2, 0);
    this.roomDeck.receiveShadow = true;
    this.propsGroup = new THREE.Group();

    this.notches = new THREE.Group();
    this.tallies = [new THREE.Group(), new THREE.Group()] as const;
    this.marbles = new THREE.Group();
    this.ghosts = new THREE.Group();
    this.arenaMarbles = new THREE.Group();

    this.grooveGeometry = new THREE.BoxGeometry(0.14, 0.02, 0.21);
    this.scratchGeometry = new THREE.BoxGeometry(0.08, 0.03, 0.15);
    this.thresholdGeometry = new THREE.CircleGeometry(0.13, 3).rotateZ(Math.PI).rotateX(-Math.PI / 2);
    this.thresholdMarkGeometry = new THREE.CircleGeometry(0.08, 3).rotateZ(Math.PI).rotateX(-Math.PI / 2);
    this.grooveMaterial = new THREE.MeshBasicMaterial({ color: COLORS.base, fog: false });
    this.scratchMaterial = new THREE.MeshBasicMaterial({ color: BONE, fog: false });

    this.scene.add(
      this.key.light,
      this.key.fixture,
      this.fill.light,
      this.fill.fixture,
      this.coldRim,
      this.warmLight,
      this.decor,
      this.particles,
      this.roomDeck,
      this.propsGroup,
      this.plate,
      this.rim.near,
      this.rim.far,
      this.notches,
      this.tallies[0],
      this.tallies[1],
      this.marbles,
      this.ghosts,
    );

    this.pipeline = createBloomPipeline(this.renderer, this.scene, this.camera);
  }

  async init(): Promise<void> {
    await this.renderer.init();
  }

  resetParticle(i: number): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5.5 + Math.random() * 11.5;
    this.particlePositions[i * 3] = Math.cos(angle) * radius;
    this.particlePositions[i * 3 + 1] = -0.3 + Math.random() * 7.0;
    this.particlePositions[i * 3 + 2] = Math.sin(angle) * radius;
  }

  frameCamera(width: number, height: number): void {
    const { fov, shift } = framing(width, height);
    this.camera.aspect = width / height;
    this.camera.fov = fov;
    this.camera.setViewOffset(width, height, 0, -shift, width, height);
  }

  applyView(view: View, reading: View | null, context: ViewContext): void {
    const consoleDef = context.consoleDef ?? {
      position: [0, 0, 0] as const,
      size: [1, 1, 1] as const,
    };
    const [x, y, z] = reading ? consoleDef.position : [0, 0, 0];
    const [, height, width] = consoleDef.size;
    const p = reading
      ? screenView({ x, y, z }, { x: 1, y: 0, z: 0 }, width, height, this.camera.fov, this.camera.aspect)
      : viewPosition(view);

    this.camera.position.set(p.x, p.y, p.z);
    this.camera.lookAt(x, y, z);
    // The picture slides right by the aside of the view (#695), never while reading: the reader centres the screen.
    const { fullWidth, fullHeight, offsetY } = this.camera.view!;
    this.camera.setViewOffset(fullWidth, fullHeight, reading ? 0 : (-view.aside * fullWidth) / 2, offsetY, fullWidth, fullHeight);
    this.camera.updateMatrixWorld();
    this.updateFog(context.tier, context.clear, view, this.fogRadius, context.deck);
  }

  updateFog(tier: Tier, clear: boolean, view: View, fogRadius: number, deck: Deck): void {
    const fog = fogSettings(tier, clear, view, fogRadius, DECKS[deck].fog);
    if (!fog) {
      this.scene.fog = null;
    } else {
      this.fogObj.near = fog.near;
      this.fogObj.far = fog.far;
      this.fogObj.color.setHex(DECK_ATMOSPHERES[deck as DeckId].fogColor);
      if (this.scene.fog !== this.fogObj) this.scene.fog = this.fogObj;
    }
  }

  updateParticles(tier: Tier, clear: boolean, reducedMotion: boolean, webdriver: boolean, forceParticles: boolean, deck: Deck): void {
    const conf = DECK_PARTICLES[deck];
    const enabled = hasParticles(tier, clear, reducedMotion, webdriver, forceParticles) && conf.count > 0;
    this.particles.visible = enabled;
    if (!enabled) return;
    this.particleMaterial.color.setHex(conf.color);
    this.particleMaterial.size = conf.size;
    this.particleMaterial.opacity = conf.opacity;
    this.particleGeometry.setDrawRange(0, conf.count);
  }

  animateParticles(now: number, deck: Deck): void {
    if (!this.particles.visible) {
      this.lastParticleNow = now;
      return;
    }
    const dt = this.lastParticleNow ? Math.min(0.08, (now - this.lastParticleNow) / 1000) : 0.016;
    this.lastParticleNow = now;
    const conf = DECK_PARTICLES[deck];
    for (let i = 0; i < conf.count; i++) {
      const o = i * 3;
      this.particlePositions[o]! += conf.drift[0] * dt * 10;
      this.particlePositions[o + 1]! += conf.drift[1] * dt * 10;
      this.particlePositions[o + 2]! += conf.drift[2] * dt * 10;
      const x = this.particlePositions[o]!;
      const y = this.particlePositions[o + 1]!;
      const z = this.particlePositions[o + 2]!;
      if (y > 7.5 || y < -0.4 || Math.hypot(x, z) > 17.5 || Math.hypot(x, z) < 5.2) {
        this.resetParticle(i);
      }
    }
    this.particlePositionAttr.needsUpdate = true;
  }

  applyDeck(next: Deck): void {
    const light = DECKS[next];
    for (const [lamp, { color, intensity }] of [[this.key, light.key], [this.fill, light.fill]] as const) {
      lamp.tint(color);
      lamp.light.intensity = intensity;
    }
    this.renderer.toneMappingExposure = light.exposure;
    if (this.currentBay) {
      applyDeckAtmosphere(this.currentBay, next as DeckId);
      if (this.bayLights) recolourBayLights(this.bayLights, next as DeckId);
    }
  }

  drawFrame(board: ArrayLike<number>): FrameShape | null {
    const next = frameShape(board);
    if (this.frame && JSON.stringify(next) === JSON.stringify(this.frame)) return null;
    this.frame = next;
    this.fogRadius = next.radius;

    const flat = (points: Point[]): THREE.Vector2[] => points.map((p) => new THREE.Vector2(p.x, -p.z));
    // Rounded edges catch the light where square ones cut it: the bevel stays inside the slab's outline (offset) and
    // height (a thinner extrusion), so the cells and the marbles sit where they did.
    const slab = (shape: THREE.Shape, top: number, depth: number): THREE.ExtrudeGeometry =>
      new THREE.ExtrudeGeometry(shape, {
        depth: depth - 2 * FRAME_BEVEL,
        bevelEnabled: true,
        bevelThickness: FRAME_BEVEL,
        bevelSize: FRAME_BEVEL,
        bevelOffset: -FRAME_BEVEL,
        bevelSegments: 2,
      })
        .rotateX(-Math.PI / 2)
        .translate(0, top - depth + FRAME_BEVEL, 0);

    const plateShape = new THREE.Shape(flat(next.inner));
    for (const h of next.holes) plateShape.holes.push(new THREE.Path().absarc(h.x, -h.z, FRAME.hole, 0, 2 * Math.PI, true));
    this.plate.geometry.dispose();
    this.plate.geometry = slab(plateShape, -0.1, 0.2);

    const halves = rimHalves(next);
    for (const end of ['near', 'far'] as const) {
      this.rim[end].geometry.dispose();
      this.rim[end].geometry = slab(new THREE.Shape(flat(halves[end])), 0, 0.3);
    }
    return next;
  }

  lightRim(light: { end: 'near' | 'far'; color: number } | null): void {
    for (const end of ['near', 'far'] as const) {
      this.rim[end].material.emissive.set(light?.end === end ? light.color : 0);
    }
  }

  drawNotches(row: NotchRow | null): void {
    this.notches.clear();
    if (!row) return;

    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, p: Point, y: number): void => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(p.x, y, p.z);
      this.notches.add(mesh);
    };

    for (const n of row.notches) {
      add(this.grooveGeometry, this.grooveMaterial, n, 0);
      if (n.lit) add(this.scratchGeometry, this.scratchMaterial, n, 0);
    }
    add(this.thresholdGeometry, this.grooveMaterial, row.glyph, 0.005);
    add(this.thresholdMarkGeometry, this.scratchMaterial, row.glyph, 0.01);
  }

  drawTally(frame: FrameShape | null, rows: readonly (readonly { marked: boolean }[])[]): void {
    if (!frame) return;
    this.tallies.forEach((group, s) => {
      group.clear();
      const list = rows[s] ?? [];
      for (let i = 0; i < list.length; i++) {
        const item = list[i]!;
        const groove = new THREE.Mesh(this.grooveGeometry, this.grooveMaterial);
        groove.position.set((i - 2.5) * 0.25, 0, s === 0 ? 3.2 : -3.2);
        group.add(groove);
        if (item.marked) {
          const scratch = new THREE.Mesh(this.scratchGeometry, this.scratchMaterial);
          scratch.position.copy(groove.position);
          group.add(scratch);
        }
      }
    });
  }

  mountBay(bay: SpaceshipBayAssets | null, deck: Deck): void {
    if (this.bayLights) {
      this.propsGroup.remove(this.bayLights);
      this.bayLights = null;
    }
    this.currentBay = bay;
    if (this.currentBay) {
      this.roomDeck.visible = false;
      applyDeckAtmosphere(this.currentBay, deck as DeckId);
      this.propsGroup.add(this.currentBay.scene);
      this.bayLights = createBayLights(deck as DeckId);
      this.propsGroup.add(this.bayLights);
    } else {
      this.roomDeck.visible = true;
    }
  }

  cellToScreen(q: number, r: number, width: number, height: number, scale = 1): { x: number; y: number } {
    const p = axialTo3D(q, r, scale);
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3(p.x, 0, p.z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * width,
      y: ((1 - v.y) / 2) * height,
    };
  }

  render(): void {
    if (this.pipeline) {
      try {
        this.pipeline.render();
        return;
      } catch {
        // Fall back to renderer if pipeline fails in mock or test environment
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
