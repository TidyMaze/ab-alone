# UI design direction

Status: v0, for issue #88. Covers the page chrome and the flat HUD only. Board and marble
materials are #89 (done), the move preview ghost is #82, the diegetic HUD is #22. This file
refines what [world.md](world.md) sections 5, 6 and 8 already decide, it adds no new lore.
The one-page art direction and the asset list are in [art.md](art.md).

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
on `<html>`. Both themes define exactly the same token names. The Theme item of the cog menu (#317) sets it: System (the default) removes the attribute and follows the system, Dark and Light set it. The choice is stored under `ab-alone.theme`, and `index.html` applies it before the first paint.

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
request keeps a readable page (no layout jump beyond font metrics). The offline app caches them
after one online visit (tech.md section 9.1).

- **Display: Chakra Petch** 600. Turn line and winner line only. Squared, stencil-like, reads
  as ship signage. Uppercase with 0.06em tracking.
- **UI: IBM Plex Sans** 400 and 500. Score line, backend note, everything else. Tabular figures
  for the `0/6` counts.
- Sizes use `rem`, so browser and UI scale settings (up to 200 %) scale the HUD. Turn line
  1.5rem, score line 1rem, notes 0.8125rem. Nothing below 0.8125rem.

## 4. HUD layout

One plate, top-left, 16 px from the edges, max width 22rem, never over the board centre at 720p.
The plate, like the evaluation plate below, is bolted on: a rivet in each corner, 4 px inside the
border, in `--edge`, drawn in CSS over the plate colour, so it adds no size (#303).
In a short landscape window (500 px tall or less, a phone held sideways) the plate keeps to the band
left of the board, like the column, with a smaller turn line, so it covers no cell (#234).
In a taller landscape window up to 1100 px wide the plate is smaller (max width 15rem) for the
same reason (#246).
The buttons (the settings cog, Reset view, New game, Game modes and the rest) share one column
top-right, beside the plate and never over it (#227). Wider than tall, the column keeps to the band
right of the board. Held upright, the column becomes rows of buttons under the plate. No button or
field covers a cell, and the space between them lets every tap through to the board.

Settings (#277): a cog button, first in the column, opens a menu, one button per item: the toggles Clear board,
then Reduced motion (#379, see section 6: it follows `prefers-reduced-motion` until pressed, then keeps the player's
choice; second, so that held upright the items still fit in two rows beside the cog), then Sound (#284, the ejection
sound, no longer a button of the column; opening the menu and toggling Sound count as
the first gesture that starts audio), then Theme (#317, System, Dark or Light: a press cycles them, see section 2), then Export game and Import game (#287, no longer buttons of the column). Each
item shows an icon of the repo's icon set (`client/src/icons.ts`: inline SVG line icons, thin `currentColor`
strokes, one size) then its label: a fog for Clear board, a ball with speed lines for Reduced motion, a speaker for Sound (crossed out while off), an arrow out
of a tray for Export game, an arrow into it for Import game. The open menu floats over the other buttons, so opening
or closing it moves no button: under the cog in the column, beside the cog over the first row when the buttons are
rows. It covers no cell either. On a touch screen each item is at least 44 px tall. It closes on Escape, on a press
outside and on the cog again. The cog is labelled "Settings" (`aria-expanded`, `aria-controls`), each toggle is a
button with `aria-pressed`, each item has the visible focus ring of the buttons.

Game modes (#357): the buttons that start a game mode, Play online, Boss fight (with the boss list it opens under it)
and Daily challenge, live in one menu behind an icon-only button, a play triangle of the icon set, labelled "Game
modes" (`aria-label`, `title`, `aria-expanded`, `aria-controls`). The menu is closed at the start on every screen
size; the three buttons keep their behaviour and their names. The button is the last of the column and the open menu
lies under it, so opening or closing it moves no other button. Held upright, the menu starts a new row under the
buttons, its items side by side, the bosses in line after Boss fight. It closes like the settings menu, on Escape, on
a press outside and on its button again, and once a mode starts (a boss picked, Daily challenge, Play online). On a
phone each item is at least 44 px tall. The controls of a running mode (Rematch, Goal, Retry, the invite link) stay
in the column, outside the menu.

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
- **End banner (#282).** When the game is over the turn line is replaced by the result in the
  display face, with the accent border, and under it comes the reason, one short line, all inside the
  plate, so nothing covers a cell (the plate may not grow over the board: the phone-layout e2e checks
  it in a boss fight too, where the banner replaces the boss block's own Victory or Defeat line). The
  result is read from the viewer's side: "You win" / "You lose" against the bot and online, "Black
  wins" / "White wins" in hot-seat and for a spectator, "Draw", and "Victory" / "Defeat" in a boss or
  daily fight, where a draw is a "Defeat" (rules.md section 10.3). The reason line is in TALLY's tone,
  built by `client/src/endbanner.ts`: "6 out. The books balance.", "6 out. Tally strikes your name.",
  "6 out. The seat is empty." (10 against the Choir), "6 out. The seat holds.", "Same position three
  times. Tally closes the page.", "100 plies, nothing ejected. Tally calls it even.", and against a boss
  "Repeated 3 times: a defeat." or "100 plies idle: a defeat.". The one action offered is the button
  already in the column: New game (local, bot), Retry (boss, daily), Rematch (online players).
  `body[data-over]` is `win`, `loss` or `draw` while the game is over (a draw against a boss is `loss`):
  the board dims (filter on the canvas) and one light plays on the rim only, the middle stays clear of
  cells, marbles and targets. Win: a warm sodium rim light rises and pulses once (1.6 s) and stays as a
  glow. Loss: a cold blue-black fade closes in while the board dims (1.4 s). Draw: a still hold of 0.6 s,
  then a neutral steel rim fades in (1.2 s). CSS only, each ends by itself, nothing runs when idle.
  Under Reduced motion (section 6) there is no light and no animation: the banner and the dimmed board
  only. No move is accepted and no marble can be selected once over. The score line still carries the
  reason in the HUD's own words ("by 6 ejections", "by threefold repetition").
- **Online status.** Online games add one line under the turn: the player's own color and
  whether the opponent is connected, updated live (#121). Strings, kept verbatim for the e2e
  tests: "You are Black. Waiting for an opponent..." (room creator alone), "Joining as White..."
  (not seated yet), "You are White. Black is here.", "You are Black. White is disconnected.",
  "Room is full, watching" (spectator). Presence means the key bound to the seat is connected,
  not any peer. A dot before the text repeats the state (accent here, hazard waiting, danger
  disconnected, muted watching); the words alone carry it. While the creator waits, the invite
  link below the buttons has a caption and the accent border.
- **Rematch.** When an online game is over, each seated player sees a Rematch button under
  Reset view, spectators do not. It is greyed once pressed, or while the opponent is
  disconnected. One more line under the status line says who asked, kept verbatim for the e2e
  tests: "You asked for a rematch. Waiting for White..." and "Black asks for a rematch." When both
  asked, the new game starts with the colours swapped and the line and the button go away (#186).
- **New game.** A button under Reset view, icon only (#297, the name is the tooltip and the accessible name, and the words show while it asks for the confirmation), in local games only (hot-seat or against the bot):
  boss, daily and online games do not show it. It leaves the game in progress for the start
  position, the bot on or off as it was, and deletes the saved game (tech.md section 8). With no
  move played it starts over at once. Once a move is played, the first press turns it into
  "Confirm new game" with the hazard colour for 4 seconds, and only a second press in that time
  starts over; no dialog. Strings kept verbatim for the e2e tests: "New game", "Confirm new game"
  (#230).
- **Daily challenge.** An item of the mode menu under Boss fight and its boss list, labelled "Daily challenge 2026-10-24: The Choir"
  (the UTC date and that day's boss), starts the daily fight (game-design.md section 7.6). During
  it, the boss block shows one muted line under the phase notches, kept verbatim for the e2e
  tests: "Daily challenge 2026-10-24 · attempt 3" (#195).
- **Copy diagnostics.** A button in the bottom-right corner, in every mode, icon only (#297: its name is the tooltip and the accessible name, at least 44 px on a phone), styled like the
  others but kept apart from the play buttons and off the board, even at phone width. It copies
  the diagnostics text (tech.md section 10) and the note line says "diagnostics copied". When the
  browser refuses the clipboard, the text appears in a box above the button, selected from its
  start, with the accent border, and the note says "diagnostics selected: copy them by hand". The
  box goes away once it loses focus. Both strings are kept verbatim for the e2e tests (#220).
- **Daily result card.** When a daily fight is over, under Retry: a read-only box with the text to
  share (game-design.md section 7.6), as wide as its text, with the accent border, then a Copy
  result button. Held upright, the rows of buttons leave no room above the board, so the card sits
  in the bottom-left corner, under the board, with Copy result beside Copy diagnostics. Wider than
  tall, the column stops above the Copy diagnostics corner, so neither the card nor a button
  scrolls under it. Like the buttons, the card never covers the plate or a cell. Copy puts the
  text in the clipboard and the note line says "result copied". When the browser refuses the
  clipboard, the text in the box is selected from its start for the player to copy by hand, and
  the note says "result selected: copy it by hand". Both strings are kept verbatim for the e2e
  tests. The card shows only at the end of a daily fight, never in a plain boss fight (#196).
- **Export game, Import game.** Two items of the settings menu, after Sound (#287), for local
  games only: hidden during online, boss and daily games (#219, file format in tech.md section 8).
  Export game downloads the game, Import game opens the browser's file picker. A refused file adds a
  short note to the HUD, kept verbatim for the e2e tests: "import refused: not a game file", "import
  refused: unknown file version", "import refused: illegal move in the file".
- The HUD is a live region (`role="status"`, `aria-live="polite"`) so a screen reader hears the
  turn change. `#hud` and its text are read by the e2e tests: ids and strings do not change.

### 4.1 Evaluation bar

Local hot-seat and bot games show who is ahead, from our own engine (#191). Online and boss games
never show it (fair play, #164): starting one hides it for good.

```
+------------------------+                  +-------------------------------------+
| [#########|.........]  |                  | [#########|.........]   Black +0.4  |
| Black +0.4             |                  +-------------------------------------+
+------------------------+                                   [ Copy diagnostics ]
 wider than tall: bottom-left                held upright: bottom-right corner
```

- **Place.** A second plate, at the bottom. It covers no cell and no control: the
  phone layout e2e test checks it like a control (#227) and checks that it lies over no button.
  - Wider than tall, it keeps to the band left of the board, bottom-left, as wide as the button
    column's band on the right (`50vw - 45vh - 1.5rem`, 8rem to 22rem), 16 px from the edges, with
    the words under the bar. The bottom-right corner keeps Copy diagnostics (#220).
  - Held upright, it is the first row of the bottom-right corner, just above Copy diagnostics,
    the window width minus 32 px at most 22rem, one row high with the words beside the bar.
  - It is not part of `#hud`, so it never re-announces the turn plate.
- **Bar.** Black's share on the left in the dark shell colour, White's on the right in the pale
  glass colour, the marble colours in both themes like the marbles (11.9:1 against each other),
  with an accent mark at the even middle. A lead of 4 ejections and their bonus (600 centi-marbles)
  or more is clamped at 5 % of the ends: the ends are kept for a decided game.
- **Words.** Next to the bar, the same state in words, so it never depends on colour or length:
  "Even", "Black +0.4" (the lead in marbles), "White winning" (the search found a forced win),
  "Black wins" (the game is over). The bar is a `role="meter"` named "Evaluation" whose value text
  is these words.
- **Source.** The search score of the position for the side to move (`Engine.evaluate`), turned
  into White's share from 0 (Black wins) to 1 (White wins) by `client/src/evalbar.ts`. It is
  computed after every move, after New game (#230) and after an import (#219) in a second copy of
  the bot worker, so a bot reply never waits behind it, with a fixed node budget (`EVAL_NODES`, a
  quarter of the bot's), never a clock. One request is in flight at a time and only for the newest
  position: an answer for an older position is dropped, so a late answer never overwrites the bar
  of a newer position. The hint (section 4.2) uses the same worker: each reply goes to its request
  by id, so an evaluation and a hint can be in flight together.
- **Motion.** The bar jumps to its new share, it does not slide (section 6).

### 4.2 Hint

Local hot-seat and bot games have a Hint button: it shows the engine's best move for the side to
move as a ghost on the board, and never plays it (#192). Online, boss and daily games never show it
(fair play, #164): starting one hides it for good, like the evaluation bar.

- **Place.** In the button column, under New game and above the Game modes button,
  the other tools of a local game, styled like the other buttons. Held upright it shares a row with
  one of them, so it adds no row of buttons over the board. The phone layout e2e test checks it
  like every control (#227).
- **Press.** A press drops the selection and asks for the best move of the position on the board.
  The move is drawn with the move preview ghost (#82): translucent marbles on the cells it would
  fill, and the marbles it takes wear the selection ring, raised like a selection (#301). The
  board, the side to move and the score do not change. While the hint is asked or shown the button
  is lit: `aria-pressed="true"`, accent border and text.
- **Clear.** A second press, a new selection (a click on a marble of the side to move) or the next
  move clears it. A hint belongs to the position it was asked for: after the next move, New game
  or an import it is off, and an answer that arrives for an older position is never drawn.
- **Disabled.** While the bot is thinking and once the game is over, the button is greyed.
- **Source.** `Engine.best_move` with the bot's own node budget (`BOT_NODES`), never a clock: the
  hint is the move the bot would play there. It runs in the evaluation bar's copy of the bot worker
  (section 4.1), so the bot's own reply never waits behind it; the next evaluation of the bar may.
  The hint state of a position lives in `client/src/hint.ts`.
- The label "Hint" is kept verbatim for the e2e tests.

## 5. Board framing

The canvas fills the window. A window taller than wide keeps the horizontal view of a square one
(the vertical field of view grows past 40 degrees), so the whole board fits the width of a phone held
upright, and the picture moves down by a quarter of the spare height, which leaves the top to the
plate and the buttons (#227). The chrome adds a rim only: a fixed, non-interactive radial gradient
from transparent at 65 % to near-black (`#0b0d0f` at 75 % opacity) at 100 %, the same in both themes because the 3D deck is dark either way (fog at the rim, never over the cells). No border or
frame is drawn around the canvas, the 3D deck is the frame. The rim is removed with clear-board
mode once that toggle exists (#32), and it has no motion.

## 6. Motion

- HUD changes fade in over 160 ms (opacity only, ease-out). Nothing moves, nothing slides.
- No looping CSS animation on the page. Camera drift belongs to the renderer, not to this file. The end of a game plays one short animation that ends by itself (section 4, End banner).
- Reduced motion, a toggle of the settings menu (#379), sets every transition and animation duration to 0
  (`:root[data-motion='reduced']`), and the renderer swaps the ejection tumble for a plain fade, drops the
  spatter and the slide. Until the player presses it, it follows `prefers-reduced-motion`; the choice is saved
  locally like Sound and Theme. One pure function, `motionReduced` in `client/src/settings.ts`, decides it.
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
