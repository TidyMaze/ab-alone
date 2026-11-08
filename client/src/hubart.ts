// 3D props for the hub room cells (#628, #1249): each room kind is a small prop standing on its cell (a blast door, a
// CRT, a table with chairs, a robot, an antenna, an arena, a lift cage, and for the modes a calendar, a map table, two
// marbles, a podium, a globe, a target dummy), ringed in its own contrast-safe colour.
import * as THREE from 'three';
import type { Axial } from './board';
import { LECTERN_TERMINALS, SEAT_BOSSES, type Door } from './hub';
import type { HubKit } from './tablezero';

export const GLYPH_COLORS = {
  boss: 0xe03131, // Crimson
  bossCore: 0xff922b, // Amber core
  bot: 0x22b8cf, // Cold cyan
  hotseat: 0xfab005, // Warm amber
  online: 0x40c057, // Signal green
  royale: 0xfd7e14, // Industrial orange
  terminal: 0x20c997, // Phosphor CRT green
  medals: 0xffd43b, // Medal gold
  lift: 0xe9ecef, // Bone white
  daily: 0x4dabf7, // Sky blue
  run: 0xda77f2, // Grape
  together: 0xf783ac, // Pink
  ranked: 0xa9e34b, // Lime
  world: 0x748ffc, // Indigo
  trainer: 0xd8a47f, // Tan
} as const;

export interface GlyphOptions {
  open?: boolean;
  cell?: Axial;
  beaten?: boolean; // a boss door whose boss is beaten stands open, with a gold seal (#1249)
}

// Cached basic materials for efficiency
const materials = Object.fromEntries(
  Object.entries(GLYPH_COLORS).map(([kind, color]) => [kind, new THREE.MeshBasicMaterial({ color })]),
) as Record<keyof typeof GLYPH_COLORS, THREE.MeshBasicMaterial>;
// The bodies of the props: rusted deck plate, lit by the deck's lamps.
const plate = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.75, metalness: 0.5 });
const lockedBarMaterial = new THREE.MeshBasicMaterial({ color: 0x0b0d0f });

// Procedural geometries
const outerRingGeo = new THREE.TorusGeometry(0.42, 0.025, 8, 32);
const coreOctaGeo = new THREE.OctahedronGeometry(0.09);
const postGeo = new THREE.BoxGeometry(0.06, 0.34, 0.06);
const lintelGeo = new THREE.BoxGeometry(0.5, 0.06, 0.06);
const slabGeo = new THREE.BoxGeometry(0.4, 0.3, 0.04);
const sealGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 20);
const crtBodyGeo = new THREE.BoxGeometry(0.4, 0.28, 0.24);
const crtScreenGeo = new THREE.BoxGeometry(0.32, 0.2, 0.01);
const tableTopGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20);
const tableLegGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.16, 8);
const chairGeo = new THREE.BoxGeometry(0.12, 0.22, 0.12);
const botBodyGeo = new THREE.BoxGeometry(0.22, 0.18, 0.16);
const botHeadGeo = new THREE.BoxGeometry(0.16, 0.12, 0.14);
const botEyeGeo = new THREE.SphereGeometry(0.035, 10, 8);
const mastGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.3, 8);
const antennaArcGeo1 = new THREE.TorusGeometry(0.1, 0.018, 6, 16, Math.PI * 0.6);
const antennaArcGeo2 = new THREE.TorusGeometry(0.18, 0.018, 6, 20, Math.PI * 0.6);
const arenaRingGeo = new THREE.TorusGeometry(0.28, 0.035, 8, 32);
const seatGeo = new THREE.BoxGeometry(0.06, 0.22, 0.06);
const plinthGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.14, 12);
const medalGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 20);
const cagePostGeo = new THREE.BoxGeometry(0.04, 0.34, 0.04);
const lecternBaseGeo = new THREE.BoxGeometry(0.46, 0.04, 0.34);
const lecternPostGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
const lecternScreenGeo = new THREE.BoxGeometry(0.84, 0.6, 0.04);
const lecternScreen = new THREE.MeshBasicMaterial({ color: 0x19e6ff }); // the neon cyan of the palette (art.md 1)
// The props of their own of the stations that share a prop of the file (#1556), in the palette (art.md 1): one draw each, no texture.
const seatLampGeo = new THREE.SphereGeometry(0.24, 12, 8);
const seatLamp = new THREE.MeshBasicMaterial({ color: 0xd9822b }); // sodium, the hazard: the deck's seat boss
const chevronGeo = new THREE.TorusGeometry(0.34, 0.06, 4, 3, Math.PI / 1.5); // an open triangle: a rank's chevron
const rankViolet = new THREE.MeshBasicMaterial({ color: 0x9a6bff });
const targetGeo = [new THREE.TorusGeometry(0.4, 0.06, 6, 24), new THREE.TorusGeometry(0.17, 0.06, 6, 16)];
/** How far the seat lamp floats over the top of the file's boss door. */
const LAMP_GAP = 0.26;
const arrowShape = new THREE.Shape(
  [[0.26, 0], [0.04, 0.18], [0.04, 0.07], [-0.2, 0.07], [-0.2, -0.07], [0.04, -0.07], [0.04, -0.18]].map(
    ([x, y]) => new THREE.Vector2(x, y),
  ),
);
const arrowGeo = new THREE.ShapeGeometry(arrowShape);
const lockedBarGeo = new THREE.BoxGeometry(0.84, 0.02, 0.05);
const calendarGeo = new THREE.BoxGeometry(0.36, 0.3, 0.05);
const calendarTopGeo = new THREE.BoxGeometry(0.36, 0.07, 0.07);
const daySquareGeo = new THREE.BoxGeometry(0.1, 0.1, 0.01);
const mapTopGeo = new THREE.BoxGeometry(0.46, 0.04, 0.32);
const nodeGeo = new THREE.SphereGeometry(0.045, 10, 8);
const twinGeo = new THREE.SphereGeometry(0.11, 16, 12);
const stepGeo = new THREE.BoxGeometry(0.16, 1, 0.2); // scaled to each step's height
const globeGeo = new THREE.SphereGeometry(0.15, 20, 14);
const orbitGeo = new THREE.TorusGeometry(0.2, 0.015, 6, 32);

/** A mesh of the prop at (x, y, z), its rotation about x and z. */
function part(geometry: THREE.BufferGeometry, material: THREE.Material, [x, y, z]: [number, number, number], rx = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, 0, rz);
  return mesh;
}

/** The near-black arrow flat on a lift's floor, up the map toward the deck above or down toward the one below (#523). */
function liftArrow(cell?: Axial, y = 0, paint: THREE.Material = lockedBarMaterial): THREE.Mesh {
  const arrow = new THREE.Mesh(arrowGeo, paint);
  if (cell) arrow.userData.cell = `${cell[0]},${cell[1]}`; // the e2e checks find it by its cell (__liftArrowY, #523)
  arrow.position.y = y;
  const cellY = cell?.[1] ?? 0;
  arrow.rotation.set(-Math.PI / 2, ((cellY < 0 ? 1 : -1) * Math.PI) / 2, 0, 'YXZ');
  return arrow;
}

/**
 * Creates the prop of a hub door kind (#628, #1249): a ring in the kind's colour flat on the floor at y = 0, and the
 * prop standing on it, facing the camera (+z).
 */
export function createDoorGlyph(door: Door, options: GlyphOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = `door-${door.kind}`;
  const accent = materials[door.kind];
  group.add(part(outerRingGeo, accent, [0, 0, 0], Math.PI / 2));

  switch (door.kind) {
    case 'boss': {
      // A blast door in a crimson frame: shut, a slab with the amber core; beaten, open with a gold seal.
      group.add(part(postGeo, accent, [-0.25, 0.17, 0]), part(postGeo, accent, [0.25, 0.17, 0]), part(lintelGeo, accent, [0, 0.34, 0]));
      if (options.beaten) {
        const seal = part(sealGeo, materials.medals, [0, 0.16, 0.02], Math.PI / 2);
        seal.name = 'beaten-seal';
        group.add(seal);
      } else {
        const slab = part(slabGeo, plate, [0, 0.15, 0]);
        slab.name = 'door-slab';
        group.add(slab, part(coreOctaGeo, materials.bossCore, [0, 0.16, 0.05]));
      }
      break;
    }

    case 'terminal': {
      // A CRT on the floor, its phosphor screen toward the camera.
      group.add(part(crtBodyGeo, plate, [0, 0.14, 0]), part(crtScreenGeo, accent, [0, 0.16, 0.125]));
      break;
    }

    case 'hotseat': {
      // A table for two: one leg, a top, and an amber chair on each side.
      group.add(
        part(tableLegGeo, plate, [0, 0.08, 0]),
        part(tableTopGeo, plate, [0, 0.18, 0]),
        part(chairGeo, accent, [-0.3, 0.11, 0]),
        part(chairGeo, accent, [0.3, 0.11, 0]),
      );
      break;
    }

    case 'bot': {
      // The ship AI's robot: a cyan body and head, an amber eye.
      group.add(
        part(botBodyGeo, accent, [0, 0.09, 0]),
        part(botHeadGeo, accent, [0, 0.25, 0]),
        part(botEyeGeo, materials.bossCore, [0, 0.26, 0.075]),
      );
      break;
    }

    case 'online': {
      // An antenna: a mast and two signal arcs opening up.
      group.add(
        part(mastGeo, plate, [0, 0.15, 0]),
        part(antennaArcGeo1, accent, [0, 0.3, 0], 0, Math.PI * 0.2),
        part(antennaArcGeo2, accent, [0, 0.3, 0], 0, Math.PI * 0.2),
      );
      break;
    }

    case 'royale': {
      // An arena: a raised orange ring and six seats around it.
      group.add(part(arenaRingGeo, accent, [0, 0.06, 0], Math.PI / 2));
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        group.add(part(seatGeo, plate, [Math.cos(a) * 0.3, 0.11, Math.sin(a) * 0.3]));
      }
      break;
    }

    case 'medals': {
      // A gold medal standing on a plinth, a gold core under it (#812).
      group.add(
        part(plinthGeo, plate, [0, 0.07, 0]),
        part(medalGeo, accent, [0, 0.27, 0], Math.PI / 2),
        part(coreOctaGeo, accent, [0, 0.27, 0.03]),
      );
      break;
    }

    case 'daily': {
      // A wall calendar on the floor: a blue header and the day's square.
      group.add(
        part(calendarGeo, plate, [0, 0.15, 0]),
        part(calendarTopGeo, accent, [0, 0.3, 0]),
        part(daySquareGeo, accent, [0.06, 0.12, 0.03]),
      );
      break;
    }

    case 'run': {
      // A map table: a low top and a branching route of three grape nodes.
      group.add(part(tableLegGeo, plate, [0, 0.08, 0]), part(mapTopGeo, plate, [0, 0.18, 0]));
      for (const [x, z] of [[-0.14, 0.08], [0.02, -0.06], [0.15, 0.08]] as const) group.add(part(nodeGeo, accent, [x, 0.24, z]));
      break;
    }

    case 'together': {
      // Two marbles side by side on one plinth: one army, two players.
      group.add(part(plinthGeo, plate, [0, 0.07, 0]), part(twinGeo, accent, [-0.1, 0.24, 0]), part(twinGeo, accent, [0.1, 0.24, 0]));
      break;
    }

    case 'ranked': {
      // A podium of three steps, the first one lime.
      for (const [x, h, material] of [[-0.17, 0.2, plate], [0, 0.3, accent], [0.17, 0.12, plate]] as const) {
        const step = part(stepGeo, material, [x, h / 2, 0]);
        step.scale.y = h;
        group.add(step);
      }
      break;
    }

    case 'world': {
      // A globe of Hollow on its stand, an orbit around it.
      group.add(part(mastGeo, plate, [0, 0.1, 0]), part(globeGeo, accent, [0, 0.33, 0]), part(orbitGeo, plate, [0, 0.33, 0], Math.PI / 2.4));
      break;
    }

    case 'trainer': {
      // A target dummy: a post and a tan target disc facing the camera, its bullseye in plate.
      group.add(part(mastGeo, plate, [0, 0.15, 0]), part(medalGeo, accent, [0, 0.3, 0.03], Math.PI / 2), part(coreOctaGeo, plate, [0, 0.3, 0.06]));
      break;
    }

    case 'lift': {
      // A lift cage: four bone-white posts, a near-black arrow on the floor toward its deck, and a bar across it while it
      // is locked (#523).
      for (const [x, z] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]] as const) {
        group.add(part(cagePostGeo, accent, [x, 0.17, z]));
      }
      group.add(liftArrow(options.cell));

      if (options.open === false) {
        const bar = new THREE.Mesh(lockedBarGeo, lockedBarMaterial);
        bar.name = 'locked-bar';
        bar.rotation.y = Math.PI / 4;
        group.add(bar);
      }
      break;
    }
  }

  return group;
}

/**
 * The prop of the Blender file (scene_hub_deck.glb) each kind of room wears on the terrace (#1374): the file draws twelve. The Medal room
 * stands a podium and the Fight-together room a dummy, which no other room of their deck has (hub.ts).
 */
export const KIT_PROP: Record<Door['kind'], string> = {
  boss: 'door',
  terminal: 'crt',
  hotseat: 'table',
  bot: 'robot',
  online: 'antenna',
  royale: 'arena',
  medals: 'podium',
  daily: 'calendar',
  run: 'map',
  together: 'dummy',
  ranked: 'podium',
  world: 'globe',
  trainer: 'dummy',
  lift: 'lift',
};

/** The second terminal of a deck (#1556): a lectern, a plate base and post, and a cyan screen tilted toward the camera. */
function lectern(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lectern';
  // the screen leans back to face the hub's camera from above: tilted toward it, it read as a sliver at the boss door's foot at 390 px
  group.add(part(lecternBaseGeo, plate, [0, 0.015, 0]), part(lecternPostGeo, plate, [0, 0.27, 0]), part(lecternScreenGeo, lecternScreen, [0, 0.7, 0.06], -0.9));
  return group;
}

/** The top of the file's prop `name` (its box), 0 when the file has none. */
function propTop(kit: HubKit, name: string): number {
  const piece = kit.parts[name]?.[0];
  return piece ? new THREE.Box3().setFromObject(piece).max.y : 0;
}

/** The prop of its own of a station that shares the file's prop (#1556), or none: a sodium lamp over the deck's seat boss door, violet
 * rank chevrons over the Ranked podium, a cyan target by the Trainer's dummy. */
function ownProp(kit: HubKit, door: Door): THREE.Object3D | null {
  if (door.kind === 'boss' && SEAT_BOSSES.has(door.boss)) {
    const lamp = part(seatLampGeo, seatLamp, [0, propTop(kit, 'door') + LAMP_GAP, 0]);
    lamp.name = 'seat-lamp';
    return lamp;
  }
  if (door.kind === 'ranked') {
    const chevrons = new THREE.Group();
    chevrons.name = 'rank-chevrons';
    const top = propTop(kit, 'podium');
    for (let k = 0; k < 3; k++) chevrons.add(part(chevronGeo, rankViolet, [0, top + 0.26 + k * 0.2, 0.05], 0, Math.PI / 2 + Math.PI / 6));
    return chevrons;
  }
  if (door.kind === 'trainer') {
    const target = new THREE.Group();
    target.name = 'trainer-target';
    for (const geometry of targetGeo) target.add(part(geometry, lecternScreen, [0.4, 0.55, 0]));
    return target;
  }
  return null;
}

/** A small gap over the top of the file's lift cage, so the arrow lies on top of it, in view (#523, #1374). */
const ARROW_GAP = 0.02;

/** Where a beaten door's gold seal hangs over the file's door: in front of its frame, at its middle. */
const KIT_SEAL: [number, number, number] = [0, 0.5, 0.06];

/**
 * A room of the hub in the Blender file's own prop, ring and shadow (the terrace's look, #1374), in place of the procedural glyph: the
 * game's state still shows, by the gold seal on a beaten boss door and the bar of the file across a locked lift. Same group names as
 * createDoorGlyph; the caller places it.
 */
export function createKitGlyph(kit: HubKit, door: Door, options: GlyphOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = `door-${door.kind}`;
  if (door.kind === 'terminal' && LECTERN_TERMINALS.has(door.lore)) group.add(lectern());
  else for (const piece of kit.parts[KIT_PROP[door.kind]] ?? []) group.add(piece.clone());
  const own = ownProp(kit, door);
  if (own) group.add(own);
  if (options.beaten) {
    const seal = part(sealGeo, materials.medals, KIT_SEAL, Math.PI / 2);
    seal.name = 'beaten-seal';
    group.add(seal);
  }
  // the file's cage has none: the arrow says which way it goes, on top of the cage, in bone white to read against the cage (#1374)
  if (door.kind === 'lift') group.add(liftArrow(options.cell, propTop(kit, 'lift') + ARROW_GAP, materials.lift));
  if (door.kind === 'lift' && options.open === false && kit.lockbar) {
    const bar = kit.lockbar.clone();
    bar.name = 'locked-bar';
    group.add(bar);
  }
  return group;
}
