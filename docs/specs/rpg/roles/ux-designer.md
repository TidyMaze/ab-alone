# RPG combat and world: UX implementation spec (ux-designer)

Status: PROPOSAL, role spec for the RPG pivot (Decision #313, still open). Source of truth: the
validated gameplay plan (`docs/specs/rpg/plan.fr.md`, French; cited below as "§x.y"). This file does
not change that plan: what it gets wrong or leaves open is listed under
[Feedback on the gameplay spec](#feedback-on-the-gameplay-spec). Nothing here is decided until
an owner closes #313 and the R0 docs PRs merge.

Tags, as in `rules.md`: **FINAL** (decided: by #313's four choices, by an existing spec, or by a
standard such as WCAG), **TUNE** (a starting value, set in playtest), **PROPOSAL** (proposed here, an
owner confirms). Every number in this file carries one.

## Scope

The ux-designer owns how the player **reads** the game and **acts** on it:

- readability of the board: what each marble and cell shows, and the order of priority between
  those layers;
- previews: push, damage, ejection, slide and hover "what if", before any confirm;
- the diegetic UI (world.md §6) and its flat fallback;
- the action bar, the targeting flow and the end of the turn;
- the "Edge danger" alert (§6.6);
- onboarding (tutorial levels 1 to 4, progressive disclosure, glyph legend);
- UI accessibility: keyboard, screen reader, colour independence, contrast, motion, UI scale,
  touch and phone layout.

Out of scope here (see Dependencies in each section): the rules and their numbers (game-designer),
the engine and its dry-run API (combat-engineer, engine-engineer), the AI and its intent choice
(ai-engineer), the world map data (world-engineer), the P2P protocol (network-engineer), the 3D scene
code, the camera and the transition (client-engineer), materials, glyph artwork and palettes
(art-director), sound cues (audio-designer), Tally's lines (narrative-designer), the item, quest and
talent content (content-designer).

Role slugs used for dependencies, assumed from the team roster (rename if the roster differs):
`game-designer`, `combat-engineer` (crate `abalone-rpg`, `apply_action`, previews), `engine-engineer`
(crate `abalone-core`: board mask, terrain, weighted push), `ai-engineer` (monster AI, intents,
player bot), `world-engineer` (crate `abalone-world`), `network-engineer`, `client-engineer`
(three.js scenes, camera, WASM bridge plumbing), `art-director`, `audio-designer`,
`narrative-designer`, `content-designer`, `qa-engineer`.

## Inputs read

- Gameplay plan, whole file, §0 to §26.
- `docs/specs/ui.md` (HUD plate, button column, end banner, evaluation bar, hint, motion, contrast).
- `docs/specs/world.md` §5 (palette, tell marks, ejection), §6 (diegetic HUD rules), §8
  (accessibility).
- `docs/specs/art.md` (palette tokens, bone-white tells, "never" list, asset budget).
- `docs/specs/game-design.md` §1 (pillars), §2 (controls and move input), §3.3 (boss structure), §4.
- `docs/specs/tech.md` §5 (renderer, quality tiers, effects timeline, diegetic text and DOM mirror,
  performance budget).
- `CONTRIBUTING.md` §6.4 (screenshot in UI PRs), §11 (strict TDD, 100 % coverage, e2e), §13.
- Code: `client/src/main.ts` (scene, `refresh`, `refreshGhosts`, pointer input), `board.ts`
  (axial cells, `groupTargets`, `moveForClick`), `ghost.ts` (preview ghosts by replay), `hud.ts`,
  `bosshud.ts`, `settings.ts`, `quality.ts`, `eject.ts` and `slide.ts` (animation contracts),
  `e2e/ghost.spec.ts`, `e2e/phone-layout.spec.ts` (layout invariants, `window.__cellToScreen`),
  `crates/abalone-wasm/src/lib.rs` (bridge API: `legal_moves`, `tell_move`, flat `Int32Array`),
  `crates/abalone-core/src/encounter.rs` (tell one ply ahead).

Facts from the code that shape this spec:

1. Today the client is one flat module set (`client/src/*.ts`), pure logic tested by vitest, with
   three.js glue in `main.ts`. E2E tests read `data-*` attributes on `<body>` (`data-ghosts`,
   `data-flips`) and project cells with `window.__cellToScreen`. This spec keeps both conventions.
2. Previews are built by **replaying** the move on a fresh engine (`ghost.ts`): the engine is the
   only judge. The RPG previews keep that principle through a dry-run API (section P2 below).
3. Keyboard play from game-design.md §2 (`Q W E A S D`, Tab, Enter) is **specified but not
   implemented**: `main.ts` handles only Escape for the settings menu. The action bar keys of §24.5
   need it first (Task UX-02).
4. The board is fixed at radius 4 (`RADIUS`, `CELLS`, 61 cells) in the client. RPG boards go from
   radius 3 to 8 and stitched tiles (§6.8, §4.6): every UX module below takes the cell list from the
   combat view, never from `CELLS`.

## Shared design: the combat view the UI consumes

Every section below reads one versioned JSON view of the combat, produced by the bridge (§24.4). The
ux-designer specifies **what it must contain**; combat-engineer owns its production and its version.

```ts
// client/src/rpg/view.ts (types only, mirrored from the bridge JSON, version 1)
type UnitId = number; type EntityId = number; type Axial = readonly [number, number];
interface CombatView {
  v: 1;
  cells: Axial[];                       // the region (mask), order r then q (§24.1)
  terrain: TerrainView[];               // only special cells
  units: UnitView[];                    // sorted by id (§24.1)
  entities: EntityView[];
  order: EntityId[];                    // the frieze, starting with the active entity (§6.2)
  active: EntityId;
  slots: { move: Slot; action: Slot; quick: Slot; bonusStep: Slot }; // §6.3
  tells: TellView[];                    // every announced threat, incl. terrain countdowns
  graveyard: GraveEntry[];              // §6.6
  counters: { turnsWithoutLoss: number; attritionAt: number; breachAt: number }; // §6.7
}
type Slot = 'open' | 'spent' | 'none';  // 'none': nothing legal for this slot
interface UnitView {
  id: UnitId; entity: EntityId; camp: number; cell: Axial;
  kind: 'hero' | 'fragment' | 'monster' | 'leader' | 'revenant' | 'boss';
  hp: number; hpMax: number; shield: number;
  weight: number; weightBase: number;   // 1..5 (§6.4)
  statuses: { id: string; turns: number; stacks?: number; immuneUntil?: number }[];
  keywords: ('unmovable' | 'unejectable' | 'lassitude')[];
  isolated: boolean;                    // §6.5
  edgeDanger: 'none' | 'could' | 'will'; // section A below
  intent?: IntentView;                  // monsters and bosses (§5.3)
  channel?: { id: string; turnsLeft: number }; // Flee, channelled abilities (§6.7, §6.10)
  armed?: string[];                     // Preparations, in trigger order, at most 2 (§6.3)
}
interface EntityView {
  id: EntityId; camp: number; name: string; glyph: string;
  resource: { id: string; value: number; max: number; extra?: { id: string; value: number; max: number } };
  losses: number; routAt: number;       // §6.7, §6.8
  cooldowns: { ability: string; turns: number }[];
  consumablesLeft: number;              // §15.4
}
```

Previews come from one call, `preview(action_json) -> PreviewView`, a dry run of `apply_action` on a
clone (section P2). Edge danger comes inside the view (`edgeDanger`), so the UI never computes a
rule.

---

## 1. Readability pillar (§1 pillar 2, §1 pillar 6, §2)

> §1 pillar 2: no dice; every threat is told one turn ahead (two for big ejecting ultimates); the
> whole combat state is public; damage and pushes are previewed before confirm.

### 1.1 The information budget of a marble

The plan adds to each marble: HP ring, Weight pips, statuses, intent, Edge danger (§24.5, §6.6),
plus faction, hero mark, Isolation, armed Preparations, channel, element states (§8.5). On a marble
of radius 0.36 (`main.ts`, FINAL today) that is unreadable at 720p. Rule (PROPOSAL): **at most 4
always-on layers per marble**, the rest on hover, focus or in the inspect panel.

| Layer | Where | Always on | Encodes |
|---|---|---|---|
| L0 Look | marble material and silhouette | yes | camp and kind (hero, fragment, monster, revenant, boss) |
| L1 HP arc | flat arc on the cell disc around the marble base | yes | `hp / hpMax`, shield as an outer arc |
| L2 Weight pips | 1 to 5 notches on the front rim of the disc | yes | `weight`; a temporary change is an outlined pip |
| L3 Top slot | one glyph floating above the marble | yes, one only | highest priority of: Edge danger > intent > hard control > channel > armed Preparation > Isolated > other statuses |
| Inspect | DOM panel and tooltip | on hover, focus, long press | full status list with turns, keywords, numbers, resource |

- L3 priority order is PROPOSAL; a marble with more than one L3 candidate shows a small "+N" count
  under the glyph (N is the hidden count).
- Clear-board mode (world.md §8) removes fog and post effects but **never** L0 to L3, nor previews,
  tells or the action bar (FINAL, world.md §8).
- The hero (L0) wears a distinct silhouette, not a colour: a cyan core plus an engraved ring band
  (PROPOSAL, art-director). Fragments are the same glass without the band.

Implementation: `client/src/rpg/layers.ts`, pure: `layersOf(unit: UnitView, ctx): Layer[]` returns
the ordered layer descriptors; `main`-side three.js glue (`client/src/rpg/scene/units.ts`) draws them.
Glyphs come from one catalog, `client/src/rpg/glyphs.ts` (section 1.2).

### 1.2 Glyph catalog (one glyph per meaning, §5.1, §4.4, §12, §16)

`client/src/rpg/glyphs.ts` exports `GLYPHS: Record<GlyphId, { label: string; shape: string;
tone: Tone }>` where `tone` is a palette token (`accent`, `hazard`, `danger`, `bone`, `muted`),
`shape` names a mesh or an inline SVG id, and `label` is the screen-reader and legend text. Integrity
tests (vitest, same idea as the data integrity tests of §24.3):

- every cell type of the terrain data has a glyph (§5.1 requires one);
- every status and keyword of §6.11 has a glyph (the plan does not require it, see Feedback F7);
- every glyph has a non-empty label and a tone from the palette, never a raw colour;
- no two glyphs share a shape within the same family (terrain, status, tier, rarity, quest).

Tones follow ui.md §2 and art.md: `--danger` red only for Edge danger, the Breach, ejection and
"fatal" previews (FINAL, ui.md §2); `--hazard` sodium for terrain hazards and cooldown warnings;
bone-white `#d8d4c8` for tells and intents (FINAL, art.md §1).

### Dependencies

- art-director: hero silhouette, glyph shapes (meshes and SVG), legibility at the sizes below.
- combat-engineer: `UnitView` fields above, `isolated` computed by the engine.
- content-designer: every terrain type and status in `data/` has a glyph id.

### Tests

- Unit, `layers.test.ts`. Given a hero with Edge danger `could`, Stunned 1 turn and Isolated, When
  `layersOf` runs, Then L3 is the Edge danger glyph and the "+N" count is 2.
- Unit. Given a monster with an intent and no status, Then L3 is the intent glyph.
- Unit. Given clear-board on, Then the layer list is the same as with clear-board off.
- Unit, `glyphs.test.ts`: the integrity rules above, run against the shipped data files.
- E2E (R1, Playwright, Chromium): a fight fixture with a hero at 40 % HP and Weight 3, Then
  `body[data-hero-hp]` is `40` and `data-hero-weight` is `3`, and a screenshot of the board is
  attached to the PR (CONTRIBUTING §6.4).

### Risks and tags

- Arc and pips on the disc may be hidden by the marble at a low camera angle; the camera pitch
  stays at the current value or steeper (client-engineer).
- Minimum on-screen glyph size: 14 CSS px at 720p, 100 % UI scale (TUNE); text 0.8125rem minimum
  (FINAL, ui.md §3). Non-text meaning contrast 3:1 against the surface (FINAL, WCAG 1.4.11).
- 4 always-on layers (PROPOSAL).

---

## 2. Previews (§1 pillar 2, §6.4, §6.5, §6.10)

### P1. Push preview and the weighted push line (§6.4)

> §6.4: "L'aperçu affiche le compte : « 2 contre 1 · Poids 4 contre 3 »."

**Implementation**

- Hovering or focusing a direction of the selected group asks `preview({ kind: 'move', cells, dir })`.
  The answer gives the ghosts (as `ghost.ts` does today), and for an inline push
  `push: { n, m, weightFor, weightAgainst, modifiers: string[] }`.
- `client/src/rpg/pushline.ts`, pure: `pushLine(push): string` gives
  `"2 vs 1 · Weight 4 vs 3"` (English source string, French in the i18n table later, §26 Q5).
  Modifiers (Slope, Mud, Percée, Bélier) are listed in the tooltip, not in the line:
  `"Slope +1, Bélier +2"`.
- **Illegal push reason (PROPOSAL, high value):** a direction that would be a push in classic
  Abalone but is illegal under the weighted rule is drawn as a crossed arrow, and its preview says
  why. The engine returns `illegal: 'count' | 'weight' | 'blocked' | 'unmovable' | 'unejectable'`
  with the same counts. Strings: `"2 vs 2: not enough marbles"`, `"Weight 2 vs 3: too light"`,
  `"Blocked behind"`, `"Cannot move: Unmovable"`, `"Cannot eject: Unejectable"`. Without it, a
  player who knows Abalone sees a "legal" 2 vs 1 refused with no reason.
- The direction ring of game-design §2 shows the push power on the arrow (`2v1`), now with a Weight
  sub-label (`W4:3`) under it.

**Dependencies**: engine-engineer (`explain_push(group, dir)` or the reason inside the move
preview), combat-engineer (the `preview` call), narrative-designer and game-designer (wording).

**Tests**

- Unit `pushline.test.ts`. Given `{n:2,m:1,weightFor:4,weightAgainst:3}`, Then
  `"2 vs 1 · Weight 4 vs 3"`.
- Unit, the six examples of §6.4 as table-driven cases of the reason mapper: Warrior (W3) alone vs
  Fragment, Then `"1 vs 1: not enough marbles"`; three Fragments vs Warrior on Mud (W4), Then
  `"Weight 3 vs 4: too light"`; Warrior + Fragment with Percée vs two Fragments, Then legal
  `"2 vs 2 · Weight 4 vs 2"` with modifier `"Percée"`.
- E2E (R1). Given the R1 fixture "warrior-vs-pack" (combat-engineer), When the player selects
  Warrior + Fragment and hovers the push direction, Then `#preview-line` reads
  `"2 vs 1 · Weight 4 vs 3"` and `body[data-ghosts]` is the expected count; hovering the illegal
  direction shows `"Weight 2 vs 3: too light"` and plays nothing.

**Risks and tags**: preview round trip under 50 ms on the reference laptop (TUNE), measured by the
existing perf test approach (tech.md §5.5). Strings are PROPOSAL.

### P2. Damage, Shock and ejection preview (§6.5, §6.6, §6.10)

**Implementation**

- Every confirmable action (Movement, ability target, consumable) is previewed by
  `preview(action) -> PreviewView`:

```ts
interface PreviewView {
  legal: boolean; illegal?: string;
  ghosts: { unit: UnitId; from: Axial; to: Axial; path: Axial[] }[]; // path: ice slides, charges
  push?: PushInfo;
  hits: { unit: UnitId; amount: number; kind: 'physical' | 'magical' | 'pure' | 'shock';
          fatal: boolean; guardCapped: boolean; shieldTaken: number;
          breakdown: { label: string; bp: number }[] }[];  // bp = basis points (§24.1)
  heals: { unit: UnitId; amount: number }[];
  statuses: { unit: UnitId; id: string; turns: number; blockedByImmunity: boolean }[];
  ejected?: UnitId;                     // at most one per action (§6.10)
  ejectChoices?: UnitId[];              // Éjecteur with several candidates: caster picks
  triggers: { unit: UnitId; preparation: string }[]; // opposing Preparations that fire (F9)
  edgeDangerAfter: UnitId[];            // own and enemy heroes in danger after the action
  losses: { entity: EntityId; after: number; routAt: number }[];
  ends?: 'victory' | 'defeat' | 'rout';
}
```

- Display (`client/src/rpg/previewview.ts`, pure: `PreviewView -> Label[]`, then CSS2D labels in
  the scene):
  - a damage label above each hit marble: `-42`; shield absorbed as `-42 (12 shield)`;
  - the HP arc shows the part that would be lost as a hatched segment (not a colour only);
  - `fatal` adds the crumble glyph and `--danger` tone; `guardCapped` adds the Guard glyph and the
    tooltip `"Guard: at most 35 % of max HP from one ability"` (35 % is FINAL in the plan, §6.5);
  - Shock (§6.5): labels on the first file marble (100 %) and the others (50 %) after the ghosts;
  - ejection: the ghost of the ejected marble is drawn one cell past the rim with the danger tone
    (same metaphor as world.md §5 "rolls one cell out over the rim");
  - the breakdown (base, ratio, armor, Isolation +25 %, Formation -10 % per ally up to -30 %, level
    gap ±5 % up to ±25 %, all from §6.5) lives in the tooltip and the screen-reader text, never on
    the board.
- `triggers`: an opposing armed Preparation that would fire is shown on its owner as the
  Preparation glyph with a bone-white outline, and the label "Interposition will trigger" in the
  preview panel (PROPOSAL, see Feedback F9).
- `edgeDangerAfter`: if the action would leave the player's own hero in Edge danger, the hero ghost
  carries the Edge danger glyph and the preview panel says "Your hero would be in Edge danger"
  (PROPOSAL; cheap: one more danger pass on the dry-run state).
- `ends`: "This wins the fight" / "Your hero dies: defeat" in the preview panel; a defeat preview
  makes the confirm a two-step press (first press arms, second within 4 s confirms, like New game in
  ui.md §4; 4 s is FINAL there, PROPOSAL here).

**Dependencies**: combat-engineer (`preview` must run the full `apply_action` path including
Preparations, atomic resolution and victory checks; one call per hover), client-engineer (CSS2D
label layer), art-director (Guard, crumble, hatch).

**Tests**

- Unit `previewview.test.ts`. Given a hit `{amount:42, fatal:false, guardCapped:true}`, Then the
  label is `-42` with the Guard glyph and tone `bone`.
- Unit. Given `fatal:true`, Then tone is `danger` and the crumble glyph is present.
- Unit. Given `ejectChoices` of length 2, Then the confirm is blocked until one is picked (section
  4.3).
- Unit. Given `ends: 'defeat'`, Then the confirm state machine needs two presses.
- E2E (R1). In the fixture, When the player hovers a push that Shocks a Brute, Then `#preview`
  contains `-` followed by the engine's number (read from `window.__lastPreview` exposed in e2e
  mode only) and the board did not change (`#hud` turn text unchanged).

**Risks and tags**: label overlap when 4 to 7 hits stack (Danse des lames, Peste): above 4 labels
(TUNE) the board shows numbers only on hover and the panel lists them all. CSS2D labels over the
canvas touch world.md §6 rule 1 ("no flat overlay for game-critical info"): they are anchored to the
marble and transient, and their DOM copy is the accessible mirror (tech.md §5.3). Owner to confirm
(open question Q4).

### P3. Hover "what if" for enemies (§1 pillar 2, §8 counters)

Many §8 counters say "the resource is visible" (Rage, sand grains). Pillar 2 promises every threat
told one turn ahead, but most abilities hit at once (see Feedback F2). Readability answer
(PROPOSAL):

- Hovering or focusing an **enemy hero** shows its **threat range**: the union of cells its ready
  and affordable abilities can target this coming turn, as a thin bone-white outline on cells, plus
  its resource gauge and cooldowns in the inspect panel.
- `threat_cells(unit) -> Axial[]` comes from the engine (combat-engineer), not from the client.

Tests: unit for the outline model; e2e (R2) hover an enemy hero in a PvP fixture, Then
`body[data-threat-cells]` equals the engine count. Tags: outline width 0.03 world units (TUNE).

---

## A. The "Edge danger" alert (§6.6, §1 pillar 2, §25 R1)

> §6.6: a glyph shows on the hero as soon as a legal enemy push could eject it on the next turn;
> computed with `legal_moves`; public, so the opponent sees it too.

### A.1 Rule as the UI needs it (engine computes it)

Definition (PROPOSAL, to be written into `rpg/combat.md` by game-designer):

`edgeDanger(hero, S)` is computed on the current state `S`, after every atomic effect (§6.3):

- `will`: a **certain** ejection before the hero's entity plays again: a told terrain effect fires
  on the hero's cell (Quicksand second turn, a Vent at 1 pointing off the board, a Pont expiring, a
  Breach or Tide ring on the hero's cell, a Séisme side), with nothing left for the hero to do about
  it except its own next turn (shown when the hero's own turn will come too late).
- `could`: for at least one opposing entity `X` that plays before the hero's entity next turn (from
  `order`), there is an action `a` in `Threat(X, S)` such that `apply(S, a)` ejects the hero.
- `none` otherwise.

`Threat(X, S)` grows by phase:

| Phase | Threat set | Tag |
|---|---|---|
| R1 | Every legal **Movement** of `X` (weighted push, including an ice slide it causes) | PROPOSAL |
| R2 | Plus push modifiers `X` can pay and has off cooldown this turn (Percée, Bélier, Cri de guerre, Croc-en-jambe, Avalanche, Titan) combined with one Movement; plus every ready, affordable **Éjecteur** ability on every legal target | PROPOSAL |
| Never | Sequences of two opposing entities (J2 then M2): too costly and too speculative; the alert says "could", not "will" | PROPOSAL |

Fast precheck (combat-engineer, keeps it cheap): only directions `d` where the hero's cell has, along
`d`, an off-board cell, a Gouffre, or a run of Ice ending off-board within the board radius, are
tested; for those only, Movements whose push line contains the hero are applied on a clone. Budget:
5 ms per hero per state in WASM on the reference laptop (TUNE).

The same flag is computed for **every hero** on the board, own, allied and enemy (it is public,
§6.6). Squad marbles never get it (PROPOSAL: clutter; an option "Edge danger on all marbles" may come
later, open question Q2).

### A.2 Display

- L3 top slot, highest priority (section 1.1): glyph = a chevron pointing **out of the board**
  along the threatening direction, with a "!" notch (PROPOSAL, art-director draws it). `could` is an
  outline glyph, `will` a filled glyph. Tone `--danger` (FINAL, ui.md §2: red is for ejection
  warnings).
- The board rim segment in that direction gets a steady bone-white tick under the hero (no flash,
  no pulse: world.md §8 FINAL).
- When the flag turns on for the **player's own hero**: one low sound tick (audio-designer; the
  visual twin is the glyph, world.md §7), and the HUD live region says
  `"Edge danger: your hero could be pushed off (east)."` (`will`: `"…will be pushed off…"`).
  For the enemy hero: `"Edge danger: the enemy hero could be pushed off (west)."` Strings PROPOSAL.
- Preview integration: P2 `edgeDangerAfter` shows it on the hero ghost before confirm.
- Inspect panel: lists the threatening entity and direction: "Brute pack, push 3 vs 1, Weight 5 vs 3"
  (needs one witness action from the engine: `edgeDangerWitness(hero) -> PreviewView`).

### A.3 Dependencies

- combat-engineer: `edgeDanger` and `edgeDangerWitness` in `abalone-rpg`, in the state hash? No: it
  is derived, never hashed (PROPOSAL); recomputed after each atomic effect.
- engine-engineer: weighted `legal_moves` on the region mask; ice slide resolution.
- game-designer: sign off the `could` / `will` definition and the Threat set by phase.
- audio-designer: the tick cue. art-director: the glyph.
- ai-engineer: the monster AI may read the same flag (it is public), no extra rule.

### A.4 Tests

Engine side (combat-engineer writes them, ux-designer provides the cases), Given/When/Then on a
board position:

1. Given a Guardian hero (W3) on the east rim with two enemy Fragments (W1 each) in line to its
   west, When the view is built, Then `edgeDanger` is `none` (2 vs 1, Weight 2 vs 3).
2. Given the same with three enemy Fragments in line, Then `could` (3 vs 1, Weight 3 vs 3 is not
   strictly greater: `none`). Then with a Warrior (W3) + Fragment: `could` (2 vs 1, Weight 4 vs 3).
3. Given an Assassin hero (W1) one cell from the rim with an Ice run to the rim behind it and an
   enemy single marble adjacent in line, Then `could` (the Movement may slide it off, §5.1).
4. Given a hero on Quicksand for the second turn start pending, Then `will`.
5. Given a hero with Forteresse (Unejectable), Then `none` for every pushing line.
6. Given all Weights 1 and the classic start position, Then `none` for every hero (property:
   the alert never fires on a board with no edge contact).

Client side:

- Unit `edgedanger.test.ts` (`client/src/rpg/edgedanger.ts`, pure): Given a view with the own hero
  `could` east, Then the live text is `"Edge danger: your hero could be pushed off (east)."`, and
  When the next view still has `could`, Then no second announcement (announce on change only).
- E2E (R1, required by §25 R1 "alerte « Danger du bord »"). Given the fixture "edge-danger"
  (combat-engineer seed), When the page loads, Then `body[data-edge-danger]` is `hero:could`,
  the live region contains `"Edge danger"`; When the player moves the hero one cell inward, Then
  `data-edge-danger` is empty. A screenshot with the glyph goes in the PR.

### A.5 Risks

- False sense of safety: `none` does not cover two opposing entities in a row (group play). The
  label says "could", the onboarding says "the alert counts the next enemy only" (section O).
- Cost on radius 8 (battle royale, 5 opponents, §6.8): budget per state may exceed 5 ms (TUNE);
  fallback: compute only for the own hero during the opponents' turns.

---

## 3. Tells, intents and the turn frieze (§1 pillar 2, §5.3, §6.2, §6.7, §18)

### 3.1 Monster intent (§5.3)

> §5.3: monsters always show their intent for their major abilities: the ability and its target.

- Display: L3 glyph = the ability's glyph in bone-white over the monster; a thin bone-white dashed
  line to the target marble or cell, drawn only while the monster or its target is hovered or
  focused, plus a small numbered tag on the target (`1`, `2`…, the monster's frieze index) always on
  (PROPOSAL: lines for 4 to 7 monsters at once are clutter).
- Intent tooltip: ability card (section 4.4) plus "Target: your hero (closest Isolated marble)", the
  targeting rule in words, then the target it resolves to now.
- `IntentView = { ability: string; target: { rule: string; unit?: UnitId; cell?: Axial }; firesIn:
  number }`, `firesIn` in turns of the monster's entity.

Dependencies: ai-engineer (the intent must be committed before the player's turn and kept, with a
written retarget rule; Feedback F5), combat-engineer (view field), narrative-designer (rule wording).

Tests: unit `intent.test.ts` (Given intent `{ability:'slam', target:{rule:'hero', unit:1}}`, Then
the tag `1` is on unit 1 and the tooltip text names the rule); e2e (R1) the fixture pack shows
`body[data-intents]` equal to the number of monsters with a major ability ready.

Tags: dashed line width 0.03 (TUNE); always-on numbered tags (PROPOSAL).

### 3.2 Tells and countdowns (§1 pillar 2, §5.1 Vent, Quicksand, Tide, §6.7 Breach, §8 tells)

- Every tell is a steady bone-white ring or glyph on the cell or marble, plus engraved ticks for
  the count (world.md §5 and §6 rule 4, FINAL; the Hull crack ticks of `main.ts` are the model).
- The count is in **turns of the entity that owns the tell**, and the frieze (3.3) shows a pin
  where it fires, so "one turn ahead" stays exact in group play (Feedback F4).
- Two-turn tells (§6.10 rule 2: Breach, Tide, Séisme, Vent, expiring Pont) show 2 ticks; they are
  the only multi-ejection sources, so their cells also get the rim tick of A.2.

Tests: unit for `ticksOf(tell, view)`; e2e (R2) Vent countdown fixture: `data-tells` and tick count.
Tags: tick count = turns left, max 3 drawn then a number (TUNE).

### 3.3 The turn frieze (§6.2, §6.3, §6.7, §6.8)

- One strip of entity tokens in turn order, starting with the active one, a round separator, and
  pins for tells, Attrition (turn 20, 12 in a skirmish) and Breach (turn 30, 18 in a skirmish)
  (numbers from §6.7, TUNE there).
- Each token: the entity glyph, its losses as tally marks out of `routAt` (world.md §6 rule 3, one
  slot per loss to rout), its resource as a small bar with the number, and its hero's Edge danger
  glyph when on.
- Diegetic: engraved along the far edge of the board frame (world.md §6). Flat: a row in the HUD
  plate (ui.md §4). The flat copy always exists in the DOM as the accessible list.
- Solo R1: 2 tokens. Group R10: up to 8 tokens (4 players and 4 packs, §6.2) on one row, wrapping
  to two rows on a phone held upright (PROPOSAL).
- The 60-turn "no loss" draw (§6.7) shows as a counter in the frieze from turn 40 on (TUNE).

Implementation: `client/src/rpg/frieze.ts`, pure: `friezeOf(view) -> Token[]` and `friezeText(view)`
for the live region ("Your turn. Next: Brute pack. Breach in 4 turns.").

Dependencies: combat-engineer (`order`, counters), network-engineer (group order is the same on all
peers, deterministic), art-director (frame engraving).

Tests: unit (Given order `[J1, M1, J2, M2]` with J1 active, Then tokens in that order and the round
separator after M2); unit (Given a Breach at entity turn 30 and J1 at turn 26, Then the pin is 4 of
J1's turns ahead); e2e (R1) `#frieze` lists 2 tokens and the active one has `aria-current="step"`.

---

## 4. The action bar, the turn and targeting (§6.3, §6.10, §8, §15.4, §24.5)

### 4.1 Bar content and keys (§24.5)

> §24.5: a 4 + 1 action bar engraved on the board frame; a flat version as an accessibility option;
> keys 1 to 4 abilities, R ultimate, F consumable, Space end turn; Q W E A S D stay the directions.

Layout (left to right), PROPOSAL:

```
[ MOVE ] [ 1 ][ 2 ][ 3 ][ 4 ]  [ R ]  [ F ×3 ]  [ special ]  [ Flee ]   [ END TURN ⎵ ]
 slot     abilities            ultimate consumable Pacte etc.  §6.7       Space
          resource gauge across the abilities, combo/extra under it (Assassin, Mage)
```

- Slot lamps above the bar: **Move**, **Action**, **Quick**, **Step** (bonus), each `open`,
  `spent` or `none` (from `view.slots`). Lamps use shape + word, never colour alone: open = ring,
  spent = filled and struck, none = dash.
- Each ability socket shows: glyph, slot type mark (Action ■, Quick ◆, Preparation ⧖), cost, and
  one state: `ready`, `cooldown N` (engraved number), `no resource` (cost in hazard tone),
  `silenced` or `stunned` (status glyph), `locked` (level gate, §8.0), `illegal` (no target).
- Keys (FINAL from §24.5 for 1-4, R, F, Space; PROPOSAL for the rest): `1`..`4`, `R`, `F`,
  `G` special (class: Pacte de sang), `X` Flee, `Space` end turn, `Enter` confirm, `Esc` back one
  step, `Tab` / `Shift+Tab` cycle legal groups (game-design §2), `Q W E A S D` directions
  (game-design §2), `V` inspect the hovered or focused marble, `H` glyph legend, `Z` overview camera
  (multi-tile, §4.6). Remappable later (world.md §8).
- Space conflict: while a DOM button has focus, Space activates it (browser default). Rule
  (PROPOSAL): the end-turn key is handled on `keydown` at the document level only when focus is on
  the canvas or the body; with focus on a bar button, Space presses that button, which is the
  accessible behaviour.

Implementation: `client/src/rpg/actionbar.ts`, pure: `barOf(view, classData, level) -> Socket[]`;
`client/src/rpg/keymap.ts`, pure: `keyToCommand(key, ctx) -> Command | null`. DOM: real `<button>`s
in a `<div id="actionbar" role="toolbar" aria-label="Actions">`, each with `aria-keyshortcuts`,
`aria-disabled` and a text state ("Charge, ready", "Fendoir, cooldown 1 turn").

### 4.2 Ending the turn (§6.3)

- Movement is mandatory when a legal one exists (§6.3). END TURN is disabled while `slots.move`
  is `open`, its label then says "Move first" (PROPOSAL).
- Auto end (PROPOSAL, Feedback F10): the turn ends by itself when Move, Action and Quick are all
  `spent` or `none` and no bonus Step is open; otherwise Space or the button. A 600 ms hold after
  the last action before the turn passes (TUNE) so the result can be read.
- Commit granularity (PROPOSAL, open question Q1): each confirmed action is final (no undo inside
  the turn). Previews are the safety net. It matches the signed lockstep log (§4.7, network).

### 4.3 Targeting state machine (§6.10)

`client/src/rpg/targeting.ts`, a pure reducer:

```
idle --select own marble--> group(1..3) --direction--> previewMove --confirm--> commit
idle --1..4/R/F/G--> armed(ability)
armed --hover target--> previewAbility(target) --confirm--> [pick*] --> commit
pick: ejectChoice (Éjecteur, several candidates) | ccTargets (hard control in a zone, up to 3)
     | perpendicular (Secousse) | sides (Séisme, 2 sides) | entry (Rappel du vide: graveyard)
Esc: back one state; any state --other ability key--> armed(other)
```

- Targeting modes of §6.10 map to hover rules: Self (no hover, confirm at once), Adjacent and Target
  (cells within range highlighted, range measured from the hero unless "Squad", §6.9), In line (the
  3 axes drawn from the hero, stopping at the first marble or obstacle), Zone (radius r ring follows
  the cursor), Group (1 to 3 aligned, same as move selection), Board (confirm at once).
- Range overlay: valid target cells get the cyan target disc already used for move targets (`main.ts`
  `targetMaterial`), out-of-range cells stay plain (PROPOSAL: no red, red is danger only).
- Picks: hard control in a zone touching more than 3 marbles (§6.10, 3 is FINAL proposed there)
  preselects the 3 first by the fixed order (closest, then r, then q, §6.10) and lets the player
  swap; Éjecteur with several candidates (§6.10 rule 1) preselects none and requires a pick.
- The final action JSON carries every pick (`ejectTarget`, `ccTargets`), so peers replay the same
  choice (combat-engineer, network-engineer).

### 4.4 Ability card (§6.10 "fiche", §8.0 "Lire une capacité")

Tooltip and inspect panel: name, type mark and word, cost and resource, cooldown (and current
cooldown), range and targeting, effect with numbers computed for the current hero (from the engine:
`ability_card(id) -> { lines: string[] }`, never computed in the client), keywords (Éjecteur, tell,
Squad), and the **counterplay line** (§6.10 requires one per ability). Rank and variant (§10) on a
second line.

### 4.5 Diegetic and flat versions (§24.5, world.md §6)

- R1 ships the **flat** bar only (DOM, bottom centre, off the board). This is a temporary
  exception to world.md §6 rule 1, to be noted in the R1 Task (open question Q3).
- R2 adds the **diegetic** bar: the same sockets engraved on the near edge of the board frame,
  rendered in the scene from the same `barOf` model; clicks on the engraving route to the same
  commands. Setting "Flat action bar" (in the settings menu, ui.md §4) switches to the flat one; on
  a window narrower than 768 px (TUNE, the `quality.ts` threshold) the flat bar is the default
  because the frame engraving would be under 14 px glyphs.
- Multi-tile boards (§4.6) and radius 8 (§6.8): the engraving sits on a frame arc in front of the
  camera, not on the union's outline (Feedback F6).

### Dependencies (section 4)

combat-engineer (`slots`, `ability_card`, action JSON with picks, `threat_cells`), content-designer
(ability data: type, targeting, keywords, counterplay), client-engineer (frame engraving, picking
on engraved sockets), art-director (socket and slot glyphs), network-engineer (picks in the signed
action), game-designer (auto end, special key list).

### Tests (section 4)

- Unit `actionbar.test.ts`. Given a Warrior level 1 with Charge (CD 2, current 1) and Fendoir (cost
  25, Rage 10), Then sockets are `[cooldown 1, no resource]` with texts
  `"Charge, cooldown 1 turn"` and `"Fendoir, needs 25 Rage"`.
- Unit `keymap.test.ts`. Given focus on a bar button, When Space, Then no end-turn command; Given
  focus on the canvas, Then `endTurn`.
- Unit `targeting.test.ts`. Given `armed(meteor)`, When Esc, Then `idle`; Given an Éjecteur preview
  with 2 `ejectChoices`, When confirm without a pick, Then the state is `pick:ejectChoice` and no
  commit; When the player picks one and confirms, Then the commit carries `ejectTarget`.
- Unit. Given `slots.move` open, Then END TURN is disabled with text `"Move first"`.
- E2E (R1). Keyboard only: Tab to the hero group, `D` to preview east, Enter to play, `1` to arm
  Charge, Enter on the previewed target, Then `#frieze` shows the pack's turn. A second e2e plays
  the same with the mouse. Phone layout: `phone-layout.spec.ts` gets the fight fixture and checks
  that `#actionbar` covers no cell and every socket is at least 44 x 44 CSS px (PROPOSAL; WCAG 2.2
  2.5.8 FINAL minimum is 24 px).

### Risks (section 4)

- The bar outgrows "4 + 1" (Feedback F8): consumable, Flee, class special, Step. Width at 375 px:
  11 sockets of 44 px plus gaps do not fit one row; phone layout uses two rows (PROPOSAL).
- `R` sits next to `E` (a direction): a slip arms the ultimate. Arming never commits (the state
  machine needs a confirm), so a slip costs nothing.

---

## 5. Board and terrain readability (§5.1, §5.2, §4.6, §6.6, §6.7, §6.9)

### 5.1 Terrain decals (§5.1)

- Each special cell draws its §5.1 glyph as a decal on the disc, centred, under the marble's base
  so a marble never hides the whole glyph (the glyph is wider than the marble footprint: 0.8 of the
  disc, TUNE). Slope and Vent glyphs rotate with the direction (§5.1 "la direction tourne").
- Timed terrain (wall of flames, Mur de boucliers, Pont, Ice from Sol verglacé) shows ticks of the
  turns left (same tick model as tells).
- A terrain change previews like a move: the decal ghost at 45 % opacity (the ghost opacity of
  `main.ts`, FINAL today).
- Biome global rules (§5.2: "range −1", "Poison +1 turn", Tide, Darkness) appear as one line each
  in a "Board rules" block of the HUD plate and in the live region at fight start (PROPOSAL).

### 5.2 Ice slide preview (§5.1 Glace)

The preview ghost walks the whole `path` (P2), with small step dots on each Ice cell crossed and
the stop cell outlined; if the slide ejects, the one ejected marble is marked and the next ones
show their stop at the rim (§5.1 "une seule éjection par action"). Reduced motion: no animated walk,
the dots and the stop only.

### 5.3 Death, Remains, Graveyard, Revenants (§6.6)

- 0 HP: the marble cracks then crumbles in 400 ms (FINAL in §6.6); reduced motion: a 400 ms fade
  (same length, no movement, PROPOSAL). It only darkens, never brightens (world.md §5 photosensitivity
  rule, FINAL).
- Remains (Dépouille): a flat cracked-glass decal on the cell, drawn below terrain glyphs' outline so
  both stay readable; it blocks nothing (§6.6), so it is never drawn as a volume.
- Graveyard: a list panel (key `G` toggles it when no class special uses `G`; else in the inspect
  panel), entries `#id camp cause turn` plus "raised" (§6.6 "relevée une seule fois"). Visible in
  every fight that has a Necromancer, else on demand (PROPOSAL).
- Revenant: L0 look = the original look with a bone glyph and decay ticks (−10 % per turn, §8.6).
  It never shows a loss tally when it falls (§6.6: not a Loss).

### 5.4 Isolation and Formation (§6.5)

Isolated marbles get the Isolated glyph in L3 (lowest L3 priority). Formation is not drawn on the
board: its reduction is in the damage breakdown only (PROPOSAL, clutter).

### 5.5 Range from the hero (§6.9)

While an ability is armed, its range is measured from the hero (unless "Squad"); the hero gets a
steady cyan ring under it as the range origin (the selection ring of `main.ts`, reused).

### 5.6 Flee, channels, anti-stalling (§6.7)

- Flee: the hero shows the channel glyph and "Fleeing: leaves at the start of your next turn" in the
  inspect panel and frieze; an interruption logs "Flee interrupted" in the combat log.
- Attrition (heals received −10 % per turn, up to −80 %, §6.7 TUNE) shows as a frieze pin and as a
  line in the heal preview breakdown.
- Breach: rim rings with the Hull crack visual and 2 ticks (§6.7).

### Dependencies (section 5)

art-director (decals, crumble, Remains, Revenant look), client-engineer (decal rendering on any
region mask, instancing within tech.md §5.5 draw-call budget), combat-engineer (`path`, timed
terrain turns, graveyard entries), content-designer (biome rule strings).

### Tests (section 5)

- Unit `terrain.test.ts`: Given a Slope with direction 2, Then the decal rotation is the direction's
  angle; Given a Vent at 1, Then 1 tick.
- Unit: Given an ice path of 3 cells ending off-board with 2 marbles sliding, Then the first is
  marked ejected and the second stops on the last cell (preview model only, engine owns the rule).
- E2E (R2): the 6 R2 cell types fixture (combat-engineer seed) shows `body[data-terrain]` = 6 kinds,
  screenshot in the PR; the R2 ice fixture shows `data-slide-steps`.
- E2E (R1): a hero at 0 HP: `body[data-over]` is `loss` and the end banner reason is the hero-death
  line (section 6).

---

## 6. Fight start, end and retry (§4.5, §6.1, §6.7, §6.12)

### 6.1 Placement (§6.1)

- Formation picker: three buttons Line, Wedge (Coin), Arrow (Flèche) with a ghost of each on the
  board on hover (same ghost layer), then "swap hero with a Fragment": click the hero, then a
  Fragment (two clicks, Esc cancels). Start button "Fight".
- PvP placement timer 20 s (§6.1, TUNE there): a ring of 20 engraved ticks on the frame going dark
  one per second, plus the number in the HUD; no flash; one tick sound at 5 s left (TUNE).

### 6.2 Unfold transition (§4.5)

UX constraints for client-engineer (who builds it): 1.2 s (TUNE, §4.5); input is ignored during
it but any click or key skips it to the end (like the ejection, world.md §5, FINAL); reduced motion:
a 300 ms cross-fade from the tile to the board, no camera move (PROPOSAL, see Feedback F12); an
ambush (§4.4, the pack plays first) waits for the transition's end, then the pack's actions play
one by one with their intents on screen, at least 500 ms per action (TUNE) and each logged.

### 6.3 Combat log

A DOM list of the last 6 events (TUNE), `role="log"`, `aria-live="polite"`: "Brute pushes your
Fragment: 2 vs 1, Weight 3 vs 1. Shock 18.", "Your Fragment is ejected. Losses 1 of 3." Built by
`client/src/rpg/combatlog.ts` from the `Effects` list (§24.2, tech.md §5.2). Every animation has its
log line, so muted or reduced-motion players miss nothing (world.md §7 FINAL: every audio cue has a
visual twin).

### 6.4 End banner and retry (§6.6, §6.7, §6.12)

- `endbanner.ts` (ui.md §4) gets the RPG reasons, Tally tone (narrative-designer writes them):
  hero ejected, hero at 0 HP, rout, all enemies routed, pack leader dead (pack flees), flee done,
  draw (skirmish retreat), draw against a boss = defeat (§6.7, FINAL existing).
- Retry against a dungeon boss: under 5 s (FINAL in §1 pillar 3 and §6.12) means the retry skips
  the unfold transition and the placement keeps the last formation (PROPOSAL).
- Defeat in the world (§6.12): the banner adds "Back to the last Beacon. Gear −10 % durability."

### 6.5 Animation time budget

Every action's whole animation stays under 1.5 s (PROPOSAL, from world.md §5 ejection bound), a
click or key skips to its end, and the next input is never held (FINAL, world.md §5). Long chains
(Danse des lames, Peste, multi-hit) compress: 150 ms per hit after the first (TUNE).

Tests: unit for `combatlog.ts` lines from an `Effects` fixture; unit for new `endbanner` reasons;
e2e (R1) defeat by hero ejection: `body[data-over]="loss"`, banner text from the reasons table,
Retry restarts in under 5 s (Playwright measures from click to `data-phase="placement"`).

Dependencies: client-engineer (transition, skip), narrative-designer (strings), combat-engineer
(`Effects` with enough data for the log), ai-engineer (pacing hooks).

---

## 7. Class resources and hero sheet (§7, §8, §9, §10)

- One gauge per entity in the frieze token and a large one on the action bar for the player:
  value / max, number always shown. Second gauges: Assassin combo 0..5 pips, Mage Overheat (next
  spell +50 %, §8.5) as a hazard mark on sockets, Chronomancer sand 0..6 as 6 pips (FINAL ranges
  from §8), Necromancer Revenants 0..3 (FINAL in §8.6).
- Enemy gauges are as readable as the player's (counters in §8.2 Avalanche and §8.7 Arrêt du temps
  rely on them): the enemy hero's gauge sits in its frieze token and its inspect panel.
- Mage element states (Burned, Frozen, Charged, §8.5) are statuses with glyphs; a reaction preview
  ("Vapour: Stunned 1 turn") appears in the preview panel when an ability would complete a pair.
- Hero sheet, Paths (§9), active tree (§10), inventory, journal, map, merchant, crafting (§24.5)
  windows: the ux-designer owns the **window shell** (section 9), not their content.

Tests: unit `gauges.test.ts` (Given Chronomancer sand 4, Then 4 of 6 pips lit and text
"Sand 4 of 6"); e2e (R2) the 4 R2 classes each show their gauge name in `#actionbar`.

Dependencies: content-designer (resource ids, ranges), combat-engineer (values in the view).

---

## 8. World readability (§4.2, §4.3, §4.4, §4.6, §22, §23)

- **Path preview (§4.2):** on hover or tap of a tile, the A* path as dots on tiles, the step count
  and the time ("12 tiles · 4.1 s"), from the world engine; a second tap walks. Keyboard: `Q W E A S
  D` step one tile (PROPOSAL; Feedback F13: keyboard world movement is not in the plan).
- **Exploration fog (§4.2):** unseen tiles dark but outlined (a tile edge 3:1 against the dark,
  FINAL world.md §5 contrast rule) so the grid stays readable; the reveal radius is 3 (§4.2).
- **Map (key M, §4.2):** zones with "% discovered" as text, Beacons with their glyph, quest markers
  (section 10).
- **Monster level tiers (§4.4):** colour **and** glyph (§4.4 requires both). Proposed glyph ramp
  (PROPOSAL): grey `–` (6 or more levels below, no XP, §4.4), green `·`, yellow `:`, orange `⁝`,
  red `!` (5 or more above, §4.4), plus the level number always shown on hover. Middle thresholds are
  missing (Feedback F3). Colours from a palette-safe ramp (art-director), red reused as danger, which
  matches its meaning.
- **Aggro (§4.4):** a faint ring of radius 1 tile (2 for an elite, FINAL in §4.4) around a pack when
  the player's ball is within 3 tiles (TUNE); the pack's patrol of 3 tiles (§4.4) is not drawn.
- **Multi-tile fights (§4.6):** overview camera first, then a zoom on the region of the selected
  group; key `Z` toggles overview (PROPOSAL); seams are never drawn stronger than a cell edge (the
  plan says seams have no special rule, so the UI must not suggest one, PROPOSAL).
- **Out-of-combat HP (§4.2):** the HP arc stays on the world ball; regen 5 % per second (§4.2) shows as
  the arc filling, no number animation.

Dependencies: world-engineer (path, cost time, discovered %, tiers), client-engineer (world scene,
camera), art-director (tier ramp, fog look).

Tests: unit `tiers.test.ts` (Given player level 20 and monster 14, Then grey and `–`; Given 25,
Then red and `!`); e2e (R4) walk to a tile with the keyboard and with a click, `data-path-steps`
matches; the map shows a zone percentage text.

---

## 9. Windows and onboarding shell (§9, §10, §11, §16, §24.5)

### 9.1 Window shell (world.md §6 rule 6: menus are a terminal in the scene)

`client/src/rpg/window.ts`: one shell for every window (hero sheet, inventory, Paths, active tree,
journal, map, merchant, crafting, legend): a terminal-styled DOM dialog (`role="dialog"`,
`aria-modal="true"`, labelled title), focus moves in on open and back to the opener on close, Esc
closes, one window at a time (PROPOSAL), keys `C` sheet, `I` inventory, `P` Paths, `K` active tree,
`J` journal, `M` map (FINAL in §4.2), `H` legend (PROPOSAL except M). Never opens during a fight
except the legend and the inspect panel (PROPOSAL: §10 "hors combat, on équipe librement").

### 9.2 Onboarding (§11 tutorial, levels 1 to 4)

> §11: fights with no ability, pure Abalone with HP and Weight; quests teach, in order: select, push,
> sumito, eject, Formation, Isolation; level 5 gives the first ability.

Implementation: `client/src/rpg/tutorial.ts`, a pure step machine `step(state, event) -> state`, the
steps as data (`data/tutorial.ron`, content-designer), each step = `{ id, goal: EventMatcher, hint:
stringId, highlight: Axial[] | 'actionbar' | 'frieze', unlocks: UiFlag[] }`. Hints are one Tally line
on the HUD plate plus a steady cyan outline on the highlighted cells (no arrow sprite flying around).

Proposed order (PROPOSAL; the plan's list plus what it misses, Feedback F11):

| Step | Teaches | Goal event | UI unlocked |
|---|---|---|---|
| 1 | select a group | a group of 2 selected | selection ring |
| 2 | move | any Movement | slot lamps (Move only) |
| 3 | push (sumito) | a legal push 2 vs 1 | push preview line |
| 4 | Weight | hover an illegal "too light" push | Weight pips, reason line |
| 5 | eject | an ejection | losses tally |
| 6 | HP and Shock | Shock a monster | HP arcs, damage preview |
| 7 | hero death and Edge danger | move the hero out of Edge danger | Edge danger alert |
| 8 | Formation | end a turn with the hero next to 2 allies | breakdown tooltip |
| 9 | Isolation | hit an Isolated monster | Isolated glyph |
| 10 (level 5) | first ability | use it | action bar, sockets 1 and Action/Quick lamps |

Progressive disclosure: `uiFlags(level, tutorialState) -> Set<UiFlag>`; a flag never turns off once
on. Information that is **rule-critical is never hidden**: HP arcs, Weight pips and Edge danger show
from the first fight that has them (steps 4, 6, 7 just explain them).

Skip: a "Skip tutorial" choice at character creation (open question Q5, game-designer decides
the reward side).

### 9.3 Glyph legend (`H`)

Lists every glyph met so far (stored in the hero save as a set of glyph ids, a few bytes) with its
label and one line of rule, from `glyphs.ts`. Also reachable from the inspect panel ("What is this?").

Dependencies: content-designer (tutorial data), narrative-designer (Tally hints), world-engineer
(tutorial quests, island of Lumen), game-designer (step order, skip).

Tests: unit `tutorial.test.ts` (Given step 3, When a push 2 vs 1 event, Then step 4 and flag
`pushLine` on); unit (Given level 5, Then flag `actionBar` on); e2e (R3) the scripted tutorial run:
Playwright plays the 10 steps on the tutorial fixture and checks each hint text in `#hud`.

---

## 10. Items, quests, social (§12, §13.4, §16, §19, §21)

- **Rarity (§12, "une couleur et un glyphe"):** glyph first: Common none, Magic `◇`, Rare `◆`,
  Legendary `✦`, Unique `◉`, Set `⛓` (PROPOSAL), tints from the palette (art-director; Feedback F3:
  WoW-like saturated colours break world.md §5).
- **Item tooltip:** stats with the delta against the equipped item as `+12` / `−3` words and arrows,
  never green and red alone.
- **"Self-declared, unverified" (§13.4, §19, §21):** a muted line with a glyph on every inspect of
  another player and on unranked ratings; string PROPOSAL "Self-declared, not verified".
- **Quests (§16):** `!` available, `?` ready to turn in, each on a plate shape (filled vs outlined)
  plus colour (§16 requires glyph plus colour); tracker in the HUD column, 3 tracked quests shown
  (TUNE), journal of 25 (§16) in the window shell.
- **Pings and emotes (§1 pillar 5, §21):** 4 emotes (§21) and pings with 4 kinds (PROPOSAL: "go
  here", "attack this", "danger", "help"), each a glyph on a cell or marble for 3 s (TUNE) plus a log
  line naming the sender's glyph; rate limit 3 pings per 5 s per player (TUNE, network-engineer
  enforces it on receive too).
- **PvP turn timer (§19, 60 s reminder):** the frieze token of the active player shows a ring of
  ticks; text "20 s left" in the live region at 20 s (TUNE); no flashing.

Dependencies: content-designer, network-engineer (pings over P2P), art-director, world-engineer
(quest states).

Tests: unit `rarity.test.ts` (every rarity has a distinct glyph and label); unit `pings.test.ts`
(rate limit); e2e (R10) two tabs: a ping from tab A shows its glyph in tab B and a log line.

---

## 11. Accessibility contract (world.md §8, ui.md §6 and §7, game-design §2)

Applies to every section above, checked in every UX Task:

1. **Keyboard:** the whole fight is playable without a mouse (game-design §2, FINAL). E2E proves it
   per phase.
2. **Screen reader:** a hidden DOM mirror (tech.md §5.3, FINAL recommendation) built by
   `client/src/rpg/mirror.ts`: active entity, own hero HP and Weight, Edge danger, selected group,
   current preview in words, last log event. `aria-live="polite"`, announcements on change only.
3. **Never colour alone** (world.md §8, FINAL): every meaning has a shape, glyph or word; the glyph
   integrity test enforces a label for each glyph.
4. **Contrast** (ui.md §7, FINAL WCAG 2.1 AA): text 4.5:1, meaningful non-text 3:1; new tokens get a
   row in ui.md §7.
5. **Motion** (ui.md §6, FINAL): `prefers-reduced-motion` sets durations to 0 or to a plain fade; no
   looping animation on any alert, intent or tell; no flash above 3 per second (FINAL, WCAG 2.3.1).
6. **UI scale 100 % to 200 %** (world.md §8, FINAL): in-scene glyphs and labels scale with the same
   setting; layout checked at 720p and 200 % (world.md §6 rule 9, FINAL).
7. **Touch and phone** (§26 Q6, ui.md §4): no control covers a cell; sockets 44 x 44 CSS px
   (PROPOSAL); long press = inspect (500 ms, TUNE); `phone-layout.spec.ts` gains the fight states.
8. **Colourblind palettes and high contrast** (world.md §8, #32): every new token is defined in each
   palette (art-director).
9. **Clear-board mode** never removes gameplay information (world.md §8, FINAL).
10. **i18n:** every player string is an id in `client/src/rpg/strings.ts`, English first (repo
    convention), French later (§26 Q5).

---

## Feedback on the gameplay spec

Contradictions and gaps found while writing this spec. The plan is not modified; each item needs an
answer from game-designer or an owner, in #313 or a follow-up Decision.

- **F1. Edge danger scope (§6.6 vs §6.10, §5.1).** "Computed with `legal_moves`" covers Movements
  only, but a hero can be ejected by an ice slide, an Éjecteur ability with no tell (Séisme du Lest,
  Avalanche, Météore after its tell), push modifiers (Percée, Bélier, Cri de guerre), and
  terrain (Quicksand, Vent, Pont, Breach, Tide). "Next turn" is also undefined in group play, where
  several opposing entities play before the hero's entity. Proposed: section A.1 (`could` /
  `will`, Threat set by phase, only the next opposing entities, each alone).
- **F2. Pillar 2 vs instant abilities.** §1 says "every threat is announced one turn ahead", but
  most §8 abilities (Fendoir, Trait de feu, Assassinat, Chaîne d'ancre) hit at once, and §6.10 rule 3
  lets an Éjecteur ultimate skip the tell. In PvE the monster intent covers it; in PvP only visible
  resources and cooldowns do. Proposed: reword the pillar ("every threat is visible: tells for
  terrain and bosses, intents for monsters, ready abilities and resources for heroes") and add the
  threat-range hover (P3).
- **F3. Colours outside the palette.** §4.4 (grey, green, yellow, orange, red monster tiers) and §12
  (rarity colours) clash with world.md §5 "nothing saturated outside these" and ui.md §2 "red only
  for danger". §4.4 also gives thresholds for grey and red only: green, yellow and orange bounds are
  missing.
- **F4. "One turn ahead" in group play (§1, §6.2, §8 tells).** Tells are counted in whose turns?
  Météore fires "at the start of your next turn", which can be 7 entity turns later in a quartet.
  Proposed: count in turns of the tell's owner and pin it on the frieze (section 3.2).
- **F5. Intent stability (§5.3).** The plan shows the intent but does not say when it is chosen
  (end of the monster's turn or the start of the next) nor what happens when its target dies or
  leaves range before it fires. Without a rule, the shown intent can lie. Needs a retarget rule.
- **F6. Engraved action bar on any board (§24.5 vs §4.6, §6.8).** "Engraved on the board frame"
  has no clear place on a stitched multi-tile union, on radius 8, or on a phone held upright.
  Proposed: a frame arc in front of the camera, flat by default under 768 px wide (section 4.5).
- **F7. No glyph rule for statuses and keywords (§6.11).** §5.1 requires a glyph per cell type, but
  statuses, keywords (Unmovable, Unejectable, Lassitude), element states (§8.5) and the hero itself
  have none. The hero's look is not specified at all.
- **F8. The bar is more than "4 + 1" (§24.5 vs §6.3, §6.7, §8.6, §15.4, §9.2).** A turn can use a
  consumable (F), Flee (replaces the Movement), Pacte de sang (a Quick action outside the 4 slots),
  a bonus Step, Grimoire descellé (swap), Avalanche's 4-marble group, plus End turn. None has a key
  except F and Space.
- **F9. Previews and opposing Preparations (§1 pillar 2 vs §6.3).** Preparations fire on their own
  during the opponent's turn. The plan does not say whether the preview includes them. If not, the
  preview lies; proposed: yes, the dry run includes them (P2 `triggers`).
- **F10. Ending a turn (§6.3).** Movement is mandatory when legal and the order is free, but the
  plan does not say whether the turn ends by itself, whether an action can be undone before the end
  of the turn, nor how a bonus Step is told apart from a one-marble Movement (both are one marble,
  one cell, no push). Proposed: auto end when all slots are spent, no undo, the Movement slot is
  consumed first and the bonus Step only after it or through its own lamp.
- **F11. Tutorial misses core rules (§11).** Levels 1 to 4 teach select, push, sumito, eject,
  Formation, Isolation, but not HP and Shock, the Weight rule, nor hero death by ejection and the
  Edge danger alert, which are the riskiest new rules (§6.4, §6.6). Proposed order: section 9.2.
- **F12. Reduced-motion unfold (§4.5).** "On n'anime qu'un seul plan" is ambiguous. Proposed: a
  300 ms cross-fade, no camera move.
- **F13. Keyboard world movement and keyboard play (§4.2, §24.5).** The world moves by click or tap
  only; game-design §2 requires the whole game playable without a mouse. Also, the keyboard move input
  of game-design §2 is not implemented in the client today (`main.ts`).
- **F14. Space key (§24.5).** Space as End turn clashes with the browser's default (Space presses
  the focused button). Proposed: canvas-focus only (section 4.1).
- **F15. Ambush readability (§4.4, §4.5, §6.1).** In an ambush the pack plays first: the plan does
  not say whether the player still places a formation first, nor how the pack's first actions are
  paced after the 1.2 s unfold.
- **F16. Placement for small boards (§6.1 vs §6.8).** The three formations are "subsets of the
  standard placement", which exists only for radius 4 with 14 marbles; skirmish (radius 3, 6
  marbles), radius 5 and radius 8 have none. Placement UI cannot be built without them.
- **F17. PvP placement visibility (§6.1).** 20 s of placement: simultaneous and hidden (commit-reveal)
  or public and sequential? It changes what the opponent sees.
- **F18. Evaluation bar and Hint in RPG fights (ui.md §4.1, §4.2).** Not covered: proposed hidden in
  every RPG fight until the engine search handles abilities (fair play like #164).
- **F19. Allied versus enemy players' marbles (§6.2, §19, §20).** In group PvE and in arenas several
  players own glass marbles; the plan does not say how a player tells their own, an ally's and an
  enemy player's marbles apart (world.md §5 only covers battle royale glyphs).
- **F20. Animation length per action (§6.3 atomic resolution, §6.6).** Multi-hit and chain effects
  have no time budget; with 400 ms crumbles and 800 ms ejections a turn can take seconds. Proposed:
  1.5 s per action, compressed hits, always skippable (section 6.5).

## Open questions

1. Q1. Does each confirmed action commit at once (no undo inside a turn), as proposed for the
   signed lockstep log?
2. Q2. Edge danger: Movements only in R1 and abilities in R2, "could" semantics, heroes only (no
   squad marbles)?
3. Q3. May R1 ship the flat action bar only, an explicit exception to world.md §6 rule 1, with the
   engraved bar in R2?
4. Q4. Are damage labels anchored to marbles (CSS2D DOM) acceptable under world.md §6 rule 1, or
   must they be in-scene MSDF text from the start?
5. Q5. Can a player skip the tutorial (experienced Abalone players), and what do they get?
6. Q6. Window keys C, I, P, K, J, H, G, X, V, Z: accepted, and remappable from day one or later?
7. Q7. Strings: English only at launch, or French and English with i18n (§26 Q5)?
8. Q8. Which palette extension does art-director allow for monster tiers, rarities and biome
   palettes within world.md §5?
9. Q9. Does the turn end by itself once all slots are spent?
10. Q10. Hint and evaluation bar: hidden in every RPG fight?
11. Q11. What does the hero look like, apart from its Fragments: a ring band and core (proposed)?

## Tasks

One Task = one PR, from `main`, strict TDD (test commit first), 100 % coverage, a screenshot in
every UI PR (CONTRIBUTING §6.4). Phases from §25.

### UX-01 Spec: RPG readability delta for ui.md and world.md §6 (R0)
Outcome: ui.md and world.md describe the RPG combat HUD, the layer budget, the Edge danger alert
and the action bar, with the Feedback items answered.
- [ ] ui.md: new section "RPG combat HUD" (layers, previews, frieze, bar, log), contrast rows for
      new tokens
- [ ] world.md §6: which info is diegetic, which is flat, the R1 flat-bar exception
- [ ] Edge danger definition agreed with game-designer, copied into `rpg/combat.md`
- [ ] Feedback F1 to F20 each answered or linked to an issue
- [ ] Docs-only PR, read by @TidyMaze

### UX-02 Keyboard move input on the classic board (R1)
Outcome: game-design §2 keyboard play works: Tab cycles legal groups, Q W E A S D preview a
direction, Enter plays, Esc backs out.
- [ ] `client/src/keymap.ts` pure, unit tests first
- [ ] works in hot-seat, bot, boss and online games
- [ ] e2e: a full local game opening played with the keyboard only
- [ ] screen reader text for the selected group and the previewed move

### UX-03 Glyph catalog and RPG strings table (R1)
Outcome: one `glyphs.ts` catalog and one `strings.ts` table that every RPG UI module uses, with
integrity tests.
- [ ] R1 glyphs: hero, fragment, monster, Weight pip, Edge danger could/will, Isolated, loss tally,
      intent, Guard, crumble
- [ ] integrity test: label and palette tone for every glyph, unique shapes per family
- [ ] integrity test against the R1 data files once they exist (cells, statuses)

### UX-04 Marble layers: HP arc, Weight pips, hero mark (R1)
Outcome: every marble of an RPG fight shows its camp, its HP and its Weight, the hero stands out by
shape.
- [ ] `rpg/layers.ts` pure with the L0 to L3 priority, unit tests
- [ ] three.js glue on any region mask (no `CELLS`)
- [ ] `data-hero-hp`, `data-hero-weight` for e2e; e2e on the R1 fixture
- [ ] screenshot desktop and phone in the PR

### UX-05 Push preview line and illegal push reason (R1)
Outcome: hovering a push shows "2 vs 1 · Weight 4 vs 3", and an illegal weighted push says why.
- [ ] `rpg/pushline.ts` with the six §6.4 examples as tests
- [ ] direction ring Weight sub-label, crossed arrow for illegal pushes
- [ ] e2e legal and illegal hover, nothing played

### UX-06 Damage, Shock and ejection preview (R1)
Outcome: before any confirm, the player sees the exact damage, Shock, kills, the one ejection and a
breakdown, from the engine's dry run.
- [ ] `rpg/previewview.ts` pure, unit tests for fatal, Guard cap, shield, ejection ghost
- [ ] hatched HP loss on the arc, labels anchored to marbles
- [ ] defeat preview needs a second press
- [ ] e2e: hover a Shock, numbers match `__lastPreview`, board unchanged

### UX-07 Edge danger alert (R1)
Outcome: the hero carries the Edge danger glyph whenever the next opposing entity could eject it,
for both camps, with a live-region line and a sound twin.
- [ ] engine cases A.4 1 to 6 handed to combat-engineer (linked issue)
- [ ] `rpg/edgedanger.ts` pure: glyph, direction, announce on change only
- [ ] preview: "Your hero would be in Edge danger" on the hero ghost
- [ ] e2e "edge-danger" fixture on and off; screenshot

### UX-08 Flat action bar, slot lamps and end of turn (R1)
Outcome: the Warrior's 2 abilities, Rage gauge, cooldowns, Move/Action/Quick lamps and End turn
work by mouse, keys 1-4, R, F, Space, and touch.
- [ ] `rpg/actionbar.ts`, `rpg/keymap.ts` additions, unit tests (states, Space focus rule)
- [ ] End turn disabled with "Move first" while a Movement is open
- [ ] `role="toolbar"`, `aria-keyshortcuts`, text states
- [ ] phone-layout e2e: bar covers no cell, sockets 44 px

### UX-09 Targeting state machine and ability card (R1)
Outcome: arming, previewing, picking and confirming an ability is one tested reducer, and every
ability has a readable card with its counterplay.
- [ ] `rpg/targeting.ts` with Self, Adjacent, Target, In line, Zone, Group, Board
- [ ] range overlay from the hero (Squad exception)
- [ ] ability card from `ability_card(id)` incl. counterplay line
- [ ] e2e keyboard-only and mouse-only ability use

### UX-10 Monster intent and combat log (R1)
Outcome: each monster shows its next major ability and target, and every event of the fight is
written in a polite live log.
- [ ] `rpg/intent.ts` (glyph, numbered target tag, hover line), unit tests
- [ ] `rpg/combatlog.ts` from `Effects`, last 6 lines, `role="log"`
- [ ] pack actions paced, each with its log line
- [ ] e2e `data-intents` and log lines after the pack's turn

### UX-11 Turn frieze, rout tallies, death and end banner (R1)
Outcome: the player sees whose turn is next, each entity's losses against its rout threshold, the
400 ms crumble with Remains, and an end banner that names a hero death.
- [ ] `rpg/frieze.ts` pure, `aria-current="step"`
- [ ] crumble and Remains decal, reduced-motion fade
- [ ] `endbanner.ts` RPG reasons (strings from narrative-designer)
- [ ] e2e defeat by hero ejection and Retry under 5 s

### UX-12 Combat screen-reader mirror (R1)
Outcome: a screen reader user hears the active entity, own hero HP, Weight and Edge danger, the
current preview and the last event.
- [ ] `rpg/mirror.ts` pure, announce-on-change tests
- [ ] e2e reads the mirror text through a full R1 fight played by keyboard

### UX-13 Status, keyword and element glyphs with diminishing returns (R2)
Outcome: every §6.11 status and keyword and every §8.5 element state is readable on the marble
(L3) and in the inspect panel, including immunity windows.
- [ ] glyphs and labels for all statuses, catalog test extended
- [ ] inspect panel with turns, stacks, immunity
- [ ] reaction preview line (Vapour, Shatter, Explosion)

### UX-14 Terrain decals, countdowns and ice slide preview (R2)
Outcome: the 6 R2 cell types show their glyph, timed cells show their turns, and an ice slide is
previewed cell by cell with its one ejection.
- [ ] `rpg/terrain.ts` (rotation, ticks), unit tests
- [ ] slide path preview, reduced-motion variant
- [ ] Board rules block for biome rules
- [ ] e2e terrain fixture, screenshot

### UX-15 Multi-pick targeting and Preparations display (R2)
Outcome: Éjecteur choices, hard-control picks up to 3, side picks and armed Preparations are clear
and carried in the action.
- [ ] pick states in `targeting.ts`, preselection by the fixed order
- [ ] armed Preparations in trigger order on the hero and in the frieze
- [ ] preview `triggers` shown
- [ ] e2e an Éjecteur with two candidates

### UX-16 Class gauges and enemy threat range (R2)
Outcome: the 4 R2 classes show their resource and extras, and hovering an enemy hero outlines what
it can reach next turn.
- [ ] `rpg/gauges.ts` for Rampart, Rage, Faith, Mana + Overheat
- [ ] enemy gauges in frieze tokens
- [ ] threat outline from `threat_cells`
- [ ] e2e each class gauge name

### UX-17 Engraved action bar and flat fallback setting (R2)
Outcome: the action bar is engraved on the frame in front of the camera, the flat bar stays as a
setting and as the default under 768 px wide.
- [ ] scene engraving from the same `barOf` model, picking routed to the same commands
- [ ] "Flat action bar" toggle in the settings menu (ui.md §4)
- [ ] readable at 720p and 200 % UI scale; screenshots both versions

### UX-18 Tutorial step machine and progressive disclosure (R3)
Outcome: levels 1 to 4 teach the 10 steps of section 9.2, and UI parts appear as they are taught
without hiding rule-critical info.
- [ ] `rpg/tutorial.ts` pure, steps as data
- [ ] `uiFlags` never turns a flag off
- [ ] e2e scripted tutorial run, hint text per step

### UX-19 Window shell and glyph legend (R3)
Outcome: every out-of-combat window shares one accessible terminal-styled shell, and `H` opens a
legend of the glyphs met so far.
- [ ] `rpg/window.ts` (focus in and back, Esc, one at a time)
- [ ] legend from `glyphs.ts` and the saved seen-set
- [ ] e2e open and close by keyboard, focus returns to the opener

### UX-20 World readability: path, aggro, tiers, fog, map, unfold (R4)
Outcome: walking the world shows the path and its time, pack aggro and level tier by glyph, the
fog keeps the grid readable, the map gives % discovered, and the unfold respects skip and reduced
motion.
- [ ] `rpg/tiers.ts` pure with thresholds from game-designer
- [ ] path preview and keyboard steps
- [ ] unfold skip on input, 300 ms reduced-motion cross-fade (with client-engineer)
- [ ] e2e walk, engage, map text

### UX-21 Rarity glyphs, item compare, unverified label (R5)
Outcome: rarity reads by glyph, item compares read by words, and another player's gear is marked
self-declared.
- [ ] rarity glyphs and labels, test
- [ ] compare deltas with words and arrows
- [ ] "Self-declared, not verified" line on inspect

### UX-22 Quest tracker and map markers (R6)
Outcome: `!` and `?` markers carry a shape plus colour, the HUD tracks 3 quests, the journal holds
25.
- [ ] markers on tiles and the map
- [ ] tracker in the HUD column, phone-layout e2e
- [ ] journal in the window shell

### UX-23 Multi-tile camera and boss phase notches (R8)
Outcome: on stitched boards the overview and region zoom keep every cell reachable, seams look like
plain cell edges, and boss phases by HP % show as notches.
- [ ] `Z` overview toggle, zoom to the selected group region
- [ ] seam rendering rule, screenshot
- [ ] boss notches at HP thresholds (`bosshud.ts` extended)
- [ ] e2e The Hull 3-tile fixture: every cell clickable

### UX-24 Group frieze, ally glyphs, pings and emotes, PvP timers (R10)
Outcome: in a party of up to 4 or an arena, each player's marbles carry their glyph, the frieze
shows up to 8 entities, pings and emotes reach the party, and placement and turn timers read
without flashing.
- [ ] frieze with 8 tokens, two rows on phones
- [ ] ally and enemy player glyphs (with art-director)
- [ ] pings with rate limit, emotes, log lines
- [ ] 20 s placement and 60 s turn timers
- [ ] e2e with 2 tabs: ping seen in the other tab
