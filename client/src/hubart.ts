// 3D procedural glyph meshes and contrast-safe materials for hub room cells (#628).
// Distinguishes boss doors, game tables, terminals and lifts on the ship decks.
import * as THREE from 'three';
import type { Axial } from './board';
import type { Door } from './hub';

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
} as const;

export interface GlyphOptions {
  open?: boolean;
  cell?: Axial;
}

// Cached basic materials for efficiency
const materials = {
  boss: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.boss }),
  bossCore: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.bossCore }),
  bot: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.bot }),
  hotseat: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.hotseat }),
  online: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.online }),
  royale: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.royale }),
  terminal: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.terminal }),
  medals: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.medals }),
  lift: new THREE.MeshBasicMaterial({ color: GLYPH_COLORS.lift }),
};

// Procedural geometries
const outerRingGeo = new THREE.TorusGeometry(0.42, 0.025, 8, 32);
const innerRingGeo = new THREE.TorusGeometry(0.20, 0.02, 8, 24);
const hornGeo = new THREE.ConeGeometry(0.06, 0.16, 4);
const coreOctaGeo = new THREE.OctahedronGeometry(0.09);
const crescentGeo = new THREE.TorusGeometry(0.38, 0.025, 8, 24, Math.PI * 0.75);
const antennaArcGeo1 = new THREE.TorusGeometry(0.25, 0.02, 8, 24, Math.PI * 0.9);
const antennaArcGeo2 = new THREE.TorusGeometry(0.42, 0.02, 8, 24, Math.PI * 0.9);
const antennaCoreGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8);
const triangleGeo = new THREE.RingGeometry(0.30, 0.42, 3);
const crtScreenGeo = new THREE.BoxGeometry(0.55, 0.02, 0.42);
const crtInnerGeo = new THREE.BoxGeometry(0.45, 0.025, 0.32);
const arrowShape = new THREE.Shape(
  [[0.26, 0], [0.04, 0.18], [0.04, 0.07], [-0.2, 0.07], [-0.2, -0.07], [0.04, -0.07], [0.04, -0.18]].map(
    ([x, y]) => new THREE.Vector2(x, y),
  ),
);
const arrowGeo = new THREE.ShapeGeometry(arrowShape);
const lockedBarGeo = new THREE.BoxGeometry(0.84, 0.02, 0.05);

const lockedBarMaterial = new THREE.MeshBasicMaterial({ color: 0x0b0d0f });

/**
 * Creates a category-specific 3D glyph group for a hub door kind (#628).
 * Lying flat on the deck floor at y = 0.02.
 */
export function createDoorGlyph(door: Door, options: GlyphOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = `door-${door.kind}`;

  switch (door.kind) {
    case 'boss': {
      // Angular horned ring in crimson + glowing amber core
      const ring = new THREE.Mesh(outerRingGeo, materials.boss);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      // Horns on outer ring
      for (const angle of [-Math.PI / 3, Math.PI / 3]) {
        const horn = new THREE.Mesh(hornGeo, materials.boss);
        horn.position.set(Math.cos(angle) * 0.44, 0, Math.sin(angle) * 0.44);
        horn.rotation.z = -angle;
        group.add(horn);
      }

      // Amber core
      const core = new THREE.Mesh(coreOctaGeo, materials.bossCore);
      core.position.set(0, 0.04, 0);
      group.add(core);
      break;
    }

    case 'bot': {
      // Concentric target rings (cold cyan)
      const outer = new THREE.Mesh(outerRingGeo, materials.bot);
      outer.rotation.x = Math.PI / 2;
      const inner = new THREE.Mesh(innerRingGeo, materials.bot);
      inner.rotation.x = Math.PI / 2;
      group.add(outer, inner);
      break;
    }

    case 'hotseat': {
      // Dual opposing crescents (warm amber)
      const crescent1 = new THREE.Mesh(crescentGeo, materials.hotseat);
      crescent1.rotation.x = Math.PI / 2;
      crescent1.rotation.z = -Math.PI * 0.375;

      const crescent2 = new THREE.Mesh(crescentGeo, materials.hotseat);
      crescent2.rotation.x = Math.PI / 2;
      crescent2.rotation.z = Math.PI * 0.625;

      group.add(crescent1, crescent2);
      break;
    }

    case 'online': {
      // Concentric antenna & signal arcs (signal green)
      const core = new THREE.Mesh(antennaCoreGeo, materials.online);
      core.position.set(0, 0.02, 0);

      const arc1 = new THREE.Mesh(antennaArcGeo1, materials.online);
      arc1.rotation.x = Math.PI / 2;
      arc1.rotation.z = -Math.PI * 0.45;

      const arc2 = new THREE.Mesh(antennaArcGeo2, materials.online);
      arc2.rotation.x = Math.PI / 2;
      arc2.rotation.z = -Math.PI * 0.45;

      group.add(core, arc1, arc2);
      break;
    }

    case 'royale': {
      // Triangular industrial hazard frame (orange)
      const tri = new THREE.Mesh(triangleGeo, materials.royale);
      tri.rotation.x = -Math.PI / 2;
      group.add(tri);
      break;
    }

    case 'terminal': {
      // Rectangular retro CRT monitor frame (phosphor green)
      const frame = new THREE.Mesh(crtScreenGeo, materials.terminal);
      const inner = new THREE.Mesh(crtInnerGeo, materials.terminal);
      inner.position.y = 0.01;
      group.add(frame, inner);
      break;
    }

    case 'medals': {
      // A gold ring around a gold core: a medal (#812)
      const ring = new THREE.Mesh(outerRingGeo, materials.medals);
      ring.rotation.x = Math.PI / 2;
      const core = new THREE.Mesh(coreOctaGeo, materials.medals);
      core.position.set(0, 0.04, 0);
      group.add(ring, core);
      break;
    }

    case 'lift': {
      // Directional arrow in dark target steel + outer ring in bone-white + locked bar if closed (#523)
      const ring = new THREE.Mesh(outerRingGeo, materials.lift);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      const arrow = new THREE.Mesh(arrowGeo, lockedBarMaterial);
      const cellY = options.cell?.[1] ?? 0;
      arrow.rotation.set(-Math.PI / 2, ((cellY < 0 ? 1 : -1) * Math.PI) / 2, 0, 'YXZ');
      group.add(arrow);

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
