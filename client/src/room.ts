// Room deck surface and props (docs/specs/world.md section 1, 3 & 5, issue #470).
// Pure data and definitions: main.ts creates the Three.js meshes.

import type { Tier } from './quality';

export interface RoomSurface {
  y: number;
  width: number;
  depth: number;
  color: number;
  roughness: number;
}

export interface PropDef {
  id: string;
  type: 'cylinder' | 'box';
  size: readonly [number, number, number];
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  color: number;
  roughness: number;
}

// The table / deck plane the board sits on: sits just below the frame plate (-0.3)
export const ROOM_SURFACE: RoomSurface = {
  y: -0.31,
  width: 28,
  depth: 24,
  color: 0x181d22, // dark hauler steel, low-key, below board steel (0x4a5258)
  roughness: 0.85,
};

// Subtle props around the board (docs/specs/world.md section 1 & 3: derelict hauler mess table)
// Positioned safely outside the board perimeter (radius > 5.0)
export const PROPS: readonly PropDef[] = [
  // Steel mug / canister at the side
  {
    id: 'canister',
    type: 'cylinder',
    size: [0.18, 0.35, 16], // radius, height, radialSegments
    position: [5.6, -0.13, 1.2],
    rotation: [0, 0.3, 0],
    color: 0x2e353b,
    roughness: 0.7,
  },
  // Data slate / ledger tablet
  {
    id: 'slate',
    type: 'box',
    size: [0.55, 0.04, 0.85], // width, height, depth
    position: [-5.6, -0.28, -2.2],
    rotation: [0, -0.4, 0],
    color: 0x22282d,
    roughness: 0.8,
  },
  // Heavy cable conduit segment
  {
    id: 'conduit',
    type: 'cylinder',
    size: [0.08, 3.2, 12],
    position: [-6.2, -0.24, 2.0],
    rotation: [Math.PI / 2, 0, 0.5],
    color: 0x1a1e22,
    roughness: 0.9,
  },
];

export function propList(tier: Tier): readonly PropDef[] {
  return tier === 'high' ? PROPS : [];
}
