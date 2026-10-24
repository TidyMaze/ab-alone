# RPG accessibility: glyphs and colours, photosensitivity, clear board, reduced motion, flat fallback (accessibility)

Status: draft v0, PROPOSAL. Role spec for the RPG pivot (Decision #313, still open). Source of truth:
the validated French gameplay plan (`docs/specs/rpg/plan.fr.md`, the copy of
`je-veux-qu-on-am-liore-whimsical-sloth.md`), cited below as "§x.y". This file does not change that
plan: what it gets wrong or leaves open for accessibility is listed in
[Feedback on the gameplay spec](#feedback-on-the-gameplay-spec). Nothing here is decided until an
owner closes #313 and the R0 docs PRs merge. No code yet: strict TDD and 100 % coverage apply from R1
(CONTRIBUTING section 11).

**Tags**, as in `rules.md`: **FINAL** (decided by #313's validated choices, by an existing spec such as
world.md §8 or ui.md §7, or by a standard such as WCAG 2.1), **TUNE** (a starting value, set in playtest
or by a measurement), **PROPOSAL** (proposed here, an owner confirms). Every number carries one. A
number quoted from the plan keeps the plan's tag ("everything is PROPOSAL and every number is TUNE
unless stated", plan "Ce qu'on vise"). A number derived by arithmetic from another carries its source's
tag plus the word "derived".

Validated decisions this file treats as FINAL: science-fantasy setting; Diablo-like P2P with a party of
4 at most; hero plus squad; an ejected hero dies and the fight is lost; deterministic combat; weighted
push (`n > m` AND strictly greater total Weight); at most 1 ejection per action. For accessibility,
"deterministic combat" adds one FINAL constraint: **no accessibility setting ever changes a rule, a
number, a timing of the engine, or the state hash.** Settings are local presentation only, like the
horror slider (world.md §11, FINAL).

---

## Scope

The accessibility role owns five things, across every RPG scene (fight, world map, hub, windows) and
across the classic tables kept in the hub (§1 pillar 1, §21):

1. **Glyphs and colours.** The rule "never colour alone" (world.md §8, FINAL) applied to every RPG
   meaning; the colour tokens of the RPG and their contrast; the colourblind palettes (protan, deutan,
   tritan) and the high-contrast palette (world.md §8, FINAL); the integrity tests that enforce
   redundancy (colour AND glyph AND label). The glyph *catalog* (ids, meanings, labels) is
   `ux-designer`'s; the glyph *atlas* and its drawing are `graphics-technical-artist`'s; the glyph
   *silhouettes as art* are `art-audio`'s. This role owns the redundancy and legibility contract they
   must pass.
2. **Photosensitivity.** The safe mode (world.md §8, FINAL rules), the inventory of RPG flash sources,
   and the test oracle that proves no scene breaks WCAG 2.3.1. The runtime flash guard in the VFX
   timeline is `graphics-technical-artist`'s (its section 6.5); this role writes the rules it must meet
   and the analyser that checks it.
3. **Clear-board mode.** What it removes and what it must keep in every RPG scene (world.md §8, tech.md
   §5.1, FINAL rule: it never removes gameplay information).
4. **Reduced motion.** The reduced variant of every RPG animation, the motion setting and its link to
   `prefers-reduced-motion` (world.md §8, ui.md §6, tech.md §5.1, FINAL).
5. **Flat fallback UI.** The flat HUD that repeats every piece of game-critical diegetic information
   (world.md §6 rule 8, FINAL; §24.5 "une version plate existe en option d'accessibilité"), its parity
   with the diegetic HUD, and the UI scale 100 % to 200 % (world.md §8, FINAL) for both.

Plus the shared **accessibility settings store** these five need (one module, read by every scene).

Out of scope (see "Dependencies" in each section): keyboard play, the screen-reader mirror's wording,
focus order, touch targets and onboarding (`ux-designer`, its section 11 "Accessibility contract");
the horror slider content (`art-audio`, `narrative-quest-designer`; this file only requires that it
never hides information); sound cues and their mix (`art-audio`); rules and numbers (`combat-engineer`,
`class-designer`, `world-designer`); rendering code (`graphics-technical-artist`, `client-engineer`).

**Role slugs** used for dependencies: the canonical list of `lead-game-designer.md` §2.2
(`lead-game-designer`, `combat-engineer`, `class-designer`, `progression-designer`, `world-designer`,
`encounter-boss-designer`, `narrative-quest-designer`, `economy-designer`, `ux-designer`,
`client-engineer`, `ai-engineer`, `network-engineer`, `pvp-br-designer`, `tech-lead`, `qa-balance`,
`art-audio`), plus `graphics-technical-artist` (has its own role file, not yet in that list) and
`accessibility` (this file).

## Inputs read

- The gameplay plan, whole file, §0 to §26, "Fichiers critiques" and "Vérification".
- `SPEC.md` §5 (clear-board toggle, colourblind-safe colours), `CONTRIBUTING.md` (sections 6.4, 11, 13),
  `AGENTS.md`.
- `docs/specs/world.md` §5 (palette, light, fog, marble looks, tell marks, ejection timing and its
  reduced variant), §6 (diegetic HUD rules 1 to 9), §7 (every audio cue has a visual twin), §8
  (accessibility, all FINAL), §11 (open question 2: safe mode on by default).
- `docs/specs/ui.md` §1 to §7 (tokens, type sizes, HUD plate, settings menu #277, motion, contrast table).
- `docs/specs/art.md` §1 (bone-white tells 3:1, "never" list), `docs/specs/tech.md` §5.1 (tiers, clear
  board as a tier, flash limiter), §5.2 (effects timeline), §5.3 (MSDF text and the DOM mirror that
  also feeds the flat HUD), `docs/specs/game-design.md` §2 (input, accessibility line).
- Sibling role files, for alignment: `ux-designer.md` (marble layers L0 to L3, glyph catalog, Edge
  danger display, accessibility contract, feedback F3, F7, F12), `graphics-technical-artist.md` (SDF glyph
  atlas, effects timeline, flash guard 6.5, unfold reduced motion 3.1), `lead-game-designer.md` §2.2
  (role slugs).
- Code: `client/src/quality.ts` (`readClearBoard`, `read`/`write` with blocked storage, tiers,
  `fogSettings` returns `null` when clear), `client/src/settings.ts` (menu list: Clear board, Sound),
  `client/src/main.ts` (`applyLook`, `body[data-clear]`, `body[data-tier]`, `prefers-reduced-motion`
  read at each animation, marble materials by side), `client/src/eject.ts` (`ejectTrack`, tumble
  800 ms or fade 400 ms), `client/src/slide.ts` (200 ms or 0), `client/src/ui.css` (tokens on `:root`,
  light theme, vignette hidden by `data-tier='low'` and `data-clear='on'`, reduced-motion rules),
  `client/e2e/clear-board.spec.ts`, `client/e2e/phone-layout.spec.ts`, `client/vite.config.ts`
  (coverage include list: pure modules only).

---

## 0. Shared design: the accessibility layer

### 0.1 Modules (all pure, unit tested at 100 %, listed in `coverage.include`)

| File | Content | Phase |
|---|---|---|
| `client/src/a11y/settings.ts` | The settings model, defaults, read and write (reuses `read`/`write` of `quality.ts`), the effective values (`effectiveReducedMotion`) | R1 |
| `client/src/a11y/contrast.ts` | WCAG relative luminance and contrast ratio of two hex colours | R1 |
| `client/src/a11y/cvd.ts` | Colour-vision deficiency simulation (Machado, Oliveira, Fernandes 2009, severity 1.0) and OKLab distance | R1 |
| `client/src/a11y/palettes.ts` | Token tables per palette (standard, protan, deutan, tritan, high contrast), the pairs to check | R1 (standard), R2 (others) |
| `client/src/a11y/motion.ts` | The animation catalogue: every animation kind with its full and reduced variant | R1 |
| `client/src/a11y/clearboard.ts` | The keep and remove lists of clear-board mode, per render layer id | R1 |
| `client/src/a11y/flashcheck.ts` | The flash analyser (WCAG 2.3.1 general and red flash), on luminance envelopes and on sampled frames | R1 |
| `client/src/a11y/flathud.ts` | The flat renderer description: HUD model items to a DOM tree description (no DOM import) | R1 |
| `client/src/a11y/redundancy.ts` | Integrity checks: every coloured meaning has a glyph and a label | R1 |

Glue (tested by Playwright, like `main.ts` today): `client/src/a11y/apply.ts` sets the data attributes
and CSS variables on `<html>`, builds the settings rows and the flat HUD DOM.

Rule (PROPOSAL): no other module reads `matchMedia('(prefers-reduced-motion: reduce)')` or a storage key
of this file directly; they receive the effective values. Today `main.ts` reads the media query twice
(lines 140 and 430); R1 routes both through `effectiveReducedMotion`.

### 0.2 The settings model

```ts
// client/src/a11y/settings.ts
export type Palette = 'standard' | 'protan' | 'deutan' | 'tritan' | 'high-contrast';
export type Motion = 'system' | 'reduced' | 'full';
export interface A11ySettings {
  palette: Palette;      // default 'standard'
  photosafe: boolean;    // default true (world.md §8)
  motion: Motion;        // default 'system': follows prefers-reduced-motion
  clearBoard: boolean;   // default false, existing key 'ab-alone.clear-board'
  flatHud: boolean;      // default false on wide screens (see section 5.3)
  uiScale: 100 | 125 | 150 | 175 | 200; // default 100
}
export const effectiveReducedMotion = (s: A11ySettings, mediaReduced: boolean): boolean =>
  s.motion === 'reduced' || (s.motion === 'system' && mediaReduced);
```

- **Storage.** One key per setting, like `quality.ts` today (KISS, no migration): the existing
  `ab-alone.clear-board` stays as it is, new keys `ab-alone.palette`, `ab-alone.photosafe`,
  `ab-alone.motion`, `ab-alone.flat-hud`, `ab-alone.ui-scale` (PROPOSAL). An unknown or missing value
  gives the default; blocked storage gives the defaults for this page view (as `read` does today).
- **Applied as** `<html data-palette="deutan" data-photosafe="on" data-motion="reduced"
  data-flat-hud="on" style="--ui-scale: 1.5">`, plus the existing `body[data-clear]` and
  `body[data-tier]`. E2E tests read these attributes (strings kept verbatim once shipped).
- **Where.** The settings menu behind the cog (ui.md §4, #277) gains rows, in this order (PROPOSAL):
  Clear board, Safe mode (photosensitivity), Reduced motion (three states: System, On, Off), Flat HUD,
  Colours (Standard, Protan, Deutan, Tritan, High contrast), UI scale (100 % to 200 %), Sound. A
  toggle is a button with `aria-pressed`; a choice is a button group with `aria-pressed` on the chosen
  one (no `<select>`, same look as #277).
- **When.** world.md §8 (FINAL): "all options reachable from the first screen, before any horror
  content". In the RPG the first screen is the title and character creation (§11): the cog is there,
  and the first launch shows one line "Accessibility options: Settings" next to it until the menu is
  opened once (PROPOSAL, wording from `narrative-quest-designer`).
- **Never in the hash, never on the wire.** Settings are not sent to peers, not in the save file
  `hero` store (§24.5), not in the combat log. Two peers with different settings see the same game.
  (FINAL, from deterministic combat.)

### 0.3 Tests (settings)

- Unit. Given empty storage, When `readSettings` runs, Then palette `standard`, photosafe on, motion
  `system`, clear board off, flat HUD off, UI scale 100.
- Unit. Given storage that throws on `getItem`, Then the defaults, and `writeSettings` does not throw.
- Unit. Given `ab-alone.ui-scale` = `130`, Then 100 (only the five steps are accepted).
- Unit. Given motion `system` and the media query reduced, Then `effectiveReducedMotion` is true; motion
  `full` and media reduced, Then false; motion `reduced` and media not reduced, Then true.
- E2E `a11y-settings.spec.ts`: open the cog, set each row, reload, Then each `data-*` attribute is
  kept and each row shows its state; the classic hot-seat board still plays two moves (same pattern as
  `clear-board.spec.ts`).

---

## 1. Glyphs and colours

Plan points: §2 ("on garde la palette, les glyphes et l'accessibilité de world.md §5 et §8. Chaque
biome ajoute sa palette, dans ce cadre"), §4.4 (monster level: a colour *and* a glyph), §5.1 (one
mandatory glyph per cell type), §5.3 (intent, Champion "bleu", Elite "jaune"), §6.4 (Weight pips),
§6.6 (Edge danger glyph), §6.11 (statuses), §8.5 (element states), §12 (rarity: a colour *and* a glyph),
§16 (`!` and `?` markers, always with a glyph besides the colour), §20 and §21 (seats, emotes, pings),
§24.5 (HP ring, pips, statuses, intent, terrain decals with glyphs).

### 1.1 The redundancy rule

FINAL (world.md §8): no meaning is carried by colour alone. Made testable (PROPOSAL):

- Every **meaning family** that uses colour is declared in `redundancy.ts` with its members. A member
  is `{ id, tone, glyph, label }`: `tone` is a token name (never a raw hex), `glyph` an id of the
  `ux-designer` catalog, `label` a non-empty string id.
- Families and their source:

| Family | Members | Source | Phase |
|---|---|---|---|
| `camp` | own, ally, enemy, neutral (escort NPC) | §6.0, §6.2, §6.7 | R1 |
| `unit-kind` | hero, fragment, monster, leader, revenant, boss | §6.6, §6.9, §5.3 | R1 (hero, fragment, monster, leader) |
| `threat` | Edge danger could, Edge danger will, tell, intent, Breach ring | §6.6, §1 pillar 2, §5.3, §6.7 | R1 |
| `hp` | HP, HP lost (preview), shield, Guard cap | §6.5, §24.5 | R1 |
| `weight` | base pip, temporary plus pip, temporary minus pip | §6.4, §6.11 | R1 |
| `terrain` | the 15 cell types | §5.1 | R2 (6 types), R9 (all) |
| `status` | the statuses and keywords of §6.11, plus Lassitude and the category immunities | §6.11 | R2 |
| `element` | Burnt, Frozen, Charged (Mage states), Wet (Water) | §8.5, §5.1 | R2 |
| `tier` | the 5 monster level tiers | §4.4 | R4 |
| `rarity` | Common, Magic, Rare, Legendary, Unique, Set; plus Champion and Elite monster rarities | §12, §5.3 | R5 |
| `quest` | available, in progress, ready to hand in, daily, bounty | §16 | R6 |
| `seat` | up to 6 player seats (battle royale), up to 4 party members, up to 4 packs | world.md §5, §6.2, §20 | R10 (the party subset in R8) |
| `social` | 4 emotes, ping | §1 pillar 5, §21 | R10 |

- **Checks** (unit, `redundancy.test.ts`, each family):
  1. every member has a glyph and a label;
  2. no two members of a family share a glyph;
  3. every member's tone exists in every palette (section 1.3);
  4. the family's data source is covered: every cell type of the terrain data, every status of the
     status data, every rarity of the item data has a member (integrity test over `data/`, §24.3).
- **No colour ramps that carry meaning on their own** (PROPOSAL). The HP arc does not turn from green to
  red as HP drops: its *length* is the value, its colour stays one token. Reason: the plan's natural
  green/red pair has an OKLab distance of 0.026 for deuteranopia (computed, see 1.3), it would read as
  one colour. Low HP is shown by the length plus a notch glyph at 25 % (§8.4 Grâce threshold, TUNE
  there), never by a colour change only.

### 1.2 Glyph legibility (on top of `ux-designer` 1.1 and 1.2)

- **Dual-tone glyphs in the scene** (PROPOSAL). Every in-scene glyph is drawn with a fill and an
  outline: fill in its tone, outline near-black `#0b0d0f` (art.md base, FINAL), outline width 12 % of the
  glyph size (TUNE). Reason, measured: the bone-white tell tone `#d8d4c8` (art.md, FINAL) has a
  contrast of 1.27:1 on a white ice surface `#e8eef2` (sample value, TUNE) and 1.97:1 on lava orange
  `#d9822b`, under the 3:1 of WCAG 1.4.11; the near-black outline gives 16.6:1 and 6.7:1 there. Rule:
  for every surface colour `s` a glyph can sit on, `max(cr(fill, s), cr(outline, s)) ≥ 3` (FINAL target,
  WCAG 1.4.11).
- **Size.** In-scene glyph height at least 14 CSS px at 720p and UI scale 100 % (TUNE, `ux-designer`),
  multiplied by the UI scale, capped at 0.8 of the on-screen cell spacing (PROPOSAL) so a glyph never
  spills over the next cell (ui.md §1 FINAL: no effect over a cell). When the cap is hit (radius 8 at
  720p, §6.8 battle royale), the camera offers a zoom instead of shrinking the glyph (dependency
  `graphics-technical-artist`, section 7 there).
- **Steady.** No glyph that carries a threat blinks, pulses or rotates (world.md §8, FINAL: tells are a
  steady shape). A state change (Edge danger appears) may fade in over 160 ms (ui.md §6, FINAL), once.
- **One meaning per shape across families too** (PROPOSAL, extends `ux-designer` 1.2 "within a family"):
  three frost meanings exist (Ice cell §5.1 snowflake, Frozen status §6.11, Frozen element state §8.5);
  the Frozen status and the Frozen element are the same thing for the player and share one glyph, the
  Ice cell keeps the snowflake. Same for Fire: Lava cell (flame) versus Burnt state (ember dot) versus
  Burn damage over time (shares the Burnt glyph). Collision list checked by test (Feedback AF6).

### 1.3 Colour tokens and palettes

Tokens (CSS custom properties on `<html>`, and the same values for three.js materials through
`palettes.ts`, so the scene and the page never disagree):

| Token | Standard (dark) | Meaning | Tag |
|---|---|---|---|
| existing ui.md §2 tokens (`--bg` … `--danger`) | unchanged | chrome | FINAL (ui.md) |
| `--tell` | `#d8d4c8` | tells, intents, countdown ticks | FINAL (art.md bone-white) |
| `--glyph-outline` | `#0b0d0f` | outline of every in-scene glyph | PROPOSAL |
| `--camp-own` | `#7fd6e8` | own marbles' core and own HUD items | FINAL (world.md cyan) |
| `--camp-ally` | `#b58cd9` | allied players (group play) | PROPOSAL |
| `--camp-enemy` | `#d9822b` | enemy entity markers in the HUD | PROPOSAL |
| `--camp-neutral` | `#d8d4c8` | escort NPC (§6.7) | PROPOSAL |
| `--hp` | `#7fb86a` | HP arc | PROPOSAL |
| `--shield` | `#7fd6e8` | shield arc | PROPOSAL |
| `--tier-0` … `--tier-4` | `#6b7378`, `#4f86d9`, `#a9c7e8`, `#f0c060`, `#ff6b5a` | monster level tiers (§4.4) | PROPOSAL |

Contrast and colourblind checks, computed for this file with the formulas of `contrast.ts` and `cvd.ts`
(values TUNE, the test recomputes them):

- Every new token against `--panel` `#161a1d`: `--camp-ally` 6.4, `--camp-enemy` 6.0, `--hp` 7.5,
  `--tier-0` 3.6, `--tier-1` 4.8, `--tier-2` 10.0, `--tier-3` 10.3, `--tier-4` 6.3. Non-text meaning
  needs 3:1 (FINAL, WCAG 1.4.11): all pass. Text in a tier colour would need 4.5:1: `--tier-0` fails, so
  tier names are written in `--text`, never in the tier colour (PROPOSAL).
- **The tier ramp is colourblind-safe by itself** (PROPOSAL): the five tier tokens keep an OKLab distance
  of at least 0.100 between any two, under no deficiency, protanopia, deuteranopia and tritanopia
  (computed minimum 0.100, TUNE threshold 0.10). The plan's literal grey, green, yellow, orange, red
  (`#8a9196`, `#7fb86a`, `#d9c45a`, `#d9822b`, `#ff6b5a` as sample values) does not: green and red are
  0.026 apart for deuteranopia and orange and red 0.058 for protanopia (Feedback AF1). So one ramp serves
  every palette and the colourblind palettes only remap what fails (KISS).
- Rarity (§12) is the hardest family: six hues. With the usual sample values Magic (blue) and Unique
  (violet) are 0.022 to 0.025 apart under protanopia and deuteranopia. Rarity is read by its glyph first
  (section 1.1); the colourblind palettes give Unique a lighter value (`art-audio` picks, the test
  checks ≥ 0.06, TUNE) (Feedback AF2).

**Palettes** (world.md §8, FINAL: three colourblind palettes plus high contrast):

- `palettes.ts` exports `PALETTES: Record<Palette, Partial<Tokens>>`: `standard` is complete, the
  others are overrides on top of it (PROPOSAL). The light theme of ui.md §2 stays a chrome-only theme;
  the 3D deck is dark in both (ui.md §5, FINAL).
- **Checks** (`palettes.test.ts`), for every palette:
  1. every pair of `CONTRAST_PAIRS` meets its target (text 4.5:1, non-text 3:1, FINAL WCAG 2.1 AA; high
     contrast: text 7:1 and non-text 4.5:1, PROPOSAL);
  2. for its target deficiency (protan palette: protanopia, and so on; standard and high contrast: all
     three), every family flagged `distinctByColour` keeps the minimum OKLab distance (0.10 for `tier`,
     `camp`, `threat`; 0.06 for `rarity`; TUNE);
  3. `ui.css` default values equal `PALETTES.standard` (a parity test that reads the CSS file, so the
     page without JS settings and the scene agree).
- **High contrast** (PROPOSAL): cell edges at 4.5:1 against the surface (above the FINAL 3:1 of world.md
  §5), terrain decals at full opacity, marble silhouettes with a 2 px outline (TUNE) in `--glyph-outline`
  on light surfaces and `--text` on dark ones, no texture behind a glyph.
- **Biome palettes** (§2, "chaque biome ajoute sa palette, dans ce cadre"): a biome look may tint
  surfaces and light, never a token above. Test (R4, R9): for each biome, the sampled surface colours
  (data from `graphics-technical-artist`, a list of hex per biome) keep the cell edge at 3:1 (FINAL,
  world.md §5) and every glyph at 3:1 through its fill or outline (section 1.2).

### 1.4 Camps and entities in group play (§6.2, §19, §20, world.md §5)

- **Perspective rule** (PROPOSAL): every viewer sees their own camp as glass with a cyan core and the
  opposing camp as shell, whatever the mode (PvE, PvP, arena, battle royale). In PvP both players see
  themselves as glass. Silhouette first (world.md §5 "silhouette cue", FINAL), so camp never depends on
  colour. Allied players (party, 2v2) are glass with their seat glyph engraved on the core; the own
  hero is glass with the hero ring band (`ux-designer` 1.1).
- **Entity glyph**: each entity has a seat glyph (players, the 6 battle royale glyphs of world.md §5
  reused, FINAL list) or a pack glyph plus its number (packs M1 to M4, §6.2). The glyph is on the
  marble (a small engraving, L0) and on the entity's token in the turn frieze, so "whose marble is
  this" never needs colour.

### 1.5 Dependencies

- `ux-designer`: glyph catalog ids and labels for every member of section 1.1, the L3 priority, the
  frieze tokens; agrees that `redundancy.ts` reads its catalog.
- `graphics-technical-artist`: dual-tone glyph shader (fill plus outline, its SDF node already has a
  second threshold), the size cap, the per-biome surface colour lists, materials reading `palettes.ts`.
- `art-audio`: values of the colourblind and high-contrast overrides, glyph silhouettes, the perspective
  rule's look (allies' engraving), approval of the token additions in art.md §1.
- `world-designer`, `combat-engineer`, `economy-designer`, `narrative-quest-designer`: their data files
  list cell types, statuses, rarities and quest states with a glyph id (integrity test input).
- `pvp-br-designer`, `network-engineer`: seat numbering is stable across peers (glyph = seat index).

### 1.6 Tests

- Unit `contrast.test.ts`. Given `#000000` and `#ffffff`, Then 21; Given `#d8d4c8` on `#161a1d`, Then
  11.8 (rounded to 0.1, matches ui.md §7). Given a malformed hex, Then it throws.
- Unit `cvd.test.ts`. Given white, Then white under every simulation; Given `#7fb86a` and `#ff6b5a`, Then
  their deuteranopia distance is below 0.05 (the case that proves AF1). Given the same colour twice,
  Then 0.
- Unit `palettes.test.ts`: checks 1 to 3 of section 1.3 for all five palettes.
- Unit `redundancy.test.ts`: checks 1 to 4 of section 1.1, including the cross-family collisions of 1.2.
- E2E (R1, `a11y-palette.spec.ts`): Given the R1 fight fixture, When the palette is set to `deutan`,
  Then `html[data-palette="deutan"]`, the computed `--tier-4` equals the palette value, and the
  `window.__materialColor('hp')` hook (debug only) returns the same hex; a screenshot per palette is
  attached to the PR (CONTRIBUTING §6.4).

### 1.7 Risks

- A colourblind palette per deficiency is four times the art review. Mitigation: overrides only, and a
  standard palette that already passes most checks.
- OKLab distance after a dichromacy simulation is an approximation; the threshold 0.10 (TUNE) is checked
  once with colourblind playtesters (`qa-balance`).
- The perspective rule changes how a spectator sees a PvP match (no "own" camp): spectators see seat 1
  as glass (PROPOSAL, open question Q3).

---

## 2. Photosensitivity

Plan points: none explicit. The plan adds many flash sources: §8.5 Chaîne d'éclairs (lightning, 2
rebounds), Météore (impact), Explosion reaction, Trait de feu; §8.4 Aube (light, all allies); §4.8 rain
and lightning weather, night (v2); §5.1 Lava, Vent countdown, Crystal reflection; §5.2 Caldeira (Burn
+50 %), Le Puits Éboulements; §6.6 crumble; §6.7 Breach cracking; §17 Volcanic and Explosive Mythic
affixes; §18 bomb marble countdown, phase changes; §12 Legendary drops; §11 level up; §20 the storm; §21
pings. world.md §8 (FINAL): no flashes above 3 per second, no strobing, no full-screen white, lower
flicker amplitude; default on "until the player picks otherwise" (still an open question in world.md
§11, Feedback AF8).

### 2.1 Rules

| Rule | Value | Tag |
|---|---|---|
| General flash cap, any mode | at most 3 flashes in any 1 s window over an area at or above the WCAG threshold | FINAL (WCAG 2.3.1, world.md §8) |
| Area threshold | 21 824 px² at 1024 × 768 (WCAG's 341 × 256), scaled by `W × H / (1024 × 768)` | FINAL (WCAG definition), scaling PROPOSAL |
| Safe mode cap | at most 3 flashes in any 1 s window in **any** 32 × 18 block of the screen, whatever the area | PROPOSAL (stricter than WCAG) |
| Red flash | no transition to or from saturated red (`R / (R + G + B) ≥ 0.8`) more than 3 times a second, any area, any mode | FINAL (WCAG 2.3.1 red flash) |
| Danger red | `--danger` never animates luminance: Edge danger, Breach and fatal previews are steady | FINAL (world.md §8 tells) |
| Full-screen white | never; bright peaks capped at `--tell` bone-white luminance | FINAL (world.md §8), cap PROPOSAL (same as `graphics-technical-artist` 6.5) |
| Flicker | deck and biome light flicker off in safe mode; outside it, amplitude at most 10 % of the light's intensity and at most 1 cycle per second | PROPOSAL; 10 % and 1 Hz TUNE |
| Screen shake | none in safe mode and in reduced motion; never on a hero death | PROPOSAL |
| Default | safe mode on at first launch | world.md §8 (FINAL wording), confirmation open (AF8) |

Definitions (FINAL, WCAG 2.1): a *flash* is a pair of opposing changes in relative luminance of 10 % or
more of the higher luminance, where the darker state is below 0.80.

### 2.2 The analyser (test oracle)

`flashcheck.ts`, pure:

```ts
export interface Frame { t: number; luma: Float32Array; red: Float32Array } // per block, row-major
export interface FlashReport { ok: boolean; worst: { t: number; flashes: number; areaPx: number }; redOk: boolean }
export function analyse(frames: Frame[], grid: { cols: number; rows: number; w: number; h: number }, safe: boolean): FlashReport;
export function envelopeFrames(tracks: LumaTrack[], grid, stepMs: number): Frame[];
```

- **Algorithm.** Per block, walk the frames and record each transition (a luminance change of at least
  10 % of the higher value, darker below 0.80, with hysteresis: a transition ends when the trend
  reverses). Two opposing transitions form a flash at the time of the second. Slide a 1 s window over
  each block's flash times. A window fails a block when it holds more than 3 flashes. Non-safe: sum the
  areas of the failing blocks in the same window and fail when the sum reaches the area threshold
  (conservative: the blocks need not touch). Safe: one failing block fails. Red: the same on the red
  measure `(R − G − B) × 320` with a change above 20 and the saturation condition of 2.1 (FINAL, WCAG).
- **Two inputs**:
  1. **Envelopes** (unit tests, no GPU): every VFX track of the effects timeline declares a luminance
     envelope `{ startMs, durationMs, peak, cells }` (`graphics-technical-artist` adds the field);
     `envelopeFrames` rasterises them onto the block grid at 16 ms steps (TUNE). This checks every ability
     recipe at 100 % coverage, deterministically.
  2. **Sampled frames** (E2E): a debug hook `window.__lumaGrid()` renders the current frame into a 32 × 18
     render target and returns block luminance (debug builds and `navigator.webdriver` only). With a
     virtual clock (`window.__step(ms)`, `client-engineer`) the e2e test steps 16 ms at a time through a
     scripted sequence and feeds `analyse`. Under automation the page throttles drawing (`drawDue` in
     `quality.ts`), so real-time sampling is not reliable: the virtual clock is required.
- **Grid** 32 × 18 blocks (TUNE), step 16 ms (TUNE).

### 2.3 Inventory and handling (PROPOSAL; each line is a test case of 2.4)

| Source | Plan | Handling in every mode | Extra in safe mode |
|---|---|---|---|
| Chain lightning, 3 hits | §8.5 | hits 60 ms apart (`graphics-technical-artist` 6.1) would be 3 onsets in 120 ms: allowed (3), a 4th onset in the same second is delayed | bolt drawn as a steady line that fades, no bright onset on the target |
| Meteor impact, Explosion reaction, Bomb | §8.5, §15.4 | one onset, radius-1 area, peak capped | onset replaced by a darkening ring (luminance goes down, not up) |
| Aube, Rayon de soin, Source (light) | §8.4 | one onset per ally, merged into one wave | no onset, a steady glyph on each healed marble |
| Lava, Caldeira glow, Vent | §5.1, §5.2 | slow glow, under 1 cycle per second (TUNE) | static, no glow animation |
| Crystal rebound | §5.1 | one onset per rebound, merged with the hit | none |
| Breach and Tide cracks, Éboulement, Effondrement, Séisme | §6.7, §5.2, §8.8 | steady crack glyph and tick count (world.md §8 FINAL) | same |
| Crumble at 0 HP, ejection | §6.6, world.md §5 | fade only, never brighter (world.md §5 FINAL for ejection) | same |
| Lightning weather, night, day | §4.8 (v2) | lightning is a slow sky brightening under 1 per 10 s (TUNE), never on the board cells | no lightning visual, the rain glyph on the board rules line |
| Legendary drop beam, level up, quest complete | §12, §11, §16 | one rise over 400 ms or more (TUNE), no strobe | no beam rise, a steady beam |
| Boss phase change, enrage | §18 | dead air and dim (world.md §7), no white flash | same |
| Volcanic, Explosive affixes | §17 | as Meteor | as Meteor |
| Ping, emote | §21 | one ring that grows and fades over 600 ms (TUNE), at most 1 ping per player per second (TUNE, rate limit) | the ring does not grow, it fades only |
| End banner win pulse | ui.md §4 (existing) | one pulse, 1.6 s | none (already none under reduced motion) |
| Damage numbers | `graphics-technical-artist` 6.3 | no flash on crit-like hits (Isolation §6.5) | same |

### 2.4 Tests

- Unit `flashcheck.test.ts`.
  - Given a block that goes 0.1 → 0.9 → 0.1 four times in 1 s, When `analyse` safe, Then not ok, worst
    4 flashes.
  - Given the same three times, Then ok.
  - Given 4 flashes in one block of 1/576 of the screen, When non-safe, Then ok (below the area); When
    safe, Then not ok.
  - Given a change from 0.85 to 0.95 (darker state above 0.80), Then no flash (WCAG definition).
  - Given a saturated red block (255, 0, 0) toggling with black 4 times in 1 s, Then `redOk` false in
    both modes.
  - Given an empty frame list, Then ok.
- Unit (`graphics-technical-artist`'s timeline test, oracle from here): for every ability recipe of the
  class data and every terrain change, Given its envelope, Then `analyse(envelopeFrames(...), safe)` is
  ok in both modes (property over random sequences of 1 to 20 recipes in one turn, seeded).
- E2E `photosafe.spec.ts` (R2, needs the Mage): Given the fixture "mage-chain" and safe mode on, When the
  scripted bot casts Chaîne d'éclairs then Météore, stepping the virtual clock, Then `analyse` of the
  sampled frames is ok; same with safe mode off and the non-safe rule. R1 version: Shock, crumble, hero
  ejection and the end banner.

### 2.5 Dependencies

- `graphics-technical-artist`: the `LumaTrack` envelope on every VFX track, the runtime guard, the
  `__lumaGrid` hook.
- `client-engineer`: the virtual clock for e2e; the safe-mode row wiring.
- `art-audio`: safe-mode variants of the ability looks; the light flicker presets per biome.
- `class-designer`: element tags on abilities (which ones are "light", "lightning", "fire").

### 2.6 Risks

- Block sampling misses a flash smaller than a block (32 × 18 on 1280 × 720 is 40 × 40 px): safe mode is
  stricter per block; a sub-block flash is below the WCAG area anyway.
- The virtual clock must drive every animation (CSS animations too: the end banner is CSS). The e2e
  pauses CSS animations with `document.getAnimations()` and seeks them to the virtual time (PROPOSAL).

---

## 3. Clear-board mode

Plan points: §2 (keep world.md §8), §4.2 (exploration fog, "les tuiles jamais vues sont sombres"), §4.6
(multi-tile camera), §4.8 (night, weather), §5.2 (Le Puits "Obscurité"), §24.5 (terrain decals, HP ring,
pips, statuses, intent, previews). Existing FINAL rules: clear board disables fog, bloom, grain,
vignette, flicker, props over the board; never removes a boss tell, a preview ghost or a phase notch
(world.md §8); no post chain, flat lighting (tech.md §5.1); it is a setting of the menu (#277).

### 3.1 The lists

`clearboard.ts` exports `CLEAR: Record<RenderLayerId, 'keep' | 'remove' | 'flatten'>`, typed on the
render layer registry of `graphics-technical-artist` (its section 4), so a new layer does not compile
until it is classified (PROPOSAL).

| Layer | Clear board | Why | Tag |
|---|---|---|---|
| Atmospheric fog, haze, steam, smoke | remove | world.md §8 | FINAL |
| Bloom, grain, vignette, chromatic effects, page rim gradient | remove | world.md §8, ui.md §5 | FINAL |
| Light flicker, deck and biome | remove | world.md §8 | FINAL |
| Props over or between cells, hanging cloth, particles (ash, snow, rain, embers, dust) | remove | world.md §8 | FINAL |
| Ability VFX particles | remove; the hit stays as the HP arc change and the damage number | tech.md §5.1 | PROPOSAL |
| Lighting | flatten: one ambient plus one key light, no shadows over cells | tech.md §5.1 | FINAL |
| Surface textures of cells | flatten to the surface colour, edges kept at 3:1 | world.md §5 | PROPOSAL |
| Biome tint | flatten to the deck surface, the biome name and rule line stay in the HUD | §2 | PROPOSAL |
| **Exploration fog** (unseen tiles) on the world map | **keep**, drawn as a flat dark tint with the tile outlines visible | §4.2: it is information (seen or not), not atmosphere | PROPOSAL |
| **Night, Le Puits darkness** | **keep as a rule glyph** on the board rules line, never as darker cells | §4.8, §5.2: rules (stats +10 %, range −1) | PROPOSAL |
| Marble looks L0, HP arc, Weight pips, top-slot glyph (L0 to L3) | keep | `ux-designer` 1.1 | FINAL (world.md §8 "never removes") |
| Terrain decals and glyphs, countdown ticks, slopes' arrows | keep | §5.1 mandatory glyph | FINAL |
| Tells, intents, Edge danger, Breach and Tide rings, phase notches | keep | world.md §8 | FINAL |
| Previews (ghosts, push line, damage labels, slide path) | keep | world.md §8 | FINAL |
| Remains (Dépouilles), Graveyard count, rout tallies | keep | §6.6, §6.7 | PROPOSAL |
| Action bar (engraved or flat), turn frieze | keep | world.md §6 | FINAL |
| Seams of multi-tile boards | keep as plain cell edges | §4.6 | PROPOSAL |
| Unfold transition | keep (motion is section 4's business) | §4.5 | PROPOSAL |

### 3.2 Implementation

- `applyLook` of `main.ts` (today: fog and `body[data-clear]`) calls `clearBoardFor(layer)` for every
  layer of the registry. The RPG scene glue does the same.
- Clear board is not a quality tier: it stacks on any tier (tech.md §5.1 lists it as a tier, Feedback
  AF11). `data-clear` and `data-tier` stay two attributes, as today.
- Clear board does not force the flat HUD, nor reduced motion, nor safe mode (each is its own setting).
  The settings menu shows them next to each other.

### 3.3 Tests

- Unit `clearboard.test.ts`. Given the registry, Then every layer has a class (compile-time by the
  `Record` type, and a runtime test against the registry list for layers built from data). Given the
  "keep" list of world.md §8 (tell, preview ghost, phase notch, HP arc, Weight pip, terrain glyph,
  Edge danger, intent), Then each is `keep` (a guard test: changing one fails with the world.md citation
  in the message).
- Unit. Given clear board on, When `fogSettings` (existing) runs, Then `null` (existing test kept); When
  `worldFogFor('unseen', clear)` runs, Then a flat tint, never `null`.
- E2E `clear-board-rpg.spec.ts` (R1). Given the R1 fight fixture with a monster intent, a hero in Edge
  danger and a Shock preview hovered, When clear board is turned on, Then `body[data-clear="on"]`,
  `window.__layers()` (debug hook) reports `fog: 0`, `post: 0`, `particles: 0`, and the counts of
  `hpArc`, `weightPip`, `intent`, `edgeDanger`, `ghost` equal the counts with clear board off. A
  screenshot of both states is attached to the PR.
- E2E (R4). Given the world map with seen and unseen tiles, When clear board is on, Then
  `data-unseen-tiles` (debug) is unchanged and the unseen tiles are still drawn darker.

### 3.4 Dependencies and risks

- `graphics-technical-artist`: the render layer registry and the `__layers` hook; the flat world fog
  tint. `world-designer`: night and darkness are expressed as rule flags in the view, not as light only.
- Risk: "flatten biome tint" may make two biomes look alike; the biome name is on the rules line, so
  no information is lost.

---

## 4. Reduced motion

Plan points: §4.5 ("en mouvement réduit, on n'anime qu'un seul plan"), §4.2 (rolling from tile to tile,
300 ms × biome cost per step, TUNE), §4.6 (camera overview then zoom), §6.6 (crumble 400 ms), §5.1 (ice
slide), §6.10 (forced moves: push, pull, teleport, swap, slide), §8.7 (Retour, Paradoxe rewind the
board), §8.8 (Rotation of 7 cells), §8.3 (Pas de l'ombre, Danse des lames jumps), §8.5 (Clignement),
§6.12 (retry under 5 s). Existing FINAL rules: reduced motion cuts camera sway, the ejection tumble and
stretch (a plain 400 ms fade, world.md §5 and §8); HUD transitions and animations go to 0 (ui.md §6); no
screen shake, no flicker, shorter ejection (tech.md §5.1); any click or key skips an animation and it
never holds the next move (world.md §5).

### 4.1 Principle

A position change is information: in reduced motion the player must still see *where* each marble went.
So reduced motion removes travel, scale, rotation, camera moves and bounces, and keeps (PROPOSAL):

- **cross-fades** in place (out at the old cell, in at the new cell) for moves of more than one cell;
- a **path trail** (a steady dotted line on the cells, shown for the rest of the turn, `--tell` tone) for
  slides, pulls, pushes over 2 cells or more, teleports and swaps, so the route is readable without
  motion;
- **one-cell moves** as a 0 ms snap (slide.ts today: 0 ms under reduced motion, FINAL existing).

### 4.2 The catalogue

`motion.ts` exports `ANIMS: Record<AnimKind, { full: Variant; reduced: Variant }>` (typed on the effects
timeline kinds of `graphics-technical-artist`, so a new kind without a reduced variant does not compile).

| Kind | Plan | Full (owner: `graphics-technical-artist`) | Reduced | Tag (reduced) |
|---|---|---|---|---|
| Move, one cell | §6.0 | 200 ms slide | 0 ms snap | FINAL (slide.ts) |
| Push and Shock | §6.5 | slide, hit recoil | snap, no recoil, damage number appears in place | PROPOSAL |
| Ejection (any marble, hero included) | §6.6 | 200 ms over the rim + 600 ms void | 400 ms fade one cell out | FINAL (world.md §5) |
| Crumble at 0 HP | §6.6 | 400 ms crack and crumble (TUNE there) | 200 ms fade, Remains decal appears | PROPOSAL; 200 ms TUNE |
| Ice slide | §5.1 | cell-by-cell slide | path trail plus cross-fade 150 ms | PROPOSAL; 150 ms TUNE |
| Pull, forced push, recoil (Chaîne d'ancre, Halo, Explosion de cadavre) | §6.10 | slide | snap (1 cell) or trail plus cross-fade | PROPOSAL |
| Teleport, swap, jump (Pas de l'ombre, Clignement, Transfert, Danse des lames, Assassinat) | §8.3, §8.4, §8.5 | dissolve and travel | trail plus cross-fade 150 ms per jump | PROPOSAL; TUNE |
| Retour, Déjà-vu return | §8.7 | rewind travel | trail plus cross-fade | PROPOSAL |
| Paradoxe (whole board) | §8.7 | every marble travels back | one cross-fade of the whole board 300 ms, trails for marbles that moved | PROPOSAL; 300 ms TUNE |
| Rotation of 7 cells | §8.8 | 60° turn | cross-fade 300 ms, a steady rotation glyph on the centre cell for the rest of the turn | PROPOSAL; TUNE |
| Terrain appears or changes (Rock wall, Lava, Ice, Bridge, Breach ring) | §6.10, §8 | rise or grow | fade 150 ms | PROPOSAL; TUNE |
| Damage numbers | §6.5 | float up | appear in place, fade after 800 ms | PROPOSAL; TUNE |
| Tile unfold | §4.5 | about 1.2 s (TUNE there) | 300 ms cross-fade from map to board, no camera move | PROPOSAL (same as `ux-designer`, `graphics-technical-artist`); 300 ms TUNE |
| Fold back after a fight | (not in plan) | 600 ms (TUNE, `graphics-technical-artist`) | 300 ms cross-fade | PROPOSAL |
| Hero step on the world map | §4.2 | rolling ball, camera follows | the ball translates without spin; the camera moves by a cut when the hero leaves the central 50 % of the view (TUNE) | PROPOSAL |
| Multi-tile overview and region zoom | §4.6 | dolly | cut | PROPOSAL |
| Map open (M), window open | §4.2, §24.5 | zoom or slide | appear (0 ms) | FINAL (ui.md §6 rule) |
| Camera sway, idle drift | world.md §8 | on | off | FINAL |
| Screen shake | — | none in RPG (PROPOSAL) | none | PROPOSAL |
| Beacon teleport, defeat return | §4.2, §6.12 | dissolve | cross-fade 300 ms | PROPOSAL |
| Boss retry | §6.12 | board resets in place | same (no motion) | PROPOSAL |

Time does not depend on motion for the rules: a world step still lasts 300 ms × biome cost (§4.2) in
reduced motion (FINAL, deterministic travel; only the look changes).

### 4.3 Tests

- Unit `motion.test.ts`. Given every kind, Then the reduced variant has no `travel`, `scale`, `rotate`,
  `camera` or `shake` channel (a property over the catalogue). Given `crumble` reduced, Then a 200 ms
  fade. Given `move` reduced, Then 0 ms. Given the effective setting false, Then `variantOf(kind)` is
  the full variant.
- Unit, trail. Given an ice slide from (0, 0) to (3, 0), Then the trail lists (0, 0), (1, 0), (2, 0),
  (3, 0) in order and lasts until the end of the active entity's turn.
- E2E `reduced-motion-rpg.spec.ts` (R1). Given `page.emulateMedia({ reducedMotion: 'reduce' })` and the
  R1 fixture, When the hero pushes a Fragment off, Then `body[data-anim]` (debug) reports `fade` and the
  ejection ends under 500 ms (TUNE margin over 400 ms); When the setting is "Off" (motion `full`), Then
  `tumble` even with the media query set.
- E2E (R4). Given reduced motion, When the hero engages a pack, Then the phase goes `world` → `unfold` →
  `placement` in under 500 ms (TUNE) and no camera transform changes during `unfold` (debug hook).

### 4.4 Dependencies and risks

- `graphics-technical-artist`: the `AnimKind` list and the variants; trails as a board layer.
- `ux-designer`: the trail look (it is a readability layer); the 1.5 s action budget still holds.
- `client-engineer`: one place that reads the effective setting.
- Risk: cross-fades on a crowded board (radius 8, 60 marbles) may be harder to follow than motion for
  some players; the motion setting has three states so a player with the OS setting on can still choose
  "Off".

---

## 5. Flat fallback UI

Plan points: §24.5 ("la barre d'actions 4 + 1 est gravée sur le cadre du plateau … une version plate
existe en option d'accessibilité"), §1 pillar 2 ("tout l'état du combat est public"), §5.3 (intent),
§6.6 (Edge danger), §6.7 (rout, Usure, Brèche counters), §6.11 (statuses), §18 (phases by HP %, visible
cooldowns), §4.2 and §4.3 (world map, % discovered), §26 Q6 (mobile). Existing FINAL rules: world.md §6
rule 1 (no flat overlay for game-critical info while a match runs), rule 4 ("flat fallback exists but is
never the only copy"), rule 8 (always a flat HUD fallback), rule 9 (720p and 200 %); tech.md §5.3 (a
hidden accessible DOM mirror that also feeds the flat HUD).

### 5.1 One model, two renderers, one DOM

- **Model.** `ux-designer` owns `hudModel(view: CombatView): HudItem[]` (its data and wording). Item:
  `{ family: HudFamily; key: string; glyph: GlyphId; label: string; value?: string; tone: Token;
  priority: number }`. `HudFamily` is a closed union (PROPOSAL):
  `turn`, `frieze`, `own-vitals` (HP, max, shield, Weight effective and base), `resource`,
  `cooldowns`, `slots` (Move, Action, Quick, bonus Step), `consumables`, `preparations`, `rout`
  (losses and threshold per entity), `edge-danger`, `intents`, `tells` (terrain and ability countdowns),
  `anti-stall` (turns without loss, Usure, Brèche), `boss` (phase thresholds by HP %, enrage),
  `board-rules` (format, biome rule, night, weather), `selected` (statuses with turns, keywords,
  immunities of the inspected unit), `log` (`ux-designer`).
- **Parity by type** (PROPOSAL): `SCENE_RENDERERS: Record<HudFamily, SceneRenderer | 'flat-only'>` and
  `FLAT_RENDERERS: Record<HudFamily, FlatRenderer>`. The compiler refuses a family without a flat
  renderer. A family may be `flat-only` in the scene map (shown flat in every mode, an explicit exception
  to world.md §6 rule 1 decided per family by an owner, Feedback AF9), never scene-only.
- **One DOM** (PROPOSAL, to agree with `ux-designer` UX-12): the flat HUD *is* the accessible mirror of
  tech.md §5.3. When the Flat HUD setting is off, the same DOM is visually hidden (the `sr-only` pattern:
  1 px clip, still read by screen readers); when on, it is shown as plates. One module, one set of tests,
  no drift between what a screen reader hears and what the flat HUD shows.
- `flathud.ts` (pure) turns `HudItem[]` into a tree `{ tag, attrs, text, children }`; the glue builds the
  DOM with `replaceChildren` on change only (keyed by `family:key`), so a polite live region does not
  re-announce unchanged items. Announcements per family: `edge-danger`, `intents`, `turn` and `log`
  are polite live regions; the rest is static and read on demand (PROPOSAL, wording `ux-designer`).

### 5.2 Layout (flat HUD on)

- Plates bolted on the frame, ui.md look (`--panel`, `--edge`, IBM Plex Sans, sizes in rem, nothing
  under 0.8125rem, FINAL ui.md §3). Order of plates (PROPOSAL): left column top to bottom: turn and
  frieze, own vitals, resource, slots and cooldowns, consumables and Preparations; right column: threats
  (Edge danger, intents, tells), rout, boss, board rules; bottom: selected unit, log.
- **No plate over a cell** (FINAL, ui.md §4): the plates use the bands beside the board; when the band is
  too narrow (phone held upright, `ux-designer` layout), the threats plate stays and the other plates
  fold into a drawer with one button "Details" (PROPOSAL), opened by tap or `Tab` and closed by `Esc`.
- **UI scale** multiplies the root font size: `html { font-size: calc(100% * var(--ui-scale)) }`
  (PROPOSAL). At 200 % on 1280 × 720 the plates scroll inside their band, never over the board.

### 5.3 Defaults

- Wide screens: Flat HUD off (world.md §6 rule 1, FINAL: diegetic first), the DOM present and hidden.
- Under 768 CSS px wide (the `tierFromHints` width threshold, FINAL in `quality.ts`): the engraved action
  bar is flat by default (`ux-designer` UX-17), the rest follows the setting (PROPOSAL).
- R1: the plan's R1 has no engraved bar yet (`ux-designer` Q3 asks for a flat-bar-only R1). Whatever is
  decided, the parity types exist from R1, so R2's engraved bar cannot ship without its flat twin.

### 5.4 World and windows (R4 to R6)

- **World flat panel** (PROPOSAL): current tile (biome, level band, content), the 6 neighbouring tiles'
  content with glyph and word, packs within 3 tiles with tier, aggro radius and patrol, the planned path
  with its time, zone % discovered (§4.2), Beacons known. Same model and parity rules (`WorldHudFamily`).
- **Windows** (§24.5: hero sheet, inventory, Paths, active tree, journal, map, merchant, crafting) are DOM
  already (`ux-designer` 9.1 window shell): they need no flat twin, only the palette tokens and UI scale.

### 5.5 Tests

- Unit `flathud.test.ts`. Given a model with an intent "Brute → Cleave → your Fragment 3", Then the tree
  has one `li` in the `intents` list with the glyph label and the text. Given the same model twice, Then
  `diff` returns no change (no re-announce). Given Edge danger `could` east on the own hero, Then the
  `edge-danger` region text matches `ux-designer`'s string.
- Type test (compile): removing a key from `FLAT_RENDERERS` fails `tsc` (a `// @ts-expect-error` fixture
  in the test file proves it).
- E2E `flat-hud.spec.ts` (R1). Given the R1 fixture and Flat HUD on, Then every family of the model has a
  visible element `[data-hud-family=…]`, the hero HP text equals `body[data-hero-hp]`, and
  `phone-layout.spec.ts`'s cell-overlap check passes at 1280 × 720, 390 × 844, and at UI scale 200 %.
  Given Flat HUD off, Then the same elements exist, are not visible, and are in the accessibility tree
  (`getByRole` finds them). Screenshots of both states in the PR.

### 5.6 Dependencies and risks

- `ux-designer`: `hudModel`, wording, the layout of bands and the drawer, keyboard focus; agreement that
  the mirror and the flat HUD are one DOM.
- `combat-engineer`: the `CombatView` fields (counters, boss thresholds, tells with turns left).
- `world-designer`: the world view fields (tile content, packs, aggro).
- `graphics-technical-artist`: `SCENE_RENDERERS` keys for the diegetic families.
- Risk: the flat HUD on a phone is dense; the drawer keeps threats always visible, the rest one tap away.

---

## 6. Per-phase coverage of the plan (what each R phase must ship for accessibility)

| Phase (§25) | Accessibility content | Tag |
|---|---|---|
| R0 | This file merged into world.md §8, ui.md §2 and §7, tech.md §5.1 deltas | PROPOSAL |
| R1 | settings store; standard tokens and contrast tests; R1 families in `redundancy.ts`; clear-board lists; motion catalogue for R1 kinds; flash analyser and R1 e2e; flat HUD parity for R1 families | PROPOSAL |
| R2 | colourblind and high-contrast palettes; terrain, status, element families; Mage and Healer flash cases; reduced variants for teleports, slides, swaps; flat HUD for statuses, tells, board rules | PROPOSAL |
| R3 | first-launch accessibility line before character creation; settings reachable from the title | PROPOSAL |
| R4 | world map: exploration fog under clear board, tier glyphs and ramp, unfold and world camera reduced variants, biome surface contrast test (3 biomes), world flat panel | PROPOSAL |
| R5 | rarity family, loot beams | PROPOSAL |
| R6 | quest marker family | PROPOSAL |
| R8 | boss phases flat, multi-tile camera reduced, party seat glyphs | PROPOSAL |
| R9 | remaining 9 cell types, 7 biomes, Le Puits darkness rule, night and weather, R9 class motions (Paradoxe, Rotation, Retour) | PROPOSAL |
| R10 | perspective rule in PvP, seat glyphs for 6, emotes and pings, BR radius 8 legibility | PROPOSAL |

---

## Feedback on the gameplay spec

Contradictions and gaps found for accessibility. The plan is not modified; each item needs an answer
from `lead-game-designer` or an owner, in #313 or a follow-up Decision. Where a sibling role raised the
same point, it is named.

- **AF1. Monster tier colours fail colour vision and the palette (§4.4).** Grey, green, yellow, orange,
  red: green and red are 0.026 apart in OKLab for deuteranopia (computed with sample values), orange and
  red 0.058 for protanopia; red is reserved for danger (ui.md §2, FINAL) and saturated colours are out of
  the palette (world.md §5, FINAL). Only the grey and red thresholds are given; green, yellow and orange
  bounds are missing (also `ux-designer` F3). Proposed: the ramp of section 1.3 and a glyph per tier.
- **AF2. Rarity colours are not specified (§12, §5.3).** The plan requires "une couleur et un glyphe" but
  names neither, while §5.3 names Champion "bleu" and Elite "jaune". The usual Magic blue and Unique violet
  are 0.022 apart for deuteranopia. Needs the palette extension decision (`art-audio`) and the glyph list.
- **AF3. Biome palettes versus tells and glyphs (§2, §5.2).** "Each biome adds its palette within the
  frame" does not say what is fixed. Bone-white tells (art.md, FINAL) reach 1.27:1 on white ice (Toundra)
  and 1.97:1 on lava (Caldeira). Proposed: dual-tone glyphs and a per-biome surface test (section 1.2).
- **AF4. Darkness as a rule (§5.2 Le Puits, §4.8 night).** "Obscurité: portée −1" and the night's stat
  bonus are rules; drawing them as darker cells conflicts with world.md §5 "cells and marbles must stay
  legible in every lighting state" (FINAL). Proposed: a rule glyph on the board rules line, the cells
  stay lit (section 3.1).
- **AF5. Exploration fog versus clear-board fog (§4.2).** The plan uses "brouillard" for unseen tiles,
  world.md uses "fog" for atmosphere that clear board removes. Removing the exploration fog would reveal
  the map. Proposed: two words in the English spec ("unexplored" for tiles, "haze" for atmosphere), and
  clear board keeps the first (section 3.1).
- **AF6. No glyph rule for statuses, keywords and element states (§6.11, §8.5, §5.1 Water).** §5.1 makes a
  glyph mandatory per cell type only. Statuses, Unmovable, Unejectable, Lassitude, category immunities,
  Burnt, Frozen, Charged, Wet have none, and three frost meanings (Ice cell, Frozen status, Frozen state)
  and three fire meanings risk one shape (also `ux-designer` F7). Proposed: section 1.1 families and the
  cross-family collision test of 1.2.
- **AF7. "En mouvement réduit, on n'anime qu'un seul plan" is ambiguous (§4.5).** Read here as one
  cross-fade (also `ux-designer` F12, `graphics-technical-artist` G2). And the plan gives no reduced
  variant for the many board-wide motions it adds: crumble (§6.6), ice slides (§5.1), teleports and jumps
  (§8.3, §8.5), Retour and Paradoxe (§8.7), Rotation (§8.8), the multi-tile camera (§4.6), the world step
  (§4.2). Proposed: the catalogue of section 4.2.
- **AF8. Photosensitivity is absent from the plan.** It adds many flash sources (section 2.3: lightning,
  meteor, explosions, light heals, lava, weather lightning, loot beams, pings) without a word on world.md
  §8. world.md §11 Q2 ("safe mode on by default: confirm") is still open; the RPG makes the answer more
  important. Proposed: on by default, the rules of section 2.1.
- **AF9. Flat version only for the action bar (§24.5).** world.md §6 rule 8 (FINAL) requires a flat
  fallback for all game-critical diegetic info: resources, cooldowns, slots, frieze, rout tallies,
  intents, tells, Edge danger, statuses, boss phases. The plan names only the bar. Also, several RPG items
  have no diegetic home at all (combat log, inspect panel, board rules), which conflicts with world.md §6
  rule 1 ("no flat overlay for game-critical info while a match runs"). Proposed: section 5.1 parity, and
  an owner decides which families are flat-only.
- **AF10. Camps in group play and PvP (§6.2, §19, §20).** world.md §5 gives glyphs to battle royale seats
  only. In a party (4 players and 4 packs), in 2v2 arenas and in duels, several players own glass
  marbles; the plan does not say how a player tells own, ally and enemy apart without colour (also
  `ux-designer` F19). Proposed: the perspective rule and seat glyphs (section 1.4).
- **AF11. Clear board as a tier (tech.md §5.1) versus a setting (#277).** Not a plan issue but it touches
  §24.5: tech.md lists clear board as a tier, the code (`quality.ts`) and ui.md treat it as a setting that
  stacks on a tier. The RPG adds world-map layers; the spec should say "setting" everywhere.
- **AF12. Isolation and Formation shown how (§6.5).** The "deterministic critical" (+25 %) invites a red
  highlight; Formation (−10 % per ally) has no visual at all. Both must be glyphs or numbers in the
  preview, not colour.
- **AF13. Hard time limits (§6.1, §19, §20, §4.4, §4.2).** PvP placement lasts 20 s, the PvP turn timer is
  60 s (a reminder), battle royale orders are timed, and the world is real time: packs patrol and an
  ambush engages "if the ball enters the aggro radius". WCAG 2.2.1 asks that time limits be adjustable
  where possible. PvP cannot extend them, but solo PvE can: proposed, the world map pauses (packs stop)
  while a window or the settings menu is open in solo (needs `world-designer`, `network-engineer` for
  parties).
- **AF14. Keys are not remappable (§24.5).** world.md §8 (FINAL) requires remappable inputs; the plan
  fixes 1 to 4, R, F, Space, Q W E A S D without saying they can be remapped (keyboard is `ux-designer`'s,
  noted here for the motor-accessibility side).
- **AF15. Emotes and pings (§1 pillar 5, §21).** "4 emotes and pings" need a glyph and a label each (a
  screen reader must hear them) and a rate limit so a ping cannot become a strobe in another player's
  view. Not specified.
- **AF16. Edge danger must be steady (§6.6).** The plan describes the glyph but not its animation; the
  usual "blinking warning" would break world.md §8. Proposed: steady, fade-in once (section 1.2).
- **AF17. Weight changes are hard to see (§6.4, §6.11, §8).** Base Weight, temporary plus and minus
  (Alourdi, Allégé, Slope, Bélier, Cri de guerre, Croc-en-jambe, Titan) all change the pips; colour alone
  would be the easy way. Needs a shape rule (outlined pip for temporary, `ux-designer` 1.1) and the
  numbers in the flat HUD.
- **AF18. Battle royale legibility (§6.8, §20).** Radius 8 (217 cells, derived) with 60 marbles at 720p
  leaves about 30 CSS px per cell (TUNE estimate); a 14 px glyph at UI scale 200 % does not fit.
  Needs a zoom rule rather than smaller glyphs (section 1.2).
- **AF19. The horror slider is not mapped to RPG content (§5.2, §8.6, §11).** Abominations, Vitrified
  bodies, Revenants, Corpse explosion, Hardcore death: the slider (world.md §8, FINAL) never changes
  information, but the plan does not say which RPG visuals it tones down. Out of this role's five
  topics; flagged for `art-audio`.

## Open questions

1. Q1. Safe mode on by default for every new player (world.md §11 Q2), with the stricter per-block rule
   of section 2.1?
2. Q2. Is the single colourblind-safe tier ramp (section 1.3) acceptable instead of the plan's grey,
   green, yellow, orange, red names?
3. Q3. The perspective rule (own camp always glass, opposing camp always shell): accepted for PvP, and
   what does a spectator see?
4. Q4. Which HUD families may be flat-only during a match (combat log, inspect panel, board rules), as an
   explicit exception to world.md §6 rule 1?
5. Q5. Is the flat HUD the same DOM as the screen-reader mirror (visually hidden when off), as proposed?
6. Q6. The motion setting has three states (System, On, Off): may a player override the OS setting
   upwards (full motion while the OS asks for reduced)?
7. Q7. Does tech.md's "a safe-mode switch … forces both" mean safe mode also forces reduced motion? This
   file keeps them separate.
8. Q8. In solo, does opening a window or the settings pause the world (packs stop patrolling)?
9. Q9. Who owns colourblind playtests and how many testers per deficiency before the palettes ship?
10. Q10. Do settings travel with an exported save (`savegame.ts` export), or stay per browser only?

## Tasks

One Task = one PR, from an up-to-date `main`, strict TDD (test commit first), 100 % coverage of the pure
modules, Playwright e2e for anything a player sees, and a screenshot in every UI PR (CONTRIBUTING §6.4).
Phases from §25. Task ids are local to this file (A11Y-nn).

### A11Y-01 Spec: RPG accessibility delta for world.md, ui.md and tech.md (R0)
Outcome: world.md §8, ui.md §2 and §7 and tech.md §5.1 describe the RPG accessibility rules of this file,
with the feedback items answered.
- [ ] world.md §8: redundancy families, photosensitivity rules 2.1, clear-board lists 3.1, reduced-motion
      catalogue 4.2 (summary), flat HUD parity 5.1
- [ ] ui.md §2 and §7: new tokens with their contrast rows
- [ ] tech.md §5.1: clear board as a setting, safe mode wording (Q7)
- [ ] Feedback AF1 to AF19 each answered or linked to an issue
- [ ] Docs-only PR, read by @TidyMaze

### A11Y-02 Accessibility settings store and menu rows (R1)
Outcome: Safe mode, Reduced motion, Flat HUD and UI scale join Clear board in the settings menu, survive a
reload, and set their `data-*` attributes on `<html>`.
- [ ] `a11y/settings.ts` pure, tests of section 0.3 first
- [ ] `main.ts` reads reduced motion only through `effectiveReducedMotion`
- [ ] menu rows with `aria-pressed`, existing Clear board and Sound rows unchanged
- [ ] e2e `a11y-settings.spec.ts`; `clear-board.spec.ts` still green; screenshot of the menu

### A11Y-03 Contrast and colour-vision checker with the standard RPG tokens (R1)
Outcome: every R1 token (camp, HP, shield, tell, glyph outline) is defined once, used by the page and the
scene, and checked for contrast and colourblind distance in tests.
- [ ] `a11y/contrast.ts`, `a11y/cvd.ts`, `a11y/palettes.ts` (standard only), tests first
- [ ] parity test between `ui.css` defaults and `PALETTES.standard`
- [ ] ui.md §7 rows for the new tokens
- [ ] screenshot of the R1 fight in the standard palette

### A11Y-04 Redundancy integrity for the R1 families (R1)
Outcome: camp, unit kind, threat, HP and Weight meanings each have a glyph and a label, enforced by a test
that reads the glyph catalog.
- [ ] `a11y/redundancy.ts` with the R1 families, checks 1 to 3 of section 1.1
- [ ] HP arc keeps one colour (no ramp), low-HP notch glyph
- [ ] dual-tone glyph contrast rule test on the R1 surfaces

### A11Y-05 Clear-board lists for RPG fights (R1)
Outcome: clear board removes haze, post effects, flicker and particles in an RPG fight and keeps every
layer that carries information, proven by layer counts.
- [ ] `a11y/clearboard.ts` typed on the render layer registry, guard tests
- [ ] `__layers()` debug hook (with `graphics-technical-artist`)
- [ ] e2e `clear-board-rpg.spec.ts`, screenshots on and off

### A11Y-06 Reduced-motion catalogue for the R1 animations (R1)
Outcome: move, push, Shock, crumble, ejection and damage numbers have a reduced variant chosen from one
catalogue, and the motion setting can override the OS.
- [ ] `a11y/motion.ts` typed on the timeline kinds, property test "no travel in reduced"
- [ ] crumble 200 ms fade, numbers in place
- [ ] e2e `reduced-motion-rpg.spec.ts` with `emulateMedia` and the setting override

### A11Y-07 Flash analyser and safe mode for R1 (R1)
Outcome: an analyser proves that the R1 fight (Shock, crumble, hero ejection, end banner) never breaks the
3-flashes rule, in safe mode and out of it.
- [ ] `a11y/flashcheck.ts` with the unit cases of 2.4 first
- [ ] `LumaTrack` envelopes on the R1 VFX tracks (with `graphics-technical-artist`)
- [ ] virtual clock and `__lumaGrid` hooks (debug only, with `client-engineer`)
- [ ] e2e `photosafe.spec.ts` R1 sequence; safe mode on at first launch

### A11Y-08 Flat HUD parity for the R1 families (R1)
Outcome: with Flat HUD on, every R1 combat fact (turn, vitals, Rage, slots, cooldowns, rout, Edge danger,
intents) is readable on plates beside the board, and the same DOM is the screen-reader mirror when off.
- [ ] `a11y/flathud.ts` pure, `FLAT_RENDERERS` typed on `HudFamily`, compile-time parity fixture
- [ ] one DOM, `sr-only` when off, live regions per family
- [ ] e2e `flat-hud.spec.ts` at 1280 × 720, 390 × 844 and UI scale 200 %; screenshots

### A11Y-09 Colourblind and high-contrast palettes (R2)
Outcome: the Colours setting switches between Standard, Protan, Deutan, Tritan and High contrast for the
page and the scene, every palette passing its contrast and distance checks.
- [ ] overrides in `palettes.ts`, checks 1 and 2 of section 1.3 per palette
- [ ] materials and CSS read the active palette
- [ ] classic hot-seat and boss boards covered too
- [ ] e2e `a11y-palette.spec.ts`, one screenshot per palette

### A11Y-10 Terrain, status and element redundancy (R2)
Outcome: the six R2 cell types, the §6.11 statuses and keywords and the element states each have a unique
glyph and label, with no cross-family shape collision.
- [ ] families `terrain`, `status`, `element` in `redundancy.ts`, integrity over `data/`
- [ ] collision test (frost, fire)
- [ ] dual-tone contrast test on the R2 terrain surfaces

### A11Y-11 Reduced motion and flash safety for the R2 classes and terrain (R2)
Outcome: teleports, swaps, ice slides, pulls, terrain changes, Chain lightning, Meteor and light heals have
reduced variants with path trails and pass the flash analyser.
- [ ] catalogue entries and trail layer
- [ ] envelope property test over the four R2 class kits
- [ ] e2e "mage-chain" in safe mode and out of it

### A11Y-12 Flat HUD for statuses, tells, Preparations and board rules (R2)
Outcome: every R2 diegetic fact, including the engraved action bar's state, has its flat twin, and the
drawer keeps threats visible on a phone.
- [ ] families `tells`, `preparations`, `selected`, `board-rules`, `anti-stall`
- [ ] engraved bar parity with `ux-designer` UX-17
- [ ] phone drawer e2e, screenshots

### A11Y-13 Accessibility first at the title screen (R3)
Outcome: a new player meets the settings before character creation and the tutorial, with safe mode on.
- [ ] first-launch line next to the cog until the menu is opened once
- [ ] e2e: fresh storage shows the line, opening the menu hides it for good

### A11Y-14 World map accessibility (R4)
Outcome: on the world map, unexplored tiles stay visible under clear board, monster tiers read by glyph
and a colourblind-safe ramp, the unfold and the camera respect reduced motion, and a flat world panel
lists what is around the hero.
- [ ] `tier` family and ramp; biome surface contrast test for the 3 R4 biomes
- [ ] world layers in the clear-board lists; reduced unfold, step and camera cut
- [ ] world flat panel (`WorldHudFamily` parity)
- [ ] e2e walk, engage, map under clear board and reduced motion; screenshots

### A11Y-15 Rarity and loot accessibility (R5)
Outcome: item rarity reads by glyph and label in every palette, and loot beams pass the flash analyser.
- [ ] `rarity` family including Champion and Elite; distance check 0.06
- [ ] loot beam envelopes, safe-mode variant
- [ ] screenshot of an inventory in two palettes

### A11Y-16 Quest marker states (R6)
Outcome: available, in progress, ready, daily and bounty markers differ by shape, not colour.
- [ ] `quest` family and integrity over the quest data
- [ ] e2e marker states on the map and in the flat world panel

### A11Y-17 Boss fights and multi-tile boards (R8)
Outcome: boss phases by HP %, enrage and boss tells are flat-readable, the multi-tile camera cuts in
reduced motion, and party seats have glyphs.
- [ ] `boss` family flat parity; tell surfaces in each boss arena checked
- [ ] overview and zoom as cuts; seam layer kept under clear board
- [ ] party subset of the `seat` family; e2e on the Hull fixture

### A11Y-18 Remaining cells, biomes and R9 classes (R9)
Outcome: all 15 cell types, the 10 biomes (with Le Puits darkness as a rule glyph, night and weather) and
the R9 class motions (Retour, Paradoxe, Rotation) meet the glyph, contrast, motion and flash rules.
- [ ] terrain family complete; surface tests for 10 biomes
- [ ] reduced variants for Paradoxe and Rotation; envelopes for the R9 kits
- [ ] night and darkness as rule glyphs, never darker cells

### A11Y-19 Multiplayer readability (R10)
Outcome: in parties, arenas and the battle royale each player tells own, ally and enemy marbles apart by
shape, emotes and pings are labelled and rate-limited, and radius 8 stays legible at 720p.
- [ ] perspective rule and 6 seat glyphs; spectator view per Q3
- [ ] `social` family, ping rate limit and safe-mode ring
- [ ] glyph size cap and zoom rule on radius 8; e2e two tabs, screenshots
