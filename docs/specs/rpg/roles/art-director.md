# RPG art direction: implementation spec (role `art-director`)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay spec (`docs/specs/rpg/plan.fr.md`, the same text as the approved plan).
A section number like "§5.2" points to that gameplay spec; `world.md §5`, `art.md §2`, `ui.md §7` and
`tech.md §5.5` point to the existing specs. This file adds no game rule. It says how the RPG looks,
how each look is built in the repo (data, pure functions, generated assets), how it is tested, and it
lists every gap or contradiction it found in [Feedback on the gameplay spec](#feedback-on-the-gameplay-spec).
No code yet: strict TDD applies from R1 (CONTRIBUTING section 11).

**Tags**, as in `rules.md`: **FINAL** (decided: by the four choices of #313, by the validated
decisions of the pivot, or by an existing FINAL spec such as world.md §5 and §8, ui.md §2 and §7 or
WCAG 2.1 AA), **TUNE** (a starting value, set by screenshots, playtests and the perf test),
**PROPOSAL** (proposed here, an owner or the owning role confirms). Every number carries one. Short
forms in tables and lists: `[F]`, `[T]`, `[P]`. A table whose header line carries a tag applies it to
every number of the table, and only cells that differ carry their own tag. A number copied from the
gameplay spec keeps its tag there: the gameplay spec says "everything is PROPOSAL and every number is
TUNE unless stated", so copied numbers are `[T]`. Hex colours are numbers: they carry tags too.
Coordinates, ids and values inside Given/When/Then examples are test data, not rules, and carry no
tag.

Validated decisions applied here as FINAL: science-fantasy universe; Diablo-like P2P with a party of
4 at most; hero plus squad; an ejected hero dies and the fight is lost; deterministic combat; weighted
push (`n > m` AND strictly greater total Weight); at most 1 ejection per action. Their art
consequences: the hero must be the most readable marble on any board; visual randomness never touches
the engine (tech.md §5.2); the weight of a marble is shown, never guessed from its size.

---

## 0. Scope

The art-director owns **what the RPG looks like** and the rules that keep it coherent with world.md §5:

- the **palette law**: the base palette (FINAL, world.md §5), how a biome, a rarity or a tier may
  extend it, and the automated test that enforces it;
- the **10 biome looks** and the hub: board surface, cell edge, light preset, fog, accent, props,
  backdrop, plus the visual side of each biome global rule (§5.2);
- the **cell decal art** of the 16 cell kinds of §5.1 and of the timed and marked cells the
  abilities create;
- **marble looks**: the hero, Fragments, the 8 lineages (§8), allies in a party, rivals in PvP,
  Revenants, Remains, the 0 HP crumble, NPCs;
- **monster looks**: 8 archetype crests, 20 families, rarity bands, elite affix marks (§5.3), the
  level tier ramp (§4.4), the intent mark;
- **boss looks** (§18): the Heart marble, the accent of each of the 8 bosses, the HP phase notches;
- the **glyph shapes** (one shape system for in-scene meshes and DOM SVG) for every glyph id the
  ux-designer catalogues;
- the **ability VFX grammar**: one visual verb per primitive of §6.10, one tone per element tag;
- the **world map look**: hex tiles, exploration darkness, tile content props, Beacons, the world
  ball (§4);
- the **look of the tile-to-board unfold** (§4.5) and of stitched boards (§4.6);
- **icons**: item slots, rarities, gems, consumables, materials, tools, ability icons (§12, §14,
  §15, §8);
- the **asset budget per biome** and the "made by" rule (art.md §2) applied to the RPG.

Out of scope (see "Dependencies" in each section): the rules and their numbers, what each layer
means and when it shows (ux-designer), the three.js scene plumbing, cameras and WASM bridge
(client-engineer), sound cues and their twins (audio-designer), names and text (narrative-quest-
designer), board generation and terrain shares (level-designer), monster and boss content
(encounter-boss-designer), class and ability content (combat-designer), items and nodes content
(economy-designer).

**Role slugs.** This file uses the slugs of the role files in `docs/specs/rpg/roles/`:
`lead-game-designer`, `combat-designer`, `systems-designer`, `gameplay-programmer`,
`level-designer`, `encounter-boss-designer`, `economy-designer`, `narrative-quest-designer`,
`ux-designer`. Roles that have no file yet keep the canonical names of `lead-game-designer.md` §2.2:
`client-engineer` (three.js scenes, WASM plumbing, Playwright fixtures), `audio-designer` (the sound
half of `art-audio`), `network-engineer`, `pvp-br-designer`, `tech-lead`, `qa-balance`.

---

## 1. Inputs read

- The gameplay spec, whole file, §0 to §26.
- `docs/specs/world.md` §1 to §8 (decks, lore, palette, materials, light, fog, marble looks per
  faction, board look per deck, tell marks, ejection timing, diegetic HUD, accessibility).
- `docs/specs/art.md` (one-page direction, bone-white tells, the "never" list, asset table, budget,
  "made by" rule).
- `docs/specs/ui.md` §1, §2 (CSS tokens), §5 (framing), §6 (motion), §7 (contrast pairs).
- `docs/specs/tech.md` §5 (renderer, post chain, quality tiers, effects timeline, MSDF text, perf
  budget: 150 draw calls), §9 (asset pipeline and budget).
- `CONTRIBUTING.md` §6.4 (screenshot in every UI PR), §11 (strict TDD, 100 % coverage, e2e), §13.
- Sibling role files, for the contracts this file must match: `ux-designer.md` (the `UnitView`, the
  layer budget L0 to L3, the glyph catalog `client/src/rpg/glyphs.ts`, Edge danger display),
  `level-designer.md` (biome ids, `data/biomes/<id>.ron` with a `palette` id, `data/terrain/cells.ron`
  with glyph ids), `encounter-boss-designer.md` (level bands and their glyphs, affixes),
  `narrative-quest-designer.md` (lineage and faction names, map markers), `economy-designer.md`
  (rarities, slots), `lead-game-designer.md` (role slugs).
- Code: `client/src/main.ts` (materials: `COLORS`, `MARBLE_COLORS`, the shell `MeshPhysicalMaterial`
  with sheen and the glass one with clearcoat, the Chaplain shell cap, the Choir army glyphs, the Hull
  crack discs and ticks, the 0.45 ghost opacity), `client/scripts/gen-assets.mjs` (seeded PNG
  generator, `SEED = 89`, value noise, `generateAssets(seed)`), `client/src/quality.ts` (tiers,
  clear-board), `client/src/eject.ts` and `slide.ts` (pure animation tracks with a reduced-motion
  variant), `client/e2e/textures.spec.ts` (assets requested, flat fallback when they fail).

Facts from the code that shape this spec:

1. Every look today is **procedural or generated**: materials in code, 4 PNGs from a seeded script
   (deck albedo and roughness, marble normal, backdrop). No file is downloaded. This spec keeps that
   rule for the whole RPG (art.md §2, FINAL there).
2. Marble geometry is one sphere of radius 0.36 [F, today]; cell discs are radius 0.46 [F, today].
   Kinds are told apart by **added geometry** (shell cap, army glyph, tell ring), never by size. The
   RPG keeps this: a marble's size never changes with its kind, Weight or level (PROPOSAL, see 5.1).
3. Animations are pure "track" functions with a reduced-motion variant (`ejectTrack`,
   `slideTracks`), tested by vitest and checked in e2e through `body.dataset`. Every new animation of
   this spec follows that pattern.
4. Colours live in two places that can drift: `COLORS` in `main.ts` and the CSS tokens of `ui.css`.
   The RPG adds many colours, so this spec puts them in **one** module and tests the CSS against it
   (section 2.1).
5. Today the player wears bone-white glass (`MARBLE_COLORS[2]`) and the shell is near-black: there is
   no cyan core yet (art.md §3, #286, #291). The RPG hero look depends on that gap being fixed first.

---

## 2. Shared design: the art layer

Everything visual in this file is **data plus pure functions**, in one client folder, so it can be
tested without a GPU (vitest) and checked once in a real browser (Playwright, screenshot in the PR).

```
client/src/art/
  palette.ts      base tokens, biome palettes, DOM tokens, the palette law (pure)
  shapes.ts       glyph shapes as polygons on a 24 x 24 grid, SVG and THREE.Shape builders
  raster.ts       tiny polygon rasterizer, used only by tests (distinctness, stroke width)
  looks.ts        lookOf(unit, viewer): MarbleLook; lookKey(look): string (pure)
  biomes.ts       BiomeArt records: palette id, light preset, fog, props, backdrop (data)
  decals.ts       cell kind -> decal (shape id, tone, rotation rule, ticks) (data + pure)
  vfx.ts          primitive -> visual verb, element -> tone, durations (data + pure)
  tracks/         crumble.ts, unfold.ts (pure timelines, like eject.ts)
  icons.ts        item, gem, material, tool and ability icons composed from shapes (pure)
client/src/rpg/scene/   (client-engineer) three.js glue that reads the modules above
client/scripts/gen-assets.mjs  extended: per-biome textures, same seed rule
```

### 2.1 The palette law (world.md §5, §2 "chaque biome ajoute sa palette, dans ce cadre")

**Base tokens** (FINAL, world.md §5 and art.md §1): base `#0b0d0f`, rust `#7a3b1d`, oxidized steel
`#4a5258`, sodium `#d9822b` (hazard, furnace), cyan `#7fd6e8` (the player's light, only), danger red
`#ff6b5a` (danger only), bone-white `#d8d4c8` (tells).

**Law** (PROPOSAL; thresholds TUNE). Every colour used by the RPG is either a base token or passes
all of these, measured in OKLab (chroma `C = √(a² + b²)`, distance `ΔE = Euclid(L, a, b)`) and in
WCAG relative luminance:

| Rule | Check | Threshold |
|---|---|---|
| A1 Nothing saturated (world.md §5) | `C` of a board surface | ≤ 0.04 [T] |
| A2 | `C` of a cell edge, fog, light or prop colour | ≤ 0.07 [T] |
| A3 | `C` of a biome accent or a DOM tone | ≤ 0.10 [T] |
| A4 Cyan is the player's (world.md §5) | `ΔE` to cyan, for every non-base colour | ≥ 0.10 [T] |
| A5 Red is danger (world.md §5, ui.md §2) | `ΔE` to danger red, for every non-base colour | ≥ 0.10 [T] |
| A6 Dark is the deck (art.md §1) | luminance of a board surface | ≤ 0.05 [P] |
| A7 Cell edge (world.md §5) | contrast of edge on surface | ≥ 3:1 [F] |
| A8 Tells (art.md §1) | contrast of bone-white on surface | ≥ 3:1 [F]; A6 gives about 7:1 |
| A9 DOM text tones (ui.md §7) | contrast on `--panel` | ≥ 4.5:1 [F] |
| A10 DOM glyph tones (WCAG 1.4.11) | contrast on `--panel` | ≥ 3:1 [F] |

A6 is the key choice: with every board surface at luminance 0.05 [P] or less, bone-white tells
(luminance 0.66, computed) and the cyan core stay above 6.8:1 on any biome, so **one tell colour
works everywhere** and no biome needs a dark-tell variant. Bright places (Glass Dunes, Dead Shore
salt, White Tundra) read bright through their **light and accent**, not through their surface.

**Implementation.** `client/src/art/palette.ts`:

```ts
export type Hex = `#${string}`;
export const BASE = { base: '#0b0d0f', rust: '#7a3b1d', steel: '#4a5258', sodium: '#d9822b',
  cyan: '#7fd6e8', danger: '#ff6b5a', bone: '#d8d4c8' } as const;      // FINAL, world.md §5
export interface BiomePalette {
  id: BiomeId; surface: Hex; edge: Hex; accent: Hex; fog: Hex; key: Hex; fill: Hex; backdrop: Hex;
}
export const BIOME_PALETTES: Record<BiomeId, BiomePalette>;        // section 3
export const DOM_TONES: Record<ToneId, { dark: Hex; light: Hex }>;  // rarities, tiers (sections 6, 12)
export function luminance(h: Hex): number;          // WCAG relative luminance
export function contrast(a: Hex, b: Hex): number;   // (L1 + 0.05) / (L2 + 0.05)
export function oklab(h: Hex): [number, number, number];
export function lawViolations(): string[];          // every A1..A10 failure, as readable lines
```

`ui.css` keeps the CSS tokens (ui.md §2, FINAL) and gains the new DOM tones; a vitest parses
`ui.css` and checks each custom property equals `palette.ts`, so the two never drift. `main.ts`
`COLORS` is replaced by imports from `palette.ts` (a refactor inside Task AD-02, no new behaviour).

**Colourblind palettes** (world.md §8: protan, deutan, tritan, high contrast; #32). `palette.ts`
exports `PALETTE_VARIANTS: Record<VariantId, Partial<Tokens>>`. The law runs on every variant. Since
no meaning is carried by colour alone (glyph integrity, section 2.2), a variant only re-tunes tones
for comfort; it never adds information.

**Dependencies.** ux-designer (DOM tone ids and where they are used; contrast rows in ui.md §7),
client-engineer (`main.ts` reads `palette.ts`), level-designer (`palette` id in each biome record).

**Tests (vitest, `palette.test.ts`).**
- Given the shipped palettes, When `lawViolations()` runs, Then it returns `[]`.
- Given a test biome with surface `#4a5258` (luminance 0.082), Then A6 fails with a line naming the
  biome and the rule.
- Given an accent `#7fc8e0`, Then A4 fails (too close to the player's cyan).
- Given `contrast('#d8d4c8', '#0b0d0f')`, Then the result is 13.1 within 0.05 (reference value, the
  bone-on-base pair).
- Given `ui.css`, Then every `--token` in it equals `DOM_TONES` or `BASE` for both themes.
- 100 % line coverage of `palette.ts` (CONTRIBUTING §11).

**Risks.** OKLab and WCAG are approximations of perception; screenshots in each PR stay the final
judge, and the thresholds are TUNE. A6 makes bright biomes harder to sell as bright: the light preset
and the backdrop carry the mood (section 3).

### 2.2 One glyph shape system (§5.1 "un glyphe obligatoire", §4.4, §12, §16)

The ux-designer owns the glyph **catalog** (`client/src/rpg/glyphs.ts`: id, label, tone, family).
The art-director owns the **shapes**. One shape feeds both renders, so the board and the flat HUD
fallback always show the same mark (world.md §6 rule 8).

**Implementation.** `client/src/art/shapes.ts`:

```ts
export type Pt = readonly [number, number];          // on a 24 x 24 grid, origin top-left
export interface Shape { id: GlyphShapeId; polys: Pt[][]; holes?: Pt[][]; directional?: boolean }
export const SHAPES: Record<GlyphShapeId, Shape>;
export function toSvgPath(s: Shape): string;          // "M x y L ... Z", for inline SVG in the DOM
export function toThreeShapes(s: Shape): THREE.Shape[]; // flat decal or extruded engraving
```

- Polygons only (no curves): a circle is a 16-gon [P]. That keeps the rasterizer of the tests tiny and
  the meshes cheap (`ShapeGeometry`, no texture, 0 bytes of download).
- Every floating glyph (above a marble, on the frieze) gets a near-black `#0b0d0f` outline [F, base
  token] of 2 grid units [P], so its contrast is checked against the outline, not against whatever is
  behind it. Decals on cells have no outline: their contrast is A8 against the surface.
- Directional glyphs (Slope, Vent, Edge danger, Porteur shield) point east at rotation 0; the scene
  rotates them by `60° × direction` [F, hex geometry].

**Tests (vitest, `shapes.test.ts`, using `raster.ts`).**
- Integrity: every glyph id of `glyphs.ts` (ux-designer) has a shape; every cell kind of
  `data/terrain/cells.ron` (level-designer) names a shape id that exists (the test reads the RON
  file as text and extracts `glyph: "..."`).
- Distinctness: rasterize each shape at 16 x 16 px [P]; within one family (terrain, status, tier,
  rarity, quest, affix, lineage, archetype) any two shapes differ by at least 20 % of their pixels
  (`1 − IoU ≥ 0.20`) [T].
- Legibility: the thinnest stroke of every shape is at least 2 grid units [P], so 1.17 px at the
  14 px minimum on-screen size of ux-designer 1.1 [T there] and 2.3 px at 200 % UI scale.
- `toSvgPath` of a square gives `"M0 0L24 0L24 24L0 24Z"`; `toThreeShapes` keeps the hole count.

**Risks.** 24-grid polygons look blunt next to hand-drawn icons. That is the intended style (engraved
plate, Chakra Petch signage, ui.md §3) and it costs no bytes. A shape may be replaced by a hand-made
one later only through the same `Shape` type.

### 2.3 The look function (§24.5, §1 pillar 6)

A marble's look is a **pure function of public state**, so every peer draws the same board and the
renderer can batch identical looks.

```ts
// client/src/art/looks.ts
export interface MarbleLook {
  body: 'glass' | 'shard' | 'shell' | 'revenant' | 'colonist' | 'heart';
  core: 'cyan' | 'cyan-dim' | 'bone' | 'none';         // section 5
  band?: LineageId | 'seat';                           // hero engraving, section 5.2
  seat?: 0 | 1 | 2 | 3;                                // party seat glyph, section 5.3
  crest?: ArchetypeId;                                 // monsters, section 6.1
  skin?: FamilyId;                                     // monster family shell variant, section 6.1
  rim?: 'champion' | 'elite' | 'rare';                 // rarity band, section 6.2
  accent?: BossAccentId;                               // bosses, section 11
  overlay?: 'frost' | 'stasis';                        // section 7.3
}
export function lookOf(u: UnitView, viewer: ViewerCtx): MarbleLook;
export function lookKey(l: MarbleLook): string;        // stable key for material and instancing caches
```

`UnitView` is the ux-designer's (ux-designer "Shared design"); `ViewerCtx` carries the viewer's camp
and seat (section 5.4). The scene keeps one material per `lookKey` and one `InstancedMesh` per
(geometry, material) pair, which keeps the board under the 150 draw calls of tech.md §5.5 [F there]
(section 17).

**Tests.** Table tests of `lookOf` (one row per kind, given in each section below); `lookKey` is
stable (same look, same key; any field change, different key).

### 2.4 Assets: how they are made and what they weigh (art.md §2, tech.md §9)

- **Made by** (FINAL, art.md §2): procedural first, then generated by a seeded script in
  `client/scripts/`, then hand-made. Never a download, an online generator, a paid service or a
  non-commercial licence.
- **Per-biome budget**: art.md gives "3 MB per deck" [F there]; a biome is a deck for this rule, so
  3 MB per biome [P], loaded lazily when the player enters the zone (tech.md §9 "lazy loading per
  deck", FINAL there). Initial load stays under 5 MB gzipped [F, tech.md §9]: the hub and Lumen
  Plains only.
- **Per biome, generated** (extending `gen-assets.mjs`, same `SEED` rule: same seed, same bytes):
  `surface-albedo-<id>.png` and `surface-roughness-<id>.png` at 512 px [F, art.md table] (300 KB
  together [F there]), `ridge-normal-<id>.png` at 256 px for the monster shells of that biome
  (64 KB [F there]), `backdrop-<id>.png` (30 KB [F there]). Total generated per biome: about 0.4 MB
  [T], far below 3 MB.
- **Procedural, 0 bytes**: glyphs and decals (2.2), crests and accents (geometry), VFX (code plus the
  existing 128 px particle atlas, art.md table), the world tiles (instanced prisms).
- **Hand-made, later**: props per biome as glTF with meshopt (tech.md §9), 150 KB each and 1 MB per
  biome [F, art.md table]. Until a prop exists, the biome ships without it: no prop is required for
  play (world.md §4 "lore never gates" applies to props too).

**Tests.** `gen-assets.test.ts` gains: same seed, same bytes for every biome file; each file under
its byte budget; `ASSET_NAMES` lists every biome of `BIOME_PALETTES`. `textures.spec.ts` gains: a
fight in a biome requests only that biome's files, and the flat fallback still renders when they fail
(the pattern that exists today).

### 2.5 The determinism boundary (§24.1, tech.md §5.2)

- Visual randomness (prop scatter, shell ridge phase, crumble shard directions, particle jitter) uses
  the client's own seeded RNG, never the engine RNG (tech.md §5.2, FINAL there).
- Its seed is a hash of **public** data only: `hash(tile_seed, "art", salt)` [P]. So in a party every
  peer sees the same props on the same tile (useful for pings, §21) and nothing visual can desync the
  signed log.
- No art module reads the combat state hash or writes to the engine. `looks.ts` and `decals.ts` take
  views, return descriptors.

**Test.** Given the same tile seed twice, Then `scatter(tileSeed)` returns the same prop list; Given
a different salt, Then a different list (vitest).

---
## 3. Hollow's surface and the 10 biomes (§2, §5.2, §4.8)

### 3.1 The outdoor rule (§2 "Hollow a été terraformée par le verre")

world.md §5 describes a ship interior: one practical lamp per deck, steel, oil, condensation. §2 says
the art direction "does not change", yet most of the RPG happens outdoors on Hollow (Feedback AD-F1).
This spec extends world.md §5 with the smallest set of rules that keeps the same mood outside:

1. **The sky is always black space** [P]. The glass made pockets of air near the ground (§2), not a
   blue sky: above every biome the backdrop is the near-black base with a few cold stars, and the
   haze of the pocket is a low band near the horizon. This keeps "dark is the deck" true outdoors.
2. **One hard key light per biome** [P], the outdoor twin of "one hard source per deck": a low white
   sun through the haze, a lava glow from below, a pale Sanctuary light in the Well. Plus the dim cyan
   fill from the player's marbles (world.md §5, FINAL).
3. **Materials are glass first** [P]: every biome is a landscape that the slag-glass has touched, so
   its surface mixes the natural material (ash, peat, sand, ice, basalt, salt) with **fused glass**
   (glassy sheen in the roughness map, fused cracks). Steel and rust stay for the Ballast, outposts and
   Colony props.
4. **No emissive surface but lights, screens, marbles, lava and Fissures** [P] (world.md §5 lists
   lights, screens and marbles [F]; lava and Lueur Fissures are added because they are light sources
   in play).
5. **Fog thickens toward the rim, never over a cell** (FINAL, world.md §5), on every biome.

### 3.2 The biome table (§5.2)

Board look of each biome. Colours pass the palette law (section 2.1, verified by hand for this
draft: surface luminance ≤ 0.043, edge on surface ≥ 3.3:1, bone-white on surface ≥ 7.6:1). Every
hex value is TUNE; every name and choice is PROPOSAL. Ids are the level-designer's (`level-designer.md`
§12).

| Id | Biome (§5.2) | Surface | Edge | Accent | Key light | Fog | Look in one line |
|---|---|---|---|---|---|---|---|
| `lumen` | Lumen Plains, glassy prairie | `#33382d` | `#8d927c` | `#b9b08a` straw | low warm-white sun | `#2a2e26`, light | Dark ash-green turf with glass blades; the gentlest board, tutorial (§11) |
| `sylve` | Ash Grove, petrified forest | `#2e2c2b` | `#85807a` | `#8a8090` ash-lilac | cold white, high | `#26252a`, medium | Grey ash, charcoal trunks as Rocks, fallen glass leaves |
| `tourbieres` | Soot Bogs, marsh | `#262420` | `#7b7462` | `#6b7a52` moss | dim olive-white | `#1e211c`, dense, low | Black peat, oily water sheen, rotten glass reeds |
| `dunes` | Glass Dunes, desert | `#40382c` | `#a8916a` | `#c9a46a` dune gold | harsh high sun, short shadows | `#3a3226`, heat band | Dun glass sand, wind ripples in the roughness, half-buried hull plates |
| `cretes` | Iron Ridges, mountains | `#34312f` | `#8a8580` | rust `#7a3b1d` [F base] | cold sky light, long shadows | `#2a2c2e`, medium | Dark iron rock, rust streaks, starglass veins on Height cells |
| `toundra` | White Tundra, glacier | `#323c42` | `#a8acae` | `#cdc4b0` frost | pale white, very low | `#2c3338`, light | Glacial slate with frost rims; bright through light and accent, not surface |
| `littoral` | Dead Shore, salt sea | `#3a3934` | `#a39f94` | `#7d8a80` brine | flat grey-white | `#34363a`, sea mist on the sea side | Salt crust on dark sand; the sea side of the rim opens on black water |
| `caldeira` | Caldera, volcano | `#241f1d` | `#7a6e66` | sodium `#d9822b` [F base] | sodium from below | `#2a1e18`, smoke | Basalt, glowing seams only in Lava and Vent cells |
| `vitrifiees` | Vitrified Lands, the core | `#141618` | `#6c6f78` | `#9c93a8` slag-violet | cold violet-white, from the side | `#18171c`, still | Black glass plain, frozen shapes inside it, faint inner pulse |
| `puits` | The Well, abyss | `#0f1011` | `#5f6266` | bone `#d8d4c8` [F base] | dim, only Sanctuaries glow | `#0b0d0f` [F base], dense at the rim | Near-black stone; the darkest board, still 3.1:1 cell edges |
| `ballast` | The Ballast, hub and ship dungeons | `#2b3034` | `#7c858b` | steel `#4a5258` [F base] | per deck (world.md §5) | per deck | The five deck looks of world.md §5, unchanged |

**Light presets** are data, not code (tech.md §5.1, FINAL there):

```ts
// client/src/art/biomes.ts
export interface BiomeArt {
  id: BiomeId; palette: BiomeId;                    // BIOME_PALETTES key
  key: { dir: [number, number, number]; intensity: number };  // one hard source
  fill: { intensity: number };                      // cyan fill from player marbles
  fog: { density: number; rimOnly: true };          // never over cells (world.md §5)
  backdrop: 'space' | 'deck';                       // section 3.1 rule 1
  props: PropId[];                                  // hand-made later, optional
  shimmer?: boolean;                                // Dunes heat, off in reduced and clear-board
}
```

Starting intensities: key 3.0 [T, the current `lamp` of `main.ts`], ambient 0.8 [T, current], fog
density 0.04 [T]. The Well has key 1.2 [T] and keeps ambient 0.8 [T] so its cells stay legible
(Feedback AD-F9).

**Clear-board** (world.md §8, FINAL) removes fog, shimmer, backdrop haze and props over the board,
and keeps surface, edge, decals, glyphs and marbles. **Reduced tier** (tech.md §5.1) keeps the same
colours with fewer lights.

**Dependencies.** level-designer (biome ids, the `palette` field of `data/biomes/<id>.ron`, which
cells each biome uses), client-engineer (light preset loader, lazy load per biome), audio-designer
(one ambience bed per biome, the twin of the look), narrative-quest-designer (biome names in English).

**Tests.**
- `biomes.test.ts`: every biome id of `data/biomes/*.ron` (file names) has a `BiomeArt` and a
  `BiomePalette`; every `palette` field of the RON files names an existing palette.
- The palette law test (2.1) covers the colours of this table.
- E2E (R4, Playwright, Chromium): a fixture fight on a Lumen tile and one on a Soot Bogs tile;
  `body[data-biome]` is `lumen` then `tourbieres`; a screenshot of each is attached to the PR
  (CONTRIBUTING §6.4); the network log shows only that biome's asset files.

**Risks.** Ten looks on a dark, desaturated palette may feel alike. Mitigations, in order: the key
light direction and colour, the accent, the backdrop horizon, and props. Each biome PR shows its
screenshot next to the previous biomes' screenshots (a contact sheet, Task AD-10).

### 3.3 Biome global rules: their visual side (§5.2)

The rule itself is the level-designer's and the gameplay-programmer's. Its **look**:

| Rule (§5.2) | Look | Tag |
|---|---|---|
| Ash Grove: max ability range −1 | No board effect (a stat rule); the HUD "Board rules" line of ux-designer 5.1 | PROPOSAL |
| Soot Bogs: Poison +1 turn | No board effect; HUD line | PROPOSAL |
| Glass Dunes: resource −10 % except fire | No board effect; HUD line | PROPOSAL |
| Iron Ridges: ragged edge, 0 to 4 rim cells are Chasms | Those cells use the Chasm decal and the backdrop shows a drop below them | PROPOSAL |
| White Tundra: Frozen lasts 1 turn more | No board effect; HUD line | PROPOSAL |
| Dead Shore: Tide, every 6 turns the sea side (5 cells) becomes Chasm for 2 turns, tell 2 turns | The sea side of the rim is drawn with a darker water backdrop at all times, so the player knows which side it is before any tell; the tell is the Breach crack decal (section 4) on those cells with 2 then 1 ticks; open cells use the Chasm decal plus a slow, non-looping water fill | PROPOSAL; 6, 5, 2, 2 [T from §5.2] |
| Caldera: Burn +50 % | No board effect; HUD line | PROPOSAL |
| Vitrified Lands: a marble that dies leaves a Corruption cell | The crumble (section 7.1) ends with the Corruption decal growing under the Remains decal in 300 ms [T] | PROPOSAL |
| The Well: Darkness, range −1 except on a Sanctuary | **Never** a darker board (world.md §5: cells legible in every lighting state, FINAL). The Well is dark by its palette already; Sanctuary cells get a pale bone light cone; the rule is a HUD line | PROPOSAL |
| The Well: Rockfall, a cell becomes Rock, tell 1 turn | Tell: the Rock decal as an outline only plus 1 tick, a fine dust column (static, no loop); then the full Rock decal | PROPOSAL; 1 [T from §5.2] |

**Tests.** `decals.test.ts`: Given a Tide tell with 2 turns left on 5 cells, Then 5 crack decals
with 2 ticks each; Given Darkness on, Then the board key light intensity is unchanged (the rule has no
light effect). E2E (R9): the Tide fixture shows `data-tide="2"` then `"1"` then `"open"`, screenshot.

**Risks.** "Darkness" invites a dark board. The rule above forbids it; the owner should confirm
(Feedback AD-F9).

### 3.4 Dungeons and boss arenas (§17, world.md §1 and §3)

| Dungeon (§17) | Biome | Look | Tag |
|---|---|---|---|
| Les Cales du Ballast, The Echo | Ship interior | world.md Cargo deck (steel plate, ore dust, gantry) | PROPOSAL |
| Le Terrier de Cendre, Weaver Queen | Ash Grove | Ash Grove palette, inside a hollow petrified trunk: silk strands as props | PROPOSAL |
| La Tourbière Engloutie, Drowned Counter | Soot Bogs | Soot Bogs palette, a sunken ore barge with tally scratches on its plates | PROPOSAL |
| La Mine de Verre-étoile, The Hull | Iron Ridges | Iron Ridges palette plus the Cargo deck's steel plates where the Ballast's hull pierced the rock | PROPOSAL |
| La Fournaise Chantante, The Choir | Caldera | Caldera palette plus the Furnace deck's pipes and steam | PROPOSAL |
| La Chapelle de Verre, The Chaplain | Vitrified Lands | Vitrified palette plus the Chapel deck's candles, wire and wax | PROPOSAL |
| Le Gouffre du Lest, Abyss Walker | The Well | The Well palette, a fallen ballast weight as the arena's centre prop | PROPOSAL |
| Le Pont de Tally (raid), The Ballast Mind | Ship interior | world.md Bridge deck (polished white-grey, too clean) | PROPOSAL |

The rule: **biome palette for the board, the boss's original deck for one prop set** [P], so the
world.md boss lore (each boss belonged to a deck) survives the relocation of §17 (Feedback AD-F15).
Each boss arena keeps its single lore object to inspect (world.md §4, FINAL there).

---

## 4. Cell decals (§5.1, §24.5 "les décalques de terrain et leurs glyphes")

**Implementation.** Each special cell draws its glyph as a flat decal on the cell disc (ux-designer
5.1: 0.8 of the disc [T there], under the marble's base). The art-director adds a **surface tint**
per kind so the kind reads at a glance when the glyph is half hidden, and keeps the glyph as the
carrier of meaning (world.md §8: never colour alone, FINAL). Data in `client/src/art/decals.ts`:

```ts
export interface DecalArt {
  kind: CellKind; shape: GlyphShapeId;               // the §5.1 glyph
  tone: 'bone' | 'sodium' | 'steel' | 'base';        // glyph colour, a base token (2.1)
  tint?: Hex;                                        // optional disc tint, palette law applies
  relief: 'flat' | 'raised' | 'sunk';                // Rock raised, Chasm sunk
  rotates?: boolean;                                 // Slope, Vent (§5.1 "la direction tourne")
  ticks?: 'countdown' | 'duration';                  // Vent countdown, timed terrain
}
export function decalOf(cell: TerrainView, biome: BiomeId): DecalArt;
```

The 16 kinds of §5.1 (glyph names from §5.1 [F there: "un glyphe obligatoire"]; looks PROPOSAL):

| Kind (§5.1) | Glyph (§5.1) | Tone | Relief and tint | Note |
|---|---|---|---|---|
| Normal | none | none | biome surface | — |
| Rock | hatched block | steel | raised block, 0.25 of the disc's height [T]; biome material (ash trunk, iron, ice boulder) | A Rock created by an ability (Mur de boucliers, Soulèvement, Prison d'os, Rempart tellurique) is the same block with its owner's seat glyph and duration ticks |
| Chasm | ringed black circle | bone ring | sunk: the disc is removed and the hole shows the void backdrop | Already in the engine (`Board::void`, §5.1); same look as Ballast pillar holes today |
| Ice | snowflake | bone | glassy, low roughness | Never cyan-tinted (A4) |
| Mud | thick waves | steel | matte, darker by 0.6 of the surface luminance [T] | — |
| Thicket | leaves | bone | low glass-leaf tufts at the disc edge, never over the marble footprint | — |
| Height | chevron | bone | raised plateau, 0.1 of the disc's height [T] | Starglass veins on Iron Ridges |
| Slope | arrow | bone | a shallow ramp texture along the direction | Rotates with the cell (§5.1, Rotation of §8.8) |
| Lava | flame | base on sodium | the only sodium-emissive disc; glow is steady, never pulsing | Sodium, never red: red is danger only (Feedback AD-F8) |
| Water | drops | bone | dark, glossy, a static ripple normal | — |
| Quicksand | spiral | bone | sand with a spiral relief | The "sucked in" tell after the first turn (§5.1) is ux-designer's tick plus a sunk marble base (−0.05 of marble radius [T]) |
| Vent | arrow and number | bone | a grate, steam only in full tier | Countdown ticks (§5.1); the number is MSDF text (tech.md §5.3) |
| Sanctuary | star | bone | a pale bone light cone, steady | The only cell with its own light in the Well |
| Corruption | crack | bone | black glass with a fissure; stacks of Vitrification are shown on the marble, not the cell | — |
| Crystal | lozenge | bone | a short raised crystal at the disc edge | — |
| Brambles | thorns | bone | thorny glass wire at the disc edge | — |

**Timed and marked cells that §5.1 does not list** (Feedback AD-F7). Each needs a glyph; the shapes
are proposed here, the catalog entry is the ux-designer's:

| Source | Look | Tag |
|---|---|---|
| Breach (§6.7), Effondrement (§8.8), Séisme (§8.8), Tide tell (§5.2) | the existing Hull crack decal (`main.ts`) in bone with ticks for turns left | PROPOSAL, reuse |
| Pont (§8.8): a cell over a Chasm or **beyond the rim** | a plank of fused glass; its duration ticks are its tell | PROPOSAL |
| Mine temporelle, Météore, Comète arcanique (marked cell, strikes next turn) | bone ring outline on the cell plus the caster's lineage mark, 1 tick | PROPOSAL |
| Fumigène (§8.3), zone that blocks targeting | a ring of low haze at the zone edge only, never over the cells (world.md §5) plus a dotted outline | PROPOSAL |
| Source (§8.4), a timed Sanctuary | the Sanctuary decal plus duration ticks | PROPOSAL |
| Mur de flammes, Sol verglacé (timed Lava and Ice) | the kind's decal plus duration ticks | PROPOSAL |
| BR loot chest on a cell (§20) | a small ledger crate prop with a bone lid glyph | PROPOSAL |
| Rockfall tell (§5.2) | section 3.3 | PROPOSAL |

**Layering on one cell** (§6.6 Remains, §5.2 Vitrified Lands, §17 Sanguin): bottom to top, surface,
kind decal, Remains decal (section 7.1), timed or marked ring, then the marble. At most 3 [P] flat
layers are drawn; a fourth (rare) shows as a "+1" notch at the disc edge.

**Dependencies.** level-designer (`cells.ron` glyph ids, which kinds are directional), ux-designer
(glyph catalog, ticks, the decal ghost of a terrain preview at 0.45 opacity), gameplay-programmer
(`TerrainView`: kind, direction, turns left, owner), client-engineer (decals on any region mask, one
instanced mesh per kind).

**Tests.**
- `decals.test.ts`: every `CellKind` has a `DecalArt`; Given a Slope with direction 2, Then
  `rotates` and the angle is 120°; Given a Lava cell, Then tone is `base` on a sodium disc and no
  `tint` is red (A5); Given a Rock made by Mur de boucliers with 2 turns left, Then 2 duration ticks
  and the owner's seat glyph.
- Shape distinctness inside the terrain family (2.2).
- E2E (R2): the 6-kind fixture of ux-designer 5 (Tests) shows 6 decal kinds; screenshot. E2E (R9):
  the remaining 10 kinds in one fixture board per biome, screenshot contact sheet.

**Risks.** A raised Rock may hide the decal of the cell behind it at a low camera pitch; the camera
pitch stays at today's value or steeper (ux-designer 1.1 Risks). Lava glow next to the sodium hazard
tone of the HUD: they share a meaning (hazard), which is wanted.

---
## 5. Player marbles: hero, Fragments, lineages, party, rivals (§6.6, §6.9, §8, §4.7, §19, §20)

### 5.1 Size never carries meaning (§6.4)

Every marble keeps the radius of today (0.36 [F, `main.ts`]) whatever its kind, Weight, level or
rarity (PROPOSAL). A heavier marble is not bigger: Weight is read from the pips (section 8.1) and the
push preview (ux-designer P1). Reason: in Abalone the eye reads lines of equal marbles; bigger marbles
would break lines, overlap neighbours at radius 0.46 [F] discs, and suggest a size rule that does not
exist. Kind is told by **silhouette added on top** (band, facets, crest, accent), as the shell cap and
army glyphs do today.

### 5.2 The hero and its Fragments (§6.6 "la pièce la plus forte", §6.9 "éclats de verre du héros")

| Unit | Body | Core | Added silhouette | Tag |
|---|---|---|---|---|
| Hero | Smooth smoked glass, clearcoat (the current glass material) | Cyan `#7fd6e8` [F, world.md §5], the brightest light on the board | An engraved **lineage band** around the equator (5.3) | PROPOSAL |
| Fragment | **Faceted** glass: a flat-shaded icosphere (detail 1 [P]), same radius | Cyan at 0.5 of the hero's emissive intensity [T] | Facets only | PROPOSAL |
| Flipped Fragment (The Chaplain, §18) | The existing Flipped look on the faceted body: black ridges creep up from the base | Dims, stays visible until the flip completes | world.md §5 [F there] | FINAL look, PROPOSAL body |

- "Cyan inner light that dims with each lost marble" (world.md §5, FINAL there) becomes: the core of
  every marble of an entity dims by `losses / routAt` of that entity [P], down to 0.35 of full
  [T] at the threshold minus one. HP is not shown by the core (that is the HP arc, ux-designer L1).
- The hero is the only smooth, banded glass marble of its entity: the silhouette test of 2.2 includes
  a rasterized side view of hero vs Fragment (`1 − IoU ≥ 0.20` [T]) at 32 px [P].

### 5.3 The 8 lineages (§8, §2 "chaque classe est une lignée")

Rule (PROPOSAL): the core stays cyan for every lineage (world.md §5: one cold cyan for the player's
light, FINAL). A lineage reads through its **band**: a material from the base palette plus an engraved
glyph repeated 3 times around the band [P]. Names from `narrative-quest-designer.md` §3.3.

| Class | Lineage | Band material | Engraved glyph | Ultimate signature (section 9.4) |
|---|---|---|---|---|
| Guardian | Anchor | Heavy rust iron `#7a3b1d` [F base], 1.5 times the band width [T] | Anchor | A ring of rivets engraved around the hero |
| Warrior | Ram | Brushed steel `#4a5258` [F base] | Ram-horn double chevron | Chevrons along the push line |
| Assassin | Shard | No full band: 3 thin cuts [P] through the glass | Blade shard | Cut lines on each struck cell |
| Healer | Lantern | Bone `#d8d4c8` [F base] | Lantern window (square in a ring) | A steady bone light cone on each ally |
| Mage | Furnace | Steel with a sodium ember line `#d9822b` [F base] | Three heat lines | Sodium seams on the target zone |
| Necromancer | Ossuary | Bone with black ridges | Rib cage (three arcs) | Bone stitches on raised marbles |
| Chronomancer | Hourglass | Dune-gold grains `#c9a46a` [T, Dunes accent] | Hourglass | A ring of tick marks around the board |
| Geomancer | Stratum | Three stone layers (steel, rust, base) | Stacked strata | Strata lines on changed cells |
| v2 Puppeteer, Artificer, Magnetizer, Cantor (§8.9) | later | later | later | later |

The Guardian and the Warrior both have Weight 3 (§8.0, TUNE there); their bands differ by material
**and** glyph, so a Guardian hero and a Warrior hero side by side differ by two cues.

### 5.4 Party, allies and rivals (§4.7 party of 4, §6.2, §19, §20)

All player heroes are glass with a cyan core. In a fight with several players the eye must still tell
*whose* marble it is and *which side* it is on.

- **Seat glyph** (PROPOSAL): in any fight with more than one player, every marble of a player entity
  (hero, Fragments, Revenants) carries its seat glyph engraved on top. The 4 party seats use the first
  4 of the 6 battle royale glyphs that world.md §5 already plans (FINAL there: "an engraved glyph,
  never color alone"). The frieze token of that player shows the same glyph (ux-designer 3.3).
- **Viewer-relative camps** (PROPOSAL): in PvP and battle royale, the **viewer's camp** is drawn as
  cyan-core glass; every other camp is drawn as **rival glass**: the same smoked glass body with a
  **bone** core (`#d8d4c8` [F base]) instead of cyan. Each peer sees itself in cyan. This is pure
  presentation: the engine and the signed log never see it (tech.md §5.2, FINAL), so it cannot desync.
  It keeps world.md's "cyan is the player's light" true for every viewer, where today's 1v1 uses
  black and white marbles.
- In PvE, allied players in the viewer's camp keep the cyan core and their seat glyph; enemy monsters
  are shells (section 6). No rival glass appears in PvE.
- `lookOf(unit, viewer)`: `core = unit.camp === viewer.camp ? 'cyan' : 'bone'` for player kinds;
  `seat = viewer.players > 1 ? unit.seat : undefined`.

**Dependencies.** ux-designer (`UnitView.kind`, `camp`, `entity`, a `seat` field to add; frieze
tokens), gameplay-programmer (seat index per entity in the combat view), network-engineer (seat order
in the party, stable for the whole fight), narrative-quest-designer (lineage names), combat-designer
(lineage per class id), pvp-br-designer (BR slot count, 6 [F, world.md §11]).

**Tests.**
- `looks.test.ts`: Given a Warrior hero of camp 0 and viewer camp 0, Then body `glass`, core `cyan`,
  band `ram`; Given the same unit and viewer camp 1, Then core `bone`; Given a Fragment, Then body
  `shard`; Given a party of 2, Then every player marble has a `seat`; Given solo, Then no `seat`.
- Lineage family distinctness of the 8 band glyphs (2.2).
- E2E (R1): the R1 fixture fight, `body[data-hero-look]` is `glass:cyan:ram`; screenshot of the board
  in the PR. E2E (R10): two tabs in an arena, each tab reads its own hero as `cyan` and the other as
  `bone` in `data-camp-looks`.

**Risks.** Viewer-relative colours make shared screenshots ambiguous ("which one was me?"): the seat
glyph stays the same for both viewers, so it is the shared reference. The idea needs an owner's yes
(Open question Q3).

---

## 6. Monsters (§5.3, §5.2 monster lists, §4.4)

### 6.1 Body, crest and skin

Every monster on a board is a **shell** marble (world.md §5, FINAL: "matte black organic shell,
ridged like a scarab, faint heat pulse, no core"). Lore line (PROPOSAL, for narrative-quest-designer):
the glass took Hollow's fauna the same way it took the crew, so a mantis, a crab or a bear is a
shell now; its old shape survives only as a crest. That keeps one board language and avoids 20
creature models (Feedback AD-F13).

Three layers, from the most important for play to the least:

1. **Crest = archetype** (§5.3, the gameplay role). Procedural geometry on top of the shell, 0 bytes.
   Must read at 720p (world.md §6 rule 9, FINAL).
2. **Rim band = rarity** (6.2).
3. **Skin = family** (the §5.2 monster names): the biome's ridge normal map in one of 2 variants
   [P] (ridge frequency and depth), plus one family detail. Cosmetic only.

Crests (PROPOSAL; sizes TUNE, as a fraction of the marble radius):

| Archetype (§5.3) | Crest | Reads as |
|---|---|---|
| Brute | A flat heavy plate on top, 0.6 wide | heavy, slow |
| Prowler (Rôdeur) | Two back-swept spikes, 0.5 long | fast, flanker |
| Thrower (Lanceur) | A short tube pointing to its facing, 0.4 long | ranged |
| Shaman (Chaman) | A thin standing ring above the top, 0.5 wide | support |
| Builder (Bâtisseur) | A stepped stack of 3 small blocks | makes Rocks |
| Exploder (Explosif) | No crest: sodium seams across the shell, steady glow | blows up at death |
| Bearer (Porteur) | A shield plate on the **front** side, 0.8 high, turned to its facing | frontal shield |
| Summoner (Invocateur) | Three small nubs around the top | calls others |

Families (§5.2), skin details (PROPOSAL):

| Biome | Family 1, skin | Family 2, skin |
|---|---|---|
| Lumen | Wandering Shells: plain ridges (the reference shell) | Lumen Prowlers: ridges swept back |
| Ash Grove | Mantises: long thin ridges | Weavers: bone silk strands on the shell |
| Soot Bogs | Bloaters: swollen smooth shell | Drowned: wet sheen, algae-matte patches |
| Glass Dunes | Burrowing Scarabs: deep scarab ridges | Mirages: bone heat lines across the shell |
| Iron Ridges | Golems: stone plates | Harpies: fine feather-like ridges |
| White Tundra | Shell-bears: thick ridges with a frost rim at the base | Frost Wraiths: pale worn ridges |
| Dead Shore | Ballast Crabs: rust-plated | Sirens: a spiral ridge |
| Caldera | Salamanders: sodium veins in the ridge gaps | Forged: riveted steel patches |
| Vitrified Lands | Vitrified: fused glass with shapes frozen inside | Echoes: mirror-polished ridges |
| The Well | Abominations: two shells fused | Lost Choirs: engraved mouth rings |

A **Mirage** must never look like player glass: its body stays matte shell (rule: no family skin may
use the glass material or a core, tested in `looks.test.ts`). White Tundra's "frost rim" is at the
base and static; the Frozen status overlay covers the upper half (7.3), so they never look alike.

### 6.2 Rarity, leader and affixes (§5.3)

| Rarity (§5.3) | Look | Tag |
|---|---|---|
| Minion (Sbire) | Crest at 0.7 scale [T]; no band | PROPOSAL |
| Normal | No band | PROPOSAL |
| Champion ("bleu", 1 affix) | **Steel** rim band + 1 notch | PROPOSAL, replaces blue (Feedback AD-F3) |
| Elite ("jaune", 2 or 3 affixes, HP ×3) | **Sodium** rim band + 1 notch per affix (2 or 3) | PROPOSAL, replaces yellow |
| Rare named | **Bone** rim band + a crown notch; its name in the inspect panel | PROPOSAL |
| Boss | Section 11 | PROPOSAL |
| Pack leader (§6.7 "mort du chef de meute") | A small bone chevron above the crest, always on | PROPOSAL |

Affix marks (§5.3, 12 affixes): one shape each in the **affix family**, framed by a small diamond
(2.2 frames). Shown in the inspect panel (ux-designer). Only affixes that change what the board does
are always on: Pillar (the Unmovable keyword glyph, §6.11), Shield (the Bearer's front plate), Frosting
and Burning (visible as the Ice and Lava they leave). Shapes (PROPOSAL): Armored a thick hex, Massive
a weight with a plus, Frosting a snowflake in a diamond, Burning a flame in a diamond, Vampiric two
fangs, Echo a mirrored chevron pair, Pillar a column, Grapple a hook, Shield a plate, Summoner three
dots, Explosive a burst, Teleporter two offset rings.

### 6.3 Monster level tier (§4.4 "une couleur et un glyphe")

§4.4 names five colours: grey, green, yellow, orange, red. Green and yellow are outside world.md §5
("nothing saturated outside these", FINAL) (Feedback AD-F2). Proposed ramp, palette-safe and ordered
by luminance, with the glyphs of `encounter-boss-designer.md` §3.3 (pips are easier to count than
the ux-designer's punctuation; the two role files disagree, Open question Q10):

| Band (§4.4) | Tone | Glyph | Tag |
|---|---|---|---|
| Grey (6 or more levels below) | `#6b7378` (3.6:1 on `--panel`) | hollow ring | tone [T], glyph PROPOSAL |
| Green (low) | `--muted` `#9aa3a8` [F, ui.md §2] | 1 pip | PROPOSAL |
| Yellow (even) | bone `#d8d4c8` [F base] | 2 pips | PROPOSAL |
| Orange (high) | sodium `#d9822b` [F base] | 3 pips | PROPOSAL |
| Red (5 or more above) | danger `#ff6b5a` [F base]: a real danger, so red keeps its meaning | a cracked ring (not a skull: no gore, world.md §2) | PROPOSAL |

The level number is text in `--text` beside the glyph (A9). The words "green" and "yellow" stay in
the design vocabulary; only the tones change.

### 6.4 Intent (§5.3 "comme dans Slay the Spire")

The intent glyph (ux-designer 3.1 owns when it shows) is the **ability icon** (section 12.4) inside a
bone ring, floating above the monster with the 2.2 outline; its target cell gets a steady bone ring
outline, the world.md tell mark (FINAL there: "steady ring outlines, pale bone-white, 3:1"). Never a
halo or a glow alone (world.md §5, FINAL).

**Dependencies.** encounter-boss-designer (archetype and family ids per monster, affixes, leader
flag, `facing` for the Bearer and the Thrower), gameplay-programmer (`facing` in `UnitView`),
ux-designer (inspect panel, intent timing, tier glyph placement), narrative-quest-designer (the fauna
lore line, family English names), level-designer (which families live in which biome).

**Tests.**
- `looks.test.ts`: Given a Bearer facing direction 3, Then crest `bearer` and the crest rotation is
  180°; Given an Elite with 3 affixes, Then rim `elite` with 3 notches; Given any monster, Then body
  `shell` and core `none` (no family may produce a glass body or a core).
- Crest silhouettes, rasterized from the side at 32 px [P], pairwise `1 − IoU ≥ 0.20` [T] (archetype
  family).
- `tiers.test.ts` (shared with ux-designer): Given delta −6, Then tone `#6b7378` and hollow ring;
  Given +5, Then danger and cracked ring.
- E2E (R1): the R1 pack of 2 monster types (§25) shows 2 distinct crests, `data-crests` lists both;
  screenshot. E2E (R4): an Elite pack on the world map shows the sodium band.

**Risks.** Crests on top can be hidden by L3 glyphs (ux-designer 1.1): L3 floats above the crest
height, 0.9 of the radius higher than the marble top [T]. Choir army glyphs (cone, torus, block) look
like the Prowler, Shaman and Brute crests: a Choir fight never shows normal monsters' crests on the
Choir's own marbles, and the army glyph keeps its pale-ring tell (Risk accepted, PROPOSAL).

---

## 7. Death, Remains, Revenants, overlays (§6.6, §8.6, §6.11)

### 7.1 The 0 HP crumble and the Remains (§6.6 "elle se fend puis s'effrite (400 ms)")

**Implementation.** `client/src/art/tracks/crumble.ts`, a pure track like `eject.ts`:

```ts
export interface CrumbleTrack { kind: 'crumble' | 'fade'; cracksMs: number; fallMs: number;
  totalMs: number; shards: { dir: [number, number]; at: number }[]; }
export function crumbleTrack(cell: Axial, body: MarbleLook['body'], reducedMotion: boolean,
  rng: () => number): CrumbleTrack;
```

- 0 to 150 ms [T]: dark crack lines spread over the marble. 150 to 400 ms [T]: it splits into 6 [T]
  shards that sink into the cell and fade. Total 400 ms [T, §6.6]. Glass bodies break into glass
  shards, shells into black flakes.
- It only darkens, never brightens (world.md §5 photosensitivity rule, FINAL): the core light fades
  to 0 during the cracks.
- Reduced motion: a plain 400 ms [T] fade on the cell (ux-designer 5.3 agrees).
- A click or a key ends it at once and it never holds the next input (world.md §5, FINAL for the
  ejection; applied here, PROPOSAL).
- **Remains** (Dépouille, §6.6, blocks nothing): a flat ring of shards on the disc (glass shards or
  black flakes, the same as the crumble), steel tone at 0.6 opacity [T], drawn under any marble that
  later stands there. Consumed Remains (Relever les morts, Explosion de cadavre, §8.6) fade out in
  200 ms [T].
- An ejection keeps the world.md §5 look for every kind, hero included (FINAL there: 200 ms over the
  rim plus 600 ms in the void).

### 7.2 Revenants (§8.6, §6.6)

`body: 'revenant'`: the original body (glass, shard or shell) with bone **stitches** over it and a
hollow, dark core (`core: 'none'`), plus the Necromancer's seat glyph when more than one player
fights. A boss raised as a Revenant keeps its accent. Decay (−10 % of max HP per turn [T, §8.6]) is
already on the HP arc; the stitches gain one crack per quarter of HP lost [P], so the decay is
readable from the silhouette too. "Armée des morts" extra Revenants (§8.6) show duration ticks.
A Revenant leaves no Remains (§6.6): its crumble ends with nothing on the cell.

### 7.3 Status overlays (§6.11)

Statuses are glyphs in the ux-designer's L3 slot and inspect panel. Two statuses also change the
marble because they change what the marble can do this turn and must read from a distance:

- **Frozen** (Gelé): a static frost crust over the upper half of the marble, bone-white, no glow.
- **Stasis**: a thin translucent shell around the marble, radius 0.40 [T], dune-gold `#c9a46a` [T]
  tint at 0.25 opacity [T].

Everything else is a glyph only (no tint, no aura), so the board does not turn into a soup of
effects.

**Tests.**
- `crumble.test.ts`: Given full motion, Then `kind` `crumble`, `totalMs` 400, 6 shards, cracks end
  at 150; Given reduced motion, Then `kind` `fade`, `totalMs` 400 and no shards; Given the same rng
  seed twice, Then the same shard directions; Given body `revenant`, Then no Remains in the result.
- `looks.test.ts`: Given a Frozen hero, Then `overlay` `frost`; Given Stasis, Then `stasis`.
- E2E (R1): a hero at 0 HP in the fixture: `body[data-crumbling]` is `crumble`, then `fade` with
  `prefers-reduced-motion`; the cell then shows `data-remains="1"`.

**Dependencies.** gameplay-programmer (`Effects` entries for death, Remains created and consumed,
Revenant raised), ux-designer (log lines, the 1.5 s animation budget of ux-designer 6.5),
audio-designer (crack and crumble sound, the twin), combat-designer (which abilities consume Remains).

---

## 8. Combat overlays: their art (§6.4, §6.5, §6.6, §6.11, §8.5, §24.5)

The ux-designer decides **which** layer shows and when (L0 to L3). The art-director draws them.

### 8.1 Weight pips (§6.4 "affiché par des pastilles")

1 to 5 [T, §6.4] raised bone studs on the front rim of the cell disc, each 0.06 of the disc radius
[T], evenly spaced over 120° [P] of the rim. A temporary change (Alourdi, Allégé, Titan, Mud's +1) is
an **outlined** stud (ux-designer L2) for each point above the base, and a missing stud socket left
visible for each point below. Instanced: one draw call for all pips [P].

### 8.2 HP arc and shield (§24.5 "un anneau de PV autour de chaque boule")

A flat arc on the disc around the marble base (ux-designer L1), bone; under 25 % of max HP [P] it
turns **sodium** (hazard), never red (red stays for ejection danger, ui.md §2, FINAL). The shield is
a thinner steel arc outside it. The HP arc is flat on the disc and the world.md tell ring stands on
the marble: the two never share a plane, so an HP ring cannot be mistaken for a tell (Feedback
AD-F17).

### 8.3 Edge danger (§6.6 "Alerte Danger du bord")

Shape for the ux-designer's A.2: a chevron pointing out of the board along the threatening direction,
with a "!" notch cut in it. `could`: outline only; `will`: filled. Tone danger red [F, ui.md §2],
with the 2.2 near-black outline. Directional (rotates by `60° × direction`). It is the only red glyph
on a calm board, so it is never lost.

### 8.4 Status, keyword and element glyphs (§6.11, §8.5)

**Family frames** (PROPOSAL) let one meaning reuse one shape across families without confusion
(2.2): terrain glyphs have no frame; status glyphs sit in a small ring; affix glyphs in a diamond;
rarity glyphs in a square (12.1). So a bare flame on a cell is Lava, a flame in a ring is Burn.

| Glyph (§6.11, §8.5) | Shape (24-grid polygons) |
|---|---|
| Anchored (Ancré) | anchor |
| Stasis | hourglass inside a circle |
| Elusive (Insaisissable) | dashed ring |
| Rooted (Enraciné) | three roots down |
| Stunned (Étourdi) | three small stars |
| Frozen (Gelé), also Mage state "Gelé" | ice block (not the Ice cell snowflake) |
| Silence | slashed mouth bar |
| Blinded (Aveuglé) | slashed eye |
| Taunt (Provocation) | "!" on a shield |
| Bleed (Saignement) | drop with a slash |
| Poison | drop with two bubbles |
| Burn (Brûlure), also Mage state "Brûlé" | flame |
| Heavier, Lighter (Alourdi, Allégé) | weight with an up or down arrow |
| Marked (Marqué) | crosshair |
| Shield (Bouclier) | shield arc |
| Charged (Mage state) | bolt |
| Wet (Mouillé, §5.1 Water) | small drop |
| Vitrification stacks (§5.1) | crack plus a 1 to 3 [T, §5.1] dot count |
| Unmovable (Inamovible) | column |
| Unejectable (Inéjectable) | ring with a lock |
| Weariness (Lassitude) | ring with a lock, slashed |
| Channel (§6.10), Flee (§6.7) | three arcs (a channel) |
| Armed Preparation (§6.3) | a cocked hook |

"Gelé" is both a status (§6.11) and a Mage state (§8.5) under one word: one glyph serves both, which
is right only if the engine treats them as one (Feedback AD-F28).

**Tests.** Distinctness inside the status family (2.2); every status and keyword id of the
gameplay-programmer's data has a shape (integrity, via the ux-designer's catalog); Given a Slope cell
and an Edge danger glyph with the same direction, Then both rotate by the same angle.

**Dependencies.** ux-designer (catalog ids, labels, layer priorities), gameplay-programmer (status and
keyword ids), combat-designer (Mage states).

---
## 9. Ability VFX grammar (§6.10, §6.5 elements, §8)

80 abilities, 160 R3 variants (§10) and 16 ultimates (§8) cannot each get their own effect. The
grammar gives **every primitive one visual verb**, and **every element tag one tone**; an ability's
effect is the sum of its primitives, generated from its data (§1 pillar 6). No per-ability art in
v1 (PROPOSAL, KISS).

### 9.1 One verb per primitive (§6.10, 12 primitives)

| Primitive | Visual verb | Duration |
|---|---|---|
| Damage | Impact chips fly 0.2 of a cell from the hit point and fade; the number is the ux-designer's label | 250 ms [T] |
| Heal | Bone motes rise 0.3 of the marble radius and fade **in then out** (never a flash) | 300 ms [T] |
| Shield | The steel shield arc (8.2) draws around the disc | 200 ms [T] |
| Forced move: push, pull, slide | The existing slide track (`slide.ts`) | as today |
| Forced move: teleport | Fade out 120 ms [T], fade in 120 ms [T] at the target | 240 ms [T] |
| Forced move: swap | Both marbles cross-fade | 240 ms [T] |
| Stat mod | An engraved arrow up or down on the marble | 300 ms [T] |
| Status | The status glyph settles into L3 | 200 ms [T] |
| Terrain | The decal grows from the cell centre | 250 ms [T] |
| Summon | The marble rises out of the cell | 300 ms [T] |
| Raise | The Remains pull together into the Revenant | 400 ms [T] |
| Mark | The bone ring outline appears, steady | 150 ms [T] |
| Resource | No board effect: the gauge ticks (ux-designer 7) | — |
| Turn (bonus Step, restriction) | No board effect: the frieze shows it (ux-designer 3.3) | — |

**Targeting** (§6.10): "In line" abilities draw a thin streak along the axis, 150 ms per cell [T],
400 ms at most [T]; "Zone" abilities draw a ring outline of the zone for their duration; "Board"
abilities draw a ring along the board frame.

### 9.2 One tone per element tag (§6.5 "étiquettes de synergie")

| Element | Tone | Texture cue (so it is not colour alone) |
|---|---|---|
| Physical (no tag) | steel `#4a5258` [F base] | chips |
| Fire | sodium `#d9822b` [F base] | rising embers |
| Frost | bone `#d8d4c8` [F base], never cyan (A4) | angular crystals |
| Lightning | bone, jagged line | zigzag streak, steady for its duration, no flash |
| Shadow | base `#0b0d0f` [F] with a bone rim | smoke that sinks |
| Light | bone | soft motes |
| Time | dune-gold `#c9a46a` [T] | tick marks |
| Pure damage | bone | a clean ring |

### 9.3 Timing and photosensitivity (world.md §8, tech.md §5.1, ux-designer 6.5)

- An action's whole effect stays under 1.5 s [P, ux-designer 6.5]; multi-hit chains (Danse des
  lames, Chaîne d'éclairs, Peste) compress to 150 ms per hit after the first [T, ux-designer].
- Any click or key ends the effect at once; the next input is never held (world.md §5, FINAL).
- **Flash budget** (PROPOSAL): every bright transient (a VFX that raises the luminance of its area)
  ramps in over at least 100 ms [P], and a pure `FlashBudget` in `vfx.ts` allows at most 3 bright
  transients per second on screen [F, WCAG 2.3.1 and world.md §8]; extra ones are drawn without
  their bright phase.
- Reduced motion: chips, motes, embers and streaks are replaced by a 200 ms [T] glyph fade on the
  target.
- Effects are driven by the `Effects` list of the engine, as timelines (tech.md §5.2, FINAL); VFX
  randomness uses the client RNG (2.5).

### 9.4 Ultimate signatures and cosmetic variants (§8, §16 "variante cosmétique de l'ultime")

An ultimate plays its primitives like any ability, plus its **lineage signature** (table 5.3)
engraved on the board for 600 ms [T]. The class quest cosmetic variant of §16 swaps the signature
for another engraving in the same lineage (PROPOSAL): a cosmetic never changes a tell, a primitive's
verb, a glyph, or a timing (world.md §8: options never remove information, FINAL there).

**Implementation.** `client/src/art/vfx.ts`:

```ts
export function vfxOf(effect: EffectView, reducedMotion: boolean): VfxCue[];  // pure
export class FlashBudget { admit(atMs: number, bright: boolean): boolean }    // pure, 3 per 1000 ms
```

**Dependencies.** gameplay-programmer (`Effects` entries carry the primitive and the element tag),
combat-designer (element tags per ability, ultimate list), ux-designer (labels, budget),
client-engineer (particle system on the existing 128 px atlas, art.md table), audio-designer (the
sound twin of each verb).

**Tests.**
- `vfx.test.ts`: Given a Damage effect tagged Fire, Then one `chips` cue with tone sodium and
  `embers`; Given a Heal, Then `motes` with an ease-in; Given reduced motion, Then one `glyph-fade`
  cue of 200 ms; Given an in-line effect over 5 cells, Then the streak lasts 400 ms (capped).
- `FlashBudget`: Given 4 bright admits at 0, 100, 200, 300 ms, Then the 4th is refused; Given a 4th
  at 1001 ms, Then admitted.
- Integrity: every primitive and every element tag of the data has a verb and a tone.
- E2E (R2): the Mage's Trait de feu in a fixture: `body[data-vfx]` lists `streak,chips`, and the
  animation ends under 1.5 s.

**Risks.** A grammar can look generic. The lineage signature, the element textures and the hero's
band carry identity; bespoke VFX for the 16 ultimates can follow once the grammar ships (not a Task
here).

---

## 10. The world map (§4.1 to §4.4, §4.7, §21, §22)

### 10.1 Tiles (§4.1, §24.5 "les tuiles en instanced mesh")

- One hex prism per tile, flat top, drawn with one `InstancedMesh` per height class [P] (3 classes
  [P]: low for the Well and Soot Bogs, mid, high for the Iron Ridges), so the world costs about 3 draw
  calls [T] whatever its size.
- Tile top colour: the biome surface lifted toward its edge colour by 30 % [T] (a board surface is
  too dark to read at map scale); tile outline: the biome edge colour (A7 holds, 3:1 [F]).
- Only tiles within 12 tiles [T] of the camera target are instanced at once (469 tiles [computed from
  12]); the rest of the 11 000 tiles [T, §4.1] exist as data only.
- Biome borders are crisp (no blending): a border is information (a new zone, a new level band).
- Each tile carries a seeded scatter of 0 to 3 [T] tiny props of its biome (2.5): grass blades, ash
  trunks, salt pillars, from the procedural set; hand-made glTF props replace them later.

### 10.2 Exploration darkness (§4.2 "brouillard d'exploration")

Unseen tiles: top in base `#0b0d0f` [F], outline steel `#4a5258` [F] (the tile grid stays readable,
ux-designer 8). Seen tiles: their full look. Reveal radius 3 [T, §4.2]. The reveal is a 300 ms [T]
fade per tile, ring by ring; reduced motion: instant. This is **not** the world.md "fog" (rim haze):
the code and the docs call it "exploration darkness" to avoid the clash (Feedback AD-F24).

### 10.3 Tile content (§4.3)

| Content (§4.3) | Map look | Tag |
|---|---|---|
| Empty | biome scatter only | PROPOSAL |
| Pack | 1 to 3 [T] small shell marbles at 0.35 scale [T] with the leader's crest, plus the level tier glyph (6.3) floating above | PROPOSAL |
| Elite or Champion | the same with the rarity band (6.2) | PROPOSAL |
| Gathering node | section 15 | PROPOSAL |
| NPC or outpost | a Colony lamp post and tent; outposts add a Beacon | PROPOSAL |
| Chest or cache | a ledger crate, bone lid glyph; a trapped one looks the same (it is a surprise by design, §4.3) | PROPOSAL |
| Puzzle | a small engraved Abalone plate on the ground | PROPOSAL |
| Dungeon entrance | a dark arch with a bone ring glyph | PROPOSAL |
| Event (§22) | a bone ring around the tile with countdown ticks | PROPOSAL |
| Zone boss or rare named | a full-scale shell with its accent (section 11), on a raised plinth | PROPOSAL |

Aggro rings (§4.4: 1 tile, 2 for an elite [T there]) are the ux-designer's faint ring; the art
draws them as a dotted steel outline on the ground, never filled.

### 10.4 The world ball, Beacons, other players (§4.2, §4.7, §21)

- **The world ball is the hero** with the exact same look (`lookOf`), so the player recognises it in
  the fight. It **rolls** one tile per step (300 ms × biome cost [T, §4.2]); on Ice it **glides**
  without rolling for the extra tile (§4.2). Élan (§4.2) only shortens the step.
- **Beacon** (Balise): a steel pylon with a bone lamp. Inactive: lamp dark, outline only. Active:
  lamp lit, steady. Never cyan (A4): cyan is the player.
- **Other players** (§4.7 party, §21 hub presence): their world balls with their seat glyph (5.4).
- **Out-of-combat HP** (§4.2) is the HP arc on a flat disc under the world ball (ux-designer 8).

**Dependencies.** level-designer (tile data, biome, height class, content, Beacon state, discovery
flags, patrol paths), client-engineer (`world.ts` scene, camera, instancing, A* path preview),
ux-designer (map window, aggro and path display, tier glyphs), economy-designer (node kinds),
encounter-boss-designer (pack leader archetype and rarity on the map).

**Tests.**
- `worldlook.test.ts` (pure): Given a tile of `cretes`, Then height class `high` and top colour =
  `mix(surface, edge, 0.3)`; Given an unseen tile, Then top `#0b0d0f` and outline `#4a5258`; Given a
  pack of 3 with an Elite leader, Then 3 props at 0.35 scale and the elite band on the leader.
- E2E (R4): walk 3 tiles; `body[data-revealed]` grows; a screenshot of the map with darkness, a pack
  and a Beacon in the PR; the draw-call counter stays under 150 [F, tech.md §5.5].

**Risks.** 469 tiles with props can exceed the frame budget on a weak GPU: the reduced tier drops the
scatter props first (tech.md §5.1 "degradation is a table").

---

## 11. Bosses (§18, §17, world.md §3)

**Heart marble** (Boule-Cœur, §18): `body: 'heart'`, the shell with the boss's accent, Weight pips 3
to 5 [T, §18], plus an always-on keyword glyph: Unejectable (ring with a lock) or **Resilient** (a
return arrow into the centre, PROPOSAL shape). Same radius as every marble (5.1).

Accents (world.md §5: "same shell with one accent", FINAL there; assignments PROPOSAL):

| Boss | Accent | Note |
|---|---|---|
| The Echo (§17 Cales du Ballast) | A mirror-polished band | It copies Movements (§18) |
| The Hull (Mine de Verre-étoile) | Welded rivet plates | The existing crack tell stays (world.md §5) |
| The Choir (Fournaise Chantante) | The existing army glyphs (spike, ring, block) | `main.ts` today |
| The Chaplain (Chapelle de Verre) | Candle wax drips | Flips only Fragments now (§18): the Flipped look on the faceted body (5.2) |
| The Ballast Mind (Pont de Tally) | Wire wrap | Tally's own army |
| Weaver Queen (Terrier de Cendre, new) | Bone silk strands that bind the shell | PROPOSAL |
| Drowned Counter (Tourbière Engloutie, new) | Scratched tally marks and a brine crust | PROPOSAL |
| Abyss Walker (Gouffre du Lest, new, the captain) | A rust crown | world.md lists "rust crown" as an accent; given to the captain (PROPOSAL) |

**Phases on HP %** (§18, for example 70 % and 35 % [T there]). world.md §6 rule 4 (FINAL there)
counts "boss marbles left" with notches. The RPG version (PROPOSAL, Feedback AD-F16): an HP bar
engraved along the arena frame, with one engraved notch per phase threshold; the bar dims as HP
falls; a steady glyph marks the next threshold. Never only flat (world.md §6 rule 4).

**The Ballast Mind raid** (§18, 7 tiles, "raid en fleur"): every petal tile is the Bridge deck look;
the centre tile is closed by raised iris plates until phase 3, then the plates sink in 600 ms [T]
(reduced motion: they fade). Each petal's frame carries its player's seat glyph.

**The Hull on 3 tiles** (§18): the middle board's collapse in phase 2 uses the Breach crack decal
with 2 ticks [T, §6.7 tell rule], then Chasm.

**Dependencies.** encounter-boss-designer (boss ids, heart keyword, phases, raid layout),
narrative-quest-designer (the captain lore for the rust crown), ux-designer (intent, phase display),
client-engineer (frame on stitched regions, 13.2).

**Tests.** `looks.test.ts`: Given the Abyss Walker heart, Then accent `rust-crown`, keyword glyph
`resilient`; every boss id of the encounter data has exactly one accent and no two bosses share one.
`frame.test.ts` (13.2): Given phases at 7000 and 3500 bp, Then 2 notches at 70 % and 35 % of the bar.
E2E (R8): The Echo fixture, `data-boss-accent="mirror"`, screenshot.

---

## 12. Icons: items, gems, materials, consumables, tools, abilities (§12, §14, §15, §8, §10)

All icons are **composed** from 2.2 shapes and rendered as inline SVG in windows and as MSDF-free
flat meshes on the engraved frame. 0 bytes, generated from data (PROPOSAL).

### 12.1 Rarity (§12 "une couleur et un glyphe")

§12 gives no colours; the usual Diablo and WoW colours (white, blue, yellow, orange, green) break the
palette (Feedback AD-F4). Glyphs are the ux-designer's (10, PROPOSAL there); tones here (DOM tones,
law A3, A9, A10; contrast on `--panel` computed):

| Rarity (§12) | Glyph (square frame) | Dark tone | Contrast | Tag |
|---|---|---|---|---|
| Common | none | `#9aa3a8` (`--muted`) | 6.8:1 | [F, ui.md §2] |
| Magic | ◇ | `#b0b0aa` | 8.0:1 | [T] |
| Rare | ◆ | bone `#d8d4c8` | 11.8:1 | [F base] |
| Legendary | ✦ | sodium `#d9822b` | 6.0:1 | [F base] |
| Unique | ◉ | copper `#b07a5a` | 4.8:1 | [T] |
| Set | ⛓ | verdigris `#7f9a86` | 5.7:1 | [T] |

Light theme twins are added with the same law (ui.md §2: both themes define the same tokens, FINAL).
Copper and verdigris are **new** tones: they extend world.md §5 with two oxidised metals that fit its
materials (rust, oxidised steel), under the A3 cap. An owner confirms (Open question Q2).

### 12.2 Equipment (§12, 10 slots)

`iconOf(item) = slotShape(slot) + tierNotches(iLvl band) + rarityFrame(rarity)` [P]. Slot shapes:
Core (weapon) a faceted orb in a socket, Relic a small shield, Shell (armour) a dome, Ballast a hanging
weight, Halo a ring, Amulet a pendant, Ring a band, Standard a pennant, Talisman a token, plus the 5
gathering tools (pickaxe, sickle, axe, knife, rod). Legendary items add their Aspect's ability icon
(12.4) in the corner.

**Equipment never changes the look of the hero on the board** (PROPOSAL): normalized PvP shows the
same template for everyone (§19), and a marble must stay a marble (readability first, ui.md §1).
Cosmetics are the lineage band variants and the ultimate signature only (9.4). (Feedback AD-F21.)

### 12.3 Gems, materials, consumables (§12, §14, §15)

- **Gems** (7 types, 5 qualities): one cut shape per type (Ruby triangle, Sapphire square, Emerald
  octagon, Topaz oval, Diamond brilliant, Skull stylised skull outline, Slag-amber drop) and the
  quality as 1 to 5 facet lines [P]. Tints within A3: Ruby rust `#7a3b1d` [F base], Sapphire slate
  `#5b6b80` [T], Emerald verdigris `#7f9a86` [T], Topaz dune-gold `#c9a46a` [T], Diamond bone [F
  base], Skull steel [F base], Slag-amber sodium [F base]. Never red (A5), never cyan (A4).
- **Materials**: family shape (ore, ingot, plank, cloth, plate, block, herb, mushroom, fish, pearl,
  salt, essence) plus T1 to T5 notches [T, §14 tiers].
- **Consumables** (§15.4): potion flask, tonic vial, antidote cross, oil drop, bomb, liquid ballast
  weight.
- **Currencies** (§13.1): gold coin, Lueur (a bone glow drop), glass shards, reputation marks (the
  faction emblem, 14.3), Honour (a crossed pair of plates), Breach tokens (a cracked ring).

### 12.4 Ability icons (§8, §10, §24.5 action bar)

`abilityIcon(ability) = primaryPrimitiveShape + targetingCorner + lineageMark` [P], generated from
the ability data, so the 80 abilities get distinct icons with no drawing. The 16 ultimates get a
bespoke shape each [P], engraved larger on the frame's fifth socket. R3 variants (§10) add a small A
or B mark (the ux-designer's ability card).

**Dependencies.** economy-designer (slots, rarities, gem and material ids, tiers), combat-designer
(ability data: primary primitive, targeting, lineage; the 16 ultimates), ux-designer (rarity glyphs,
ability card, window layouts), narrative-quest-designer (currency and faction ids).

**Tests.**
- `icons.test.ts`: every item slot, gem type, material family, consumable, currency and ability id
  of the shipped data has an icon; Given two abilities of one class, Then their icons differ
  (rasterized, `1 − IoU ≥ 0.20` [T]); Given a Legendary item, Then the frame is the
  Legendary square with ✦.
- Palette law covers the 6 rarity and 7 gem tones (2.1).
- E2E (R5): the inventory window shows one item per rarity; `data-rarity` attributes and a screenshot.

**Risks.** Composed ability icons may look alike inside a class (two Damage abilities, both
adjacent): the distinctness test fails them and a bespoke shape is drawn for the loser, as data.

---
## 13. The unfold and stitched boards (§4.5, §4.6, §6.8)

### 13.1 The tile unfolds into a board (§4.5 "le moment signature du jeu")

The look of the signature moment, as a pure timeline. The client-engineer builds the scene and the
camera; the art-director owns the timeline data and its tests.

```ts
// client/src/art/tracks/unfold.ts
export interface UnfoldTrack {
  kind: 'unfold' | 'crossfade'; totalMs: number;
  camera: { fromMs: number; toMs: number };                 // world view -> board view
  rings: { ring: number; startMs: number; riseMs: number }[]; // cells rise ring by ring
  marblesAtMs: number;                                      // marbles settle on start cells
}
export function unfoldTrack(region: Axial[][], reducedMotion: boolean): UnfoldTrack; // one list per tile
```

- Total 1 200 ms [T, §4.5]. 0 to 300 ms [T]: the camera dollies down onto the tile, the other tiles
  darken toward the base. 300 to 1 000 ms [T]: the tile top splits along the cell lines and the cells
  rise **ring by ring from the centre**: ring `k` starts at `300 + ⌊k × 450 / max(R, 1)⌋` ms [T] and each
  cell rises in 250 ms [T]; decals appear as each cell settles. 1 000 to 1 200 ms [T]: the marbles
  drop onto their start cells and the backdrop becomes the biome's.
- A multi-tile fight unfolds all its tiles at once, each from its own centre (§4.6).
- Any click or key ends it at once; inputs are ignored during it (ux-designer 6.2).
- **Reduced motion** (§4.5 "on n'anime qu'un seul plan"): read as "one flat cross-fade": 300 ms [P,
  ux-designer 6.2] from the tile view to the board view, no camera move, no rising cells (Feedback
  AD-F11).
- A boss retry (§6.12, under 5 s [T there]) skips the unfold (ux-designer 6.4).

### 13.2 Stitched boards and the frame on any region (§4.6, §24.5 "barre gravée sur le cadre")

- Each tile of a stitched fight keeps its own biome surface; seam cells use the normal cell edge,
  never a stronger line (§4.6 "aucune règle spéciale"; ux-designer 8). A fight across a biome border
  therefore shows two surfaces, which is true information.
- The **frame** (the engraved rim that carries the turn light, the tally marks, the boss notches and
  the 4 + 1 action bar, world.md §6 and §24.5) must follow any region: radius 3 to 8 [T, §6.8],
  stitched tiles, the ragged edge of the Iron Ridges, a Pont beyond the rim (§8.8). Algorithm
  (PROPOSAL): collect every cell side whose neighbour is outside the region, chain the sides into
  closed loops, keep the **outer** loop (inner loops are Chasms: they get their decal, not a frame),
  offset it outward by 0.1 of a cell [T], and extrude a strip along it. The action bar sockets sit on
  the frame segment nearest the viewer's start zone (ux-designer 4.5).
- A Pont cell beyond the rim (§8.8) bends the frame outward around it for its duration.

**Dependencies.** client-engineer (camera dolly, cell meshes, frame mesh, skip input), level-designer
(region masks, tile anchors, seams, start zones), ux-designer (transition constraints, bar placement),
audio-designer (the unfold sound twin).

**Tests.**
- `unfold.test.ts`: Given one radius-4 tile, Then `totalMs` 1200, 5 rings, ring 0 starts at 300
  and ring 4 at 750; Given reduced motion, Then `kind` `crossfade` and `totalMs` 300; Given 3 tiles,
  Then 3 ring lists, each from its own centre.
- `frame.test.ts`: Given a hex region of radius 4, Then 1 outer loop of 54 sides (6 × (2R + 1),
  computed); Given radius 4 with one inner Chasm, Then still 1 frame loop; Given two stitched radius-4
  tiles, Then 1 loop with no self-crossing; Given a Pont cell beyond the rim, Then the loop goes around
  it.
- E2E (R4): engage a pack; `body[data-unfold]` goes `unfold` then empty within 1.5 s; with
  `prefers-reduced-motion`, `crossfade`; a click during it ends it at once. Screenshot of the mid
  point in the PR. E2E (R8): The Hull on 3 tiles shows one continuous frame.

**Risks.** The unfold costs 1.2 s per fight at 15 % of tiles holding a pack [T, §4.3]; it must stay
skippable and short. A frame on a radius-8 board at phone width gets thin: its width is set in screen
pixels, not world units (minimum 6 px [T]).

---

## 14. NPCs, quests, factions, Tally, the hub (§2, §13.5, §16, §21)

### 14.1 The Colony and other NPCs (§2 "à moitié vitrifiés")

`body: 'colonist'`: **clouded** glass (rough, frosted, no clear coat), **no core light**, with
rust-stained shell patches on one side (PROPOSAL). It must not look like the Flipped look (glass with
black ridges creeping from the base up, world.md §5, FINAL): colonists are rough and dull, flipped
marbles are clear glass turning black (Feedback AD-F14). NPC marbles stand on a small plinth in the
world and in the hub, never on a fight board except as an escort (§6.7), where they keep this body
plus a bone escort ring.

### 14.2 Quest markers (§16 "`!` et `?` ... toujours avec un glyphe en plus de la couleur")

Shapes for the `narrative-quest-designer.md` §7.3 markers, on a plate (filled = available or ready,
outlined = in progress, ux-designer 10). Tones: sodium for available and ready, steel for grey and in
progress, and **bone** for repeatable, instead of the narrative's cyan (A4: cyan is the player's)
(Feedback AD-F5).

### 14.3 Factions (§13.5)

Four emblems in the 24-grid, used on faction NPCs, vendors, reputation marks and titles (PROPOSAL):
The Colony, a lamp over a pick; The Quiet Vitrified, a closed eye; The Order of the Ledger, three
ledger lines and a tick; The Ballast Strippers, a cut chain.

### 14.4 Tally (§2, world.md §2 and §4)

Tally has no face and no body (world.md §1: "no face", FINAL for the player; for Tally, PROPOSAL):
in the world and the hub it is ledger text on screens (MSDF, tech.md §5.3) with a steady bone cursor.
The Ballast Mind fight gives it its army (section 11), never an avatar.

### 14.5 The hub (§21)

| Room (§21) | Look | Tag |
|---|---|---|
| Bridge | world.md Bridge deck | FINAL look |
| Mess (classic tables) | world.md Mess deck, **unchanged**: the classic modes keep their current look and assets (§1 pillar 1) | FINAL look |
| Hold (Soute: merchants, banker, Gambler) | world.md Cargo deck with stalls | PROPOSAL |
| Furnace (stations) | world.md Furnace deck with the stations (15.2) | PROPOSAL |
| Chapel (Paths master) | world.md Chapel deck | FINAL look |
| Launch Bay (arenas, battle royale, group finder) | new: open steel bay, floodlight key light, docking clamps as props | PROPOSAL |
| Archives (Codex, terminals, audio logs) | new: ledger shelves, rows of dim screens | PROPOSAL |

The hub is the "ballast" palette (3.2). Outposts (§21) are Colony tents, a lamp post, a Beacon, a
station and a contract board, in their biome's palette.

**Codex** (§22): bestiary entries render the monster's marble in-engine with `lookOf` on a neutral
plinth (0 bytes, always matches the board). No illustrations.

**Dependencies.** narrative-quest-designer (NPC list, marker states, faction ids, Tally lines, Codex
entries), level-designer (outpost and hub layout), ux-designer (marker plates, windows),
client-engineer (hub scene).

**Tests.** `looks.test.ts`: Given an NPC, Then body `colonist`, core `none`; `shapes.test.ts`:
quest marker family and faction family distinctness; `palette.test.ts`: no marker tone within A4 of
cyan. E2E (R6): an NPC with an available quest shows `data-marker="available"`; screenshot.

---

## 15. Gathering nodes and stations (§14, §15)

### 15.1 Nodes on the world map (§14)

| Profession (§14) | Node look | Rich vein |
|---|---|---|
| Mining | Faceted rock with metal glints (steady), tier notches engraved | Twice the size of the prop [T], bone ring on the ground |
| Herbalism | Glass plants of the biome | same rule |
| Herbalism, Fissure (Lueur) | A crack in the ground with a pale **bone** glow (Lueur, the currency) | same rule |
| Woodcutting | A petrified trunk | same rule |
| Shelling (Décorticage) | A monster shell husk, open | same rule |
| Fishing | A static ripple ring on a water tile | same rule |

A harvested node dims to 0.5 of its luminance [T] and sinks slightly until it respawns for this player
(§14, per-player state). The 3 s [T, §14] harvest channel shows a ring that fills around the world
ball (ux-designer owns the ring; the art draws it in bone).

### 15.2 Stations (§15.1, §15.2)

5 refining stations and 7 crafting benches, in the hub's Furnace room and in outposts. Procedural
placeholders first (primitive blocks with the station's shape glyph engraved), hand-made glTF later
(1 MB per biome budget, 2.4). A station is never needed to read the game: its name and glyph are on
its plate.

**Dependencies.** economy-designer (node kinds, tiers, stations list), level-designer (node placement,
respawn state), ux-designer (harvest ring), client-engineer (world props).

**Tests.** `worldlook.test.ts`: Given a harvested node, Then luminance factor 0.5 and sunk; Given a
rich vein, Then scale 2 and a bone ring; every node kind of the economy data has a look. E2E (R7):
harvest a node in a fixture, `data-node="harvested"`, screenshot.

---

## 16. PvP, arenas, battle royale, social (§19, §20, §21, §1 pillar 5)

- **Arenas** (§19): the Launch Bay look (14.5); camps by viewer-relative glass (5.4). Normalized
  templates (§19) look like any hero of their class with the player's cosmetics (§19: cosmetics
  count).
- **Battle royale** (§20): 6 players [T, §20], each with one of the 6 slot glyphs of world.md §5
  (FINAL there); the viewer is cyan, the others rival glass. world.md §5's "shell tint per player" row
  becomes "rival glass plus slot glyph" (PROPOSAL; the RPG battle royale has heroes, not shells).
  In-match loot chests: the crate prop of section 4. The Breach (§20) is the Hull crack look.
- **Emotes and pings** (§21: 4 emotes, pings): shapes for the ux-designer's 4 ping kinds (go here: a
  chevron down; attack: crossed plates; danger: a triangle with "!" in sodium, not red, because red is
  the engine's ejection warning; help: a ring with a gap) and 4 emotes (wave, bow, thumbs-up plate,
  ledger tick), each with the sender's seat glyph.
- **"Self-declared, not verified"** (§13.4, §19, §21): a muted seal glyph (an open ring with a
  question mark).

**Dependencies.** pvp-br-designer (arena and BR rules, slots), network-engineer (seat and slot order),
ux-designer (ping kinds, inspect), narrative-quest-designer (emote list).

**Tests.** `looks.test.ts` (viewer-relative rows of 5.4 for 6 BR players: exactly one cyan camp per
viewer); `shapes.test.ts` (ping and emote families). E2E (R10): two tabs, a ping from tab A shows its
shape and seat glyph in tab B (with the ux-designer's ping test); arena screenshots from both tabs in
the PR.

---

## 17. Accessibility and performance gates (world.md §8, tech.md §5.5, §9)

Every Task of this file passes these, and its PR says so:

1. **Never colour alone** (world.md §8, FINAL): every meaning has a shape (2.2 integrity and
   distinctness tests).
2. **Contrast** (world.md §5, ui.md §7, FINAL): the palette law (2.1).
3. **Tells survive every mode** (world.md §8, FINAL): clear-board, reduced tier, colourblind palettes
   and the horror slider never remove a tell ring, a glyph, a decal, a pip or an arc. Test: the list of
   rendered tell and glyph meshes is the same with clear-board on and off (vitest on the scene
   descriptor, and e2e `data-tells` count equal in both modes).
4. **Photosensitivity** (world.md §8, tech.md §5.1, FINAL): at most 3 flashes per second (the
   `FlashBudget`, 9.3); nothing brightens on death or ejection.
5. **Reduced motion** (world.md §8, ui.md §6, FINAL): every track has a fade variant (crumble,
   unfold, VFX, reveal, iris).
6. **UI scale and 720p** (world.md §6 rule 9, FINAL): glyph shapes keep a 2-unit stroke (2.2); a
   Playwright screenshot at 1280 × 720 and 200 % UI scale per UI Task.
7. **Horror slider** (world.md §8, FINAL, 0 to 3): in the open world it only scales ambience props
   (shelled remains in the grass, frozen shapes inside the Vitrified glass) and close-ups; at 0 no
   shelled-body props are shown. It never changes a board look (Open question Q9).
8. **Draw calls** under 150 [F, tech.md §5.5]: Playwright perf fixtures (radius-8 battle royale with
   60 marbles [T, §20: 6 × 10], the 7-tile raid, the world map at 469 tiles) read
   `window.__drawCalls` (client-engineer exposes `renderer.info.render.calls`) and assert ≤ 150.
9. **Bytes**: initial load under 5 MB gzipped [F, tech.md §9], each biome's art under 3 MB [P]
   (2.4), checked by `gen-assets.test.ts` and the existing CI size report.

---

## 18. Day, night and weather (§4.8, v2): deferred, rules only

No Task: §4.8 is v2, after R10. Rules for when it comes (PROPOSAL):

- **Night**: key light × 0.6 [T]; the fill, cell edges, decals and glyphs do not change, so the law
  A7 and A8 still hold at night (the palette test runs the night preset too).
- **Rain**: thin screen-space streaks, off in clear-board and reduced tier. **Lightning** is never a
  flash on the board: a distant steady streak in the backdrop only, through the `FlashBudget`.
- **Sandstorm** (range −1): a haze band at the rim, never over a cell (world.md §5, FINAL), plus the
  HUD rule line; the haze is not the information.

---
## Feedback on the gameplay spec

Contradictions (C) and gaps (G) found while specifying the art. The gameplay spec is not modified;
each item says what this file assumes until an owner decides.

| Id | Type | Where | Problem | Assumed here |
|---|---|---|---|---|
| AD-F1 | C | §2 "La direction artistique ne change pas" vs world.md §1 and §5 | world.md §5 is a ship interior (decks, practical lamps, steel); most of the RPG is outdoors on a moon that world.md §1 says has no atmosphere. "Unchanged" cannot cover prairies, forests, seas and skies | Section 3.1: black space sky, one key light per biome, glass-touched materials; world.md §5 needs an "Hollow surface" delta |
| AD-F2 | C | §4.4 grey, green, yellow, orange, red | Green and yellow are outside world.md §5 ("nothing saturated outside these", FINAL) | Palette-safe ramp by luminance plus pip glyphs (6.3) |
| AD-F3 | C | §5.3 Champion "bleu", Elite "jaune" | Saturated blue sits next to the player's cyan (world.md §5: cyan is the player's light); yellow is outside the palette | Steel and sodium rim bands plus notches (6.2) |
| AD-F4 | G | §12 "une couleur et un glyphe" | No colours given; the genre defaults (white, blue, yellow, orange, green) break the palette | Rarity tones of 12.1, with two new oxidised-metal tones |
| AD-F5 | G | §16 markers "`!` et `?` ... avec un glyphe en plus de la couleur" | No colours given; the narrative role picked cyan for repeatable quests, which is the player's colour | Bone instead of cyan (14.2) |
| AD-F6 | G | §6.6 Dépouille, §5.2 Vitrified Lands, §17 Sanguin | Remains have no look, and one cell can carry Remains, a Corruption made by a death and a Sanctuary made by Sanguin: no stacking order | Remains decal (7.1), at most 3 flat layers per cell (section 4) |
| AD-F7 | G | §5.1 "un glyphe obligatoire" | The catalog lists 16 kinds but not the timed or marked cells abilities create (Breach, Pont beyond the rim, marked strike cells, Fumigène zone, ability-made Rocks, Rockfall tell, Tide tell) nor the battle royale chest cell (§20) | Glyphs proposed in section 4 |
| AD-F8 | G | §5.1 Lava "Flamme", §5.2 Caldeira | Lava invites red, which world.md §5 reserves for danger (breach, ejection) | Lava is sodium (section 4) |
| AD-F9 | C | §5.2 Le Puits "Obscurité" | A literal dark board breaks world.md §5 ("cells and marbles must stay legible in every lighting state", FINAL) | Darkness is a stat rule with a HUD line; the Well's palette is dark but law-compliant (3.3) |
| AD-F10 | C | §4.8 rain "foudre", night | Lightning invites flashes (world.md §8, WCAG 2.3.1); night invites a darker board | Section 18: no board flash, night dims only the key light |
| AD-F11 | G | §4.5 "en mouvement réduit, on n'anime qu'un seul plan" | "Un seul plan" is ambiguous (one camera shot? one layer?) | A 300 ms cross-fade, no camera move (13.1), as the ux-designer reads it |
| AD-F12 | G | §6.9, §8, §4.7, §19, §20 | No look for hero vs Fragments, for the 8 lineages, for allied players in a party, or for two glass camps in PvP; world.md §5 only has "player glass vs shell" | Section 5: smooth banded hero, faceted Fragments, lineage bands, seat glyphs, viewer-relative rival glass |
| AD-F13 | G | §5.2 monster lists, §5.3 | Monsters are fauna (mantises, bears, crabs, sirens) while the lore makes every enemy a shelled marble; and four names collide: the family "Rôdeurs" with the archetype "Rôdeur", the monsters "Vitrifiés" with the faction "Vitrifiés pacifiques", the family "Échos" with The Echo, the family "Chœurs perdus" with The Choir | Fauna became shells (6.1); the name collisions go to narrative-quest-designer and encounter-boss-designer |
| AD-F14 | C | §2 Colony "à moitié vitrifiés" vs world.md §5 Flipped | Half glass, half shell is exactly the Flipped look of The Chaplain | Clouded glass with rust patches, no core (14.1) |
| AD-F15 | C | §17 vs world.md §1 and §3 | The Hull moves to an Iron Ridges mine, the Choir to the Caldera, the Chaplain to the Vitrified Lands, while world.md ties each boss to a deck and its board look | Biome board plus the boss's deck prop set (3.4) |
| AD-F16 | C | §18 phases on HP % vs world.md §6 rule 4 | world.md's phase notches count boss marbles left | An engraved HP bar with threshold notches on the frame (section 11) |
| AD-F17 | G | §24.5 "un anneau de PV autour de chaque boule" | world.md §5 uses "ring outlines" on marbles for tells; an HP ring around the marble would read like a tell | HP is a flat arc on the disc, tells stand on the marble (8.2) |
| AD-F18 | G | §24.5 "barre gravée sur le cadre", §4.6, §6.8, §8.8 | No frame exists for radius 8, stitched tiles, ragged edges or a Pont beyond the rim; world.md §6 rule 3 tally marks assume 6 losses per side, while thresholds are now 3 to 6 and 40 % in groups | Frame algorithm on any region (13.2); tally slots = the entity's `routAt` (ux-designer) |
| AD-F19 | G | §6.4 pips, §4.6 zoomed-out overview, §6.8 radius 8 | Five pips and an arc per marble on a radius-8 board or a 7-tile overview at phone width fall under a few pixels | Pips and arcs have a minimum screen size; the overview hides pips and shows them on zoom (ux-designer to confirm) |
| AD-F20 | C | §20 heroes in battle royale vs world.md §5 "Battle royale slots: shell tint per player" | RPG battle royale players are glass heroes, not shells | Rival glass plus slot glyph (section 16) |
| AD-F21 | G | §12 slots (Halo, Shell, Standard) | Not said whether gear shows on the hero; a visible Halo would crowd the L3 slot and break normalized PvP fairness | Gear never shows on the board (12.2) |
| AD-F22 | G | §16 class quest "variante cosmétique de l'ultime", §13.2 and §19 cosmetics | The cosmetic scope is undefined | Band variants and ultimate signatures only (9.4) |
| AD-F23 | G | §2 "Chaque biome ajoute sa palette, dans ce cadre" | No rule says what "in this frame" allows | The palette law (2.1) |
| AD-F24 | C | §4.2 "Brouillard d'exploration" vs world.md §5 "Fog" | Two different things share one word | "Exploration darkness" (10.2) |
| AD-F25 | G | §22 Codex bestiary | No visual for entries | In-engine marble renders (14.5) |
| AD-F26 | G | §25 roadmap | R1 must be "jouable dans le navigateur" with a hero, Fragments and monsters, but today the player wears bone glass without a cyan core and has the shell against the bot (art.md §3: #286, #291). The roadmap has no art prerequisite | Task AD-04 depends on #291 (cyan core); Open question Q12 |
| AD-F27 | G | §0 deliverables, "Fichiers critiques" | world.md is to change in §1, §2, §4, §6 only, and no RPG file covers art; the art delta (world.md §5 and §8, art.md, ui.md §2 and §7 tokens) has no docs PR | Task AD-01 adds it to docs PR 4 |
| AD-F28 | G | §6.11 Gelé (status) and §8.5 Gelé (Mage state) | One word, two lists: if they differ, two glyphs are needed | One glyph, if the engine treats them as one (8.4) |
| AD-F29 | G | §1 pillar 6, §24.3 integrity tests | "Content is data" lists classes, biomes, monsters, items but not their looks; no integrity test asks that every content id has a look, an icon or a glyph | Art integrity tests in every section here |

---

## Open questions

1. Q1. Hollow's sky above the air pockets: always black space with stars (proposed, 3.1), or a hazy
   sky per biome?
2. Q2. Palette extension: do owners accept the new desaturated tones under the A3 cap (copper and
   verdigris for rarities, slate for sapphire, and one accent per biome), all outside cyan and red?
3. Q3. Viewer-relative camps in PvP and battle royale: each peer sees its own camp in cyan and every
   other camp as bone-core rival glass (5.4)?
4. Q4. Are monsters always shell marbles with a crest (no creature models on the board or the map),
   and does narrative-quest-designer write the "the glass took the fauna" line (6.1)?
5. Q5. Equipment never visible on the board hero (12.2)?
6. Q6. Cosmetics limited to lineage band variants and ultimate signatures (9.4)?
7. Q7. Boss arenas: the biome palette plus the boss's original deck prop set (3.4)?
8. Q8. The Well's "Darkness": a stat rule with no darker board (3.3)?
9. Q9. Horror slider in the open world: only ambience props and close-ups (section 17 item 7)?
10. Q10. Level tier glyphs: the encounter-boss-designer's pips or the ux-designer's punctuation
    (6.3)? This file proposes pips with a cracked ring instead of a skull.
11. Q11. Who owns the sound twins of every look here (no `audio-designer` role file yet)?
12. Q12. Are the open art issues #286 and #291 (cyan core, player not in the shell) a hard gate
    before R1 is called playable?
13. Q13. Marble size fixed for every kind, bosses included (5.1)?

---

## Tasks

One Task = one PR from an up-to-date `main`, `Closes #<task>`, opened as a draft after local checks,
strict TDD (test commit first), 100 % coverage of the touched code, `bun run test`, `tsc`, one
`bun run e2e` run, and a **screenshot in the PR description for every visual change** (CONTRIBUTING
§6.4). Phases from §25. No Task starts before #313 is decided and the R0 docs PRs are merged.

### AD-01 Spec: RPG art direction delta (R0)
Outcome: world.md §5 and §8, art.md and ui.md describe the RPG looks, the palette law and the asset
budget per biome, with the Feedback items above answered by an owner.
- [ ] world.md §5: "Hollow surface" rules (3.1), marble looks table rows (hero, Fragment, lineages,
  rival glass, Revenant, colonist, monster crests, rarity bands), battle royale row updated.
- [ ] world.md §8: the art rules of section 17 (tells survive every mode, flash budget).
- [ ] art.md: biome table, decal table, VFX grammar summary, asset rows per biome.
- [ ] ui.md §2 and §7: new DOM tones (rarity, tier) with contrast rows.
- [ ] Part of docs PR 4 of §0; @TidyMaze merges (docs-only).

### AD-02 Palette module and the palette law (R1)
Outcome: every colour of the client comes from `client/src/art/palette.ts` and a test fails on any
colour that breaks world.md §5.
- [ ] Test first: `palette.test.ts` with the A1 to A10 cases of 2.1 and the `ui.css` parity check.
- [ ] `palette.ts` with `BASE`, `luminance`, `contrast`, `oklab`, `lawViolations`.
- [ ] `main.ts` `COLORS` and `MARBLE_COLORS` read from `palette.ts` (no visual change; before and
  after screenshots identical).
- [ ] 100 % coverage of `palette.ts`.

### AD-03 Glyph shape system and the R1 glyphs (R1)
Outcome: one polygon shape feeds both the in-scene mesh and the DOM SVG, and the R1 glyphs exist.
- [ ] Test first: `shapes.test.ts` (integrity against the ux-designer catalog, distinctness, stroke
  width) with `raster.ts`.
- [ ] `shapes.ts` with `toSvgPath`, `toThreeShapes`, family frames.
- [ ] R1 shapes: Edge danger (could, will), Weight pip, intent ring, rout tally slot, Ram band glyph,
  the 2 R1 ability icons.
- [ ] Screenshot of the glyph sheet in the PR.

### AD-04 Hero, Fragment and R1 monster looks (R1)
Outcome: in the R1 fight the hero is smooth banded glass with a cyan core, Fragments are faceted
glass, and the 2 monster types are shells with distinct crests.
- [ ] Depends on #291 (cyan core) being merged.
- [ ] Test first: `looks.test.ts` rows of 5.2, 5.3 (Ram), 6.1 (2 crests), `lookKey` stability.
- [ ] `looks.ts`, material cache per `lookKey`, instanced meshes per look.
- [ ] E2E: `data-hero-look` and `data-crests`; screenshot of the R1 board.

### AD-05 Weight pips, HP and shield arcs (R1)
Outcome: every marble shows its Weight as studs and its HP and shield as flat arcs, readable at 720p.
- [ ] Test first: pip layout (1 to 5, outlined above base, empty sockets below), arc tone sodium under
  25 %.
- [ ] Instanced pips (one draw call).
- [ ] E2E: fixture with Weight 3 and 40 % HP; screenshot at 1280 × 720 and at 200 % UI scale.

### AD-06 Crumble at 0 HP and Remains (R1)
Outcome: a marble at 0 HP cracks and crumbles in 400 ms (a fade with reduced motion) and leaves its
Remains on the cell.
- [ ] Test first: `crumble.test.ts` (7.1 cases).
- [ ] `tracks/crumble.ts`, Remains decal, skip on click or key.
- [ ] E2E: `data-crumbling` with and without `prefers-reduced-motion`, `data-remains`; screenshot.

### AD-07 Cell decals for the R2 kinds (R2)
Outcome: the 6 R2 cell kinds and timed terrain show their glyph decal, tint, relief and ticks.
- [ ] Test first: `decals.test.ts` (rotation, ticks, owner glyph, no red tint, layering cap).
- [ ] `decals.ts`, one instanced mesh per kind.
- [ ] E2E: the 6-kind fixture; screenshot.

### AD-08 Status, keyword and element glyphs, Frozen and Stasis overlays (R2)
Outcome: every R2 status and keyword has a framed glyph, and Frozen and Stasis also change the marble.
- [ ] Test first: status family distinctness, integrity with the status ids, overlay rows of
  `looks.test.ts`.
- [ ] Shapes of 8.4, overlays of 7.3.
- [ ] Screenshot of a Frozen and a Stasis marble.

### AD-09 VFX grammar and flash budget (R2)
Outcome: every ability effect plays the verb of its primitives in its element's tone, under 1.5 s,
never above 3 bright transients per second.
- [ ] Test first: `vfx.test.ts` and `FlashBudget` cases of section 9.
- [ ] `vfx.ts` driven by `Effects`; reduced-motion glyph fades.
- [ ] E2E: Trait de feu `data-vfx`; screenshot sequence in the PR.

### AD-10 Lineage bands for Guardian, Mage and Healer (R2)
Outcome: the 4 R2 heroes differ by band material and engraved glyph.
- [ ] Test first: band rows of 5.3; lineage glyph distinctness.
- [ ] Anchor, Furnace and Lantern bands (Ram exists from AD-04).
- [ ] Screenshot of the 4 heroes side by side.

### AD-11 Composed ability icons (R2)
Outcome: every ability of the R2 classes has a distinct icon generated from its data.
- [ ] Test first: `icons.test.ts` ability rows (coverage of ids, distinctness inside a class).
- [ ] `abilityIcon` composition; bespoke shapes for the 8 R2 ultimates (2 per class, §8)
  and for any icon that fails distinctness.
- [ ] Screenshot of the action bar for each R2 class.

### AD-12 Biome art data and the first 3 biome looks (R4)
Outcome: fights on Lumen Plains, Ash Grove and Soot Bogs tiles each show their own surface, light,
fog and backdrop, loaded lazily under 3 MB per biome.
- [ ] Test first: `biomes.test.ts` (ids match `data/biomes`), palette law rows, `gen-assets.test.ts`
  byte budgets and determinism per biome.
- [ ] `biomes.ts`, generated textures for 3 biomes, lazy load per biome.
- [ ] E2E: `data-biome` per fixture, only that biome's files requested, flat fallback still renders;
  contact sheet of the 3 biome screenshots.

### AD-13 World map look (R4)
Outcome: the world shows biome tiles, exploration darkness, tile content props, Beacons and the
rolling hero ball within the draw-call budget.
- [ ] Test first: `worldlook.test.ts` (10.1 to 10.4 cases).
- [ ] Instanced tiles per height class, content props, Beacon states, world ball roll and ice glide.
- [ ] E2E: walk and reveal, `window.__drawCalls` ≤ 150; screenshot.

### AD-14 Monster crests, rarity bands, affix marks and level tiers (R4)
Outcome: every archetype, rarity, leader, affix and level band of a world pack reads by shape.
- [ ] Test first: crest silhouettes, rarity rows, `tiers.test.ts`, affix family distinctness; no
  monster look has a glass body or a core.
- [ ] 8 crests, bands, leader mark, 12 affix shapes, tier ramp; skins of the 6 families of the R4
  biomes.
- [ ] E2E: an Elite pack on the map and in a fight; screenshot.

### AD-15 Tile-to-board unfold (R4)
Outcome: engaging a pack unfolds the tile into its board in 1.2 s (a 300 ms cross-fade with reduced
motion), skippable at once.
- [ ] Test first: `unfold.test.ts` (13.1 cases).
- [ ] `tracks/unfold.ts`; the client-engineer's scene reads it.
- [ ] E2E: `data-unfold` both modes and skip; mid-point screenshot.

### AD-16 Hub and outpost looks (R4)
Outcome: the minimal hub reuses the world.md deck looks per room and outposts show their props in
their biome's palette.
- [ ] Test first: room-to-look table test; the Mess keeps the classic assets (no request change in
  `textures.spec.ts`).
- [ ] Hold, Launch Bay and Archives placeholders; outpost prop set.
- [ ] Screenshots of each room.

### AD-17 Item, gem, material, consumable and currency icons (R5)
Outcome: the inventory, merchant and loot windows show composed icons with rarity glyph frames and
palette-safe tones.
- [ ] Test first: `icons.test.ts` item rows, rarity and gem tones in the palette law.
- [ ] `iconOf`, gem cuts and facets, material families, currency shapes; `ui.css` rarity tokens.
- [ ] E2E: one item per rarity, `data-rarity`; screenshot.

### AD-18 Colonist NPCs, quest markers and faction emblems (R6)
Outcome: NPCs read as clouded colonists, quest givers carry glyph-and-tone markers, and the 4
factions have emblems.
- [ ] Test first: colonist row, marker and faction family distinctness, no marker tone near cyan.
- [ ] Shapes and the colonist material.
- [ ] E2E: `data-marker` on an NPC; screenshot.

### AD-19 Gathering nodes and station placeholders (R7)
Outcome: each node kind, rich veins and harvested nodes read on the map; stations exist as engraved
placeholders.
- [ ] Test first: node look rows (harvested, rich vein, every node kind).
- [ ] Node props, Fissure glow, station placeholders.
- [ ] E2E: harvest a node, `data-node`; screenshot.

### AD-20 Frame on any region (R8)
Outcome: the engraved frame follows stitched tiles, ragged edges and a Pont beyond the rim, and
carries the action bar on the viewer's side.
- [ ] Test first: `frame.test.ts` (13.2 cases).
- [ ] Boundary loop, outward offset, extruded strip, socket placement.
- [ ] E2E: The Hull 3-tile fixture shows one continuous frame; screenshot.

### AD-21 Boss looks and HP-phase bar (R8)
Outcome: the 8 bosses wear their accents on Heart marbles, phases read on an engraved HP bar, and the
raid centre opens as an iris.
- [ ] Test first: accent uniqueness, heart keyword glyphs, phase notches.
- [ ] Accents, Resilient glyph, HP bar on the frame, iris track with a fade variant.
- [ ] E2E: The Echo fixture `data-boss-accent`; screenshot per converted boss.

### AD-22 The 7 late biomes and the remaining 10 cell kinds (R9)
Outcome: Glass Dunes to The Well have their looks, and every §5.1 kind and biome rule has its visual.
- [ ] Test first: palette law and biome rows for 7 biomes, decal rows for 10 kinds, Tide, Rockfall,
  ragged edge and death-Corruption cases of 3.3.
- [ ] Generated textures under budget, light presets, family skins of the 14 late families.
- [ ] E2E: one fixture per biome with its kinds; contact sheet of the 10 biomes.

### AD-23 The 4 late lineages and Revenants (R9)
Outcome: Assassin, Necromancer, Chronomancer and Geomancer heroes have their bands and signatures,
and Revenants read as stitched, coreless marbles.
- [ ] Test first: band rows, lineage distinctness over 8 glyphs, Revenant rows (7.2).
- [ ] Shard cuts, Ossuary, Hourglass and Stratum bands; Revenant body and decay cracks; signatures.
- [ ] Screenshot of the 8 heroes and of a Revenant.

### AD-24 Party seats, rival glass, battle royale slots, pings and emotes (R10)
Outcome: in a party, an arena or a battle royale every player's marbles carry their seat glyph and
each viewer sees its own camp in cyan and the others as rival glass.
- [ ] Test first: viewer-relative rows (one cyan camp per viewer, 6 BR players), ping and emote
  family distinctness.
- [ ] Seat and slot engravings, rival glass material, ping and emote shapes.
- [ ] E2E: two tabs in an arena, `data-camp-looks` in each tab; screenshots from both tabs.
