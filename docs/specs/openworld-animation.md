---
id: openworld-animation
type: feature-design
status: draft
title: "Open world animation"
parent: openworld
depends-on: [motion]
---

# Open world animation (#1035)

One topic: what moves in the Open world, for how long, with which easing, at what cost, and what it does under reduced
motion. It is story 1 of the split of #1035; stories 2 to 7 build it, one PR each. It changes no rule (`openworld.md`,
`rules.md`): the state (cells, collisions, save, data attributes) is final at once, only what is drawn moves, as the push
animation of #967 already does. No sound. Contrast, 3:1 and lighting are not part of it.

Durations and easings are the **tokens of `motion.md`** (#1036), named here and not repeated. A number in brackets is
today's value or my proposal for a token `motion.md` may lack (section 8).

## 1. Common rules

- **Clock**: every animation reads one frame time `now` (ms), the one `OpenWorldMode.frame` gets. Pure helper in
  `client/src/openworldglide.ts` (story 1, no visible change):
  `animT(startMs, nowMs, durMs, ease): number` returns the eased progress, 0 before the start, 1 from `startMs + durMs` on,
  `ease` one of the tokens' easings. `durMs <= 0` returns 1. Unit tests cover 100 % (before, start, middle, end, after, zero
  duration, each ease). Looping motions use `loopT(nowMs, periodMs): number` in `[0, 1)`.
- **Reduced motion** (the page's `reduced()`, the in-game setting): every animation of this spec is off. `animT` is not
  called; the pose is the rest pose, as today (marbles jump, no glide, the water glow held at 1). One gate, read once a frame.
- **Slow check**: `window.__openworldSlow` multiplies the durations, as for the push (`openworld.md` section 4).
- **Snap**: a click, a zoom, a resize, a fixture, a new world or leaving the mode ends every animation on its final pose.
- **Draw only when needed** (#1058): the frame draws when `dirty` or when a loop is live. A finite animation sets `dirty` until
  `animT` returns 1, then stops drawing. Only the loops of section 3 (water) and 6 (ambience) may keep drawing, and only when
  their element is in view. `body[data-openworld-anim="1"]` stays set while any finite animation runs.
- **Props near the hero** (#1058): the loaded 441 chunks are not rebuilt or re-uploaded by an animation. Per-prop motion is a
  term of the shader driven by one uniform (`uTime`), never an instance-matrix rewrite; the hi-detail props near the hero
  keep their set. No animation changes the chunk centre, `reach` or the loaded instances.
- **Held walk** (#1065, #1290): within a step the pace is steady. No animation lengthens a step, delays the next, or adds a pause.
  A tap or a short walk steps at `motion.step` (140 ms, `GLIDE_MS`). A held key, a held stick or a far tap keeps 140 ms for its
  first 2 steps, then each step is 15 ms shorter down to the cruise pace of 80 ms (`CRUISE_MS`, `stepMs(n)`: 140, 140, 125, 110,
  95, 80...). The glide of a step lasts as long as the cadence to the next step (the marble never pauses), the troop delay stays
  at most half of it. A release stops at once, a new press starts at 140 ms again. Reduced motion has the same cadence (no glide).
  A 150-cell held walk lasts 12.2 s instead of 21.0 s; squash and turn ride inside the step.
- **Per-frame cost**: no allocation in the frame (pools and reused vectors, as `Marble` poses). Each story measures the frame
  time and CPU before/after in its PR (budget #1034); the allowed increase is 0.3 ms median per frame at the widest zoom with
  441 chunks, 0 on a frame where nothing is live.
- **LOD cut**: past `ROLL_ZOOM` (3, `openworldglide.ts`) the marbles draw no roll and no squash; the same cut drops every
  small effect below (marked "cut"). The camera and UI motion are not cut.
- **Nothing hides a target**: no effect covers a cell, a marble or a legal target (`ui.md` section 1).

## 2. Story 2: hero and troop step

| What moves | Duration, easing | Trigger | Cut |
|---|---|---|---|
| Hop and squash: the marble rises 0.08 cell at mid-step, flattens `SQUASH` (0.12) on the last 30 % and is round again on the cell | `motion.step` (140 ms), ease-out, the glide's own | a hero or troop step | cut at `ROLL_ZOOM` |
| Settle after landing: one small overshoot of 0.03 cell | `motion.settle` | end of a step, only if no step follows at once | cut |
| Idle breath: scale 1 to 1.03, period 2400 ms [`motion.breathe`] | loop | hero idle for 800 ms, stops at the next step | cut |
| Turn: the marble's facing eases to the new direction by the shortest arc, yaw-aware (#1026) | `motion.step`, ease-in-out | the facing changes | cut |

- **Budget**: 1 pose per marble, at most 7 (hero and 6 troop), already written by `Marble`; the breath is the only loop and
  is the hero's alone. A held walk shows no breath and no settle: each step starts the next.
- **Reduced**: no hop, squash, settle, breath or turn; the marble jumps to its cell facing the new way.
- **Static**: enemies (they only move when pushed, #967), the troop's idle (no breath), the ejected marble (its own fall).
- **Acceptance**: with the fixed clock, a step at `t = 0` has the marble on the old cell, at `t = 140 ms` on the new cell with
  scale 1 (unit); a held walk of 5 steps lasts 140 + 140 + 125 + 110 + 95 ms (`stepMs`), to the ms; idle for 800 ms starts the breath, the next step stops it;
  with `reduced()` true the pose is the rest pose at once.

## 3. Story 3: water

| What moves | Duration, easing | Trigger | Cut |
|---|---|---|---|
| Ripple: a ring grows from the hero's cell to 1.2 cells while it fades 0.5 to 0 | `motion.slow` (600 ms [proposal]), ease-out | the hero steps onto or off a cell next to water | cut |
| Shore foam: the shore band of water cells brightens 0 to 0.25 and back, period 3200 ms, phase by cell | loop | a water cell with a land neighbour in view | cut |
| Splash: 6 droplets rise 0.3 and fall into the cell | `motion.slow` (600 ms), ease-out | an enemy ejected into water (the fall of #967, 410 to 710 ms) | cut |
| Glow breath (today): `emissiveIntensity = 1 + 0.15 sin(ms / 1200)` | loop, kept | a lake in view | kept |

- **Budget**: at most 4 ripples and 2 splashes live (pool of 6 quads, one draw); foam is a shader term (cell phase from its
  coordinates), no per-cell JS. The water already forces a draw every frame while a lake is in view (`frame`, `moving`):
  the foam and ripples ride that frame and add no draw of their own. With no lake in view and no ripple live, nothing draws.
- **Built (#1101)**: `client/src/openworldmotion.ts`. The foam and the ripples are the water material's emissive (TSL), the foam read from the
  instance colour (a cell with a land neighbour), the ripples from 4 uniforms; the splash is 6 particles of the #1110 pool with a gravity, born
  when the fall starts. No mesh, no draw call, no instance write. Off under reduced motion, on the low tier (`body.dataset.tier`) and past `ROLL_ZOOM`.
- **Reduced**: no ripple, foam or splash; the glow stays held at 1 (today).
- **Static**: still water far from the hero, deep water, the cell colours (`waterColor`).
- **Acceptance**: a step next to water spawns one ripple that is gone after 600 ms; a fifth ripple replaces the oldest; an
  ejection into water spawns one splash at the fall's cell; zoom past `ROLL_ZOOM` draws none; the pool never grows.

## 4. Story 4: props

| What moves | Duration, easing | Trigger | Cut |
|---|---|---|---|
| Sway of trees and bushes: lean up to 2 degrees (trees) and 3 (bushes), period 4000 ms, phase by cell | loop (vertex-time term) | props in view | cut |
| Grass reacts: grass within 1 cell of the hero bends 10 degrees away and returns | `motion.settle`, ease-out | the hero or a troop marble passes | cut |
| Dust puff on a refused boulder push: 5 puffs rise 0.25 and fade | `motion.base` (250 ms [proposal]), ease-out | the hero is blocked by a boulder (the nudge, `NUDGE_MS` 120) | cut |

- **Budget**: sway is `uTime` in the prop material's vertex shader: **no chunk rebuild, no instance write per frame**, no new
  draw. Grass reaction is a per-prop shader input for at most 7 marbles (positions in one uniform array). Puffs use the pool of
  section 6. A tree or bush never moves its collision or its cell.
- **Built (#1102, partly)**: the trees (low and detailed mesh, one material) lean by `positionNode`, the phase from `instanceIndex`. Not built:
  the grass bend (the grass is a ground column, not a prop) and the boulder dust (a boulder is broken by the hero since #1147, so no push is
  refused; the shards already fly).
- **Reduced**: `uTime` held at 0, no bend, no puff.
- **Static**: boulders, walls, peaks, the hi-detail set near the hero if its mesh has no vertex term (note in the PR).
- **Acceptance**: two frames 1 s apart differ only in the vertex term and the instance buffers are byte-identical; no chunk is
  rebuilt over 10 s of idle; a refused boulder push spawns 5 puffs, gone after 250 ms; reduced motion draws no frame at rest.

## 5. Story 5: camera

| What moves | Duration, easing | Trigger | Cut |
|---|---|---|---|
| Zoom punch: the zoom factor goes in 3 % then back | `motion.base` (250 ms max), ease-out then ease-in | a successful troop push (#967) | not cut |
| Pan ease: the camera's follow starts and stops with a smooth ease, not a hard start | `motion.base` (250 ms max), ease-in-out | the first step of a walk, and the end of a held walk | not cut |
| Shake: 2 px decaying offset, 3 oscillations | `motion.shake` (200 ms [proposal]) | an enemy ejected | not cut |

- **Budget**: only the camera uniforms change, no scene rebuild. Every camera motion lasts at most 250 ms. The punch and the
  shake never change `reach`, the chunk centre or the zoom the player set: they are an offset applied on top and removed at the
  end. The existing height and yaw easing (`ease`, `easeYaw`) is kept. The held walk keeps its speed: the pan ease cannot lag the
  hero by more than the existing follow lag, and the end of a walk is not delayed.
- **Built (#1103)**: `client/src/openworldcamera.ts`. The punch and the shake start when the push lands (after the step's glide); the
  pan lags 0.15 cell behind the hero at the first step of a walk and carries 0.15 cell on at its end, both over `motion.base`. The
  shake is horizontal, 2 px over 200 ms. Offsets are applied to the camera only (look-at point, zoom factor, view offset).
- **Reduced**: no punch, pan ease or shake; the camera follows as today.
- **Static**: the camera on a refused step; zoom and yaw set by the player.
- **Acceptance**: at the end of each (250 ms later) the camera offset and zoom factor are exactly the base values (unit);
  a shake on a frame with a resize snaps to base; `reachAt` is the same before, during and after (unit).

## 6. Story 6: biome ambience

| Biome | What moves | Period, easing |
|---|---|---|
| Forest | drifting leaves, 8 live | fall 6000 ms, linear, sideways sway [`motion.ambient`] |
| Tundra | snow, 16 live | fall 5000 ms, linear |
| Desert | heat shimmer: a 1 px wobble of the ground in view | loop, period 3000 ms |
| Meadow | none | none |

- **Budget**: one pool of 24 sprites, one draw, around the hero (radius 6 cells), reused when a particle leaves; none allocated
  after the first frame. Spawn chosen by the biome of the hero's cell (`openworld-terrain.md`). Shimmer is a shader term, no
  extra pass. Cut at `ROLL_ZOOM`. A loop keeps the page drawing, so it counts in the section 1 cost.
- **Built (#1104)**: the particles of #1110 stay as the owner asked (pollen, leaves, snow and dust, counts as in `AMBIENT`), from the one
  pool, no new draw; this story adds the Desert shimmer, a vertex term of the sand ground (`shimmerPosition`, 0.02 cell about a pixel,
  3000 ms, per-cell phase, only when the hero stands in the desert). Off on the low tier (the step's dust stays), under reduced motion and
  past `ROLL_ZOOM`.
- **Reduced**: nothing; no particle is spawned.
- **Static**: the cell colours, the fog, Meadow.
- **Acceptance**: the pool never exceeds 24; Meadow draws none; crossing from Forest to Meadow lets the leaves finish their fall
  and spawns no new one; past `ROLL_ZOOM` the pool is empty.

## 7. Story 7: Open world UI

| What moves | Duration, easing | Trigger |
|---|---|---|
| HUD slides in/out from its edge | `motion.base` in, `motion.fast` out, token easings | entering/leaving the mode, folding |
| New world sheet slides up and fades | `motion.base` in, `motion.fast` out | opened/closed |

- **Budget**: `transform` and `opacity` only, no layout change, no canvas redraw; it matches the thumb dock (`thumb-dock.md`,
  #1032) and reuses the tokens as is.
- **Reduced**: the HUD and the sheet appear and vanish at once (`prefers-reduced-motion` and the in-game setting).
- **Static**: the content of the HUD, the focus order, hit areas during the slide (they take the final place at once).
- **Acceptance**: a slide measured on the compositor shows no layout shift (CLS 0); with reduced motion the end state is set
  with no transition; focus is not lost.

## 8. Tokens needed from `motion.md`

Named and used: `motion.step`, `motion.settle`, `motion.base`, `motion.fast`, `motion.slow`. If `motion.md` lacks them,
`motion.md` is the place to add them, not this spec: `motion.slow` (600 ms), `motion.shake` (200 ms), and two **looping**
tokens that are periods, not durations, `motion.breathe` (2400 ms) and `motion.ambient` (3000 to 6000 ms). `motion.step` must
equal `GLIDE_MS` (140). Open point for the lead: if `motion.md` has no loop notion, loops keep their period here.
