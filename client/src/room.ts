// Spaceship interior architecture, room deck, pedestal and lighting (docs/specs/world.md section 1 & 5, issues #478, #485).
// Pure data definitions: main.ts creates the Three.js meshes and materials.

import type { Tier } from './quality';

export interface RoomSurface {
  y: number;
  width: number;
  depth: number;
  color: number;
  roughness: number;
}

// A box's size is its width, height and depth; a cylinder's its radiusTop, radiusBottom, height and radialSegments.
export type StructuralPart = {
  id: string;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  color: number;
  roughness: number;
} & (
  | { type: 'box'; size: readonly [number, number, number] }
  | { type: 'cylinder'; size: readonly [number, number, number, number] }
);

// The floor deck plane the board sits on: extends 64x64 to sit beneath all surrounding walls at radius 24
export const ROOM_SURFACE: RoomSurface = {
  y: -0.31,
  width: 64,
  depth: 64,
  color: 0x22272c, // Visible industrial hauler steel grating, below board steel (0x4a5258)
  roughness: 0.82,
};

// Pedestal anchoring the board into the deck floor
export function pedestalParts(): readonly StructuralPart[] {
  return [
    // Main pedestal body under the board plate
    {
      id: 'pedestal-core',
      type: 'cylinder',
      size: [3.9, 4.1, 0.22, 16], // radiusTop, radiusBottom, height, radialSegments
      position: [0, -0.20, 0],
      rotation: [0, 0, 0],
      color: 0x262c32,
      roughness: 0.8,
    },
    // Flanged base plate welded to the deck
    {
      id: 'pedestal-flange',
      type: 'cylinder',
      size: [4.4, 4.4, 0.08, 16],
      position: [0, -0.27, 0],
      rotation: [0, 0, 0],
      color: 0x1e2328,
      roughness: 0.88,
    },
  ];
}

// 360-degree spaceship bay enclosure surrounding the camera orbit (radius 24, well outside DIST_MAX 18)
export function spaceshipArchitecture(tier: Tier): readonly StructuralPart[] {
  const parts: StructuralPart[] = [
    ...pedestalParts(),

    // --- CORNER EQUIPMENT MODULES (Framing the 4 viewport corners around the board, radius 6.5 - 8.0) ---
    // NW corner: Avionics & Navigation terminal console (visible under top-left HUD)
    {
      id: 'corner-console-desk-nw',
      type: 'box',
      size: [2.0, 1.0, 1.2],
      position: [-5.5, 0.3, -5.5],
      color: 0x323a42,
      roughness: 0.75,
      rotation: [0, Math.PI / 4, 0],
    },
    {
      id: 'corner-console-screen-nw',
      type: 'box',
      size: [1.6, 0.7, 0.1],
      position: [-5.5, 0.95, -5.5],
      color: 0x223c34, // Phosphor screen tone
      roughness: 0.45,
      rotation: [0, Math.PI / 4, 0],
    },

    // NE corner: Auxiliary power reactor & conduit stack (visible under top-right buttons)
    {
      id: 'corner-generator-housing-ne',
      type: 'box',
      size: [1.8, 1.4, 1.4],
      position: [5.5, 0.5, -5.5],
      color: 0x303840,
      roughness: 0.78,
      rotation: [0, -Math.PI / 4, 0],
    },
    {
      id: 'corner-generator-cell-ne',
      type: 'cylinder',
      size: [0.35, 0.35, 1.8, 10],
      position: [5.5, 1.4, -5.5],
      color: 0x38424a,
      roughness: 0.7,
      rotation: [0, 0, 0],
    },

    // SW corner: Sealed ore cargo container with hazard straps (anchoring bottom-left)
    {
      id: 'corner-cargo-crate-sw',
      type: 'box',
      size: [1.8, 1.0, 1.4],
      position: [-5.5, 0.3, 3.8],
      color: 0x343c44,
      roughness: 0.82,
      rotation: [0, -Math.PI / 6, 0],
    },
    {
      id: 'corner-cargo-pallet-sw',
      type: 'box',
      size: [2.0, 0.15, 1.6],
      position: [-5.5, -0.22, 3.8],
      color: 0x242a30,
      roughness: 0.9,
      rotation: [0, -Math.PI / 6, 0],
    },
    // The deck's log recorder (#517, world.md section 4), left on the crate lid: a click plays its audio log.
    {
      id: 'log-recorder',
      type: 'box',
      size: [0.6, 0.2, 0.4],
      position: [-5.5, 0.9, 3.8],
      color: 0x5a4426, // worn amber casing, apart from the steel around it
      roughness: 0.6,
      rotation: [0, -Math.PI / 6, 0],
    },

    // SE corner: Life-support / oxygen tank rack (anchoring bottom-right)
    {
      id: 'corner-machinery-frame-se',
      type: 'box',
      size: [1.6, 1.2, 1.2],
      position: [5.5, 0.4, 3.8],
      color: 0x303840,
      roughness: 0.76,
      rotation: [0, Math.PI / 6, 0],
    },
    {
      id: 'corner-machinery-tank-se',
      type: 'cylinder',
      size: [0.25, 0.25, 1.5, 10],
      position: [5.5, 1.1, 3.8],
      color: 0x3a444c,
      roughness: 0.65,
      rotation: [0, 0, 0],
    },

    // --- 360-DEGREE OCTAGONAL WALL ENCLOSURE (Radius 24) ---
    // North wall (rear bulkhead with sealed airlock)
    {
      id: 'wall-north',
      type: 'box',
      size: [22.0, 18.0, 0.4],
      position: [0, 7.5, -24.0],
      color: 0x2c333a,
      roughness: 0.85,
      rotation: [0, 0, 0],
    },
    // South wall (forward viewing bay and blast gates)
    {
      id: 'wall-south',
      type: 'box',
      size: [22.0, 18.0, 0.4],
      position: [0, 7.5, 24.0],
      color: 0x2c333a,
      roughness: 0.85,
      rotation: [0, 0, 0],
    },
    // West wall (port systems and avionics terminal bank)
    {
      id: 'wall-west',
      type: 'box',
      size: [22.0, 18.0, 0.4],
      position: [-24.0, 7.5, 0],
      color: 0x2c333a,
      roughness: 0.85,
      rotation: [0, Math.PI / 2, 0],
    },
    // East wall (starboard conduit bank and machinery)
    {
      id: 'wall-east',
      type: 'box',
      size: [22.0, 18.0, 0.4],
      position: [24.0, 7.5, 0],
      color: 0x2c333a,
      roughness: 0.85,
      rotation: [0, Math.PI / 2, 0],
    },

    // Diagonal corner bulkheads (radius hypot(17, 17) = 24.04)
    {
      id: 'wall-diagonal-nw',
      type: 'box',
      size: [14.0, 18.0, 0.4],
      position: [-17.0, 7.5, -17.0],
      color: 0x2a3138,
      roughness: 0.86,
      rotation: [0, Math.PI / 4, 0],
    },
    {
      id: 'wall-diagonal-ne',
      type: 'box',
      size: [14.0, 18.0, 0.4],
      position: [17.0, 7.5, -17.0],
      color: 0x2a3138,
      roughness: 0.86,
      rotation: [0, -Math.PI / 4, 0],
    },
    {
      id: 'wall-diagonal-sw',
      type: 'box',
      size: [14.0, 18.0, 0.4],
      position: [-17.0, 7.5, 17.0],
      color: 0x2a3138,
      roughness: 0.86,
      rotation: [0, -Math.PI / 4, 0],
    },
    {
      id: 'wall-diagonal-se',
      type: 'box',
      size: [14.0, 18.0, 0.4],
      position: [17.0, 7.5, 17.0],
      color: 0x2a3138,
      roughness: 0.86,
      rotation: [0, Math.PI / 4, 0],
    },

    // --- STRUCTURAL CORNER BULKHEAD COLUMNS (Radius ~23.5) ---
    {
      id: 'bulkhead-column-nw-a',
      type: 'box',
      size: [1.2, 18.2, 1.2],
      position: [-10.5, 7.5, -23.5],
      color: 0x343c44,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },
    {
      id: 'bulkhead-column-ne-a',
      type: 'box',
      size: [1.2, 18.2, 1.2],
      position: [10.5, 7.5, -23.5],
      color: 0x343c44,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },
    {
      id: 'bulkhead-column-sw-a',
      type: 'box',
      size: [1.2, 18.2, 1.2],
      position: [-10.5, 7.5, 23.5],
      color: 0x343c44,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },
    {
      id: 'bulkhead-column-se-a',
      type: 'box',
      size: [1.2, 18.2, 1.2],
      position: [10.5, 7.5, 23.5],
      color: 0x343c44,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },
    {
      id: 'bulkhead-column-wn-b',
      type: 'box',
      size: [1.2, 18.2, 1.2],
      position: [-23.5, 7.5, -10.5],
      color: 0x343c44,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },
    {
      id: 'bulkhead-column-ws-b',
      type: 'box',
      size: [1.2, 18.2, 1.2],
      position: [-23.5, 7.5, 10.5],
      color: 0x343c44,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },
    {
      id: 'bulkhead-column-en-b',
      type: 'box',
      size: [1.2, 18.2, 1.2],
      position: [23.5, 7.5, -10.5],
      color: 0x343c44,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },
    {
      id: 'bulkhead-column-es-b',
      type: 'box',
      size: [1.2, 18.2, 1.2],
      position: [23.5, 7.5, 10.5],
      color: 0x343c44,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },

    // --- CEILING PERIMETER BEAMS (At y = 16.0, above camera) ---
    {
      id: 'beam-perimeter-north',
      type: 'box',
      size: [22.0, 1.0, 1.0],
      position: [0, 16.0, -23.5],
      color: 0x2e363e,
      roughness: 0.82,
      rotation: [0, 0, 0],
    },
    {
      id: 'beam-perimeter-south',
      type: 'box',
      size: [22.0, 1.0, 1.0],
      position: [0, 16.0, 23.5],
      color: 0x2e363e,
      roughness: 0.82,
      rotation: [0, 0, 0],
    },
    {
      id: 'beam-perimeter-west',
      type: 'box',
      size: [1.0, 1.0, 22.0],
      position: [-23.5, 16.0, 0],
      color: 0x2e363e,
      roughness: 0.82,
      rotation: [0, 0, 0],
    },
    {
      id: 'beam-perimeter-east',
      type: 'box',
      size: [1.0, 1.0, 22.0],
      position: [23.5, 16.0, 0],
      color: 0x2e363e,
      roughness: 0.82,
      rotation: [0, 0, 0],
    },

    // --- DIEGETIC AIRLOCK (North wall at z = -23.7) ---
    {
      id: 'airlock-frame',
      type: 'box',
      size: [5.0, 7.0, 0.4],
      position: [0, 3.5, -23.7],
      color: 0x3a424a,
      roughness: 0.75,
      rotation: [0, 0, 0],
    },
    {
      id: 'airlock-door',
      type: 'box',
      size: [4.2, 6.2, 0.2],
      position: [0, 3.5, -23.85],
      color: 0x282e34,
      roughness: 0.8,
      rotation: [0, 0, 0],
    },

    // --- DIEGETIC OBSERVATION / FORWARD BAY (South wall at z = 23.7) ---
    {
      id: 'observation-frame',
      type: 'box',
      size: [8.0, 5.0, 0.4],
      position: [0, 4.0, 23.7],
      color: 0x343c44,
      roughness: 0.78,
      rotation: [0, 0, 0],
    },
    {
      id: 'observation-glass',
      type: 'box',
      size: [7.2, 4.2, 0.2],
      position: [0, 4.0, 23.85],
      color: 0x1b2830, // Cool tinted reinforced space glass
      roughness: 0.4,
      rotation: [0, 0, 0],
    },

    // --- DIEGETIC TERMINAL CONSOLE (West wall at x = -23.4) ---
    {
      id: 'console-desk',
      type: 'box',
      size: [0.8, 2.4, 4.0],
      position: [-23.4, 1.2, 0],
      color: 0x30373e,
      roughness: 0.75,
      rotation: [0, 0, 0],
    },
    {
      id: 'console-screen',
      type: 'box',
      size: [0.1, 1.4, 2.8],
      position: [-22.95, 2.2, 0],
      color: 0x182e28, // Phosphor screen hue
      roughness: 0.5,
      rotation: [0, 0, 0],
    },

    // --- STARBOARD CONDUIT STACK (East wall at x = 23.4) ---
    {
      id: 'machinery-stack-main',
      type: 'cylinder',
      size: [0.35, 0.35, 14.0, 10],
      position: [23.4, 7.0, 0],
      color: 0x323a42,
      roughness: 0.78,
      rotation: [0, 0, 0],
    },
  ];

  // High tier gets fine architectural details (hazard lintels, locking wheel, floor conduits)
  if (tier === 'high') {
    parts.push(
      // Hazard warning lintel strip directly above airlock frame
      {
        id: 'hazard-lintel',
        type: 'box',
        size: [5.0, 0.5, 0.08],
        position: [0, 7.25, -23.65],
        color: 0x483a24, // Amber hazard steel
        roughness: 0.6,
        rotation: [0, 0, 0],
      },
      // Hazard strip on South observation deck threshold
      {
        id: 'hazard-lintel-south',
        type: 'box',
        size: [8.0, 0.4, 0.08],
        position: [0, 6.7, 23.65],
        color: 0x483a24,
        roughness: 0.6,
        rotation: [0, 0, 0],
      },
      // Airlock manual locking wheel hub
      {
        id: 'airlock-wheel-hub',
        type: 'cylinder',
        size: [0.45, 0.45, 0.1, 12],
        position: [0, 3.5, -23.7],
        color: 0x384048,
        roughness: 0.7,
        rotation: [Math.PI / 2, 0, 0],
      },
      // Floor power conduit lines routing from pedestal out toward bulkhead walls
      {
        id: 'conduit-deck-north',
        type: 'cylinder',
        size: [0.08, 0.08, 16.0, 8],
        position: [0, -0.27, -12.0],
        color: 0x20252a,
        roughness: 0.88,
        rotation: [Math.PI / 2, 0, 0],
      },
      {
        id: 'conduit-deck-south',
        type: 'cylinder',
        size: [0.08, 0.08, 16.0, 8],
        position: [0, -0.27, 12.0],
        color: 0x20252a,
        roughness: 0.88,
        rotation: [Math.PI / 2, 0, 0],
      },
      {
        id: 'conduit-deck-west',
        type: 'cylinder',
        size: [0.08, 0.08, 16.0, 8],
        position: [-12.0, -0.27, 0],
        color: 0x20252a,
        roughness: 0.88,
        rotation: [0, 0, Math.PI / 2],
      },
      {
        id: 'conduit-deck-east',
        type: 'cylinder',
        size: [0.08, 0.08, 16.0, 8],
        position: [12.0, -0.27, 0],
        color: 0x20252a,
        roughness: 0.88,
        rotation: [0, 0, Math.PI / 2],
      },
    );
  }

  return parts;
}

export interface SpaceshipLights {
  emergency: {
    color: number;
    intensity: number;
    position: readonly [number, number, number];
    distance: number;
  };
  rim: {
    color: number;
    intensity: number;
    position: readonly [number, number, number];
  };
}

export function spaceshipLights(): SpaceshipLights {
  return {
    // Dim sodium emergency light above the airlock hatch
    emergency: {
      color: 0xd9822b,
      intensity: 0.6,
      position: [0, 8.0, -22.0],
      distance: 28.0,
    },
    // Faint cold cyan rim backlight emphasizing the forward bay
    rim: {
      color: 0x7fd6e8,
      intensity: 0.4,
      position: [-18.0, 10.0, 18.0],
    },
  };
}

export const propList = spaceshipArchitecture;
