// Spaceship interior architecture, room deck, pedestal and lighting (docs/specs/world.md section 1 & 5, issue #478).
// Pure data definitions: main.ts creates the Three.js meshes and materials.

import type { Tier } from './quality';

export interface RoomSurface {
  y: number;
  width: number;
  depth: number;
  color: number;
  roughness: number;
}

export interface StructuralPart {
  id: string;
  type: 'box' | 'cylinder';
  size: readonly [number, number, number] | readonly [number, number, number, number];
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  color: number;
  roughness: number;
}

// The floor deck plane the board sits on: sits just below the frame plate (-0.3)
export const ROOM_SURFACE: RoomSurface = {
  y: -0.31,
  width: 32,
  depth: 28,
  color: 0x181d22, // dark hauler steel, low-key, below board steel (0x4a5258)
  roughness: 0.85,
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
      color: 0x1d2227,
      roughness: 0.8,
    },
    // Flanged base plate welded to the deck
    {
      id: 'pedestal-flange',
      type: 'cylinder',
      size: [4.4, 4.4, 0.08, 16],
      position: [0, -0.27, 0],
      rotation: [0, 0, 0],
      color: 0x15181c,
      roughness: 0.9,
    },
  ];
}

// Cohesive spaceship compartment architecture (bulkhead arches, rear wall, sealed airlock)
export function spaceshipArchitecture(tier: Tier): readonly StructuralPart[] {
  const parts: StructuralPart[] = [
    ...pedestalParts(),

    // --- REAR BULKHEAD WALL (z = -8.5) ---
    {
      id: 'rear-wall',
      type: 'box',
      size: [24.0, 6.0, 0.2],
      position: [0, 2.4, -8.5],
      color: 0x14181c,
      roughness: 0.88,
      rotation: [0, 0, 0],
    },

    // Sealed airlock outer door frame
    {
      id: 'airlock-frame',
      type: 'box',
      size: [3.4, 4.0, 0.3],
      position: [0, 1.4, -8.35],
      color: 0x22282e,
      roughness: 0.75,
      rotation: [0, 0, 0],
    },

    // Recessed pressure hatch door
    {
      id: 'airlock-door',
      type: 'box',
      size: [2.8, 3.5, 0.15],
      position: [0, 1.4, -8.42],
      color: 0x171b1f,
      roughness: 0.82,
      rotation: [0, 0, 0],
    },

    // --- STRUCTURAL BULKHEAD ARCH (Framing the scene at z = -6.8) ---
    {
      id: 'arch-col-left',
      type: 'box',
      size: [0.6, 5.8, 0.6],
      position: [-8.0, 2.3, -6.8],
      color: 0x1c2126,
      roughness: 0.82,
      rotation: [0, 0, 0],
    },
    {
      id: 'arch-col-right',
      type: 'box',
      size: [0.6, 5.8, 0.6],
      position: [8.0, 2.3, -6.8],
      color: 0x1c2126,
      roughness: 0.82,
      rotation: [0, 0, 0],
    },
    {
      id: 'arch-beam-top',
      type: 'box',
      size: [16.6, 0.6, 0.6],
      position: [0, 5.0, -6.8],
      color: 0x1c2126,
      roughness: 0.82,
      rotation: [0, 0, 0],
    },
    {
      id: 'arch-brace-left',
      type: 'box',
      size: [0.3, 1.8, 0.4],
      position: [-7.0, 4.3, -6.8],
      color: 0x1a1e22,
      roughness: 0.85,
      rotation: [0, 0, Math.PI / 4],
    },
    {
      id: 'arch-brace-right',
      type: 'box',
      size: [0.3, 1.8, 0.4],
      position: [7.0, 4.3, -6.8],
      color: 0x1a1e22,
      roughness: 0.85,
      rotation: [0, 0, -Math.PI / 4],
    },

    // Ceiling longitudinal girders connecting arch to rear wall
    {
      id: 'girder-longitudinal-left',
      type: 'box',
      size: [0.4, 0.4, 2.0],
      position: [-8.0, 5.0, -7.6],
      color: 0x161a1e,
      roughness: 0.85,
      rotation: [0, 0, 0],
    },
    {
      id: 'girder-longitudinal-right',
      type: 'box',
      size: [0.4, 0.4, 2.0],
      position: [8.0, 5.0, -7.6],
      color: 0x161a1e,
      roughness: 0.85,
      rotation: [0, 0, 0],
    },
  ];

  // High tier gets fine architectural details (hazard lintel, airlock pressure wheel, floor conduits)
  if (tier === 'high') {
    parts.push(
      // Hazard warning lintel strip directly above airlock frame
      {
        id: 'hazard-lintel',
        type: 'box',
        size: [3.4, 0.3, 0.06],
        position: [0, 3.45, -8.28],
        color: 0x362c1e, // Muted amber / hazard steel
        roughness: 0.6,
        rotation: [0, 0, 0],
      },
      // Airlock manual locking wheel hub
      {
        id: 'airlock-wheel-hub',
        type: 'cylinder',
        size: [0.35, 0.35, 0.08, 12],
        position: [0, 1.4, -8.32],
        color: 0x242a30,
        roughness: 0.7,
        rotation: [Math.PI / 2, 0, 0],
      },
      // Floor power conduit lines routing from pedestal into deck
      {
        id: 'conduit-deck-left',
        type: 'cylinder',
        size: [0.08, 0.08, 4.2, 8],
        position: [-3.4, -0.27, -2.4],
        color: 0x15181b,
        roughness: 0.9,
        rotation: [Math.PI / 2, 0, -0.4],
      },
      {
        id: 'conduit-deck-right',
        type: 'cylinder',
        size: [0.08, 0.08, 4.2, 8],
        position: [3.4, -0.27, -2.4],
        color: 0x15181b,
        roughness: 0.9,
        rotation: [Math.PI / 2, 0, 0.4],
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
      intensity: 0.4,
      position: [0, 3.8, -8.0],
      distance: 8.0,
    },
    // Faint cold cyan rim backlight emphasizing the bulkhead arches
    rim: {
      color: 0x7fd6e8,
      intensity: 0.3,
      position: [-5, 5, -7],
    },
  };
}

export const propList = spaceshipArchitecture;
