import type * as THREE from 'three/webgpu';
import { axialTo3D, VANISHED, type Axial } from './board';
import { canEnter, roomsOf, step, type Spot as HubSpot } from './hub';
import { arrowCell, bumpLine, HUB_BOARD, hubHtml } from './hubview';
import { createDoorGlyph } from './hubart';
import type { SceneRenderer } from './scene';

export interface ModeController<TContext = unknown> {
  readonly id: string;
  enter(context: TContext): void;
  exit(): void;
  onCellClick?(cell: Axial, ...args: any[]): unknown;
  onPointerMove?(cell: Axial | null): boolean | void;
  onPointerLeave?(): boolean | void;
  hud?(): string | null;
}

export interface HubStepResult {
  stepped: boolean;
  at: HubSpot;
}

export class HubController implements ModeController<HubSpot> {
  readonly id = 'hub';
  at: HubSpot;
  hover: Axial | null = null;
  bumped = '';

  constructor(initialSpot: HubSpot) {
    this.at = initialSpot;
  }

  enter(spot: HubSpot): void {
    this.at = spot;
    this.hover = null;
    this.bumped = '';
    delete document.body.dataset.hubHover;
    document.body.dataset.hub = `${spot.deck} ${spot.cell[0]},${spot.cell[1]}`;
  }

  exit(): void {
    this.hover = null;
    delete document.body.dataset.hub;
    delete document.body.dataset.hubHover;
    delete document.body.dataset.lifts;
  }

  onPointerMove(cell: Axial | null): boolean {
    if (cell === this.hover || (cell && this.hover && cell[0] === this.hover[0] && cell[1] === this.hover[1])) {
      return false;
    }
    this.hover = cell;
    if (this.hover) document.body.dataset.hubHover = `${this.hover[0]},${this.hover[1]}`;
    else delete document.body.dataset.hubHover;
    return true;
  }

  onPointerLeave(): boolean {
    if (!this.hover) return false;
    this.hover = null;
    delete document.body.dataset.hubHover;
    return true;
  }

  onKeyDown(key: string, reading: boolean): Axial | null {
    if (reading) return null;
    return arrowCell(this.at.cell, key);
  }

  onCellClick(to: Axial, beaten: readonly string[]): HubStepResult {
    this.hover = null;
    delete document.body.dataset.hubHover;
    const from = this.at;
    const next = step(from, to, beaten);
    this.bumped = bumpLine(from, to, beaten);
    if (next === from) {
      return { stepped: false, at: from };
    }
    this.at = next;
    return { stepped: true, at: next };
  }

  hud(): string {
    return hubHtml(this.at, this.bumped, this.hover);
  }

  draw(
    sceneRenderer: SceneRenderer,
    discs: readonly THREE.Mesh[],
    sfx: { setTension(value: number): void },
    beaten: readonly string[],
    playerMarble: THREE.Mesh,
    drawFrame: (board: ArrayLike<number>) => unknown = (b) => sceneRenderer.drawFrame(b),
    lightRim: () => unknown = () => sceneRenderer.lightRim(null),
  ): void {
    const lifts: string[] = [];
    drawFrame(HUB_BOARD);
    lightRim();
    sceneRenderer.notches.clear();
    for (const group of sceneRenderer.tallies) group.clear();
    discs.forEach((disc, i) => {
      disc.visible = (HUB_BOARD[i] ?? VANISHED) !== VANISHED;
    });
    sceneRenderer.marbles.clear();
    sceneRenderer.ghosts.clear();
    sfx.setTension(0);

    for (const { cell, door } of roomsOf(this.at.deck)) {
      const p = axialTo3D(cell[0], cell[1]);
      const open = door.kind === 'lift' && canEnter(door, beaten);
      const glyph = createDoorGlyph(door, { open, cell });
      glyph.position.set(p.x, 0.02, p.z);
      sceneRenderer.marbles.add(glyph);
      if (door.kind === 'lift') lifts.push(`${door.to} ${open ? 'open' : 'locked'}`);
    }
    document.body.dataset.lifts = lifts.join(',');

    const p = axialTo3D(this.at.cell[0], this.at.cell[1]);
    playerMarble.position.set(p.x, 0.36, p.z);
    sceneRenderer.marbles.add(playerMarble);
    document.body.dataset.hub = `${this.at.deck} ${this.at.cell[0]},${this.at.cell[1]}`;
  }
}
