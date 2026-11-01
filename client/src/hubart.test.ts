import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Door } from './hub';
import { createDoorGlyph, createKitGlyph, GLYPH_COLORS, KIT_PROP } from './hubart';
import type { HubKit } from './tablezero';

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
    const kinds = ['boss', 'bot', 'hotseat', 'online', 'royale', 'terminal', 'medals', 'lift', 'daily', 'run', 'together', 'ranked', 'world', 'trainer'] as const;
    expect(new Set(kinds.map((k) => GLYPH_COLORS[k])).size).toBe(kinds.length); // one colour per room kind (#1249)
  });

  // #1249: a room for each mode with no table: each its own prop and colour.
  it('builds a prop in its own colour for each mode room', () => {
    const props: [Door, string][] = [
      [{ kind: 'daily' }, 'a calendar'],
      [{ kind: 'run' }, 'a map table'],
      [{ kind: 'together' }, 'two marbles'],
      [{ kind: 'ranked' }, 'a podium'],
      [{ kind: 'world' }, 'a globe'],
      [{ kind: 'trainer' }, 'a target dummy'],
    ];
    for (const [door, what] of props) {
      const glyph = createDoorGlyph(door);
      expect(glyph.name, what).toBe(`door-${door.kind}`);
      expect(glyph.children.length, what).toBeGreaterThanOrEqual(3);
      const colors = glyph.children.map((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex());
      expect(colors, what).toContain(GLYPH_COLORS[door.kind as keyof typeof GLYPH_COLORS]);
    }
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

  it('builds a gold ring and core for the Medal room (#812)', () => {
    const glyph = createDoorGlyph({ kind: 'medals' });
    expect(glyph.name).toBe('door-medals');
    const materials = glyph.children.map((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex());
    expect(materials).toContain(GLYPH_COLORS.medals);
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

  // The deck plan (#1249): each room is a small prop standing on its cell, no longer a flat glyph, so the kinds read
  // apart at a glance.
  it('stands every room up as a prop on its cell', () => {
    const doors: Door[] = [
      { kind: 'boss', boss: 'echo' },
      { kind: 'bot' },
      { kind: 'hotseat' },
      { kind: 'online' },
      { kind: 'royale' },
      { kind: 'terminal', lore: 'mess-house-rule' },
      { kind: 'medals' },
      { kind: 'lift', to: 'cargo' },
      { kind: 'daily' },
      { kind: 'run' },
      { kind: 'together' },
      { kind: 'ranked' },
      { kind: 'world' },
      { kind: 'trainer' },
    ];
    for (const door of doors) {
      const top = new THREE.Box3().setFromObject(createDoorGlyph(door, { open: true })).max.y;
      expect(top, door.kind).toBeGreaterThan(0.2);
      expect(top, door.kind).toBeLessThan(0.6); // low enough to read the deck around it
    }
  });

  it('opens a beaten boss door: no slab and no amber core, a gold seal instead', () => {
    const shut = createDoorGlyph({ kind: 'boss', boss: 'echo' });
    expect(shut.getObjectByName('door-slab')).toBeDefined();
    expect(shut.getObjectByName('beaten-seal')).toBeUndefined();
    const beaten = createDoorGlyph({ kind: 'boss', boss: 'echo' }, { beaten: true });
    expect(beaten.getObjectByName('door-slab')).toBeUndefined();
    expect(beaten.getObjectByName('beaten-seal')).toBeDefined();
    const colors = beaten.children.map((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex());
    expect(colors).toContain(GLYPH_COLORS.boss);
    expect(colors).toContain(GLYPH_COLORS.medals);
    expect(colors).not.toContain(GLYPH_COLORS.bossCore);
  });
});

describe('the hub props of the Blender file on the rooms of the game (#1374)', () => {
  const mesh = (name: string): THREE.Mesh => Object.assign(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), { name });
  const kit: HubKit = { parts: { door: [mesh('prop'), mesh('ring')], lift: [mesh('cage')], dummy: [mesh('dummy')] }, lockbar: mesh('bar') };

  it('names a prop of the file for every kind of room, one per kind on a deck', () => {
    const kinds = ['boss', 'terminal', 'hotseat', 'bot', 'online', 'royale', 'medals', 'daily', 'run', 'together', 'ranked', 'world', 'trainer', 'lift'] as const;
    expect(Object.keys(KIT_PROP).sort()).toEqual([...kinds].sort());
    expect(KIT_PROP.boss).toBe('door');
    // two kinds share a prop only when no deck has both (hub.ts: the Medal room is the Mess's, Ranked the Bridge's, Together the Furnace's, the Trainer the Bridge's)
    expect([KIT_PROP.medals, KIT_PROP.ranked]).toEqual(['podium', 'podium']);
    expect([KIT_PROP.together, KIT_PROP.trainer]).toEqual(['dummy', 'dummy']);
  });

  it('puts a copy of the parts of the kind in a group named as the procedural glyph is', () => {
    const glyph = createKitGlyph(kit, { kind: 'boss', boss: 'echo' });
    expect(glyph.name).toBe('door-boss');
    expect(glyph.children.map((c) => c.name)).toEqual(['prop', 'ring']);
    expect(glyph.children[0]).not.toBe(kit.parts.door![0]); // a copy: the kit's parts stay where they are
    expect((glyph.children[0] as THREE.Mesh).geometry).toBe(kit.parts.door![0]!.geometry);
  });

  it('shows a gold seal on a beaten boss door, and none on a shut one', () => {
    expect(createKitGlyph(kit, { kind: 'boss', boss: 'echo' }).getObjectByName('beaten-seal')).toBeUndefined();
    expect(createKitGlyph(kit, { kind: 'boss', boss: 'echo' }, { beaten: true }).getObjectByName('beaten-seal')).toBeDefined();
  });

  it('bars a locked lift with the bar of the file, and leaves an open one clear', () => {
    const lift: Door = { kind: 'lift', to: 'cargo' };
    expect(createKitGlyph(kit, lift, { open: false }).getObjectByName('locked-bar')).toBeDefined();
    expect(createKitGlyph(kit, lift, { open: true }).getObjectByName('locked-bar')).toBeUndefined();
    expect(createKitGlyph(kit, lift).getObjectByName('locked-bar')).toBeUndefined();
    expect(createKitGlyph({ ...kit, lockbar: null }, lift, { open: false }).getObjectByName('locked-bar')).toBeUndefined();
    expect(createKitGlyph(kit, { kind: 'bot' }, { open: false }).getObjectByName('locked-bar')).toBeUndefined(); // only a lift
  });

  it('lays the lift arrow on the floor, toward the deck above from the north half of the map and below from the south', () => {
    const arrowOf = (cell: [number, number]): THREE.Mesh => createKitGlyph(kit, { kind: 'lift', to: 'cargo' }, { cell }).children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.ShapeGeometry) as THREE.Mesh;
    expect(arrowOf([1, -2]).rotation.y).toBeCloseTo(Math.PI / 2);
    expect(arrowOf([-1, 2]).rotation.y).toBeCloseTo(-Math.PI / 2);
  });

  it("lays the lift arrow a small gap over the top of the file's cage, read from its box, not on the floor", () => {
    const cage = Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), new THREE.MeshBasicMaterial()), { name: 'cage' });
    cage.position.y = 0.5; // the cage stands from 0 to 1
    const tall: HubKit = { ...kit, parts: { ...kit.parts, lift: [cage] } };
    const arrow = createKitGlyph(tall, { kind: 'lift', to: 'cargo' }, { cell: [1, -2] }).children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.ShapeGeometry) as THREE.Mesh;
    expect(arrow.position.y).toBeGreaterThan(1);
    expect(arrow.position.y).toBeLessThanOrEqual(1.05);
    const bare: HubKit = { ...kit, parts: { ...kit.parts, lift: [] } }; // no cage in the file: the gap alone, from the floor
    const low = createKitGlyph(bare, { kind: 'lift', to: 'cargo' }, { cell: [1, -2] }).children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.ShapeGeometry) as THREE.Mesh;
    expect(low.position.y).toBeCloseTo(0.02);
  });

  it('paints the terrace lift arrow bone white, so it reads on the cage (#523, #1374)', () => {
    const arrowOf = (props: HubKit): THREE.Mesh => createKitGlyph(props, { kind: 'lift', to: 'cargo' }, { cell: [1, -2] }).children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.ShapeGeometry) as THREE.Mesh;
    expect((arrowOf(kit).material as THREE.MeshBasicMaterial).color.getHex()).toBe(GLYPH_COLORS.lift);
  });

  it('draws a room whose prop the file lacks as an empty group', () => {
    expect(createKitGlyph(kit, { kind: 'bot' }).children).toHaveLength(0);
  });
});
