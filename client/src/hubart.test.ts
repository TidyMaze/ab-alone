import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Door } from './hub';
import { createDoorGlyph, GLYPH_COLORS } from './hubart';

describe('hub door 3D glyphs (#628)', () => {
  it('defines distinct contrast-safe accent colors for every door kind', () => {
    expect(GLYPH_COLORS.boss).toBe(0xe03131); // Crimson
    expect(GLYPH_COLORS.bossCore).toBe(0xff922b); // Amber core
    expect(GLYPH_COLORS.bot).toBe(0x22b8cf); // Cold cyan
    expect(GLYPH_COLORS.hotseat).toBe(0xfab005); // Warm amber
    expect(GLYPH_COLORS.online).toBe(0x40c057); // Signal green
    expect(GLYPH_COLORS.royale).toBe(0xfd7e14); // Industrial orange
    expect(GLYPH_COLORS.terminal).toBe(0x20c997); // Phosphor CRT green
    expect(GLYPH_COLORS.lift).toBe(0xe9ecef); // Bone white
  });

  it('builds an angular horned ring with glowing inner core for boss door', () => {
    const door: Door = { kind: 'boss', boss: 'echo' };
    const glyph = createDoorGlyph(door);
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.name).toBe('door-boss');
    expect(glyph.children.length).toBeGreaterThanOrEqual(2);

    const materials = glyph.children
      .map((c) => (c as THREE.Mesh).material as THREE.MeshBasicMaterial)
      .map((m) => m.color.getHex());
    expect(materials).toContain(GLYPH_COLORS.boss);
    expect(materials).toContain(GLYPH_COLORS.bossCore);
  });

  it('builds concentric target rings for bot table', () => {
    const door: Door = { kind: 'bot' };
    const glyph = createDoorGlyph(door);
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.name).toBe('door-bot');
    expect(glyph.children.length).toBeGreaterThanOrEqual(2);

    const materials = glyph.children
      .map((c) => (c as THREE.Mesh).material as THREE.MeshBasicMaterial)
      .map((m) => m.color.getHex());
    expect(materials).toContain(GLYPH_COLORS.bot);
  });

  it('builds dual opposing crescents for hot-seat table', () => {
    const door: Door = { kind: 'hotseat' };
    const glyph = createDoorGlyph(door);
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.name).toBe('door-hotseat');
    expect(glyph.children.length).toBeGreaterThanOrEqual(2);

    const materials = glyph.children
      .map((c) => (c as THREE.Mesh).material as THREE.MeshBasicMaterial)
      .map((m) => m.color.getHex());
    expect(materials).toContain(GLYPH_COLORS.hotseat);
  });

  it('builds radiating concentric antenna for online table', () => {
    const door: Door = { kind: 'online' };
    const glyph = createDoorGlyph(door);
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.name).toBe('door-online');
    expect(glyph.children.length).toBeGreaterThanOrEqual(2);

    const materials = glyph.children
      .map((c) => (c as THREE.Mesh).material as THREE.MeshBasicMaterial)
      .map((m) => m.color.getHex());
    expect(materials).toContain(GLYPH_COLORS.online);
  });

  it('builds triangular hazard frame for battle royale lobby', () => {
    const door: Door = { kind: 'royale' };
    const glyph = createDoorGlyph(door);
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.name).toBe('door-royale');
    expect(glyph.children.length).toBeGreaterThanOrEqual(1);

    const materials = glyph.children
      .map((c) => (c as THREE.Mesh).material as THREE.MeshBasicMaterial)
      .map((m) => m.color.getHex());
    expect(materials).toContain(GLYPH_COLORS.royale);
  });

  it('builds rectangular CRT screen frame for terminal', () => {
    const door: Door = { kind: 'terminal', lore: 'mess-house-rule' };
    const glyph = createDoorGlyph(door);
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.name).toBe('door-terminal');
    expect(glyph.children.length).toBeGreaterThanOrEqual(1);

    const materials = glyph.children
      .map((c) => (c as THREE.Mesh).material as THREE.MeshBasicMaterial)
      .map((m) => m.color.getHex());
    expect(materials).toContain(GLYPH_COLORS.terminal);
  });

  it('builds directional arrow for open lift, oriented towards destination', () => {
    const door: Door = { kind: 'lift', to: 'cargo' };
    const glyphUp = createDoorGlyph(door, { open: true, cell: [1, -2] });
    expect(glyphUp).toBeInstanceOf(THREE.Group);
    expect(glyphUp.name).toBe('door-lift');

    const glyphDown = createDoorGlyph(door, { open: true, cell: [-1, 2] });
    expect(glyphDown).toBeInstanceOf(THREE.Group);

    const glyphDefault = createDoorGlyph(door, { open: true });
    expect(glyphDefault).toBeInstanceOf(THREE.Group);

    const materials = glyphUp.children
      .map((c) => (c as THREE.Mesh).material as THREE.MeshBasicMaterial)
      .map((m) => m.color.getHex());
    expect(materials).toContain(GLYPH_COLORS.lift);
    // Open lift does not have a locked cross bar
    expect(glyphUp.getObjectByName('locked-bar')).toBeUndefined();
  });

  it('adds locked bar across the ring when lift is locked', () => {
    const door: Door = { kind: 'lift', to: 'cargo' };
    const glyph = createDoorGlyph(door, { open: false, cell: [1, -2] });
    expect(glyph).toBeInstanceOf(THREE.Group);
    expect(glyph.getObjectByName('locked-bar')).toBeDefined();
  });
});
