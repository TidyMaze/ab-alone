import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DECK_NAMES } from './deck';
import { ROOM_SURFACE } from './room';
import { DECK_TINTS } from './roomrefined';
import { AMBER, DARK_FLOOR, HIDDEN_BAY, KEPT_PROPS, STEEL, cornerCrates, flatBay, hazardStripe, wallStrips } from './roomdecor';

describe('the refined room decor (#1138)', () => {
  it('has four lit wall strips: three in the deck tint, one amber', () => {
    for (const deck of DECK_NAMES) {
      const strips = wallStrips(deck);
      expect(strips.map((s) => s.color)).toEqual([DECK_TINTS[deck], DECK_TINTS[deck], AMBER, DECK_TINTS[deck]]);
      for (const s of strips) expect(s.emissive).toBe(s.color);
    }
  });

  it('lays a plain amber stripe on the floor, not lit', () => {
    const stripe = hazardStripe();
    expect(stripe.color).toBe(AMBER);
    expect(stripe.emissive).toBeUndefined();
    expect(stripe.position[1]).toBeGreaterThan(ROOM_SURFACE.y);
  });

  it('puts a plain steel crate in each corner, no two alike', () => {
    const crates = cornerCrates();
    expect(crates).toHaveLength(4);
    expect(new Set(crates.map((c) => `${c.position[0]},${c.position[2]}`)).size).toBe(4);
    for (const c of crates) expect(c.color).toBe(STEEL.crate);
  });

  it('hides what the refined room does not keep and keeps the frame, the chevrons, the walls of the room and the floor', () => {
    for (const gone of ['East_Hollow_Viewport', 'Hollow_Moon_Disc', 'Crane_Rail_Port', 'Bulkhead_Column_EN', 'Bulkhead_Wall_North', 'Radial_Floor_Conduits', 'Airlock_Bulkhead_Doors', 'Pedestal_Grate_Trench'])
      expect(HIDDEN_BAY.test(gone), gone).toBe(true);
    for (const kept of ['Airlock_Gantry_Frame', 'Airlock_Hazard_Chevrons', 'Ship_Deck_Floor', 'Console_Kiosk_Stand']) expect(HIDDEN_BAY.test(kept), kept).toBe(false);
  });

  it('restyles the bay: flat steel without maps, the bay floor kept darker, the chevrons amber', () => {
    const map = () => new THREE.Texture();
    const mat = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ map: map(), normalMap: map(), roughnessMap: map(), metalnessMap: map(), aoMap: map() });
    const m = { deck: mat(), bulkhead: mat(), grate: mat(), hazard: mat() };
    const deckMap = m.deck.map;
    const root = new THREE.Group();
    const hidden = Object.assign(new THREE.Mesh(), { name: 'Hollow_Moon_Disc' });
    const kept = Object.assign(new THREE.Mesh(), { name: 'Airlock_Gantry_Frame' });
    root.add(hidden, kept);
    flatBay(root, m);
    expect(hidden.visible).toBe(false);
    expect(kept.visible).toBe(true);
    expect(m.grate.color.getHex()).toBe(STEEL.frame);
    expect(m.bulkhead.color.getHex()).toBe(STEEL.wall);
    for (const flat of [m.grate, m.bulkhead]) {
      expect([flat.map, flat.normalMap, flat.roughnessMap, flat.metalnessMap, flat.aoMap, flat.displacementMap]).toEqual([null, null, null, null, null, null]);
    }
    expect(m.deck.color.getHex()).toBe(DARK_FLOOR);
    expect(m.deck.map).toBe(deckMap); // the bay's own hex floor stays
    expect(m.hazard.color.getHex()).toBe(AMBER);
    expect(m.hazard.emissive.getHex()).toBe(AMBER);
    const bare = { deck: mat(), bulkhead: mat(), grate: mat() }; // no hazard material
    flatBay(new THREE.Group(), bare);
    expect(bare.grate.color.getHex()).toBe(STEEL.frame);
  });

  it('keeps the lore console and the log recorder, which are gameplay', () => {
    expect([...KEPT_PROPS].sort()).toEqual(['console-desk', 'console-screen', 'log-recorder']);
  });
});
