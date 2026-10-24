# UI design direction

Status: v0, for issue #88. Covers the page chrome and the flat HUD only. Board and marble
materials are #89 (done), the move preview ghost is #82, the diegetic HUD is #22. This file
refines what [world.md](world.md) sections 5, 6 and 8 already decide, it adds no new lore.

## 1. Mood

Cold, low-key, industrial. A dim ship deck lit by one practical lamp, a cyan glow where the
player is. The page must feel like a viewport onto that deck, not like a web app around a canvas.
Clarity of play wins over mood every time: no effect may touch a cell, a marble or a legal target.

Reference notes (all from world.md):

1. **Palette (section 5).** Near-black base, rust, oxidized steel, sodium orange for hazard, one
   cold cyan for the player's light. Red only for danger, never for a normal state.
2. **Diegetic HUD rules (section 6).** The rim and the frame carry the info, a flat HUD is the
   fallback. Our flat HUD is that fallback, styled as a plate bolted on the frame, and it must
   stay readable at 720p and 200 % UI scale (rule 9).
3. **Accessibility (section 8).** Never colour alone, reduced motion cuts camera sway and
   animation, clear-board mode removes fog and vignette but never the turn or score info.

## 2. Palette as CSS tokens

Tokens live in `client/src/ui.css` on `:root`. Dark is the default (the deck). Light is picked by
`prefers-color-scheme: light` and can be forced with `data-theme="light"` or `data-theme="dark"`
on `<html>`. Both themes define exactly the same token names.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0b0d0f` | `#e6e2d6` | page background |
| `--panel` | `#161a1d` | `#f3f0e6` | HUD plate |
| `--edge` | `#4a5258` | `#8a8f8c` | plate border, rivets |
| `--text` | `#d8d4c8` | `#14181b` | main text |
| `--muted` | `#9aa3a8` | `#454d52` | secondary text |
| `--accent` | `#7fd6e8` | `#0a5f73` | player light, turn marker |
| `--hazard` | `#d9822b` | `#8f4a0c` | warnings, last-marble notice |
| `--danger` | `#ff6b5a` | `#a3241a` | breach, ejection warning only |

Dark `--bg` is the world.md base, `--edge`, `--hazard` and `--accent` are the world.md steel,
sodium and cyan. Light is a daylight fallback for people who force it, not a second mood.

## 3. Type

Both faces come from Google Fonts, loaded with `display=swap`, with system fallbacks so a blocked
request keeps a readable page (no layout jump beyond font metrics).

- **Display: Chakra Petch** 600. Turn line and winner line only. Squared, stencil-like, reads
  as ship signage. Uppercase with 0.06em tracking.
- **UI: IBM Plex Sans** 400 and 500. Score line, backend note, everything else. Tabular figures
  for the `0/6` counts.
- Sizes use `rem`, so browser and UI scale settings (up to 200 %) scale the HUD. Turn line
  1.5rem, score line 1rem, notes 0.8125rem. Nothing below 0.8125rem.

## 4. HUD layout

One plate, top-left, 16 px from the edges, max width 22rem, never over the board centre at 720p.

```
+---------------------------------+
| (o) BLACK TO MOVE               |   display face, marker + text
| * You are Black. White is here. |   online only: status line, UI face
| Black ejected 0/6 . White 0/6   |   UI face, the score line, text kept verbatim
| ||||||  ||||||                  |   tally pips, decorative, aria-hidden
| WebGPU                          |   note, muted
+---------------------------------+
```

- **Turn.** A marker plus the words "Black to move" or "White to move". The marker is a filled
  disc for Black and a ring for White, so the side never depends on colour (world.md section 8).
- **Score.** The existing score text from #93 stays the source of truth and the readable copy.
  Six pips per side are scratched out as marbles are ejected, a visual twin of the text.
- **Winner line.** When the game is over the turn line is replaced by the result ("Black wins",
  "White wins", "Draw") in the display face, with the accent border. The score line still
  carries the reason ("by 6 ejections", "by threefold repetition").
- **Online status.** Online games add one line under the turn: the player's own color and
  whether the opponent is connected, updated live (#121). Strings, kept verbatim for the e2e
  tests: "You are Black. Waiting for an opponent..." (room creator alone), "Joining as White..."
  (not seated yet), "You are White. Black is here.", "You are Black. White is disconnected.",
  "Room is full, watching" (spectator). Presence means the key bound to the seat is connected,
  not any peer. A dot before the text repeats the state (accent here, hazard waiting, danger
  disconnected, muted watching); the words alone carry it. While the creator waits, the invite
  link below the buttons has a caption and the accent border.
- **Rematch.** When an online game is over, each seated player sees a Rematch button under
  Play online, spectators do not. It is greyed once pressed, or while the opponent is
  disconnected. One more line under the status line says who asked, kept verbatim for the e2e
  tests: "You asked for a rematch. Waiting for White..." and "Black asks for a rematch." When both
  asked, the new game starts with the colours swapped and the line and the button go away (#186).
- The HUD is a live region (`role="status"`, `aria-live="polite"`) so a screen reader hears the
  turn change. `#hud` and its text are read by the e2e tests: ids and strings do not change.

## 5. Board framing

The canvas fills the window. The chrome adds a rim only: a fixed, non-interactive radial gradient
from transparent at 65 % to near-black (`#0b0d0f` at 75 % opacity) at 100 %, the same in both themes because the 3D deck is dark either way (fog at the rim, never over the cells). No border or
frame is drawn around the canvas, the 3D deck is the frame. The rim is removed with clear-board
mode once that toggle exists (#32), and it has no motion.

## 6. Motion

- HUD changes fade in over 160 ms (opacity only, ease-out). Nothing moves, nothing slides.
- No looping CSS animation on the page. Camera drift belongs to the renderer, not to this file.
- `@media (prefers-reduced-motion: reduce)` sets every transition and animation duration to 0.
- No flash above 3 per second, no full-screen white, ever (photosensitivity, world.md section 8).

## 7. Contrast targets (WCAG 2.1 AA)

Measured with the relative luminance formula, values in the checked pairs:

| Pair | Dark | Light | Target |
|---|---|---|---|
| `--text` on `--panel` | 11.8 | 15.7 | 4.5 |
| `--muted` on `--panel` | 6.8 | 7.6 | 4.5 |
| `--accent` on `--bg` | 11.8 | 5.6 | 4.5 |
| `--hazard` on `--panel` | 6.0 | 5.8 | 4.5 |
| `--danger` on `--panel` | 6.3 | 6.5 | 4.5 |
| `--edge` on `--bg` (plate border) | 2.5 | 2.5 | none, decorative |

Meaning is never carried by colour alone: turn side by marker shape and words, score by text,
result by words. Non-text parts that carry meaning (the turn marker) need 3:1 against the plate.

## 8. Out of scope

Board textures and marble looks (#89, #26, #28), the ghost preview (#82), menus and settings
terminal (#22), UI scale and theme picker (#32), audio. A theme picker is not part of this task:
the theme follows the system setting, `data-theme` is the hook for #32.
