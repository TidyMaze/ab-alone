# Coverage of the redesign: every mode, boss, screen (art director)

Rule for every row: SAME KIT (terrace slab, plateau rings, ridges, haze, hex dish `#b3aa81`, one flat pedestal disc, the 7 materials), SAME LIGHT (one sun, elevation 22, azimuth 50 left, warm `#ffd9a8` lit, cool `#1c2a33` shade). A row changes only: sky ramp, ground tint ramp, one prop, and its overlay glyphs. A tell is a SHAPE (ring, chevron, digit plate, crack, glyph), never colour alone, and must read at 390 px on the dish (`#b3aa81`) at 3:1 minimum in its own tone. Overlays are drawn by the game over the dish; the scene must leave the dish clear (no shadow, no prop) under every cell the overlay uses.

Status: only the 1v1 arena (batch A) is under judgment (round 3 = NOT YET, 7 small changes). A final APPROVED needs every row rendered AND judged. Spec sources: `docs/specs/game-design.md` sections 3, 6, 7, `stalker.md`, `roguelite.md`, `openworld.md`.

Renders per row (unless said otherwise): phone 390x844 default pitch, desktop 1280x720 default pitch, one close crop of the tell, plus the view set (yaw 0/90/180/270, pitch 10/50/81) for batch A only. Decks: Mess sky `#e8a870`, Cargo hazy `#c9b48a`, Furnace Sodium `#d9822b` to `#3a1a10`, Chapel teal `#2c5a63`, Bridge pale `#c4d0d8`; ground Moss/Dust/Badlands/Forest/Tundra per brief section 7.

## Batch A: standard board (radius 4, 61 cells), no overlay: the base (render once, swap ramps by script)
| # | Item | Scene must show | Sky / ramp | One prop | Render |
|---|---|---|---|---|---|
| 1 | 1v1 arena: hot-seat, bot, online, ranked | Base terrace, 14v14, selection ring, legal-target arrows, last-move edge, turn bar. Online/ranked: same scene, add only the opponent name plate in DOM | Mess dusk (base) | none | Round 3 views (in progress) |
| 2 | Daily challenge | Same board as the day's boss or standard layout; the daily marker is DOM. Scene follows the boss of the day's deck | deck of the day's boss | none | None extra: covered by the boss rows, state it in the PR |
| 3 | Trainer | Standard board plus hint ring and eval bar (DOM). Hint ring = Bone ring on the dish, a shape distinct from the selection ring | Mess dusk | a chalkboard-slab on the parapet | 1 render with a hint ring |
| 4 | Fight won / lost screens (all modes) | Board frozen, marbles ejected visible, scene dimmed 25% by DOM. Won: sun warmer (`#ffd9a8` glow +20%). Lost: shade tint over everything, sky ramp toward `#17303d`. Same geometry, ramp only | Won warm, lost cool | none | 2 renders (won, lost), desktop and phone |

## Batch B: Mess and Cargo decks, standard board with overlays
| # | Boss | Scene must show (read from spec and code) | Sky / ramp | One prop | Render |
|---|---|---|---|---|---|
| 5 | Echo (Mess) | Ghost preview of the mirrored bonus moves: marble ringed in teal on landing cell; free-move teal ring on movable marbles and a teal DIAMOND over the target arrow. Dish must keep teal readable | Mess `#e8a870` | a quartermaster bench slab at the east plinth | close crop with ghost + diamond |
| 6 | Hull (Cargo) | Crack on a cell: dark crack that ticks 2 turns (2 stages: fresh, about to fall), cell vanishing to void (dark under-layer visible), rim cracks first then inner cells | Cargo `#c9b48a` | broken hull plate leaning on the plinth | 3 states: fresh crack, last tick, void hole |
| 7 | Alien (Cargo) | Eggs on cells with a digit plate 4,3,2,1 (pale digit on near-black plate, camera-facing), glow under the egg on 1, hatchlings; a crushed egg | Cargo | ore sack heap | close crop, eggs 4/1, hatch |
| 8 | Rail Yard (Cargo) | Chevrons at both board edges of a swept line, a train sweeping, announce lead 5; chevrons on the dish edge readable at 3:1 | Cargo | a rail buffer stop | close crop of an announced line + a sweep frame |
| 9 | Assembly Line (Cargo) | 3 belts: roller each end, scrolling steel surface, chevron on each belt cell, counter on the centre belt (turns to reverse), press plates and a press hanging over a strike slot blinking red | Cargo | the press gantry (it is also the prop) | belt at rest, counter 1, strike announced |

## Batch C: Furnace, Chapel, Bridge decks, standard board with overlays
| # | Boss | Scene must show | Sky / ramp | One prop | Render |
|---|---|---|---|---|---|
| 10 | Choir (Furnace) | 3 armies of 6 (Alto, Tenor, Bass) in triangles, a steady pale ring on the army that moves next (the ring is a shape on 6 marbles) | Furnace Sodium `#d9822b` to `#3a1a10`, Badlands ground | tuning-fork pillar | army ring on each of the 3 armies |
| 11 | Magnetizer (Furnace) | Pale + or - glyph on top of polarized marbles (shape), repulsion lines when two like signs touch; crane silhouette | Furnace | magnet crane post | close crop of + and - marbles |
| 12 | Unstable Core (Furnace) | Charged centre cells, 1 to 3 pips above marbles (shape), overload at 4, wedge rhythm; reactor glow only as Sodium on the plinth, not on the dish | Furnace | reactor stack | pips 1, 3, overload flash |
| 13 | Chaplain (Chapel) | Hover preview: marbles that would flip show a ring and glyph; converted marbles: half shell, half glass with a pale glyph and cracks (shape and texture); the martyr: marked ring and glyph then explosion flash and shards | Chapel `#2c5a63`, Forest ground | confessional booth | preview, martyr, converted marble close crop |
| 14 | Overseer (Chapel) | Dark hexagonal pedestal with a pale eye on cell (0,0), 6 cores (pale marble with its own glyph), neurotoxin timer, burned core | Chapel | the Overseer pedestal IS the prop (keep its silhouette from the code) | pedestal + cores, burned core |
| 15 | Stalker (Chapel) | Fog of war: cells beyond sight drawn dark (board outline stays), hidden boss marbles not drawn, revealed blocker marble, boss last-move ring in sight only. The fog must be a dark dish tone, not a hole in the scene | Chapel, night variant (zenith `#0b0d0f`) | a watch lamp on the parapet | P1 (sight 3) and P3 (sight 1) |
| 16 | Pulsar (Bridge) | 6 pulsars round the board, steady glow plus counter 2 then 1, an amber chevron before each of 9 lines, faint shock rings when counter is 1; pulse force text is DOM | Bridge `#c4d0d8` pale | a beacon pylon (x6 on the parapet posts) | counter 2, counter 1 + chevrons, pulse frame |

## Batch D: special boards (new slab, same kit)
| # | Item | Scene must show | Sky / ramp | One prop | Render |
|---|---|---|---|---|---|
| 17 | Swarm (Cargo, #1008, spec 7.14) | Standard radius 4 board, the player starts in the middle: 11 marbles in one compact group, the boss starts with none. Announce RING on every empty rim cell where a swarm marble lands next turn (3 a turn, 4 in P3, all 6 edges, 24 rim cells): rings on the rim dish must read at 3:1 and not touch the plinth shadow, so keep the rim dish clear of AO and props. Marbles drop in on their marks (a drop frame with the contact blob). Evac clock 40 to 0 and "(-2)" are DOM; at clock end the evac LIGHTS THE WHOLE BOARD (a Bone/Sodium wash on every dish, a lift of the survivors): render that state | Cargo `#c9b48a`, Dust ground; evac frame: warm sky pushed +30% | an evac lift pad/beacon on the plinth (the evac) | 3 renders: start (11 centre, 3 rings), mid fight (many swarm marbles on the rim, 3 rings), evac lit; phone first, rim ring readability crop |
| 18 | Ballast Mind (Bridge) | Radius 5 board (91 cells), 6 void pillars (symmetric, a dark column down to the haze), 16v16, the borrowed effect of the turn (crack, pulse, polarity, conversion) reusing rows 6, 11, 13, 16 overlays | Bridge pale, a bigger slab | the ship's mind core on the plinth | slab with pillars + one borrowed crack |
| 19 | Dual Room (Mess) | Two hex rooms of radius 3 (37 cells) split by a gap in the deck (a visible drop to the plateau); the landing cell announce mark (colour of the coming marble), a returning marble arc | Mess | the galley bridge plank | both rooms in one frame, phone and desktop |
| 20 | Battle royale | Radius 8 (217 cells), 6 wedges, hole of radius 1 at the centre (void, dark, deep), cracked outer ring glowing with a countdown, ring gone to void over rounds, 3 to 6 players with 6 colours (marble skins unchanged) | Mess dusk, hull-breach: add a Sodium rim glow on cracked rings | none (the hole is the prop) | full board at round 1, round 12 (crack), round 20 (rings gone), at phone scale: 217 cells need the tightest gap check |

## Batch E: screens that are not a board
| # | Item | Scene must show | Sky / ramp | One prop | Render |
|---|---|---|---|---|---|
| 21 | Ship hub, the 5 decks | Terrace radius 3 (37 cells) with the room props at their cells (boss east, terminals, tables west, BR lobby, medal room Mess only, lifts up and down) each with its ring colour and AO ring; lift moves only the sky ramp; locked lift has a bar across its glyph | Mess, Cargo, Furnace, Chapel, Bridge ramps | the lift cage | 5 renders (one per deck) at phone, plus 1 desktop |
| 22 | Rogue-lite map | The terrace at dusk with the branching map as DOM over a calm sky; nodes named by kind (Fight, Elite, Rest, Event, Boss); needs a quiet background band: no props behind the node area | one ramp per act (3): Mess, Furnace, Bridge | none | 3 backgrounds, phone |
| 23 | Rogue-lite fights | Standard board (row 1) with special marbles Heavy, Anchor, Spark readable by silhouette (shape on top), army below 14 | per act ramp | none | 1 render with the three special marbles |
| 24 | Open world itself | The same miniature hex columns, towers, claim walls, outcrops the arena plateau looks over: the world IS the plateau seen from above; hero marble, troop, enemies, obstacles, chunk edge fade into haze | Mess dusk, day variants by biome | the tower | 1 phone, 1 desktop, + yaw 90 to prove the world reads as one place with the arena (the terrace appears at the map origin) |
| 25 | Online lobby / ranked (non-board) | Terrace with the table plate as DOM; same as row 1 with no marbles placed | Mess dusk | none | covered by row 1: state it |

## Order for 3d-artist (batch to cut waste)
1. Close round 3 changes (arena base, the 7 changes in notes-round3.md).
2. Batch A rows 3 and 4: two ramp variants and a hint ring.
3. Batch B and C: ONE script per deck (change ramp, ground, prop) then the overlays of each boss: Mess (5), Cargo (6, 7, 8, 9), Furnace (10, 11, 12), Chapel (13, 14, 15), Bridge (16). Overlays stay game-side; the Blender render only proves the dish and light leave room for them (mock them flat).
4. Batch D (new slabs): 18, 19, 20.
5. Batch E: 21, 22, 23, 24.
6. Row 17 (Swarm) after the Cargo overlays, since it reuses their ramp.

I judge each batch in one pass (phone first). APPROVED for the project needs rows 1 to 24 judged APPROVED.
