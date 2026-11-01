# Brief for 3d-artist: the 1v1 arena and the Ship hub as one place (#1314, #1315)

Art director: concept-artist. Built in Blender first (Blender MCP), judged on `look` renders, three.js only after approval.
Owner rules, kept: low poly, no heavy texture, clear, shared theme/meshes/lighting with the Open world, openings showing the outside.
Owner verdict on the last attempt (Table Zero): "very ugly and poor". Cause: black void, no ground, no sky, no depth, flat dull cells, a window of cropped columns, black marbles lost. This brief fixes those, it does not add detail: it adds a PLACE, a gradient, a light with two sides, and things that sit.
Superseded: the two flat SVG mockups of round one and the "minimalist = empty" reading. Not changed: rules, thresholds, marble skins.

## 1. Three directions (short)

A. **Dusk Mesa.** The slab stands on a hex-stepped plateau in the open; the Open world (terrain, outcrops, towers) falls away in rings to a horizon. Sky is a vertex gradient, low sun, big pale planet. Everything outdoors.
B. **Bay Window.** A low-poly ship bay: dark panel floor with one warm lamp pool, a huge window the width of the frame showing the Open world at dusk. Closer to the ship, darker, risks the old room again.
C. **Terrace over the Survey.** A = A with a built terrace (parapet posts, two steps, banners of claim stakes) and the Open world shown as a miniature hex map far below, like a table the arena looks over; fog bands between.

**Chosen: C (A's place, with C's terrace and lift).** Why: one outdoor place carries both modes (the map literally lies below the table; lairs are tables out there, towers are visible from the terrace), it needs no interior props, the horizon and sky give depth for free, and a terrace gives the hub a plan and a lift to go down to the Open world. B is the ship we are leaving; A alone is a floating slab in a field.
Lore line (one sentence for captions): through the slag-glass visor Hollow has a sky; the terrace is Table Zero, the grid below is the Hollow Survey, the towers are the other tables.

## 2. Palette (extends the 8, flat colors, ramps by vertex color)

Core (unchanged): Hollow Black `#0b0d0f`, Slate `#4b4f55`, Moss `#446957`, Dust `#877d65`, Slag Teal `#2fb5a0`, Glass Cyan `#7fd6e8`, Sodium `#d9822b`, Bone `#d8d4c8`.
Sky ramp (only for the sky, fog and far layers): zenith `#0b0d0f`, high `#17303d`, mid `#2c5a63`, horizon band `#e8a870` (2 to 4 percent of the frame), haze `#9db8c4`.
Shadow tint: `#1c2a33` (cool), never pure black. Lit tint: warm `#ffd9a8`.
Cells: a light dish `#b3a98a` (Dust lifted) so BLACK marbles read as dark on light; white marbles read by their dark contact shadow and cool underside. Do not darken the cells to flatter the white ones.

## 3. Light, one setup for arena, hub, Open world

- Sun: warm `#ffd9a8`, from upper left, azimuth 50 degrees left of the camera axis, elevation 28 degrees. Shadows are not real: baked.
- Sky fill: hemisphere, sky `#9db8d8` over ground `#5a4636`, low strength, so shade sides are cool and lit sides warm.
- Rim: a weak cool Glass Cyan `#7fd6e8` kicker from upper right behind. No point lights, no emissive except the sun disc, tower lamps (Sodium) and the turn bar.
- Baked in vertex color: ambient occlusion (darker at cell edges, at wall foots, under overhangs, 0.6 to 0.8 factor), side faces 0.55 of top, a vertical gradient on columns (lighter top 15 percent).
- Soft contact shadow: one 128 px blob texture under every marble and prop (under 1 KB), offset lower right with the sun, a tint of `#1c2a33` at 45 percent.
- Marbles: keep game materials (gloss). They take the sky as reflection: bright horizon band top-left makes a visible highlight on the black ones. Check the black marble shows a readable highlight and a rim.
- Fog: linear, haze `#9db8c4` toward the horizon, beginning past the plateau edge, never over the board.

## 4. Composition from the game's camera (fov 40, looking down about 55 to 60 degrees, board centred)

Desktop 1280x720: the board fills about 640 px of the middle; the visible surroundings are the left and right bands (about 260 px each) and the top 140 px.
- Top 140 px: horizon line at about y=60, a sky gradient above, the sun disc glowing at upper left (x about 230), the pale planet partly cut at upper right, two towers (one Sodium lamp lit) on the horizon right of centre, teal crystals.
- Left and right bands: the plateau's stepped hex terrain rings falling away, Moss and Dust, a claim wall run, three teal outcrops, two frozen-crew shells, a cairn. The parapet posts frame the slab at the 6 corners, short, with Bone caps.
- Foreground (bottom 80 px behind the HUD): the terrace steps and the plateau edge.
Phone 390x844: the board sits low (bottom 45 percent), so the TOP 45 percent is the world: horizon at about y=300, sky above it with sun and planet, the Open world miniature map below the horizon as three receding bands of hex columns, a tower on the left third and one on the right, fog bands. This is the money shot: it must read as a place at 390 px with nothing cropped mid-shape (no half columns on the frame edge).
The view can rotate: the ring is 360 degrees, with the horizon and sky all round, the sun fixed in world space.

## 5. Mesh list and triangle targets (flat shading, vertex colors, no PBR map)

| Mesh | Count | Tris each | Total |
|---|---|---|---|
| Slab, rim (chamfered, 6 segments), plinth, 2 steps | 1 | 220 | 220 |
| Cells: hex dish (top, a 0.04 inset ring, sides) | 61 | 24 | 1,460 |
| Turn bar (flat strip on the rim, 2 sides) | 2 | 12 | 24 |
| Parapet posts with caps | 6 | 20 | 120 |
| Plateau terrain: hex columns, 4 rings stepping down, tinted Moss/Dust/Slate | 180 | 20 | 3,600 |
| Open world miniature below: hex columns in three receding bands | 450 | 12 | 5,400 |
| Far ridges (3 stepped silhouettes, vertex-faded to haze) | 3 | 300 | 900 |
| Slag-glass outcrops (5-sided cones, 2 to 3 per cluster) | 24 | 10 | 240 |
| Survey towers (three stacked prisms + lamp) | 4 | 72 | 288 |
| Claim wall runs (black base, sodium cap, bone stake) | 24 | 28 | 672 |
| Frozen crew (20-tri shell sphere) | 10 | 20 | 200 |
| Cairns, stakes | 12 | 12 | 144 |
| Sky dome (vertex gradient, no texture) | 1 | 128 | 128 |
| Sun disc, planet (fan) | 2 | 48 | 96 |
| Fog band cards (3 vertical gradient quads, alpha) | 3 | 2 | 6 |
| **Scene total** | | | **about 13,500** |
Marbles are extra and unchanged (28 plus a spare). Hard ceiling for the scene: 40,000 triangles, 30 draw calls (instance the columns by material), 0 point lights. Textures: one 256x4 gradient ramp (under 2 KB) and one 128 px blob (under 1 KB); everything else vertex color. All meshes export as one glTF with meshopt, under 150 KB, hex columns as one instanced prop.

## 6. Readability rules (check on every render, phone first)

1. Cell edges: each dish separated from its neighbours by a darker 2 to 3 px gap at 390 px width. The board must read as a grid at a glance.
2. Black marbles: dark body, visible sky highlight top-left, a Bone-free but lighter dish under them. If a black marble merges with the plate, the dish is too dark: lift it, never add a glow.
3. White marbles: visible against the dish by shape (dark contact blob, cool underside).
4. Turn: Glass Cyan flat bar on the rim of the side to move, plus the HUD word. Selection: raised marble plus a Bone ring. Legal targets: near-black ring plus arrow on the dish. Last move: Sodium cell edge. Boss tells: steady Bone or near-black glyphs on cells.
5. The sky, sun and towers stay out of the board's tonal range (nothing brighter than the dish behind the marbles; the horizon band is behind the far rim, not the cells).
6. No flicker, no bloom dependence. Contrast is the owner's: report the cell edge and marble figures, never loosen.

## 7. The Ship hub, same place, a plan

The hub board is the terrace at radius 3 (37 cells), slightly larger slab, same sky and sun. The existing room props (boss door, CRT, table, robot, antenna, arena, lift cage, calendar, map table, podium, globe, dummy) are re-drawn in the kit, each at most 60 triangles, each with its own ring color kept for identification (these glyph colors are theirs, ringed flat, not the palette).
- The five decks are five times of the same dusk, changing only the ramps: Mess `#e8a870` horizon, Moss ground; Cargo hazy `#c9b48a`, Dust ground; Furnace Sodium sky `#d9822b` to `#3a1a10`, Badlands `#643d35` ground; Chapel teal `#2c5a63` with Slag outcrops, Forest ground; Bridge pale `#c4d0d8` horizon, Tundra ground. A lift moves the sky ramp, nothing else.
- The Open world door is a plank-and-stake pier running off the terrace edge toward the miniature map: walk to it to go down. The medals and the lore terminals are standing slabs on cells (Slate with a Bone face).
- Each room prop casts the same blob shadow; labels stay DOM plates.
Boss rooms later: same terrace, the boss's one prop and a sky variant. Not in this brief.

## 8. Deliverables for each round

1. Blender renders with `look`: desktop 1280x720 and phone 390x844, from the game's camera (fov 40, board centred, 55 to 60 degree pitch), mid-game board with a selected line of 3, legal targets, last move, turn bar.
2. The same at the phone viewport for the hub, Mess deck.
3. Wireframe or stats: triangles per mesh, total, draw calls, texture list.
4. A close crop of black marbles on cells.
I will answer each round with what fails and exactly what to change, or APPROVED. I approve only what I would ship.
