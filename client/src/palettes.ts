// Colorblind and high-contrast palettes (docs/specs/world.md section 8, issue #381).
// Pure data and CVD simulation: main.ts and ui.css apply the colours.
import type { RGB } from './contrast';

export type Palette = 'default' | 'protan' | 'deutan' | 'tritan' | 'contrast';

export const PALETTES: readonly Palette[] = ['default', 'protan', 'deutan', 'tritan', 'contrast'];

export const PALETTE_NAMES: Record<Palette, string> = {
  default: 'Default',
  protan: 'Protan',
  deutan: 'Deutan',
  tritan: 'Tritan',
  contrast: 'High contrast',
};

export interface PaletteDefinition {
  id: Palette;
  name: string;
  shell: number; // dark side marble colour
  glass: number; // pale side marble glass body
  core: number; // cyan / player inner light
  rim: number; // back accent light
  sodium: number; // warm point / lamp accent
  tell: number; // tell marks and glyphs (bone)
  accent: string; // CSS hex string for HUD markers, borders, focus
  hazard: string; // CSS hex string for warnings
  lightAccent: string | null; // accent on the light theme's cream, null: ui.css's own (#923)
  lightHazard: string | null; // hazard on the cream, null: ui.css's own
}

export const PALETTE_DEFS: Record<Palette, PaletteDefinition> = {
  default: {
    id: 'default',
    name: 'Default',
    shell: 0x101214,
    glass: 0x2c363d,
    core: 0x7fd6e8,
    rim: 0x7fd6e8,
    sodium: 0xd9822b,
    tell: 0xd8d4c8,
    accent: '#7fd6e8',
    hazard: '#d9822b',
    lightAccent: null,
    lightHazard: null,
  },
  protan: {
    // Protanopia (red-blind): avoid red/cyan confusion, preserve blue/yellow
    id: 'protan',
    name: 'Protan',
    shell: 0x0f172a,
    glass: 0x334155,
    core: 0x38bdf8,
    rim: 0x38bdf8,
    sodium: 0xfacc15,
    tell: 0xf8fafc,
    accent: '#38bdf8',
    hazard: '#facc15',
    lightAccent: '#0b5d8a',
    lightHazard: '#7a5a00',
  },
  deutan: {
    // Deuteranopia (green-blind): preserve blue/gold
    id: 'deutan',
    name: 'Deutan',
    shell: 0x111827,
    glass: 0x374151,
    core: 0x60a5fa,
    rim: 0x60a5fa,
    sodium: 0xfbbf24,
    tell: 0xf9fafb,
    accent: '#60a5fa',
    hazard: '#fbbf24',
    lightAccent: '#1e40af',
    lightHazard: '#7a5a00',
  },
  tritan: {
    // Tritanopia (blue-blind): preserve red/teal-cyan
    id: 'tritan',
    name: 'Tritan',
    shell: 0x18181b,
    glass: 0x3f3f46,
    core: 0x2dd4bf,
    rim: 0x2dd4bf,
    sodium: 0xf43f5e,
    tell: 0xfafafa,
    accent: '#2dd4bf',
    hazard: '#f43f5e',
    lightAccent: '#0f6b5f',
    lightHazard: '#a3123a',
  },
  contrast: {
    // High contrast: pure black, pure white and electric cyan
    id: 'contrast',
    name: 'High contrast',
    shell: 0x050505,
    glass: 0x52525b,
    core: 0x00ffff,
    rim: 0x00ffff,
    sodium: 0xffaa00,
    tell: 0xffffff,
    accent: '#00ffff',
    hazard: '#ffaa00',
    lightAccent: '#005f6b',
    lightHazard: '#8a4b00',
  },
};

export const paletteById = (id: string): PaletteDefinition =>
  PALETTE_DEFS[id as Palette] ?? PALETTE_DEFS.default;

/** The inline accent and hazard of a palette: all palettes on the dark theme, the on-cream pair on the light one
 *  (null: no inline value, so ui.css's own light colours apply). */
export const themeColors = (pal: PaletteDefinition, light: boolean): { accent: string | null; hazard: string | null } =>
  light ? { accent: pal.lightAccent, hazard: pal.lightHazard } : { accent: pal.accent, hazard: pal.hazard };

export const nextPalette = (p: Palette): Palette => {
  const i = PALETTES.indexOf(p);
  return PALETTES[(i + 1) % PALETTES.length]!;
};

export function hexToRgb(hex: number): RGB {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** Color vision deficiency simulation (Vienot/Brettel matrices). */
export function simulateCvd([r, g, b]: RGB, deficiency: 'protan' | 'deutan' | 'tritan'): RGB {
  if (deficiency === 'protan') {
    return [
      Math.min(255, Math.round(0.56667 * r + 0.43333 * g)),
      Math.min(255, Math.round(0.55833 * r + 0.44167 * g)),
      Math.min(255, Math.round(0.24167 * g + 0.75833 * b)),
    ];
  }
  if (deficiency === 'deutan') {
    return [
      Math.min(255, Math.round(0.625 * r + 0.375 * g)),
      Math.min(255, Math.round(0.7 * r + 0.3 * g)),
      Math.min(255, Math.round(0.3 * g + 0.7 * b)),
    ];
  }
  return [
    Math.min(255, Math.round(0.95 * r + 0.05 * g)),
    Math.min(255, Math.round(0.43333 * g + 0.56667 * b)),
    Math.min(255, Math.round(0.475 * g + 0.525 * b)),
  ];
}
