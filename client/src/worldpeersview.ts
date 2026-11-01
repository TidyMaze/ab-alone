// The other heroes of the public Open world on screen (#1305): a marker marble on the cell of each one in view, and at the screen
// edge an arrow with the distance in tiles for each one out of view. The marker is one instanced mesh in the world's scene, the
// indicators are plain elements over the canvas.
import * as THREE from 'three/webgpu';
import { axialTo3D, type Axial } from './board';
import type { World } from './openworld';
import { GROUND, MARBLE, topOf } from './openworldview';
import { hexDistance, MAX_PEERS } from './worldpeers';

/** The marker marble of another hero: pink, to set it apart from the pale blue hero, the black enemies and the green ground. */
export const PEER_LOOK = { color: 0xff7ad9, emissive: 0x9a2a7c };
/** How far in from the screen's edge the indicator sits, as a share of the half screen. */
const MARGIN = 0.88;
/** How far a marker standing on the hero's own cell is lifted above it, so both show. */
const LIFT = 0.75;

export interface Spot {
  inside: boolean;
  /** The place of the indicator, in percent of the screen from its left and its top edge. */
  left: number;
  top: number;
  /** The way the arrow points, in radians clockwise from the right (CSS rotate). */
  angle: number;
}

/**
 * Where the indicator of a point goes: `x`, `y`, `z` are its normalised device coordinates (z above 1 is behind the camera),
 * `aspect` the screen's width over its height. A point behind the camera is mirrored through the centre, so its arrow points
 * away from the view. A point on screen keeps its own place; any other one goes where the line from the centre to it meets the margin of the screen.
 */
export function edgeSpot(x: number, y: number, z: number, aspect: number): Spot {
  const behind = z > 1;
  const nx = behind ? -x : x;
  const ny = behind ? -y : y;
  const inside = !behind && Math.abs(x) <= 1 && Math.abs(y) <= 1;
  const far = Math.max(Math.abs(nx), Math.abs(ny));
  const scale = inside ? 1 : far === 0 ? 0 : MARGIN / far;
  const px = nx * scale;
  const py = far === 0 ? -MARGIN : ny * scale; // dead behind the centre: the bottom edge
  return { inside, left: ((px + 1) / 2) * 100, top: ((1 - py) / 2) * 100, angle: Math.atan2(-py, px * aspect) };
}

export class PeersLayer {
  private readonly mesh: THREE.InstancedMesh;
  private readonly edges: HTMLElement[] = [];
  private readonly tags: HTMLElement[] = [];
  private shown = '';

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: Pick<World, 'tile'>,
    private readonly root: HTMLElement,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(MARBLE, 16, 12), new THREE.MeshStandardMaterial({ ...PEER_LOOK, roughness: 0.2 }), MAX_PEERS);
    this.mesh.name = 'peers';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /**
   * Draws `peers` for a hero standing on `hero`: a marker on each one in view on loaded ground, an edge indicator for the others.
   * Returns whether the markers changed, so the page draws the scene again.
   */
  update(peers: readonly { peer: string; cell: Axial; name: string }[], hero: Axial): boolean {
    this.camera.updateMatrixWorld();
    const point = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const out: { cell: Axial; spot: Spot; name: string }[] = [];
    const named: { spot: Spot; name: string }[] = [];
    let markers = 0;
    for (const { cell, name } of peers) {
      const p = axialTo3D(cell[0], cell[1]);
      const tile = this.world.tile(cell[0], cell[1]);
      const lift = cell[0] === hero[0] && cell[1] === hero[1] ? LIFT : 0;
      point.set(p.x, (tile ? topOf(GROUND[tile.terrain], tile.height) + MARBLE : MARBLE) + lift, p.z);
      this.mesh.setMatrixAt(markers, matrix.setPosition(point));
      const ndc = point.clone().project(this.camera);
      const spot = edgeSpot(ndc.x, ndc.y, ndc.z, this.camera.aspect);
      if (spot.inside && tile) {
        markers++;
        if (name) named.push({ spot, name });
      } else out.push({ cell, spot, name });
    }
    // The markers were written in order of the list, the ones kept first: a skipped slot is overwritten by the next marker.
    this.mesh.count = markers;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.indicate(out, named, hero);
    const key = peers.map((p) => `${p.peer}:${p.cell}`).join(' ');
    const changed = key !== this.shown;
    this.shown = key;
    return changed;
  }

  private indicate(out: { cell: Axial; spot: Spot; name: string }[], named: { spot: Spot; name: string }[], hero: Axial): void {
    this.pool(this.tags, named.length, () => {
      const tag = document.createElement('div');
      tag.className = 'peer-tag';
      tag.setAttribute('aria-hidden', 'true');
      return tag;
    });
    named.forEach(({ spot, name }, i) => {
      const tag = this.tags[i]!;
      tag.style.left = `${spot.left.toFixed(1)}%`;
      tag.style.top = `${spot.top.toFixed(1)}%`;
      tag.textContent = name; // text, never markup: a name comes from another player
    });
    this.pool(this.edges, out.length, () => {
      const edge = document.createElement('div');
      edge.className = 'peer-edge';
      edge.setAttribute('role', 'img');
      edge.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false"><path d="M4 4l16 8-16 8 3-8z" fill="currentColor" stroke="#0b0d0f" stroke-width="1.5" stroke-linejoin="round"/></svg><span></span>';
      return edge;
    });
    out.forEach(({ cell, spot, name }, i) => {
      const edge = this.edges[i]!;
      const tiles = hexDistance(hero, cell);
      edge.style.left = `${spot.left.toFixed(1)}%`;
      edge.style.top = `${spot.top.toFixed(1)}%`;
      edge.style.setProperty('--angle', `${spot.angle.toFixed(3)}rad`);
      edge.setAttribute('aria-label', `${name || 'Another hero'}, ${tiles} ${tiles === 1 ? 'tile' : 'tiles'} away`);
      edge.lastElementChild!.textContent = name ? `${name} ${tiles}` : String(tiles);
    });
    this.root.hidden = out.length === 0 && named.length === 0;
    this.root.dataset.peers = String(this.mesh.count + out.length); // for the browser checks
    this.root.dataset.edges = out.map(({ cell }) => hexDistance(hero, cell)).join(',');
  }

  /** Grows or shrinks `pool` to `size` elements, each made by `make` and added to the root. */
  private pool(pool: HTMLElement[], size: number, make: () => HTMLElement): void {
    while (pool.length < size) {
      const el = make();
      this.root.append(el);
      pool.push(el);
    }
    while (pool.length > size) pool.pop()!.remove();
  }

  /** Takes the marker out of the scene and frees it, and clears the indicators. */
  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.edges.length = 0;
    this.tags.length = 0;
    this.root.replaceChildren();
    this.root.hidden = true;
    delete this.root.dataset.peers;
    delete this.root.dataset.edges;
  }
}
