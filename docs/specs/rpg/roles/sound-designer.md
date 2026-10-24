# Procedural sound of the RPG: implementation spec (role `sound-designer`)

Status: role draft v0, PROPOSAL. Written for the RPG pivot (Decision #313, still open). Spec only, no
code: strict TDD applies from R1 (CONTRIBUTING section 11). Source of truth: the validated French
gameplay spec (`docs/specs/rpg/plan.fr.md`, same text as the approved plan). Section numbers like
"§6.4" point to that gameplay spec. Sections of the existing specs are written with their file name
("world.md §7", "tech.md §5.4"). This file adds no game rule: it says how every rule the player
can hear is made audible, with procedural Web Audio and no audio file. What is missing or
contradictory in the gameplay spec is listed in section 21, never fixed here.

**Tags**, as in `rules.md`: **FINAL** (decided), **TUNE** (start value, set by listening tests and
playtests), **PROPOSAL** (proposed here, an owner confirms). Every number carries one. A number
copied from the gameplay spec keeps its tag there (the gameplay spec says "everything is PROPOSAL
and every number is TUNE unless stated"). A number copied from an existing spec keeps that spec's
status: world.md §7 and tech.md §5.4 are merged specs, so their rules are written FINAL here.
Section numbers, issue numbers, cue ids, example coordinates and example test values are references,
not tuning numbers, and carry no tag. Every frequency, gain and duration in this file is TUNE unless
written otherwise: the ear decides, not the spec.

**Role slugs** follow the roster of `lead-game-designer.md` section 2.

| Slug | What this file needs from it |
|---|---|
| `sound-designer` (this file) | Owns `client/src/audio/`, `data/audio/`, every cue, ambience bed and music stem. Alias `audio-designer`, the sound half of `art-audio` |
| `art-audio` | The visual twin of each cue (glyph, rim light, notch): world.md §7 FINAL says every cue has one |
| `combat-engineer` | The `Effect` list of `abalone-rpg` (gameplay-programmer.md §4.3), `CombatView`, `edge_danger` |
| `client-engineer` | The effects timeline (start and duration per effect), scenes, settings DOM, IndexedDB, Playwright |
| `ux-designer` | The combat log lines (the twin of every cue for muted players), Edge danger display, timers, captions |
| `class-designer` | The `element` tag and optional `sound` override on each ability |
| `progression-designer` | XP, level-up, talent and respec events (§9 to §11) |
| `world-designer` | Biome ids, tile content, the world clock (§4.8), the unfold transition timing |
| `encounter-boss-designer` | Monster archetype and family ids, intentions, boss phases and tells |
| `narrative-quest-designer` | Quest events, audio log transcripts and their timing (#21) |
| `economy-designer` | Rarity ids, gathering professions, stations, consumables |
| `network-engineer` | Which entity is "me" and which camp each peer is in; emotes and pings messages |
| `pvp-br-designer` | Timers, breach rings and chests of the battle royale |
| `technical-designer` | The `data/` conventions, the content hash, integrity test harness |
| `tech-lead` | Bundle and CPU budget, the rule that audio never feeds the engine (tech.md §5.2) |
| `qa-balance` | Listening tests and playtest notes on fatigue, loudness, clarity |

---

## 1. Scope

In scope:
- the audio engine of the client: bus graph, mixer, voice scheduler, synth player (generalizes
  `client/src/sound.ts`);
- the **cue map**: a pure function from the engine's `Effects` to timed cues (tech.md §5.4 FINAL:
  "Cue selection is a pure map from `Effects`");
- the sound of combat: moves, weighted pushes, Shock, damage types and elements, deaths, ejections,
  the hero, Revenants, rout, flee, anti-stall, victory and defeat (§6);
- the sound of the 80 abilities and 16 ultimates of the 8 launch classes, their resources (§8);
- the sound of the statuses, keywords and Mage reactions (§6.11, §8.5);
- the sound of the 16 cell types (§5.1) and their tells;
- the ambience beds of the 10 biomes and the hub, the world movement and the tile-to-board
  transition (§4, §5.2, §21);
- the adaptive music: exploration, threat, combat tension, boss phases, victory, defeat, hub (§3,
  §18, world.md §7);
- the sound of the out-of-combat loops: loot, merchants, gathering, crafting, quests, progression
  (§11 to §16);
- social and multiplayer sound: party perspective, emotes, pings, PvP timers, battle royale (§4.7,
  §19 to §21);
- the mix settings and the audio accessibility rules (world.md §7, §8).

Out of scope (other roles): every visual twin (`art-audio`, `ux-designer`), the text of the combat
log and captions (`ux-designer`), the audio log recordings and transcripts (`narrative-quest-designer`,
#21), the effects timeline itself (`client-engineer`), any engine rule (`combat-engineer`).

Non-goals (FINAL, from existing specs): no audio file for a sound a synth can make (art.md §2, world.md
§7), no melodic loop (world.md §7), no voice acting (art.md §1 "Voice"), no audio library at first
(tech.md §5.4), audio never feeds the engine (tech.md §5.2).

## 2. Inputs read

- Gameplay spec, all of it (§0 to §26 and the verification list).
- `SPEC.md` §4 phase 5, §5 (art and audio direction: heavy low-frequency sound, decompression).
- `docs/specs/world.md` §1, §5, §6, §7 (audio direction), §8 (accessibility), §9 (references).
- `docs/specs/tech.md` §5.2 (effects timeline boundaries), §5.4 (audio), §5.5 (performance,
  background tabs), §9 (asset budget), tech radar rows on Web Audio.
- `docs/specs/art.md` §1 (sound and voice lines), §2 (made by: procedural first; sound row).
- `docs/specs/ui.md` §4 (settings menu: Clear board, then Sound, #284).
- `docs/specs/game-design.md` (pillars, boss grid §3.3, §7), `rules.md` (§5, §10), `boss-balance.md`.
- `CONTRIBUTING.md` (sections 1, 5, 6.4, 11, 13), `AGENTS.md`.
- Code: `client/src/sound.ts` and `sound.test.ts` (the ejection: data voices, `Sfx` wrapper, fake
  context tests), `client/src/eject.ts` (`PUSH_MS` 200, `VOID_MS` 600), `client/src/settings.ts`,
  `client/src/quality.ts` (`readSound`, `writeSound`), `client/src/main.ts` (unlock on first
  gesture, `data-sound`, `window.__audio`), `client/src/choir.ts`, `client/e2e/sound.spec.ts`.
- Sibling role drafts: `gameplay-programmer.md` §4.3 (the `Effect` enum), `ux-designer.md` A.2,
  §6.1 to §6.3 (Edge danger tick, timers, combat log), `combat-designer.md` (`element` on
  `AbilityDef`), `technical-designer.md` (data conventions), `lead-game-designer.md` (role roster).

## 3. The sonic grammar (rules every cue follows)

These rules come from world.md §7 and art.md §1 (FINAL there) and are extended to the RPG here
(PROPOSAL). Every task below is checked against them.

1. **Weight first** (FINAL, world.md §7). The heavier the thing that moves, the lower and longer the
   sound. In the RPG, Weight (§6.4) is a number: it drives pitch (section 5.2).
2. **Silence is a tool** (FINAL, world.md §7). Dead air before a boss phase change, vacuum silence
   during an ejection, near silence in Le Puits.
3. **No melodic loop** (FINAL, world.md §7). Drones, textures, pulses. A short stinger (a chord, a
   toll, a swell) is not a loop and is allowed (PROPOSAL reading of the rule).
4. **Every cue has a visual twin** (FINAL, world.md §7). The game is fully playable on mute. Each
   cue in this file names its twin; the twin is owned by `art-audio` or `ux-designer`.
5. **Glass and shell** (FINAL, world.md §7, generalized PROPOSAL). The listener's camp is glass
   (rings, tolls, pure partials). Opposing camps are shell (dry clacks, chitin, no tail). Section
   5.4 defines "listener's camp" for parties.
6. **Science-fantasy colour** (PROPOSAL, §2). Slag-glass powers sound like resonant glass excited by
   something: heat (crackle), time (tape glide), stone (grind), the dead (whispered noise). Every
   lineage has one exciter (section 6.1).
7. **Readable over pretty** (PROPOSAL, pillar 2 §1). A cue must say *what* happened in under 300 ms
   (TUNE). Tails may ring longer but never mask the next cue's attack.
8. **Pure presentation** (FINAL, tech.md §5.2). Audio reads `Effects` and the view, never writes to
   the engine; its randomness uses a client RNG, never the engine RNG.

---

## 4. Audio architecture (§24.1, §24.5; tech.md §5.4)

### 4.1 Modules and files

All new client code lives in `client/src/audio/` (PROPOSAL). The existing `client/src/sound.ts`
becomes `audio/synth.ts` + `audio/patches` data; its tests move with it, unchanged in meaning.

| File | Pure? | Role |
|---|---|---|
| `audio/synth.ts` | yes (data) + thin player | `Voice`, `Envelope`, `Filter`, `Patch` types; `playPatch(graph, patch, params, at)` builds nodes. Today's `ejectionVoices` and `Sfx.play` generalized |
| `audio/graph.ts` | no (Web Audio) | `AudioGraph`: master, limiter, buses `music`, `ambience`, `fx`, `ui`, `voice`, duck node; made on the first gesture (today's `Sfx.unlock`) |
| `audio/mixer.ts` | yes | Slider values to gains (dB curve), mute, mono, persistence keys; migrates the old `Sound` toggle |
| `audio/cues.ts` | yes | Loads and validates `data/audio/cues.json`; `CueId` type generated from the data |
| `audio/cuemap.ts` | yes | `cuesFor(effects, slots, listener) -> CueEvent[]`: the heart of combat sound |
| `audio/scheduler.ts` | yes (logic) | Voice cap, priority, merge window, per-cue instance cap, seeded variation |
| `audio/rng.ts` | yes | `mulberry32` + `fnv1a` seeding from `(combat seed, effect index, cue index)` |
| `audio/tension.ts` | yes | `tension(view, me) -> 0..100` for the combat music |
| `audio/music.ts` | logic pure, player thin | Music state machine and procedural stems |
| `audio/ambience.ts` | logic pure, player thin | Biome beds, sparse event scheduler, positional sources |
| `audio/world.ts` | yes | Cue map for world events (steps, unfold, engage, loot, quests, gathering…) |
| `audio/debug.ts` | yes | What `window.__audio()` returns and the `data-cues` attribute (e2e contract) |

The engine side needs nothing new: the `Effect` list (gameplay-programmer.md §4.3) carries every
fact a cue needs. If a cue needs a fact that is not in an `Effect`, it is a request to
`combat-engineer`, listed in Dependencies, never a diff of two states (tech.md §3 FINAL).

### 4.2 The bus graph (tech.md §5.4 FINAL, extended)

```
voices ─┬─> fx ───────┐
        ├─> ui ───────┤
        ├─> voice ────┼─> master ─> limiter (DynamicsCompressor) ─> destination
music ──┴─> duck ─────┤
ambience ─> duck ─────┘
```

- Five buses (PROPOSAL): tech.md lists four (`music`, `ambience`, `fx`, `voice`); this adds `ui`
  (clicks, coins, menu) so a player can lower menu sounds without losing combat sounds. The `ui`
  slider is folded into `fx` in the settings if owners keep four sliders (open question Q3).
- Limiter: threshold −6 dBFS, knee 6, ratio 12, attack 3 ms, release 250 ms (all TUNE).
- Duck: music and ambience go −9 dB (TUNE) under an audio log (tech.md §5.4 FINAL: "a duck node that
  lowers music and ambience under audio logs") and −4 dB (TUNE) for 600 ms (TUNE) under an ultimate
  or a hero death cue.
- Mono switch (PROPOSAL, accessibility): a `ChannelMergerNode` folds the master to mono.

### 4.3 Patch data format (`data/audio/cues.json`, pillar 6 §1: content is data)

The voice model of `sound.ts` is kept, as JSON. One cue = one patch = a list of voices plus routing.

```json
{
  "version": 1,
  "cues": {
    "push.knock": {
      "bus": "fx", "priority": 3, "max_instances": 4, "twin": "move.ghost_settle",
      "voices": [
        { "source": "sine", "freq": [180, 90], "env": [[0, 0], [0.004, 0.7], [0.12, 0]] },
        { "source": "noise", "filter": { "type": "lowpass", "freq": [700, 300], "q": 0.8 },
          "env": [[0, 0], [0.003, 0.5], [0.06, 0]] }
      ]
    }
  }
}
```

- `source`: `noise`, `sine`, `triangle`, `square`, `sawtooth` (PROPOSAL: the last two are new, for
  Lightning buzz and Rage growls). `freq` glides exponentially, `env` points are `[seconds, gain]`,
  ramped in turn, silent at both ends (today's rules, kept FINAL by the existing tests).
- New optional voice fields (PROPOSAL): `delay` (seconds before the voice starts, for grains),
  `grains` (`{ count, spread }`: repeat the voice `count` times spread over `spread` seconds with
  seeded jitter, for crumbles, sand, crackle), `pan` (−1..1 offset), `detune` (cents), `lfo`
  (`{ rate, depth, target: "gain" | "freq" }` for tremolo and wobble).
- Runtime params, set per event by the cue map: `pitch` (ratio applied to every frequency), `gain`
  (multiplier), `pan` (−1..1), `stretch` (time multiplier on every envelope point), `density` (for a
  merged event, scales `grains.count`).
- `twin`: the id of the visual twin, documentation that the integrity test checks is non-empty
  (world.md §7 FINAL).
- File split (PROPOSAL): `data/audio/cues.json` (one-shots), `data/audio/beds.json` (biome and hub
  ambience), `data/audio/music.json` (stems and states). The client imports them with Vite JSON
  import; the engine never loads them (audio is not a rule, so `include_str!` is not needed).

**Integrity test** (vitest, `audio/cues.test.ts`), one test per rule:
- every envelope starts and ends at 0, its times strictly increase, every gain is in [0, 1];
- every frequency is > 0 (an exponential glide needs a positive value);
- every `bus` exists; every `priority` is 0..9;
- every cue has a `twin`;
- every id referenced by `beds.json`, `music.json`, the ability data (`sound.cast`, `sound.impact`),
  the status table, the cell table, the biome table and the monster table exists in `cues.json`;
- the longest cue is under 4 s (TUNE), except the ones in an explicit `long` list (tolls, swells);
- no voice of a cue in `fx` has a frequency above 12 kHz (TUNE: harsh on cheap speakers).

### 4.4 The cue event and the cue map API

```ts
export interface CueEvent {
  cue: CueId;
  atMs: number;        // from the start of the timeline of this action
  pitch: number;       // 1 = as written
  gain: number;        // 1 = as written
  pan: number;         // -1 left .. 1 right, from the board position
  stretch: number;     // 1 = as written
  density: number;     // 1 = single event; n when n events merged
  priority: number;    // copied from the patch, raised by context (own hero)
  key: string;         // merge key: cue + unit or cell, for the scheduler
}

export interface Listener {
  me: EntityId;                         // the local player's entity
  campOf: (e: EntityId) => CampId;      // from the CombatView
  isHero: (u: UnitId) => boolean;
  panOf: (cell: Axial) => number;       // camera-relative, section 4.7
  biome: BiomeId;
}

export function cuesFor(effects: readonly Effect[], slots: readonly Slot[], l: Listener): CueEvent[];
// Slot = { startMs, durationMs } for effects[i], given by client-engineer's timeline (tech.md §5.2)
```

- `cuesFor` is pure and total: every `Effect` variant maps to zero or more cues by a table in
  section 5 (an unknown variant is a type error, so the TS `switch` is exhaustive).
- Live versus catch-up (existing rule, #232): a replayed or caught-up action calls nothing (`live`
  false), only the final music state is set.

### 4.5 Scheduler (voice budget and clarity)

`scheduler.ts` turns `CueEvent[]` into what plays. Pure part tested without Web Audio.

| Rule | Value | Tag |
|---|---|---|
| Concurrent voices (all buses) | 32 | TUNE |
| Instances of one cue at once | `max_instances` of the patch, default 4 | TUNE |
| Merge window: same `key` prefix (cue id) within | 30 ms | TUNE |
| Merged event | one event, `density` = count, `gain` × (1 + 0.15 × log2(count)) capped at 1.6 | TUNE |
| Over the cap | drop the lowest `priority`, then the oldest; never drop priority ≥ 8 | PROPOSAL |
| Lookahead (schedule on `AudioContext.currentTime`) | 100 ms | TUNE |
| Variation per event | pitch ×2^(±40 cents), gain ±1.5 dB, grains jitter ±20 % | TUNE |

Priorities (PROPOSAL): 9 own hero death, combat end; 8 ejection, ultimate, tell placed and tell
firing, Edge danger tick; 6 weighted push, Shock, Loss; 5 ability impact; 4 ability cast, status
applied; 3 plain move, terrain; 2 status end, resource; 1 UI, ambience events.

Why: a zone of 9 targets (Séisme, Brèche ring, Armée des morts) must not stack 9 full crumbles; the
merge keeps one readable event that sounds bigger (rule 7, section 3).

### 4.6 Determinism and the client RNG (§24.1; tech.md §5.2 FINAL)

- New audio code never calls `Math.random` (PROPOSAL; today's `whiteNoise` does, it moves to a
  seeded fill so tests are stable; noise colour is not audible as a pattern).
- Variation seed: `fnv1a(combatSeed, effectIndex, cueIndex)` into `mulberry32`. A replay of the
  same log sounds the same (nice for bug reports), and two peers hear the same variation.
- Ambience events: seed `fnv1a(tileSeed, floor(nowSec / 10))` so a bed is not a loop but tests can
  pin a seed.
- Audio never touches `Board`, `CombatState`, the state hash or the engine RNG (FINAL, tech.md §5.2).

### 4.7 Space: pan and position (world.md §7 FINAL: "positional in the hub, stereo on the board")

- Board: `pan = clamp(x_screen / (width / 2), −1, 1) × 0.6` (0.6 TUNE), equal-power `StereoPannerNode`.
  On a multi-tile board (§4.6) the pan follows the camera, so a cue in another region is panned
  and lowered by 6 dB (TUNE) when off-screen.
- World (PROPOSAL, extends world.md): packs, nodes, events and other players within 4 tiles (TUNE)
  use `StereoPannerNode` + distance gain `1 / (1 + d)`; HRTF `PannerNode` only in the hub (tech.md
  §5.4 FINAL), because HRTF costs more and the world view is top-down.

### 4.8 Lifecycle (tech.md §5.4, §5.5 FINAL)

- The context is made on the first click, touch or key, only while sound is on (today's `unlock`).
- Background tab (PROPOSAL): on `visibilitychange` hidden, master ramps to 0 in 200 ms, then the
  context is suspended after 1 s; on visible, resume and ramp back in 300 ms. No `setTimeout` for
  scheduling (tech.md §5.5 FINAL): all timing uses `AudioContext.currentTime`, and the ambience and
  music schedulers run from the render loop with lookahead.

### 4.9 Tests for the architecture

- Unit (vitest, fake `AudioContext` as in today's `sound.test.ts`): the graph has the five buses and
  the limiter; a slider sets the bus gain with `setTargetAtTime`; muting the master fades, never cuts
  (no click: time constant 7 ms, today's `TOGGLE_TAU`).
- **Given** sound off, **When** a gesture happens, **Then** no context exists (`__audio().state` is
  `none`), as today.
- **Given** the old key `sound=off` in local storage, **When** the mixer loads, **Then** master is
  muted and the four sliders keep their defaults (migration).
- **Given** two runs of `cuesFor` on the same effects and seed, **Then** equal output (determinism).
- e2e: existing `client/e2e/sound.spec.ts` stays green (classic ejection toll and clack unchanged:
  the Mess tables keep their sound, §21).

### 4.10 Risks

- Web Audio node count on phones: 32 voices of 2 to 4 nodes each is about 130 nodes; measured on a
  mid phone in SND-04 (risk: crackles). Fallback: cap 16 (TUNE) on `low` quality tier.
- Autoplay: Safari keeps contexts `suspended` after resume races; the existing `unlock` on every
  gesture covers it.
- Moving `sound.ts` may break `main.ts` imports used by other open PRs: done in one small PR (SND-01)
  with a re-export shim for one release (PROPOSAL).

---
## 5. Combat sound: the cue map (§6)

Every row reads one `Effect` variant of gameplay-programmer.md §4.3. "Twin" is the visual that
already carries the same fact (owner in brackets).

### 5.1 Turn structure (§6.2, §6.3)

| Effect | Cue | Rule | Twin |
|---|---|---|---|
| `TurnStarted` of `me` | `turn.mine` | Soft rim hum, 300 ms (TUNE), 70 Hz + 140 Hz sines | Rim lights in my colour (world.md §6.2) [art-audio] |
| `TurnStarted` of an ally entity (party) | `turn.ally` | Same hum, −9 dB (TUNE), panned to that player's hero | Frieze highlight [ux-designer] |
| `TurnStarted` of an opposing entity | none | Silence: the opposing camp's actions speak for themselves | Frieze |
| `TurnEnded` of `me` while my Mouvement is unspent and none is legal (passed) | `turn.pass` | A dry double tick | Log line "No legal move: pass" [ux-designer] |
| `Armed` (Préparation) | `prep.arm` | A low latch click, glass | Prep icon on the hero [ux-designer] |
| `PrepFired` | `prep.snap` + the ability's cast cue | Snap first (priority 8: the player did not choose this moment, §6.3 "sans demander l'avis") | Prep icon flashes once, steady glyph [art-audio] |
| `CooldownStarted` | none | Silence (would fire every turn) | Cooldown ring |
| Ultimate becomes castable (cost reached and CD 0, derived from view) | `ult.ready` | Once per readiness, a slow glass swell 900 ms | Ultimate slot lit on the frame |

- Turn pacing: an AI or remote turn plays its effects on the client timeline; the cue map never
  waits (the timeline is `client-engineer`'s).
- Dependencies: `combat-engineer` (`TurnStarted`, `Armed`, `PrepFired` in the Effects),
  `ux-designer` (frieze, prep icon), `client-engineer` (timeline slots).
- Tests:
  - **Given** effects `[TurnStarted{entity: me}]`, **When** `cuesFor`, **Then** exactly one
    `turn.mine` at `atMs` 0.
  - **Given** `[TurnStarted{entity: M1}]` with M1 an opposing pack, **Then** no cue.
  - **Given** an opposing `Mouvement` with `[Pushed…, PrepFired{entity: me, prep: guardian.interpose}]`,
    **Then** `prep.snap` comes before the cast cue and has priority 8.
- Risks: the turn hum every turn may tire the ear in 15 min boss fights; fallback −6 dB after the
  10th turn (TUNE).

### 5.2 Mouvement and weighted push (§6.4)

world.md §7 (FINAL): "dull glass-on-steel knock for a plain move, a grinding scrape for a sumito
push, pitch dropping with push size (1, 2, 3 marbles)". The RPG adds Weight.

**Rule (PROPOSAL, numbers TUNE):**
- Plain move (`Moved{how: Mouvement}` with no `Pushed` in the same action): `push.knock`, once per
  action, not per marble, with `pitch = 2^(−2(n−1)/12)` for a group of `n` marbles (a whole tone
  lower per extra marble).
- Push (`Pushed{n, m, weight_for, weight_against}`): `push.scrape`, with
  - `pitch = 2^(−2(n−1)/12) × 2^(−(weight_for − n)/12)`, clamped to [0.5, 1]: every point of Weight
    above 1 per marble lowers it a semitone;
  - `stretch = 1 + 0.12 × m` (a longer grind for a longer pushed file);
  - a strain overtone voice whose gain is `1 − (weight_for − weight_against − 1) / 4`, clamped
    [0, 1]: a narrow win (Weight 4 against 3) groans, a crushing one (Weight 9 against 2) slides.
- **Invariant (mirrors §6.4 FINAL proposed):** when every Weight is 1, `weight_for = n` and the
  pitch is exactly the classic one. Tested as a property (below).
- Percée and Avalanche (pushes at equal count, or with 4 marbles, §8.2): same `push.scrape`, plus
  the ability's own impact cue; Avalanche `n = 4` uses the formula as is (pitch 2^(−6/12)).
- Écrasement (§8.2, push against an obstacle, nothing moves): `push.crush` (scrape with no slide,
  ending on a hard stop), then the Damage cue.
- Blocked: `Blocked{at_edge: true}` (a non-Ejector stopped on the last cell, §6.10 rule 3):
  `push.edge_stop`, a hard brake knock plus a high glass creak (the player must hear "it almost
  went over").
- Illegal push attempt (UI, the preview refuses): `ui.deny`, dull short thunk, `ui` bus.
- Slide on Ice (`Slid{path}`): `terrain.ice_glide`, a filtered noise whose `stretch` is the path
  length × 120 ms (TUNE), ending in the usual stop knock.
- Dependencies: `combat-engineer` (`Pushed` carries `n`, `m`, both Weight sums including Slope and
  bonuses, §6.4 point 2), `ux-designer` (preview "2 contre 1 · Poids 4 contre 3" is the twin).
- Tests:
  - Property (fast-check style or a table over n ∈ 1..3, m ∈ 1..2): **Given** all Weights 1, **When**
    the pitch is computed, **Then** it equals the classic pitch for `n`.
  - **Given** `Pushed{n: 2, m: 1, weight_for: 4, weight_against: 3}`, **Then** `pitch` =
    2^(−2/12) × 2^(−2/12) ≈ 0.794 and the strain gain is 1 (narrow win).
  - **Given** `Pushed{n: 3, m: 2, weight_for: 3, weight_against: 2}` (classic 3 vs 2), **Then**
    `stretch` = 1.24 and pitch = 2^(−4/12).
  - **Given** `Blocked{at_edge: true}`, **Then** `push.edge_stop` with priority ≥ 6.
- Risks: pitch clamp at 0.5 makes Weight 5 groups all sound alike; acceptable (rare).

### 5.3 Damage, Shock, Guard, position modifiers (§6.5)

**Damage kind gives the body; the element tag gives the colour** (PROPOSAL):

| Kind (§6.5) | Body | Cue family |
|---|---|---|
| Physical | Lowpassed knock + falling sine, no ring | `hit.phys` |
| Magical | Bandpassed glass ring, Q 8 to 12, 250 ms tail | `hit.magic` |
| Pure | A dry sine click 1.2 kHz, no tail, nothing else | `hit.pure` |

| Element (§6.5 labels) | Colour layer added to the body | Cue |
|---|---|---|
| Fire | Crackle: 12 to 20 noise grains, bandpass 2 to 5 kHz, over 300 ms | `el.fire` |
| Frost | Crystalline tinkle: 3 high sines (3 to 6 kHz, inharmonic), plus a short crack | `el.frost` |
| Lightning | Sawtooth buzz burst 60 ms at 110 Hz, highpassed noise snap | `el.lightning` |
| Shadow | Reversed swell: noise rising 250 ms into the hit, lowpassed | `el.shadow` |
| Light | Bell partials 1, 2, 3 (harmonic, a clean chord, short) | `el.light` |
| Time | Tape glide: the body's pitch glides down an octave over 200 ms | `el.time` |

- `Damaged{kind, amount, absorbed, guard_capped}`: gain bucket by `amount / maxHP` of the target:
  under 5 % → 0.4, under 15 % → 0.6, under 30 % → 0.8, else 1.0 (TUNE). A fully absorbed hit
  (`amount = 0`, `absorbed > 0`) plays only `shield.absorb` (a glass ring, section 7).
- **Shock** (§6.5): a `Damaged` whose source is a push plays `hit.shock` (a heavier physical knock,
  20 % lower) on the first marble of the file and a −6 dB copy on the others, merged by the
  scheduler. It lands *after* the `push.scrape` (the move resolves first, §6.5 point 1), so its
  `atMs` is the push slot's end.
- **Guard** (§6.5, Garde du héros 35 %): `guard_capped = true` adds `hero.guard`, a strained glass
  creak 400 ms (twin: the capped number display) [ux-designer]. Priority 8: the player must learn
  "the Guard saved me".
- **Isolation** (+25 %, the deterministic crit): the hit gets an extra high "hollow" resonance (a
  1.6 kHz sine, 150 ms) so isolated hits ring out alone. **Formation** (−10 % per ally) lowers the
  body's lowpass by 15 % per adjacent ally, a muffled hit. Both read flags on `Damaged` (requested
  from `combat-engineer`: `isolated: bool`, `formation: u8`), else derived from the view before the
  action.
- Level gap (±5 %): no sound (TUNE: too subtle to hear).
- Life steal (`Healed` with a damage source): `heal.drain`, a short upward glide, quiet.
- Dependencies: `combat-engineer` (`isolated`, `formation`, `guard_capped`, `source` is a push or an
  ability, `kind`, element of the source), `class-designer` (`element` on abilities,
  combat-designer.md line on `AbilityDef.element`).
- Tests:
  - **Given** `Damaged{kind: Magical, amount: 30}` on a 120 PV target from Trait de feu (element
    Fire), **Then** `hit.magic` + `el.fire`, gain 0.6.
  - **Given** a Shock on a file of 2, **Then** two events merged to one `hit.shock` with density 2,
    after the `push.scrape` slot.
  - **Given** `guard_capped: true` on my hero, **Then** `hero.guard` with priority 8.
  - **Given** `Damaged{amount: 0, absorbed: 12}`, **Then** only `shield.absorb`.
- Risks: element plus body plus status cues on one hit stack to 3 cues; the scheduler cap and the
  rule "status applied by the same ability at the same ms is merged into the impact" (section 7)
  keep it at 2.

### 5.4 Death, ejection, the hero, the Graveyard, Revenants (§6.6)

**Listener's camp (PROPOSAL, generalizes `cueFor(side)` of `sound.ts`):** "glass" means *the
listener's camp*, "shell" every opposing camp. In a party, an ally's lost marble is glass (toll),
−6 dB and panned to it. In PvP each player hears their own side as glass. The Mess tables keep the
classic rule (side 2 = toll) untouched (§21, invariant).

| Effect | Cue | Notes | Twin |
|---|---|---|---|
| `Died{corpse: true}` of an ordinary marble | `death.crumble` | Crack (bandpass noise burst 3 kHz, 30 ms) at 0, then 14 grains (TUNE) over 400 ms (§6.6 "se fend puis s'effrite (400 ms)"), then the camp tail: `tail.toll` (mine) or `tail.clack` (theirs) | Crack and crumble animation, Dépouille decal [art-audio] |
| `Ejected` of an ordinary marble | `eject.*` | The existing ejection, kept FINAL (world.md §7): inhale 200 ms, thud, 600 ms vacuum silence, then toll or clack by camp | Ejection animation (`eject.ts`) |
| `Loss` | none extra | The Loss is already heard through death or ejection; a counter tick would double it | Tally marks on the frame (world.md §6.3) |
| My hero `Died` or `Ejected` | `hero.death` | The crumble or ejection plays, then **dead air** 1.5 s (TUNE: music and ambience duck to −30 dB), then `hero.shatter`: a low glass shatter plus a toll an octave under `tail.toll` (49 Hz with partials). Priority 9 | Hero marble shatters, end banner [ux-designer] |
| An opposing hero or a pack leader dies or is ejected | `leader.fall` | A deep clack at 0.7 pitch with a short sub thump; then, if the pack flees (§6.7 "le reste de la meute fuit"), `pack.flee` | Leader glyph breaks |
| An ally hero dies (party) | `ally.hero_death` | `hero.shatter` at −6 dB, panned, no dead air (the fight goes on) | Frieze slot greys |
| `Raised` (Revenant, §8.6) | `raise.revenant` | A reversed toll: a swell rising 600 ms into a short whisper (formant-filtered noise at 700 and 1200 Hz) | Revenant look [art-audio] |
| A Revenant disappears (decay, Sacrifice, excess after Armée des morts) | `revenant.dust` | Dry dust: 8 grains of lowpassed noise, **no tail, no toll, no clack** (§6.6: no corpse, not a Loss, no Moisson) | Dust puff |
| `Summoned` | `summon` | Glass forming: rising inharmonic partials 300 ms | Spawn |

- Rule from §6.6, made audible (PROPOSAL): anything that counts as a Loss ends on a camp tail (toll
  or clack); anything that does not (a Revenant) never does. A player learns the score rule by ear.
- Dependencies: `combat-engineer` (`Died`, `Ejected`, `Loss`, `Raised`, a flag `revenant: bool` on
  the unit or on `Died`, `EntityLeft{why: LeaderDead}`), `network-engineer` (`me` and camps),
  `ux-designer` (end banner timing: it must wait for the dead air, 1.5 s TUNE).
- Tests:
  - **Given** `Ejected` of my Fragment, **Then** cues `eject.inhale`, `eject.thud`, `tail.toll` at
    0, 200, 800 ms (the existing times, `PUSH_MS`, `EJECT_MS`).
  - **Given** `Died{corpse: false}` of a Revenant, **Then** `revenant.dust` and no `tail.*` cue.
  - **Given** my hero `Ejected`, **Then** `hero.death` at 800 ms (after the ejection) with priority 9,
    and the music state becomes `deadAir` then `defeat` (section 11).
  - **Given** a party of 2, **When** the ally's Fragment dies, **Then** `tail.toll` gain −6 dB and
    `pan` ≠ 0.
  - e2e (R1): eject an enemy Fragment, read `data-cues` contains `tail.clack`; lose the hero, read
    `__audio().music.state === "defeat"`.

### 5.5 Victory, defeat, rout, flight, anti-stall (§6.7)

| Effect or event | Cue | Notes |
|---|---|---|
| `EntityLeft{why: Routed}` | `rout` | One descending noise sweep 700 ms for the whole entity; its marbles vanish silently (no N crumbles) |
| `EntityLeft{why: LeaderDead}` (pack flees) | `pack.flee` | Skittering shell grains moving out in pan |
| `ChannelStarted{what: Flee}` | `flee.wind` loop | A rising wind loop while the 1-turn channel lasts (twin: channel ring) |
| `ChannelBroken` | `channel.break` | Glass snap, the loop stops at once |
| `EntityLeft{why: Fled}` (mine) | `flee.go` | Whoosh, then music state `explore` |
| Usure starts (turn 20, 12 in skirmish) | `stall.wear` | Once, a low bell with a beating detune (twin: heal icon greys) [ux-designer] |
| Brèche tell (`TellPlaced` of the ring) | `breach.crack` | Rumble + crack along the ring, panned around (2-turn tell); a tick each turn it counts down |
| `CellVoided` of a ring (many cells) | `breach.fall` | One merged collapse (density = cells), never one per cell |
| `CombatEnded{Victory}` | `end.victory` | Glass swell 2 s rising into a clean partial chord (stinger, not a loop) |
| `CombatEnded{Defeat}` | `end.defeat` | Falling drone 2.5 s ending in `tail.toll` an octave down |
| `CombatEnded{Draw}` (repetition, 60 turns) | `end.draw` | Two unresolved partials, fading |
| Draw against a boss (= defeat, FINAL) | `end.defeat` | Same as defeat |

- Tests: **Given** `EntityLeft{why: Routed}` with 6 marbles, **Then** one `rout` and no
  `death.crumble`. **Given** a Brèche voiding 18 cells, **Then** one `breach.fall` with density 18.
- Dependency: `combat-engineer` (Usure onset as an Effect or a view flag: today it is not in the
  enum, request), `ux-designer` (twins).

### 5.6 Formats, party order, multi-tile boards (§6.2, §6.8, §4.6)

- Party: other players' actions play with the listener rule of 5.4. Each ally's sounds are −3 dB
  (TUNE) under mine so my own actions stay on top.
- Multi-tile (§4.6): pan and off-screen attenuation of section 4.7; when the camera changes region,
  `camera.region` (a soft whoosh 300 ms, twin: camera move). A push across a seam sounds like any
  push (§4.6 "aucune règle spéciale").
- Formats (§6.8) change nothing in the cue map; the music reads the format (section 11).

### 5.7 Retry and resume (§6.12)

- Boss retry in under 5 s (§6.12, pillar 3): music jumps to the boss phase 1 state with a 300 ms
  (TUNE) fade-in, no intro; ambience keeps playing across the retry (no restart click).
- Page reload resume: the context needs a new gesture (browser rule); the first gesture after resume
  starts music at the current state, never replays past cues (`live` false, existing #232 rule).
- Test: **Given** a defeat against a boss, **When** retry, **Then** within 300 ms
  `__audio().music` is `{state: "boss", phase: 1}`.

---

## 6. Abilities and class resources (§6.10, §8, §10)

### 6.1 Lineage exciters (one timbre per class, PROPOSAL)

| Class (lineage) | Exciter (cast family `cast.<class>`) | Resource sound (`res.<class>`) |
|---|---|---|
| Gardien (Ancre) | Chain and steel clank, low (110 to 220 Hz), heavy | Rempart: a plate locking into place on each +10 from a hit (not on the +5 per turn) |
| Guerrier (Bélier) | Low noise burst with sawtooth growl (55 Hz), like a ram hitting | Rage: growl whose pitch rises with Rage (60 → 90 Hz) on +15 and +25; a cooling hiss on −10 |
| Assassin (Éclat) | Blade swish: highpassed noise sweep 2 → 8 kHz, 120 ms | Combo points: one glass pip per point (pip pitch rises per point: 5 steps); Energy: silent |
| Guérisseur (Lueur) | Soft bell partials (harmonic) | Faith: none per turn; `res.faith_low` when under the cheapest ability cost |
| Mage (Fournaise) | Element of the spell (6.2) on a resonant glass body | Mana: none; Surchauffe: a rising hiss on each extra spell in the turn (twin: cost display +50 %) |
| Nécromancien (Ossuaire) | Bone rattle: 6 triangle clicks 1.5 kHz, jittered, + whisper | Essence: a breath-in on each +20 from a Loss; Pacte de sang: wet thump + breath |
| Chronomancien (Sablier) | Sand trickle (grains of noise) + tape glide | Grains: one sand tick per grain gained, one reversed tick per grain spent; Paradoxe penalty: a stuck-tape stutter |
| Géomancien (Strate) | Stone grind, sub rumble 40 Hz | Strates: a pebble click per +5 from a special cell |

Rule (PROPOSAL): resource cues play only on *discrete events* listed above, never on the fixed
per-turn gain (it would sound every turn). The fixed gain has its twin in the gauge.

### 6.2 Ability cues: derivation rule

Each ability has two cues: **cast** (on `AbilityCast`) and **impact** (on each resulting primitive
effect). Default derivation (PROPOSAL), overridable in the ability data with
`sound: { cast?: CueId, impact?: CueId }` (owned by `class-designer` for the data, cue ids by me):

| Primitive (§6.10) | Effect read | Default impact cue |
|---|---|---|
| Dégâts | `Damaged` | Body by kind + element colour (5.3) |
| Soin | `Healed` | `heal.rise`: shimmer gliding up a fifth, 400 ms; gain by amount bucket |
| Bouclier | `ShieldChanged` up | `shield.up`: glass ring 880 Hz, Q 20 |
| Déplacement forcé | `Moved{how: Forced}` | `force.push` (pull: reversed); teleport `Moved{how: Teleport}` → `blink` (two clicks with a swish between); swap → `swap` (two crossing glides) |
| Modif de stat | `StatusApplied` of a stat mod | `stat.up` / `stat.down` (glides up or down) |
| Statut | `StatusApplied` | Status cue (section 7) |
| Terrain | `TerrainChanged`, `CellAdded`, `CellVoided` | Cell cue (section 8) |
| Invocation | `Summoned` | `summon` |
| Réanimation | `Raised` | `raise.revenant` |
| Marque | `TellPlaced` | `tell.place` + the tell rules (6.4) |
| Ressource | `ResourceChanged{cause: Ability}` | Resource sound of 6.1, or `res.steal` (a reversed pip) |
| Tour | `Moved{how: Step}` bonus Pas / restriction | `step.bonus` (light glass tap) / `turn.restrict` (muffled thud) |

- Cast and impact of the same ability within 30 ms merge into one event (scheduler key).
- Self-moves (Charge, Clignement, Pas de l'ombre, Danse des lames, §6.3) use their own cast, never
  the push scrape (they never push, §6.3).
- Multi-target order (§6.10: nearest first, then r, then q): impacts keep the engine order, spaced by
  the timeline slots; the scheduler merges beyond 4 instances.

### 6.3 Ultimates (16 at launch, PROPOSAL)

Each ultimate gets a hand-written patch (`ult.<class>.<id>`), louder and lower than any ability,
with three layers: a 300 ms pre-swell (music ducks −4 dB, section 4.2), the class exciter at 0.7
pitch, a sub drop (60 → 30 Hz, 500 ms). Examples (the rest follow the same frame):

| Ultimate | Signature |
|---|---|
| Forteresse (Gardien) | Every allied marble rings a short glass ping in turn (r, then q order), then a single anchor clank |
| Séisme du Lest | Sub rumble 800 ms + rocks; Ejector: the chosen ejection plays the standard `eject.*` |
| Avalanche (Guerrier) | The 4-marble scrape at pitch 2^(−6/12), doubled Shock knock, a roar |
| Titan | Growl locked low for 2 turns: a quiet 40 Hz hum loop on the hero while it lasts |
| Danse des lames (Assassin) | Up to 4 blade swishes, rising, panned to each cell |
| Assassinat | Silence 200 ms, then one very dry cut and a high glass ring |
| Aube (Guérisseur) | Rising harmonic chord 1.5 s (the only "major" sound of the game, PROPOSAL) |
| Martyr | Bell with a slow beating, held quietly while active |
| Météore (Mage) | Tell: a distant roar growing each turn; fire: impact boom + crackle field |
| Zéro absolu | A crack of ice spreading in pan, then a frozen high whine fading |
| Armée des morts (Nécro) | Up to 3 reversed tolls, staggered 150 ms, plus a choir of whisper noise |
| Peste | A wet bubbling bed that lasts the 3 turns at −18 dB (TUNE) |
| Paradoxe (Chrono) | A full tape rewind: every recent cue sound ghosted backward (a reversed noise sweep 900 ms), then a clock-like double tick |
| Arrêt du temps | The music and ambience pitch slide down a fourth for the target's turn (`playbackRate` is not used: the procedural stems get a pitch param), then snap back |
| Rempart tellurique (Géo) | Six stone thumps around the ring, clockwise in pan |
| Séisme (Géo) | 2-turn tell rumble on the chosen sides; fire: `breach.fall`-like collapse |

### 6.4 Tells and intentions (pillar 2 §1, §5.3, world.md §8 FINAL)

world.md §8 (FINAL): every boss tell is a steady shape plus a **sound twin**. This file extends the
rule to every tell (PROPOSAL, see feedback F5): ability tells (Météore, Mine temporelle,
Effondrement, Séisme), terrain tells (Brèche, Marée, Évent, Sables, Éboulement, Pont expiring) and
boss tells.

- `TellPlaced{fires}`: `tell.place.<kind>` (default: a low glass "mark" plus the cause's colour).
- At each `TurnStarted` while a tell is live: `tell.tick`, one tick per remaining turn (2 ticks = 2
  turns left), the last turn's tick is higher and doubled (twin: engraved ticks, world.md §6.4).
- `TellFired`: the effect's own cue; it never needs a separate "fire" sound.
- Monster intention (§5.3) targeting **my hero**: `intent.hero`, a single low pulse when the intent
  first appears (twin: the intent arrow) [encounter-boss-designer, ux-designer]. Other intents:
  silent (too frequent).
- **Edge danger** (§6.6 alert; ux-designer.md A.2 asks for "one low sound tick"): on the rising edge
  of the flag for my hero, `edge.could` (one 80 Hz tick with a glass overtone) or `edge.will` (two
  ticks). Never repeated while the flag stays on; never for the enemy hero (it is public, but the
  sound is for my safety; the enemy's glyph is enough, PROPOSAL).
- Tests:
  - **Given** `TellPlaced{fires: in 2 turns}` then `TurnStarted` of its owner, **Then** `tell.tick`
    with density 2, then next turn density 1 with the "last" variant.
  - **Given** `edge_danger` goes from `none` to `will` for my hero, **Then** one `edge.will`; **Given**
    it stays `will` next action, **Then** none.
- Dependencies: `combat-engineer` (`TellPlaced`, `TellFired`, `edge_danger` in the view),
  `encounter-boss-designer` (intent data), `ux-designer` (Edge danger rising-edge logic shared,
  `rpg/edgedanger.ts` "announce on change only": the audio reads the same function).

### 6.5 Tests and data for abilities

- Integrity: every ability of `data/classes/*` resolves a cast and an impact cue (by override or by
  the derivation rule); every ultimate has its own `ult.*` cue (PROPOSAL rule, so ultimates never
  fall back to defaults).
- **Given** Fendoir (Physical, no element) on an Isolated target, **Then** `cast.warrior`,
  `hit.phys` with the isolation ring.
- **Given** Chaîne d'éclairs with 2 rebounds, **Then** three `hit.magic` + `el.lightning` in engine
  order, pans following the targets.
- e2e (R2): cast each of the 4 R2 classes' first ability in the bot fight fixture, read the cast cue
  id in `data-cues`.
- Risks: 80 abilities × variants is a lot of hand work; the derivation rule covers about 80 % so
  hand patches are only ultimates and signature abilities (Charge, Retour, Rotation, Pont, Relever).

---
## 7. Statuses, keywords and reactions (§6.11, §8.5)

**Rules (PROPOSAL):** one short cue on `StatusApplied`, a shorter reversed version on
`StatusEnded`, a tick for damage over time at the start of the bearer's turn, and **no loop** for a
status (loops would pile up on a board of 20 marbles). A status applied by the same action at the
same ms as its impact merges into the impact. The twin of every status is its icon on the marble
[ux-designer, art-audio].

| Status or keyword | Applied (`status.<id>`) | Tick / end |
|---|---|---|
| Inamovible, Ancré | Chain clank, the marble "locks" (low, 150 ms) | End: the chain falls slack |
| Inéjectable | A glass ring around the marble, 2 sines beating 3 Hz | Lassitude: none (end cue only) |
| Stase | Time freeze: a glide down an octave then a held whisper 300 ms | End: glide up |
| Insaisissable | An air swirl (bandpassed noise, LFO on cutoff) | Dodge: `status.dodge`, a near-miss swish |
| Enraciné | Root creak + thump | End: crack |
| Étourdi | Two high sines 1.8 kHz beating 7 Hz, 400 ms (a daze ring) | — |
| Gelé | Ice crack + frost tinkle (`el.frost`) | End: thaw drip |
| Silence | A "hush": noise cut by a closing lowpass 4 kHz → 200 Hz | End: opening lowpass |
| Aveuglé | A bright shimmer fading | — |
| Provocation | Low shell growl at the provoking marble | — |
| Saignement | Wet drip | Tick: drip, gain by amount bucket |
| Poison | Bubble (sine blips gliding up) | Tick: bubble |
| Brûlure | Crackle (`el.fire` short) | Tick: crackle; extinguished by Water: `terrain.hiss` |
| Alourdi / Allégé | Glide down / up a fourth per point of Weight | — |
| Marqué | A dry tick + a high pin ring | Bonus consumed: louder ring on the hit |
| Bouclier | `shield.up` | Broken: `shield.break` (glass shatter, short) |
| Vitrification (Corruption) | Glass crackle, pitch higher per stack (3 steps) | Stack lost: soft reverse crackle |
| Mouillé | Splash | — |
| Element states Brûlé, Gelé, Chargé (§8.5) | The element colour (5.3), short | — |

Reactions (§8.5), `Reaction{reaction}`:
- Vapeur (Brûlé + Gelé, Stun): `react.steam`, a loud hiss burst 500 ms + the daze ring.
- Bris (Gelé + Chargé): `react.shatter`, glass shatter + buzz, the Weight drop glide.
- Explosion (Brûlé + Chargé): `react.blast`, a boom (noise burst lowpassed 400 Hz + sub thump), panned.

Diminishing returns (§6.11): `StatusRefused{why: DR | keyword | Stase}` plays `status.refused`, a
dull deflect thunk (twin: the immunity glyph). A player learns "it did nothing" by ear.

- Dependencies: `combat-engineer` (`StatusApplied`, `StatusEnded`, `StatusRefused`, `Reaction`, the
  DoT tick as a `Damaged` with a status source), `ux-designer` (icons), `class-designer` (status
  ids).
- Tests:
  - Integrity: every status id of the status table has an `applied` cue (and an `end` cue where
    the table lists one).
  - **Given** Nova de givre freezing 3 enemies, **Then** 3 `status.frozen` merged into one event of
    density 3, at the same ms as the impact.
  - **Given** `StatusRefused{why: DR}`, **Then** `status.refused` and no `status.stunned`.
  - **Given** a Burned marble entering Water, **Then** `terrain.splash` then `terrain.hiss`.
- Risks: Poison, Burn and Bleed ticks on 6 marbles at the start of a turn: merged by cue id, so 3
  events at most (PROPOSAL).

---

## 8. Terrain cells (§5.1)

Every cell type has a glyph (§5.1 FINAL rule "un glyphe obligatoire"): that glyph is the twin. A cell
sounds only when something happens on it, never as a loop on the board (PROPOSAL; the biome bed is
the continuous layer).

| Cell | Event | Cue |
|---|---|---|
| Roc | A push blocked by it (preview refusal) / a Roc created (`TerrainChanged` to Roc) / destroyed | `ui.deny` / `terrain.rock_up` (stone thump + grind) / `terrain.rock_break` |
| Gouffre | A marble pushed in | The standard ejection (`eject.*`), FINAL world.md §7 |
| Glace | A slide (`Slid`) / ice created | `terrain.ice_glide` (stretch by path) / `terrain.ice_form` (crackle freezing) |
| Boue | A marble enters | `terrain.mud` (low squelch: noise lowpassed 300 Hz with a wobble) |
| Fourré | A damage reduced by it | `terrain.rustle` on the hit (twin: leaves glyph) |
| Hauteur | An ability cast from it | `terrain.height` (a short "air" layer on the cast) |
| Pente | A push using it | The push pitch already includes the Slope Weight (5.2); no extra cue |
| Lave | End-of-turn damage | `terrain.sizzle` (crackle + low hiss) |
| Eau | Enter / Wet / Burn put out | `terrain.splash` / — / `terrain.hiss` |
| Sables mouvants | Rooted at turn start / sucked in (tell after turn 1) / ejected | `terrain.sand_pull` / `tell.place.sand` / `eject.*` |
| Évent | Countdown (tell) / blast push | `tell.tick` with a steam hiss colour / `terrain.vent_blast` |
| Sanctuaire | Heal at end of turn | `terrain.sanctum` (soft harmonic chime, the only consonant terrain sound) |
| Corruption | Stack gained | `status.vitrify` (section 7) |
| Cristal | A line ability bounces | `terrain.crystal` (bright ping 2.6 kHz, Q 30) at the bounce cell |
| Ronces | A marble pushed in, damaged | `terrain.thorns` (scrape of high noise grains) |
| Éboulement (Le Puits) | Tell / Roc falls | `tell.place.rockfall` / `terrain.rockfall` (crash + debris grains) |
| Marée (Littoral Mort) | 2-turn tell / sea side becomes Gouffre / back | `tide.swell` (growing low wave) / `tide.surge` (merged by cells) / `tide.ebb` |
| Pont (Géomancien) | Made / expiring tell / gone | `terrain.bridge` (stone setting) / `tell.tick` / `terrain.bridge_fall` |

- Dependencies: `combat-engineer` (`TerrainChanged`, `CellAdded`, `CellVoided`, `Slid`, damage
  source = cell), `world-designer` (cell ids), `ux-designer` (glyphs are the twins).
- Tests: integrity test "every cell id of the terrain table maps to its cues"; **Given** a slide of 3
  cells on Ice, **Then** `terrain.ice_glide` with `stretch` 3 × 120 ms / the patch length.
- Risks: Lava and Corruption at end of every turn on many marbles: merged per cue.

---

## 9. The world: biomes, movement, transition (§4, §5.2)

### 9.1 Biome ambience beds (§5.2)

world.md §7 (FINAL): "Bed per deck: low hum, creaks, distant metal, wet dripping. Low-frequency
heavy." The RPG adds one bed per biome (PROPOSAL). A bed has 3 layers in `data/audio/beds.json`:
a **drone** (2 to 3 sines around a root, slow detune LFO), a **texture** (filtered noise with a slow
LFO), and **events** (one-shot cues drawn by a seeded scheduler, 1 every 4 to 12 s, TUNE). Every
root is low (rule 1); a 2nd and 3rd harmonic are always present so laptop and phone speakers that
cannot play under 100 Hz still hear the bed (risk R-9.1).

| # | Biome (§5.2) | Root (TUNE) | Texture | Sparse events | Roll surface (9.2) |
|---|---|---|---|---|---|
| 1 | Plaines de Lumen | 55 Hz | Airy wind, highpassed 1 kHz, gentle | Glass-grass chimes (inharmonic, quiet), a far shell click | Soft glass swish |
| 2 | Sylve de Cendre | 49 Hz | Ash fall hiss, very soft | Petrified wood creaks, mantis clicks (shell), a branch snap | Dry crunch |
| 3 | Tourbières de Suie | 46 Hz | Wet low noise, bubbling | Bubbles (rising blips), drips, a distant bloat pop | Squelch |
| 4 | Dunes de Verre | 52 Hz | Wind gusts (bandpass sweeping 300 → 900 Hz) | Singing-dune low hum swell, sand slides | Sand hiss |
| 5 | Crêtes de Fer | 44 Hz | Mountain wind howl (resonant bandpass) | Metal ringing in the rock, rockfall, harpy screech (shell, filtered) | Stone knock |
| 6 | Toundra Blanche | 58 Hz | Thin high wind | Ice cracks, deep glacier groans | Ice glide + crunch |
| 7 | Littoral Mort | 41 Hz | Waves: lowpassed noise with a 0.1 Hz swell (the tide) | Salt crystal crackle, a sea-shell knock | Wet glass |
| 8 | Caldeira | 37 Hz | Magma rumble (sub + noise 80 Hz) | Steam vent bursts, crackle, a forge clang far away | Hot clink |
| 9 | Terres Vitrifiées | 62 Hz | Glass shimmer (detuned partials) | Whispers (formant noise), corruption crackle | Ringing glass |
| 10 | Le Puits | 33 Hz | Almost nothing: sub only, −12 dB | Far choir (formant noise chord), a single drip, long silences (rule 2) | Muffled knock |
| H | Le Ballast | The existing deck hums (world.md §7) | Creaks, distant metal | Per room (section 17) | Steel knock |

- Crossfade between biomes: 3 s (TUNE) when the hero's tile changes biome; inside a zone, the bed
  never restarts.
- In combat, the same bed continues at −6 dB (TUNE) under the music, so a fight in the Caldeira
  sounds like the Caldeira (the board is the tile, §4.5).
- Biome global rules heard (PROPOSAL): Obscurité in Le Puits (range −1) lowers the bed's highs (a
  lowpass at 1.2 kHz) except on a Sanctuary; Marée has its own tell (section 8); Brûlure +50 % in
  the Caldeira is not audible beyond the louder crackle. These are flavour, never the only copy of a
  rule (the rule's twin is the HUD).
- Dependencies: `world-designer` (biome id of the current tile, zone borders), `art-audio`
  (palette, so bed and colour are designed together).
- Tests:
  - Integrity: `beds.json` has one bed per biome id of the world data and for the hub.
  - **Given** the hero crosses from biome 1 to 2, **When** the ambience logic runs, **Then** target
    gains fade 1 → 0 and 0 → 1 over 3 s (pure function `bedGains(prevBiome, nextBiome, t)`).
  - **Given** a fixed seed, **Then** the event schedule for 60 s is the same list (determinism of
    the pure scheduler).
  - e2e (R4): walk from Plains to Ash forest, `__audio().ambience` becomes `sylve`.
- Risks: R-9.1 low roots inaudible on small speakers (harmonics mitigate); R-9.2 fatigue in 1-hour
  sessions: events are sparse and the texture breathes (LFO 0.03 to 0.1 Hz).

### 9.2 Moving the single marble (§4.2)

- A step takes 300 ms × biome cost (§4.2, TUNE there): `world.step.<surface>` plays once per tile
  step, with `stretch` = the cost; Élan (−20 %, −35 %) makes the roll lighter (pitch ×1.06, ×1.1,
  TUNE). Ice (`cost 0.8, slide one more tile`): a glide cue over the extra tile.
- Waypoint (Balise): activation `world.beacon_on` (a rising glass chord 1 s); teleport for 1 Lueur:
  `world.teleport` (inhale-like hiss reversed, then arrival thump); full heal on a Balise or in the
  hub: `world.restore` (soft swell).
- Fog reveal: silent (too frequent). Zone 100 % discovered (§22): `world.discovered` (stinger).
- Out-of-combat regen (5 % per second): silent; the HP ring is the twin.
- Night and weather (§4.8, v2): the bed's highs lower at night (lowpass 2.5 kHz, TUNE) and a night
  event set is used (shell clicks, far whispers); rain adds a noise layer with drops; sandstorm adds
  a gust layer. Since weather changes rules (lightning +25 %, range −1), its sound has a HUD twin
  (feedback F10).
- Tests: **Given** a path of 3 tiles over costs 1, 1.5, 0.8, **Then** 3 step cues with stretch 1,
  1.5, 0.8 and `atMs` 0, 300, 750 (300 × cumulative cost).

### 9.3 Engagement and the tile-to-board unfold (§4.4, §4.5)

- Ambush (§4.4, the pack plays first): `world.ambush`, a sharp shell stinger (dry clack cluster +
  low hit), priority 8. Player engages by clicking: `world.engage`, a heavy glass knock.
- Monster level colours (§4.4): no sound.
- **The unfold (§4.5, "le moment signature du jeu", 1.2 s TUNE there):** `world.unfold`, PROPOSAL:
  - 0 ms: a glass crack (the tile splitting);
  - 0 to 1100 ms: a rising resonant swell (bandpass sweep 200 → 1600 Hz) and 6 to 12 seeded
    "plate" clicks as the rings of cells lay down (one per ring, timed on the animation);
  - 1200 ms: the settle thump (sub 45 Hz + steel knock), the board is ready.
  - The music crossfades `explore → combat` over the same 1.2 s (section 11).
  - Skip (any click or key, ux-designer.md §6.2): jump straight to the settle thump, cancel the swell
    with a 30 ms fade (no click).
  - Reduced motion (§4.5 "un seul plan"): the sound is unchanged; it is not motion.
- Dependencies: `client-engineer` (the unfold timeline exposes ring times and a skip event),
  `world-designer` (ambush vs engage flag).
- Tests: **Given** `world.unfold` with 4 rings, **Then** 4 plate clicks between 0 and 1100 ms and
  one settle at 1200; **Given** a skip at 400 ms, **Then** the settle is rescheduled to 400 ms and
  no plate click after it.
- e2e (R4): walk into a pack, `data-cues` contains `world.unfold` then `world.ambush` or
  `world.engage`, `__audio().music.state === "combat"` after 1.2 s.

---

## 10. Monsters (§5.3)

- Every monster marble is shell (rule 5). Two data fields (PROPOSAL) on monster data, owned by
  `encounter-boss-designer`: `sound.family` (one of `carapace`, `chitin`, `stone`, `glass`, `bloat`,
  `spectral`, `metal`) and the archetype (already in the data).
- Family sets the *tail* (clack variant) and the move knock colour; archetype sets the *action*
  layer:

| Archetype | Action signature (`mob.<archetype>`) |
|---|---|
| Brute | Heavy low shell grunt (noise 120 Hz burst) on its pushes |
| Rôdeur | Fast skitter (5 clicks) before its hit |
| Lanceur | A charging hum 300 ms before the projectile |
| Chaman | A hollow wooden-like chime on heal or shield |
| Bâtisseur | Stone grind on Roc creation |
| Explosif | A fuse hiss when under 30 % HP (twin: a crack glyph); death: `react.blast` + push of neighbours |
| Porteur | Shield clank on a frontal hit (twin: the shield side) |
| Invocateur | A whisper swell on summon |

- Elite affixes (§5.3): one extra layer each where audible: Givrant/Brûlant (the cell cue as it
  leaves Ice or Lava), Vampirique (`heal.drain`), Écho (every mirrored Mouvement plays its knock
  with a 120 ms echo, a nod to The Echo), Téléporteur (`blink`), Explosif (as above), Bouclier
  (`shield.up`). Others silent.
- Biome monster families (§5.2: Coquilles errantes, Mantes, Gonfleurs, Scarabées, Golems,
  Ours-coques, Crabes-lest, Salamandres, Vitrifiés, Abominations…) map to a family in data, so no
  new cue per monster (KISS).
- Tests: integrity "every monster has a family and an archetype that resolve to cues"; **Given** an
  Explosif dying, **Then** `react.blast` then `force.push` merged for the neighbours.

---
## 11. Adaptive music (§3, §18; world.md §7, tech.md §5.4)

world.md §7 (FINAL): "No melodic loops. Drone and texture layers, 2 to 3 tension layers driven by
game state (marbles in danger, boss phase). Boss themes are a slow pulse that speeds up per phase."
tech.md §5.4 (FINAL): "2 to 3 stem layers crossfaded by a tension value derived from engine state".
The gameplay spec has no music section (feedback F1, F8); this section applies the existing rules
to the RPG loops of §3.

### 11.1 Stems (procedural, `data/audio/music.json`)

Three stems, all synthesized, all in the key of the current biome's root (9.1) so music and bed
never clash (PROPOSAL):

| Stem | Content | Notes |
|---|---|---|
| S1 drone | Root + fifth + octave sines, slow detune, a low-passed sawtooth pad under it | Always on in combat, on in exploration only under threat |
| S2 pulse | A soft low thump (sub + lowpassed noise) at a tempo; every 4th beat a glass tick | Tempo from the state (11.3); never a melody |
| S3 tension | Bowed-glass texture: bandpassed noise at 3 partial frequencies with slow swells, plus a beating dissonance (a minor second at −24 dB) at high tension | The "danger" layer |

### 11.2 States (pure state machine, `music.ts`)

```ts
type MusicState =
  | { s: "silent" }                       // no context yet, or master muted
  | { s: "explore"; biome: BiomeId; night: boolean }
  | { s: "threat"; biome: BiomeId }       // a pack within aggro radius + 1 (TUNE)
  | { s: "combat"; format: Format; tension: number }
  | { s: "boss"; boss: BossId; phase: number; tension: number }
  | { s: "deadAir" }                      // 1.5 s after my hero dies, before a boss phase
  | { s: "victory" } | { s: "defeat" } | { s: "draw" }
  | { s: "hub"; room: RoomId };
export function nextMusic(prev: MusicState, ev: MusicEvent): MusicState;  // pure
export function stemGains(st: MusicState): [number, number, number];      // pure
export function pulseBpm(st: MusicState): number;                         // pure
```

| State | S1 | S2 | S3 | Transition in |
|---|---|---|---|---|
| explore | 0 (the bed alone, rule 2) | 0 | 0 | 3 s fade |
| threat | 0.4 | 0 | 0.15 | 2 s |
| combat | 0.7 | by tension | by tension | over the unfold, 1.2 s |
| boss | 0.8 | 1 | by tension | at the end of the unfold |
| deadAir | 0 | 0 | 0 | 100 ms, ambience ducked to −30 dB |
| victory / defeat / draw | stinger (5.5) then explore after 4 s (TUNE) | — | — | 300 ms |
| hub | room hum (section 17), no stems | — | — | 3 s |

All gains are TUNE. Exploration is mostly silent on purpose (rule 2, world.md "silence as a tool"),
which also answers fatigue in long sessions (§3 "30 à 60 min").

### 11.3 Tension (combat and boss)

Pure function in `tension.ts` (PROPOSAL; weights TUNE), integers 0..100:

```
T = 35 × (my entity's Losses / my rout threshold)
  + 25 × (1 − my hero HP / my hero max HP)
  + 20 × edge(my hero)            // none 0, could 0.5, will 1 (§6.6 alert)
  + 20 × max(breach_soon, phase_progress)
breach_soon    = 1 when a Brèche or enrage tell fires within 2 turns, else 0
phase_progress = (boss HP lost since the phase start) / (HP span of the phase), bosses only
```

- S2 gain rises linearly from T = 25 to T = 50; S3 from T = 60 to T = 85 (TUNE). Target gains change
  with a 800 ms time constant (TUNE) and a hysteresis of 5 points (TUNE) so one hit does not flap
  the layers.
- Combat pulse: 48 BPM (TUNE), +1 BPM per 5 points of T, up to 60.
- Party: tension uses my entity, plus the lowest-HP allied hero at half weight (PROPOSAL).
- Dependencies: `combat-engineer` / `ux-designer` (`CombatView`: Losses, thresholds, hero HP, edge
  danger, live tells, boss phase thresholds; ux-designer.md §1 CombatView), `encounter-boss-designer`
  (phase thresholds in % HP, §18).
- Tests:
  - **Given** a fresh combat (0 Losses, full HP, no danger, no tell), **Then** T = 0 and gains
    `[0.7, 0, 0]`.
  - **Given** Losses 2 of 3, hero at 40 %, edge `will`, **Then** T = 23 + 15 + 20 = 58 (integer
    floor per term) and S2 at 1, S3 at 0.
  - **Given** T moves 58 → 61 → 59, **Then** S3 target goes up at 61 and stays up at 59 (hysteresis).
  - **Given** `MusicEvent.HeroDied(me)`, **Then** `deadAir` then `defeat` after 1.5 s.
  - e2e (R1): the reference fight fixture; after two Fragment losses, `__audio().music.tension`
    is > 0 and `layers[1] > 0`.

### 11.4 Risks

- Drone-only music may feel thin for a Diablo-like (feedback F8, open question Q1).
- Tension weights may make S3 permanent in hard fights; qa-balance listening tests at R2.
- Stems built from oscillators are cheap (about 15 nodes) but must be torn down on state `silent`.

---

## 12. Bosses, phases, multi-tile fights (§18, §17, §4.6)

world.md §7 (FINAL): "Boss themes are a slow pulse that speeds up per phase", "dead air before a boss
phase change". §18 changes phases to boss HP % (70 %, 35 %, TUNE there).

- Per-boss music data (`music.json` → `bosses`): pulse BPM per phase, a signature colour on S3, and a
  "phase cue". PROPOSAL values (TUNE):

| Boss (§17) | Phase BPM | S3 colour | Signature |
|---|---|---|---|
| The Echo (Cales du Ballast) | 40 / 50 / 62 | Every pulse has a 250 ms echo | The mirrored Mouvement plays an echoed knock (its tell twin) |
| La Reine Tisseuse | 44 / 56 / 70 | Silk scratch grains | Web creation crackle |
| Le Noyé-qui-compte | 38 / 48 / 60 | Bubbling under, Tally-like ledger ticks | A counting tick per its tell |
| The Hull (3 tiles) | 36 / 46 / 58 | Steel groans | Phase 2 collapse of the middle board: `breach.fall` large + 2 s dead air |
| The Choir | 42 / 54 / 66 | Formant noise chords (vowels a, o, u) | Its existing tells keep their sound twins (#62) |
| The Chaplain | 40 / 52 / 64 | Candle crackle, wire hum | Conversion of a Fragment: a reversed clack turning into a toll (the side swap made audible) |
| Le Marcheur d'abîme | 34 / 44 / 56 | Near silence, sub only | Footstep thumps on its moves |
| The Ballast Mind (raid, 7 tiles) | 40 / 50 / 60 / 72 | A ledger of ticks across pans (one per petal) | Phase 3 centre opening: the only full stop of all stems (3 s) |

- Phase change: `deadAir` 1 s (TUNE) **before** the phase's first effect, then the phase cue
  (`boss.phase`, a low toll + the boss colour), then the faster pulse. Twin: phase notches (world.md
  §6.4).
- Résilient core (§18: ejected, loses 25 % HP, back to centre): the ejection plays, then instead of a
  clack, `boss.return` (a reversed suck, then a heavy thump at the centre). The player hears "it came
  back".
- Inéjectable core: an illegal push attempt plays `ui.deny` with a deeper variant.
- Enrage (§18, the Brèche advances): `breach.crack` with the boss colour.
- Boss mechanics (§18 list): channel stopped by a push → `channel.break`; marked zones →
  `tell.place`; cells to hold → a held hum per unheld cell at −18 dB while the tell runs; bomb-marble
  countdown → `tell.tick` on the bomb; linked marbles → a beating tone between them; frontal shield →
  `mob.porteur` clank.
- World bosses (§18, every 3 h by UTC seed): a far `world.boss_horn` (a low non-melodic brass-like
  swell made of sawtooth partials, lowpassed) when one spawns within view distance on the map. Twin:
  map marker.
- Dependencies: `encounter-boss-designer` (phase thresholds, tell ids, boss ids, mechanics as
  Effects), `combat-engineer` (`Effect` for phase change, resilient return), `art-audio` (notches).
- Tests:
  - **Given** a boss at phase 1 losing HP below 70 %, **When** the phase Effect arrives, **Then** the
    music goes `deadAir` for 1 s, then `boss.phase`, then `pulseBpm` = phase 2 value.
  - **Given** a Résilient core ejected, **Then** `eject.inhale`, `eject.thud`, `boss.return`, and no
    `tail.clack`.
  - Existing boss e2e (`client/e2e/boss.spec.ts`) stays green for the classic bosses at the Mess.
  - e2e (R8): The Echo fight, reach phase 2 with the fixture, `__audio().music` = `{state: "boss",
    phase: 2}`.

---

## 13. Progression, talents, tutorial (§9, §10, §11)

| Event | Cue | Twin |
|---|---|---|
| XP gained after a fight | `prog.xp` (quiet rising pips, merged) | XP bar |
| Level up | `prog.level` (a glass swell into a clean partial chord, 1.6 s, stinger) | Level glyph and banner |
| Passive point spent / rune taken | `ui.rune` (stone click) / keystone: `ui.keystone` (heavier, with a ring) | Tree node lights |
| Active point spent / rank up / variant chosen | `ui.ability_rank` (glass click, pitch up per rank) | Rank pips |
| New ability unlocked (lineage trial, level 5) | `prog.lineage` (the class exciter + the level swell) | Banner |
| Respec (Maître des Voies) | `ui.respec` (a reversed sweep) | Tree resets |
| Tutorial steps (§11, levels 1 to 4) | Reuse combat cues; a `ui.hint` soft chime on each new step | Hint text |

- Dependencies: `progression-designer` (events), `narrative-quest-designer` (tutorial steps),
  `ux-designer` (windows).
- Tests: **Given** two level-ups in one fight reward, **Then** one `prog.level` with density 2 (no
  overlap of two chords).

---

## 14. Items, loot and merchants (§12, §13)

- Loot by rarity (§12: "une couleur **et** un glyphe"), PROPOSAL: a third twin, sound, so a drop is
  readable three ways. `loot.<rarity>` plays when the loot is revealed:

| Rarity | Cue |
|---|---|
| Commun | Dull clink |
| Magique | Glass ping |
| Rare | Two pings, a fifth apart |
| Légendaire | A long rising swell + bright ring 2 s (Diablo-like beam sound) |
| Unique | Légendaire with a low toll under it |
| Ensemble | Légendaire with a second ring a fourth up |

- Gold (`loot.gold`, coins), materials (`loot.mat`, soft thud), gems (`loot.gem`, crystal ping
  pitched by quality: 5 steps).
- Inventory: pick `ui.pick`, equip by slot family (`ui.equip.metal` Noyau, Coque, Lest; `ui.equip.glass`
  Halo, Amulette, Anneaux; `ui.equip.cloth` Étendard), full inventory `ui.deny`.
- Merchants (§13.2): buy/sell `ui.coin`, buy-back `ui.coin` reversed, repair `ui.anvil`
  (Forgeron), socket/remove gem `ui.socket`, Creuset fuse `ui.crucible` (three pings merging), Parieur
  `ui.gamble` (a shaken box, then the rarity cue), recycle `ui.salvage` (crunch).
- Durability low (§12): `ui.durability_low` once when an item drops under 10 % (TUNE).
- Dependencies: `economy-designer` (rarity ids, events), `ux-designer` (windows, beam visuals).
- Tests: integrity "every rarity id has a loot cue"; **Given** 6 drops of which one legendary,
  **Then** the legendary cue plays last and the others merge by rarity.

---

## 15. Gathering and crafting (§14, §15)

- Gathering channel (§14: 3 s, shorter with a good tool, interrupted by aggro): a loop per
  profession that plays for the channel's duration, then the result cue.

| Profession | Channel loop | Success | Rich vein / luck |
|---|---|---|---|
| Minage | Pick strikes every 600 ms (TUNE), stone knock | Ore tumble | Rich: lower, heavier strikes; luck (gem): `loot.gem` |
| Herboristerie | Sickle swishes | Rustle bundle | Lueur on a Fissure: a glassy shimmer |
| Bûcheronnage | Axe chops (wood-like knock) | Log fall thump | Rich: a creak before the fall |
| Décorticage | Knife scrape on chitin (shell) | Plate crack | Trophy: `loot.rare` |
| Pêche | Line hum + water lap | Splash pull | Pearl: crystal ping |

- Interrupt (aggro): `channel.break` + `world.ambush` if the pack engages.
- Filons mini-game (§14, v2): uses combat cues on a radius-2 board; success ×5 → `loot.rare`.
- Stations (§15.1, §15.2), positional loops in the hub and outposts (section 17): Fonderie (roar
  + bubbling metal), Tannerie (scraping), Tisserie (loom clatter), Scierie (saw cycle), Taillerie
  (grinding wheel), Forge (anvil hits), Atelier arcanique (resonant hum), Armurerie (rivets),
  Joaillerie (fine taps), Ingénierie (ratchets), Alchimie (bubbling), Cuisine (sizzle).
- Craft result by quality (§15.3): `craft.done` pitched up per quality band (3 bands TUNE);
  Catalyseur guaranteed affix: an extra ring.
- Consumables in combat (§15.4): Potion `item.potion` (gulp + `heal.rise`), Tonique (gulp + resource
  sound), Antidote (gulp + `status` end), Huile (oil sizzle + element colour), Bombe (`react.blast`
  without the sub), Lest liquide (`status.heavier`).
- Dependencies: `economy-designer` (professions, nodes, stations, consumables), `world-designer`
  (node positions for positional sound), `client-engineer` (channel progress events).
- Tests: **Given** a 2.1 s channel with a T3 pick, **Then** the loop length is 2.1 s and the success
  cue at 2.1 s; **Given** an interrupt at 1 s, **Then** `channel.break` at 1 s and no success cue.

---

## 16. Quests, exploration, events, audio logs (§16, §22, §21 Archives)

| Event | Cue | Twin |
|---|---|---|
| Quest accepted / step done / completed / turned in | `quest.accept` (low ledger tick, Tally's world) / `quest.step` / `quest.done` (stinger) / `quest.turnin` + `ui.coin` | Tracker, `!` and `?` markers with glyph (§16) |
| Puzzle (Énigme) solved (§4.3, §16) | `quest.puzzle` (a "lock opening" click chain) | Codex entry |
| Codex entry unlocked (§22) | `ui.codex` (page turn-like noise flick) | Codex badge |
| Dynamic event starts nearby (§22) | `world.event_horn` (non-melodic low swell) | Map marker |
| Chest opened / trapped chest | `world.chest` (lid creak + loot) / `world.chest_trap` (spring snap, then ambush) | Chest animation |
| Tally line (§2, register lines) | `voice.tally` (a short ledger "printer" tick under the text, no voice, art.md "No voice acting") | The text panel |

- **Audio logs (#21, Archives §21):** the playback lives on the `voice` bus with ducking (tech.md
  §5.4 FINAL), subtitles always (world.md §8 FINAL: "subtitles for all audio logs"). Content and
  whether logs are recordings or procedural ambient texture is `narrative-quest-designer`'s and an
  open conflict (feedback F18). This file provides the player: `audioLog.play(id)`, duck, pause
  on combat start, resume after.
- Dependencies: `narrative-quest-designer` (quest events, log data), `ux-designer` (tracker,
  subtitles), `world-designer` (events, chests).
- Tests: **Given** an audio log playing, **When** a fight starts, **Then** the log pauses and the
  duck releases in 300 ms (TUNE).

---

## 17. Hub, social, party (§21, §4.7, pillar 5 §1)

- Hub rooms (§21), each a positional bed (HRTF `PannerNode`, tech.md §5.4 FINAL) around the room's
  main source:

| Room | Bed | Point sources |
|---|---|---|
| Pont | Cold, clean high hum (the Bridge, art.md "too clean") | Tally's terminal ticks |
| Mess | **The existing Mess bed, unchanged** (classic tables, §21: "les modes existants restent intacts") | The classic tables' knocks |
| Soute | Cargo creaks, steel | Merchants' coins, the Parieur's dice-box |
| Fournaise | Furnace roar, steam | The stations of section 15 |
| Chapelle | Candle crackle, wire hum | Maître des Voies: a stone rune chime |
| Baie de lancement | Big empty space, wind through doors | Arena door clank |
| Archives | Paper-like hiss, servers hum | Terminals (#20), audio logs (#21) |

- Outposts (§21): a small version of the biome bed + the station loop + the Balise hum.
- Presence (§21, best effort): other players' marbles roll with `world.step` at −9 dB (TUNE),
  positional.
- **Emotes and pings** (pillar 5: "seulement des emotes et des pings"): 4 emote cues (PROPOSAL: a
  greeting ring, a "yes" double tick, a "no" low thunk, a "wait" held hum) and `ping.board` (a bright
  glass ping at the cell, positional) / `ping.map` (the same on the map). Rate limit: one emote or ping
  per player per 1 s (TUNE) plays; extras are dropped (spam guard, PROPOSAL; twin: the ping marker).
- Party (§4.7): invite received `ui.invite` (soft double chime), member joined/left
  `ui.party_join` / `ui.party_leave`.
- Dependencies: `network-engineer` (emote and ping messages, member events), `client-engineer`
  (hub scene positions), `narrative-quest-designer` (Archives content).
- Tests: **Given** 5 pings from one peer in 1 s, **Then** 1 cue; **Given** I am in Soute, **Then** the
  Fournaise sources are not playing (culled beyond 2 rooms, TUNE).

---

## 18. PvP and battle royale (§19, §20)

- PvP placement (§6.1, 20 s): `timer.tick` once at 5 s left (ux-designer.md §6.1, TUNE there), and a
  soft tick each second of the last 3 (PROPOSAL).
- PvP turn timer (§19, 60 s, a reminder): `timer.tick` at 10 s left (TUNE), never a buzzer: the
  timer is only a reminder, the claim uses rules.md §10.2 (FINAL there).
- Each player hears their own camp as glass (5.4). Spectators (if any later) hear side 1 as glass.
- Arena: no crowd (pillar 5, the lonely mood). A start `arena.gong` (low metal swell, non-melodic).
- Battle royale (§20, 6 players, radius 8):
  - Brèche rings: `breach.crack` and `breach.fall`, panned around the ring.
  - Chest pickup (finishing a Mouvement on it): `loot.<rarity>` of its content.
  - Elimination of a player (hero dead or no marble left): `br.elim`, a far toll panned to where the
    hero was; my own elimination is `hero.death`.
  - Orders resolution (§20: orders resolve in initiative order, an illegal order does nothing): each
    resolved order plays normally; a cancelled order plays `ui.deny` quietly at its unit.
- Dependencies: `pvp-br-designer` (timers, chests, ring schedule), `network-engineer` (who is me),
  `ux-designer` (timer display).
- Tests: **Given** a BR elimination of player 3, **Then** `br.elim` with pan of player 3's hero;
  **Given** 10 s left on the turn timer, **Then** exactly one `timer.tick`.

---

## 19. Mix, settings, accessibility (world.md §7, §8; ui.md §4; #60)

- Sliders (world.md §7 FINAL: music, ambience, effects, voice): 0 to 100, step 5 (PROPOSAL),
  defaults music 60, ambience 60, effects 80, voice 80 (TUNE), plus master 80 (TUNE). A slider at 0
  stops that bus's sources (CPU) rather than playing them at gain 0 (PROPOSAL).
- Curve: `gain = 10^((v − 100) × 0.4 / 20)` for v > 0, so 50 ≈ −20 dB (TUNE).
- The existing **Sound** toggle (ui.md §4, #284) becomes the master mute; its stored value migrates
  (section 4.9). It stays the first gesture that may start audio (ui.md §4 FINAL).
- Mono switch (PROPOSAL). "Sound captions" (PROPOSAL): a toggle that writes a short caption line for
  every priority ≥ 6 cue in the combat log area ("[Ejection: your Fragment]"); it reuses
  `ux-designer`'s combat log, so it is mostly a flag. Twin rule (world.md §7) is already met by the
  log; captions help hard-of-hearing players who keep sound on.
- Horror intensity slider (world.md §8, 0 to 3): scales stinger gains and S3 dissonance (0: no
  dissonance layer, calmer stingers; 3: full). It never removes a cue (FINAL there: "never changes
  gameplay information"). Whether the slider survives the science-fantasy pivot is feedback F12.
- Reduced motion, clear-board, photosensitivity: no change to sound (sound is not motion or flashes),
  and none of them may remove a tell's sound twin (world.md §8 FINAL).
- Persistence: local storage keys `audio.master`, `audio.music`, `audio.ambience`, `audio.fx`,
  `audio.voice`, `audio.mono`, `audio.captions` (PROPOSAL), read through `quality.ts`-style helpers
  with try/catch defaults.
- Dependencies: `ux-designer` (settings menu layout, captions in the log), `client-engineer` (DOM),
  `art-audio` (horror slider owner).
- Tests: unit for curve and migration; e2e: set music to 0, reload, `__audio().buses.music` is 0 and
  no music source is running.

---

## 20. Performance and budget (tech.md §5.5, §9; art.md §2)

| Budget | Value | Tag |
|---|---|---|
| Audio files downloaded | 0 KB (all procedural); a recording only when a synth cannot, Opus ≤ 100 KB a cue (art.md §2) | FINAL (art.md) |
| `data/audio/*.json` gzipped | ≤ 30 KB | TUNE |
| Audio code gzipped | ≤ 15 KB | TUNE |
| Concurrent voices | 32 (16 on the low tier) | TUNE |
| Live nodes, steady state (bed + stems) | ≤ 40 | TUNE |
| Main-thread time for scheduling per frame | ≤ 0.3 ms | TUNE |
| Cue latency from the effect slot start | ≤ 20 ms + output latency | TUNE |

- Measured by a Playwright perf test (reported, soft gate, like tech.md §5.5): play the R1 fixture
  fight at 4× speed, record `__audio().stats` (peak voices, dropped events).
- Risk: phones with high output latency (Android 100 ms+): cues are scheduled ahead by the
  timeline, so they stay in sync with animation if the timeline is known 100 ms ahead.

---
## 21. Feedback on the gameplay spec

Contradictions (C) and gaps (G) for the lead (`lead-game-designer`) to settle. The gameplay spec is
not modified here.

| # | Type | Where | Issue | Proposal in this file |
|---|---|---|---|---|
| F1 | G | Whole spec, "Fichiers critiques" | No audio section and no audio spec in the delta list: world.md §7 and tech.md §5.4 are not listed among the specs to update, so biome, ability, status and music sound have no owner file | Add `world.md` §7 and `tech.md` §5.4 to the PR 4 updates, or a `rpg/audio.md`; this file is the draft |
| F2 | C | §4.7, §6.2 vs world.md §7 | "Toll for the player's loss, clack for the enemy's" assumes two sides; a party has up to 8 entities in 2 camps, PvP has two players who each are "the player" | Listener's camp is glass, all others shell (5.4) |
| F3 | G | §6.6 | A Revenant that vanishes has no presentation rule; it must not look or sound like a Loss (it is not one) | `revenant.dust`, no camp tail (5.4) |
| F4 | G | §6.6, §6.7 | The hero's death ends the fight but gets the same 400 ms crumble as any marble; no distinct feedback is specified for the most important event of a fight | `hero.death` with dead air (5.4); `ux-designer` owns the visual |
| F5 | G | Pillar 2 §1, §5.1, §6.10 | "Chaque menace est annoncée" but only boss tells need a sound twin (world.md §8); terrain and ability tells (Brèche, Marée, Évent, Météore, Séisme, Sables) have none | Every tell gets a sound twin and per-turn ticks (6.4) |
| F6 | G | §6.3 Préparation | A Préparation fires "sans demander l'avis du joueur" during the opponent's turn; nothing says how the player notices it | `prep.snap`, priority 8, plus a log line (5.1) |
| F7 | C | §2 vs world.md §1, SPEC.md §5 | Hollow now has atmosphere pockets, but the ejection fiction is "sucked into space with a decompression sound". In an open world on a surface, where does an ejected marble go, and why does it decompress? | Keep the sound (the board edge is the "void" of the slag-glass, like a Gouffre); needs a lore line from `narrative-quest-designer` |
| F8 | G | §3, world.md §7 | "No melodic loops" (FINAL) meets Diablo/WoW-length sessions (30 to 60 min) with no music spec at all; risk of a thin or tiring score | Mostly silent exploration + tension stems (11); confirm the rule still holds (Q1) |
| F9 | G | §4, world.md §7 | Positional sound is defined for the hub only; packs, nodes, events and other players in the open world are not covered | Stereo pan + distance gain in the world (4.7) |
| F10 | G | §4.8 | Weather and night change rules (lightning +25 %, range −1, monsters +10 %) but have no required twin; on mute or without a HUD line the player cannot know | A HUD line from `ux-designer`, sound is flavour only (9.2) |
| F11 | G | §6.5, §6.10 | Elements are "synergy labels", but the ability card (§6.10) has no element field, and most abilities (Météore, Nova de givre…) only imply one | `element` on every ability (combat-designer already has it); sound uses it (5.3) |
| F12 | G | §2 vs world.md §8 | The horror intensity slider (0 to 3) belongs to the Dead Space mood; the science-fantasy pivot does not say if it stays | Keep it, it scales stingers and dissonance only (19) |
| F13 | G | §6.1, §19 | The 20 s placement and the 60 s turn timer give no signal rule (only ux-designer adds a tick) | One tick at 5 s / 10 s left (18) |
| F14 | G | §6.7 Usure | Healing reduction grows each turn from turn 20 with no tell and no visible cue required: a hidden rule against pillar 2 | One `stall.wear` cue + a HUD icon at onset (5.5) |
| F15 | G | §4.5 | The unfold is "le moment signature" but its skip and reduced-motion behaviour for sound is unspecified | Skip jumps to the settle thump; reduced motion keeps the sound (9.3) |
| F16 | G | §6.12, §18 | Retry in under 5 s: no rule on the boss's phase on retry (phase 1 again?) nor on what the player hears | Music restarts at phase 1 with a 300 ms fade (5.7) |
| F17 | G | §21 Mess | "Les modes existants restent intacts" should explicitly include their sound (classic knock, toll and clack, boss tells) so RPG sound work never changes them | Invariant test on the existing `sound.spec.ts` (4.9) |
| F18 | C | §21 Archives (#21) vs art.md §1, world.md §7 | Audio logs are "voice or ambient recordings", but art.md says "No voice acting" and #283 forbids paid or downloaded assets: who records them, with what voice? | `narrative-quest-designer` decides; this file only provides the player and ducking (16) |
| F19 | G | §6.10 multi-target, §6.7 Brèche, §8.6 Armée des morts | Many effects per action (up to 9 or 18 cells, 4 bounces, 3 raises) with no presentation pacing rule; the timeline duration per effect has no owner in the gameplay spec | Scheduler merge (4.5); timeline owned by `client-engineer` |
| F20 | G | §5.3 | Intentions are shown, but nothing says how a player notices an intent that newly targets the hero | `intent.hero` pulse (6.4) |
| F21 | G | Pillar 5 §1, §21 | "4 emotes et des pings" with no list, no ping semantics (board cell, map tile) and no rate limit | 4 emotes, two ping kinds, 1 s rate limit (17) |
| F22 | G | §24.5 | The client windows list has no audio settings; #60 (sliders) is still open and the RPG adds buses | Settings in 19, Task SND-01 |
| F23 | G | §8.7 Arrêt du temps, Paradoxe | Abilities that rewind or freeze time are the most "audible" of the game but the spec gives no presentation for the state jump (Paradoxe moves every marble at once) | Rewind cue and a single merged move cue (6.3) |
| F24 | G | §12, §13 | Rarities have colour and glyph; nothing about the reveal moment (drop, chest, end of fight), which matters for a Diablo-like loot loop | Rarity cues as a third twin (14) |

## 22. Open questions

| # | Question | Who answers | My default |
|---|---|---|---|
| Q1 | Does world.md §7 "No melodic loops" stay FINAL for the RPG, with 30 to 60 min sessions? | Owners (Decision) | Yes, with mostly silent exploration and short non-looping stingers |
| Q2 | Is a short stinger chord (level up, victory, Aube) a "melody"? | `lead-game-designer` | No: a single chord is allowed, a phrase is not |
| Q3 | Four sliders (world.md) or five (adding `ui`)? | `ux-designer` | Four in the menu, `ui` folded into effects |
| Q4 | Does the horror slider survive the science-fantasy pivot? | Owners | Yes (19) |
| Q5 | Edge danger sound for the *enemy* hero too (an opportunity cue)? | `ux-designer`, `lead-game-designer` | No, only my hero (6.4) |
| Q6 | Do audio logs use recordings at all (budget, voice, licence #283)? | `narrative-quest-designer`, owners | Procedural ambient + text first |
| Q7 | Should the boss phase music restart at phase 1 on retry, or at the phase reached? | `encounter-boss-designer` | Phase 1 (the fight restarts) |
| Q8 | Can ability data carry a `sound` override field, or must cues be derived only? | `technical-designer`, `class-designer` | Optional override field |
| Q9 | Does `Effect` get `isolated` / `formation` flags on `Damaged`, a phase-change Effect and a Usure-onset Effect? | `combat-engineer` | Yes, cheap to add, otherwise the client diffs the view |
| Q10 | Party: should allies hear my moves at full gain or lowered? | `network-engineer`, `ux-designer` | Lowered −3 dB, panned (5.6) |
| Q11 | Mobile web (§26 Q6): keep the same voice cap or lower it by default on phones? | `tech-lead` | Low tier: 16 voices |

---
## 23. Tasks (one PR each)

Every Task follows CONTRIBUTING: Ready and assigned before work, branch `<issue>-<slug>` from `main`,
test commit before the code commit, 100 % coverage of the new client code (vitest), `bun run test`,
`tsc` and one `bun run e2e` run before the draft PR, a screenshot when the UI changes (CONTRIBUTING
6.4). "Common done" below means all of that and is not repeated. Phases are the R phases of §25.

### SND-01 Audio graph with buses and a master mute (R1)
Outcome: the client has one audio graph with music, ambience, fx, ui and voice buses, a limiter and
a master mute that the existing Sound toggle drives, and the classic ejection sounds exactly as
before.
- [ ] `audio/graph.ts`, `audio/mixer.ts`; `sound.ts` re-exports for one release
- [ ] fake-context unit tests: buses, limiter, fades without clicks, no context before a gesture
- [ ] migration test: stored `sound=off` mutes the master
- [ ] `client/e2e/sound.spec.ts` unchanged and green (toll, clack, `__audio`)
- [ ] links #60; common done

### SND-02 Cue patches as data with an integrity test (R1)
Outcome: every sound is a patch in `data/audio/cues.json`, checked by an integrity test, and the
ejection plays from that data.
- [ ] JSON schema of section 4.3, `audio/cues.ts` loader and `CueId` type
- [ ] the ejection voices moved to data, existing `sound.test.ts` assertions kept
- [ ] integrity tests of section 4.3 (silent ends, positive frequencies, buses, twins, length)
- [ ] seeded noise buffer (no `Math.random` in audio code); common done

### SND-03 Voice scheduler and client RNG (R1)
Outcome: cues are merged, capped and varied by a pure scheduler, so a big zone effect sounds like
one readable event and a replay sounds the same.
- [ ] `audio/scheduler.ts`, `audio/rng.ts` pure, table of section 4.5
- [ ] tests: merge window, instance cap, priority drop order, never drop priority ≥ 8, same seed same
      output
- [ ] `__audio().stats` (peak voices, dropped events) for e2e; common done

### SND-04 Combat cue map: moves, weighted pushes, damage, deaths (R1)
Outcome: in the R1 fight every move, weighted push, Shock, physical hit, death and ejection has its
sound, glass for my camp and shell for the other.
- [ ] `audio/cuemap.ts` for `Moved`, `Pushed`, `Slid`, `Blocked`, `Damaged` (Physical), `Died`,
      `Ejected`, `Loss`, `EntityLeft{Routed}` (sections 5.2 to 5.5)
- [ ] property test "all Weights 1 = classic pitch" and the Given/When/Then of 5.2 to 5.4
- [ ] `data-cues` attribute (last 8 cue ids) on `body`
- [ ] e2e: push and eject an enemy Fragment in the R1 fixture, `tail.clack` heard; common done
- Depends on `combat-engineer` (Effects), `client-engineer` (timeline slots)

### SND-05 Turn, Warrior kit, Edge danger, hero death, end of combat (R1)
Outcome: the player hears their turn, the Warrior's Rage and 2 abilities, the Edge danger tick, the
Guard, the hero's death with dead air, and the victory or defeat stinger.
- [ ] cues `turn.mine`, `res.warrior`, cast and impact of the 2 R1 abilities, `edge.could`,
      `edge.will`, `hero.guard`, `hero.death`, `end.victory`, `end.defeat`, `end.draw`, `rout`
- [ ] Edge danger rising-edge tests (shared logic with `rpg/edgedanger.ts`)
- [ ] e2e: lose the hero in the fixture, `hero.death` in `data-cues`; common done
- Depends on `ux-designer` (UX-07 Edge danger), `class-designer` (R1 abilities)

### SND-06 Combat music v1: tension and three stems (R1)
Outcome: a fight has a drone, a pulse and a tension layer that follow Losses, hero HP, Edge danger
and tells, with dead air on the hero's death.
- [ ] `audio/tension.ts`, `audio/music.ts` (`nextMusic`, `stemGains`, `pulseBpm`) pure, tests of 11.3
- [ ] procedural stems in `data/audio/music.json`, player built and torn down on `silent`
- [ ] e2e: after two Fragment losses, `__audio().music.tension > 0` and pulse layer on; common done

### SND-07 Elements and the R2 class kits (R2)
Outcome: Gardien, Guerrier, Mage and Guérisseur abilities, resources and 8 ultimates each have their
cast and impact cues, with the 6 element colours and 3 damage kinds.
- [ ] derivation rule of 6.2 and the optional `sound` override read from ability data
- [ ] patches: 3 kinds, 6 elements, 4 lineage exciters, 4 resource sounds, 8 ultimates
- [ ] integrity: every R2 ability resolves cues, every ultimate has its own
- [ ] e2e: each class casts its first ability in the bot fixture; common done
- Depends on `class-designer` (`element`, `sound` fields), `technical-designer` (schema)

### SND-08 Statuses, reactions and diminishing returns (R2)
Outcome: every status of §6.11 sounds when applied and ended, damage over time ticks, the Mage
reactions burst, and a refused control thunks.
- [ ] cues of section 7, merge with the impact of the same action
- [ ] integrity: every status id has its cues; tests of section 7; common done
- Depends on `combat-engineer` (`StatusApplied`, `StatusEnded`, `StatusRefused`, `Reaction`)

### SND-09 Terrain cells and tell twins (R2)
Outcome: the 6 R2 cell types and every tell (placement, per-turn ticks, firing) have their sound
twins.
- [ ] cues of section 8 for the R2 cells, `tell.place`, `tell.tick` (last-turn variant)
- [ ] tests of 6.4 and section 8; common done
- Depends on `world-designer` (cell ids), `combat-engineer` (`TellPlaced`, `TerrainChanged`)

### SND-10 Progression and tutorial cues (R3)
Outcome: XP, level up, passive and active points, lineage trial and tutorial steps have short UI
cues on the `ui` bus.
- [ ] cues of section 13, merge of multiple level-ups; tests; common done
- Depends on `progression-designer`, `narrative-quest-designer`

### SND-11 Biome beds and world steps for the first 3 biomes (R4)
Outcome: walking through Plaines de Lumen, Sylve de Cendre and Tourbières de Suie sounds different,
with steps paced by the biome cost and a 3 s crossfade at zone borders.
- [ ] `audio/ambience.ts` (bed gains, seeded event scheduler) pure, `data/audio/beds.json`
- [ ] steps, Élan, Balise activation and teleport cues
- [ ] tests of 9.1 and 9.2; e2e: cross a border, `__audio().ambience` changes; common done
- Depends on `world-designer` (biome of the current tile, step events)

### SND-12 Unfold, engagement and exploration music (R4)
Outcome: the tile unfolds with its signature sound, ambushes and engagements sound different, and
the music moves from explore to threat to combat and back.
- [ ] `world.unfold` with ring clicks and skip, `world.ambush`, `world.engage`
- [ ] music states explore, threat, combat transitions (11.2)
- [ ] tests of 9.3; e2e: walk into a pack, unfold then combat music; common done
- Depends on `client-engineer` (unfold timeline and skip event), `world-designer` (aggro radius)

### SND-13 Hub beds with positional sources (R4)
Outcome: the minimal hub has room beds and HRTF point sources, and the Mess keeps its classic sound
unchanged.
- [ ] hub beds of section 17 for the R4 rooms, `PannerNode` sources, culling beyond 2 rooms
- [ ] invariant: classic modes e2e sound tests green; common done
- Depends on `client-engineer` (hub scene positions)

### SND-14 Mixer sliders, mono and captions (R4)
Outcome: the settings menu has master, music, ambience, effects and voice sliders, a mono switch
and sound captions, all saved locally.
- [ ] slider curve and persistence (section 19), a bus at 0 stops its sources
- [ ] captions flag writes into `ux-designer`'s combat log
- [ ] e2e: music 0 survives a reload; screenshot of the menu; common done
- Depends on `ux-designer` (menu layout, log), closes #60 if owners agree

### SND-15 Loot, inventory and merchant cues (R5)
Outcome: every loot reveal sounds its rarity, and buying, selling, repairing, socketing and gambling
have their cues.
- [ ] cues of section 14, integrity "every rarity has a cue"; tests; common done
- Depends on `economy-designer` (rarities, merchant events)

### SND-16 Quest cues and the audio log player (R6)
Outcome: quests, puzzles, the Codex and Tally's lines have cues, and audio logs play on the voice
bus with ducking, subtitles and a pause in combat.
- [ ] cues of section 16, `audioLog.play`, duck and pause; tests; common done
- Depends on `narrative-quest-designer` (#21 content, subtitles), `ux-designer`

### SND-17 Gathering, stations and consumables (R7)
Outcome: the 5 gathering channels, the refining and crafting stations and the combat consumables
have their sounds, with interrupts and results.
- [ ] cues and loops of section 15, positional stations; tests of 15; common done
- Depends on `economy-designer` (professions, stations, consumables)

### SND-18 Boss music and boss cues (R8)
Outcome: each converted boss has its phase pulses, colour and signature, with dead air before a
phase and an instant restart on retry; multi-tile fights pan by region.
- [ ] `music.json` bosses table (section 12), phase transition, Résilient return, enrage
- [ ] off-screen region attenuation (4.7), `camera.region`
- [ ] tests of 12 and 5.7; e2e: The Echo phase 2 and retry; common done
- Depends on `encounter-boss-designer` (phases, tells), `combat-engineer` (phase Effect)

### SND-19 The full world and class set (R9)
Outcome: the 7 remaining biomes, the 4 remaining classes with their ultimates, every cell type,
monster families and the night and weather layers are in.
- [ ] beds for biomes 4 to 10, patches for Nécromancien, Chronomancien, Géomancien, Assassin
- [ ] remaining cells (section 8), monster families and archetypes (section 10), night and weather
- [ ] integrity tests cover the whole data set; common done
- Depends on `world-designer`, `class-designer`, `encounter-boss-designer`

### SND-20 Multiplayer audio: party, emotes, pings, PvP, battle royale (R10)
Outcome: in a party each player hears their own camp as glass, allies lower and panned, emotes and
pings with a rate limit, PvP timer ticks and the battle royale rings, chests and eliminations.
- [ ] listener rules of 5.4 and 5.6 for parties and PvP, emotes and pings (17), timers and BR (18)
- [ ] tests; e2e with two tabs: a ping from tab B is heard in tab A (`data-cues`); common done
- Depends on `network-engineer` (me, camps, messages), `pvp-br-designer`
