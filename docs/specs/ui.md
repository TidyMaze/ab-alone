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

HUD buttons, in groups (#839). The column holds the buttons grouped by what they do, in this order, each group a row
that wraps, so its buttons share a row when they fit and a group with no visible button takes no room: (1) the
settings cog; (2) the view, Reset view and Cam (Free Cam, `#free-cam`); (3) the game, New game, Rematch, Goal, Retry,
Hold, Start, Invite and Back to the ship (the controls of the running mode, only the ones the mode shows); the daily
result card when a daily fight ends; (4) the tools, Hint, Replay and Auto-play; (5) Game modes, last of the column, its
menu under it; (6) the invite link of an open room: its caption, then the link with its Copy button. Held upright the
groups give their buttons to the rows of the column, in the same order. Every button of a group has the one button
style (the panel colour, the edge, the 14 px text, the 2 px radius): Cam is lit, like Hint, while Free Cam is on.
Only New game, Game modes and Copy diagnostics show an icon alone (#297); every other button shows its name, Play online
included. While the invite link shows, the button column is back at its top, so no button above the link is
scrolled out of a short window (#839).

Invite link (#839): the caption, then the link and a Copy button on one row. Copy writes the link to the clipboard,
then the caption, the link and Copy close for good (a new room shows them again). When the browser refuses the
clipboard, or the page has none, the link stays, selected, and the plate says "invite link selected: copy it by hand".

Settings (#277): a cog button, first in the column, opens a menu, one button per item: the toggles Clear board,
then Reduced motion (#379, see section 6: it follows `prefers-reduced-motion` until pressed, then keeps the player's
choice), then Flat HUD (#391, off by default: the flat HUD fallback of world.md section 6 rule 8, see the Flat HUD
item below), then Sound (#284, no longer a button of the column; a press shows the four volume sliders of #438, Music, Ambience,
Effects and Voice, each its name over a range of 0 to 100 %, in place of the items, so the menu never grows taller and
covers no cell; the menu opens on its items again once closed; opening the menu and moving a slider count as the first
gesture that starts audio; the Transcript toggle of the audio logs, #516, shares its item, on by default and saved
locally), then Theme (#317, System, Dark or Light: a press cycles them, see section 2), then Export game and Import game (#287, no longer buttons of the column),
then Logs, the log archive of world.md section 4 (#513): a short word beside Import game, as FPS is beside Clear board,
titled "Log archive"; a press shows the lore entries read, then the audio logs heard (#517), one button per title
in ship order, in place of the items ("Nothing read yet." before any), and a press on one closes the menu and opens that
entry in the terminal reader, or replays that log. The last rows of the menu are three light sliders
(#861), Bloom, Lamps and Lights, each a range of 0 to 300 % of the tuned power (defaults 20, 25 and 215), saved on its
own under `ab-alone.light.<name>`, then a Reset lights button (#899, #900) that puts the three back to their defaults
and saves them, so a phone that kept low levels is not left dark (`client/src/main.ts`, `client/src/quality.ts`). Each
item shows an icon of the repo's icon set (`client/src/icons.ts`: inline SVG line icons, thin `currentColor`
strokes, one size) then its label: a fog for Clear board, a ball with speed lines for Reduced motion, lines in a box for Flat HUD, a speaker for Sound, an arrow out
of a tray for Export game, an arrow into it for Import game. The open menu floats over the other buttons, so opening
or closing it moves no button: under the cog in the column, beside the cog over the first row when the buttons are
rows. It covers no cell either. Held upright (`orientation: portrait`), or in a narrow or short window (up to 1100 px
wide or 500 px tall), each item shows its icon only, a 44 px square, so every item fits without reaching the board
(#414): held upright side by side beside the cog, wider than tall in rows of 3 under the cog (Clear board and FPS
share one row of two). Roomy windows keep icon then label, one item per row. Each item keeps its
name as its `aria-label` and as a tooltip (`title`), so a screen reader reads it and a pointer shows it. On a touch screen each item is at least 44 px tall. It closes on Escape, on a press
outside and on the cog again. The cog is labelled "Settings" (`aria-expanded`, `aria-controls`), each toggle is a
button with `aria-pressed`, each item has the visible focus ring of the buttons.

Game modes (#357): the buttons that start a game mode, Play online (its name shown, #839), Fight together (with the boss list it opens under
it, #530), Battle royale (#502), Boss fight (with the boss list it opens under it), Daily challenge and Ship (the hub,
game-design.md section 3.5, #521), live in one menu behind an icon-only button, a play triangle of the icon set,
labelled "Game modes" (`aria-label`, `title`, `aria-expanded`, `aria-controls`). The menu is closed at the start on every screen size; the buttons keep their behaviour and their
names. The button is the last of the column and the open menu lies under it, so opening or closing it moves no other
button. Held upright, the menu starts a new row under the buttons, its items side by side; an open boss list is one row
of its own under Boss fight or Fight together that scrolls sideways, so a new boss adds no row over the board (room for
12 bosses and more on a phone 360 px wide, #666). In a desktop window (wider than tall, over 1100 px wide, a mouse) the items of the mode menu sit side by side when they fit, and an open boss list takes a row of its own as wide as the column with two bosses a row, each row compact, so 12 bosses and more with Daily challenge fit a 1280x720 or 1280x800 window without a scroll (#653, #699). One boss list is open at a time: opening one closes the other (#615). It closes like the settings menu, on Escape, on a press outside and on its button again,
and once a mode starts (a boss picked, Daily challenge, Play online, Ship, Battle royale). On a phone each item is at
least 44 px tall. The controls of a running mode (Rematch, Goal, Retry, Back to the ship, Hold, the invite link)
stay in the column, outside the menu. Opening the root URL without query parameters or a saved game in progress lands directly on the Ship hub (Mess deck, #602). Saved games and query URLs (`?bot=`, `?nodes=`) open their board mode directly.

```
+---------------------------------+
| (o) BLACK TO MOVE               |   display face, marker + text
| * You are Black. White is here. |   online only: status line, UI face
| Black ejected 0/6 . White 0/6   |   UI face, the score line, text kept verbatim
| ||||||  ||||||                  |   tally pips (desktop), decorative, aria-hidden
+---------------------------------+
```

- **Turn.** A marker plus the words "Black to move" or "White to move". The marker is a filled
  disc for Black and a ring for White, so the side never depends on colour (world.md section 8).
- **Score.** The score text stays the source of truth and the readable copy: each side's ejected
  count against the win target. Game-over winner names and draw reasons are not duplicated in the
  score line since the turn line and end banner already announce them (#425). On desktop, six pips
  per side are scratched out as marbles are ejected; on compact and mobile screens (under 1100 px wide
  or 500 px tall), decorative pips are hidden to slim down the HUD plate. The render backend note
  (WebGL2 / WebGPU) is dropped from the player HUD and kept in `environment.backend` of diagnostics.
- **Tally line (#294, #425).** Matches start with Tally's accounting line per mode/boss, which fades
  out via CSS animation after 5 seconds or clears on the first move.
- **End banner (#282).** When the game is over the turn line is replaced by the result in the
  display face, with the accent border, and under it comes the reason, one short line, all inside the
  plate, so nothing covers a cell (the plate may not grow over the board: the phone-layout e2e checks
  it in a boss fight too, where the banner replaces the boss block's own Victory or Defeat line). The
  result is read from the viewer's side: "You win" / "You lose" against the bot and online, "Black
  wins" / "White wins" in hot-seat and for a spectator, "Draw", and "Victory" / "Defeat" in a boss or
  daily fight, a co-op one included (#530), where a draw is a "Defeat" (rules.md section 10.3). The reason line is in
  TALLY's tone, built by `client/src/endbanner.ts`: "6 out. The books balance.", "6 out. Tally strikes your name.",
  "6 out. The seat is empty.", "6 out. The seat holds.", "Same position three
  times. Tally closes the page.", "100 plies, nothing ejected. Tally calls it even.", and against a boss
  "Repeated 3 times: a defeat." or "100 plies idle: a defeat.". The one action offered is the button
  already in the column: New game (local, bot), Retry (boss, daily), Rematch (online players), and Back to the
  ship when a hub room started the game (game-design.md section 3.5, #522).
  A won boss fight (daily and co-op included) adds the medal to the reason line (#791): "Medal earned: 12 turns."
  the first time, "New record: 9 turns." when the fight took fewer player turns than the medal held, and
  "Medal best: 9 turns." when it did not. In the boss list, a beaten boss carries "Medal: 9 turns" after its name.
  A medal is the fewest player turns a win needed, per boss id, in local storage (`client/src/medals.ts`, key
  `ab-alone.medals`); `hasMedal(store, boss)` is what the auto-play task asks (#792). Every peer of a co-op win gets it.
  `body[data-over]` is `win`, `loss` or `draw` while the game is over (a draw against a boss is `loss`):
  the board dims (filter on the canvas) and one light plays on the rim only, the middle stays clear of
  cells, marbles and targets. Win: a warm sodium rim light rises and pulses once (1.6 s) and stays as a
  glow. Loss: a cold blue-black fade closes in while the board dims (1.4 s). Draw: a still hold of 0.6 s,
  then a neutral steel rim fades in (1.2 s). CSS only, each ends by itself, nothing runs when idle.
  Under Reduced motion (section 6) there is no light and no animation: the banner and the dimmed board
  only. No move is accepted and no marble can be selected once over. The score line still carries the
  reason in the HUD's own words ("by 6 ejections", "by threefold repetition").
- **Flat HUD (#391).** With the Flat HUD setting on, the plate ends with one more block, one line each, built by
  `flatHudHtml` (`client/src/hud.ts`): "Turn: Black" ("Turn: game over" once over), "Ejected: Black 1/6, White 4/6",
  and in a boss fight "Boss phase: 2 of 3" and "Tell: " with the tell text and its countdown ("none" without a tell).
  Off, the block is gone. Strings kept verbatim for the e2e tests.
- **Boss health bar (#788).** In every boss fight (solo, daily, co-op) `#boss-bar` sits at the top centre: the boss's
  name in the display font, a red bar under it. The bar is cut into one fragment per ejection the player needs to win,
  read from the engine (`win_ejections`: 6 for most bosses, 12 for The Ballast Mind), and one fragment empties from the
  right per ejection, to an outline in `--muted` while the filled ones are `--danger` (3:1 against the plate in both
  themes). The fragment where a phase begins (`phase_ejections`) has a light tick on its left edge, so the phase steps
  read without colour. It is one `role="meter"` for a screen reader ("2 of 6 ejected, phase 1 of 3"). Wider than tall it
  is centred in the top band between the plate and the button column, at most 24 rem wide and at least 10 rem (the top
  row of the board lies below it, also at 812 by 375); held upright it is the first row of the column, above the
  plate, one slim row (the name, then the bar) and the plate's own boss name is hidden, so the column is no taller and
  covers no cell. It grows with the UI scale like the plate and lets every press through. A fragment drains with a 400 ms
  fade; under Reduced motion (section 6) it changes at once. When the boss heals (The Chaplain, a player marble converted to it, #810) a fragment fills back with a 450 ms refill, a brief swell and brightening; the phase read by the screen reader comes from the engine and does not go back. It replaces nothing: the plate keeps the boss block with
  its P1 P2 P3 notches and the tell, and the phase notches and tally marks scratched on the frame stay (the bar is the
  quick read at the top, the frame marks the exact count), decided in #788. Outside a boss fight it is hidden.
- **Choir army chips (#816).** In The Choir's fight `#boss-bar` carries `.chips` (`client/src/choirchips.ts`), the play order `▲ Alto 5 > ○ Tenor 6 > ■ Bass 4`: one chip per army with a marble left, in cycle order, with its board glyph, name and marbles left, from `armies()` and `next_army()`. The army that moves next has a ringed chip (`aria-current="step"`), a removed army is gone and the arrows close up, the last army reads "×2". Right of the bar on a wide window (smaller on a phone held sideways), a second row of the bar's box under it when held upright; it covers no cell, plate or button, also at 200 % UI scale.
- **Terminal reader (#512, world.md section 4).** While the camera frames the deck console, the HUD, the
  buttons and the support corner hide, so nothing covers the screen's text at any UI scale; they come back
  when the player leaves. The page shown is copied into `#reader` (`aria-live="polite"`, labelled
  "Terminal"): its title, its text and "Page 1 of 2", read by screen readers only, and with the Flat HUD on
  shown as a plate at the bottom of the window, in the UI face at the UI scale.
- **Audio log player (#516, world.md section 4).** `#log` (labelled "Audio log"), the last of the page chrome
  but shown in the reader too: a Play log button while the reader is open, Skip log while a log plays, and
  above it the transcript line shown (`#transcript`, `aria-live="polite"`) unless the Transcript toggle is off.
  Wider than tall it lies bottom left, in the band left of the board, over the evaluation plate (at the top
  with the Flat HUD on in the reader); held upright it is the last row of the column, under the buttons and
  over the board. Like the evaluation plate it covers no cell and no control, and the line lets every press
  through to the board.
- **Online status.** Online games add one line under the turn: the player's own color and
  whether the opponent is connected, updated live (#121). Strings, kept verbatim for the e2e
  tests: "You are Black. Waiting for an opponent..." (room creator alone), "Joining as White..."
  (not seated yet), "You are White. Black is here.", "You are Black. White is disconnected.",
  "Room is full, watching" (spectator). Presence means the key bound to the seat is connected,
  not any peer. A dot before the text repeats the state (accent here, hazard waiting, danger
  disconnected, muted watching); the words alone carry it. While the creator waits, the invite
  link below the buttons has a caption and the accent border.
- **Fight together (#530).** An item of the mode menu under Play online. It opens the list of the bosses of Boss
  fight under it; picking one opens a co-op room against that boss with a random seed (coop-boss.md), and the invite
  link's caption reads "Invite link: send it to your partner". Both seats play Black, so the HUD names the partner,
  never a colour. On a seated player's human ply the turn line reads "Your turn" or "Partner's turn", on the boss
  turn "White to move" as in solo. The status line reads "Waiting for a partner...", "Joining the fight...", "Your
  partner is here.", "Your partner is disconnected." or "Room is full, watching". Strings kept verbatim for the e2e
  tests. It is greyed offline, like Play online. The boss block shows the room's attempt, one muted line under the
  phase notches as in a daily fight: "Fight together · attempt 2" (#531). The Rematch button reads "Retry" and its
  line names the partner: "You asked for a retry. Waiting for your partner..." and "Your partner asks for a retry."
  When both asked, the same fight restarts (coop-boss.md section 5).
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
  (the UTC date and that day's boss; on a phone held upright the boss name takes a second line, so a long name pushes
  no item over the board, #575), starts the daily fight (game-design.md section 7.6). During
  it, the boss block shows one muted line under the phase notches, kept verbatim for the e2e
  tests: "Daily challenge 2026-10-24 · attempt 3" (#195).
- **Battle royale (#502).** An item of the mode menu under Fight together. It starts an offline battle royale, the
  player against 5 bots on the radius 8 arena (rules.md section 10.4), at the Furnace, the arena drawn at half the
  cell spacing in the room of the board, each seat's marbles in its shell tint. New game, Hint, the evaluation bar and
  Export game, Import game go away, as in a boss fight. The player selects marbles and presses a target as for a
  move, which locks the order, or presses Hold (#611). The bots' orders come from the round-start state, and the round
  resolves at once. The plate shows "Battle royale · Round 3", the initiative order of that round before its reveal,
  then the reveal of the last round in initiative order, one line a seat: "Bot 1: moved, ejected Bot 3", "You:
  fizzled" (in the hazard colour), "Bot 3: held", "Bot 4: out". The player is "You", the bots "Bot 1" to "Bot 5", each
  name after a dot of its tint. These strings are kept verbatim for the e2e tests. Once the game is over, Hold is
  greyed. A boss fight, Play online or Ship leaves it.
- **Battle royale online (#504).** Invite, in the column of an offline battle royale (not a seventh item of the mode
  menu: on a phone held upright its row would cover the board), greyed while offline like Play online. It opens a
  room of 6 seats (tech.md section 6) and shows its invite link, "Invite link: send it to the other players"; each
  link opener takes the first free seat. The arena and the plate are those of the offline
  game, the seats named "You", "Player 2" for another player and "Bot 4" for an empty seat, by seat number. Under the
  round line a status line: "2 players in. Start: bots take the empty seats" for the creator, who also gets Start in
  the column, in the accent; "2 players in. Waiting for the start..." for the others; then "Your order: a move or
  Hold", "Order locked, waiting for the others..." once the order is committed, "Waiting for the round..." past the
  deadline or for a spectator, and "Desync after round 4: a peer's game differs" in the danger colour. Under it,
  while the open round takes orders (to a spectator too), the order deadline in whole seconds, "Order deadline: 12 s"
  (#673), in the text colour (above 3:1 on the plate in both themes), redrawn each second from the round start as it
  reached the page; in the last 5 s it pulses its opacity (to 0.6 at least), not under Reduced motion. It goes once
  every seat committed or the deadline passed. A seat silent for 2 rounds is played by the bot (tech.md section 6,
  #674): its reveal line reads as for any seat. Hold and the targets work only while the order can be committed. These strings are kept verbatim for the e2e tests, with
  body[data-net] (lobby, choosing, locked, waiting, over) and body[data-desync] (the round, 0 for none).
- **Battle royale breach, seats out and placement (#503).** A ring that cracks at the end of a round (rules.md section
  10.4, ring 8 at the end of round 12) glows in the hazard colour for the whole next round, under the Hull's crack
  decal and one tick per round left, and the plate warns in the hazard colour: "Breach: 48 cells void in 1 round". At
  the end of that round the ring is void: its discs are gone. A seat with no marble left is out: on the plate its name
  is greyed out and struck through in the initiative order, its tint dot faded, and its "out" line of the reveal is
  greyed. Once the game is over the plate is the end banner, lit like the others (End banner, #282):
  "You win" for first place (one seat, #641), else "You place 3rd", then the points the player scored, "10 points. The
  books balance." or "5 points. Tally strikes your name.", and the places, best first, one seat a line: "1st You · 10
  points", "2nd Bot 1 · 6 points". These strings are kept verbatim for the e2e tests.
- **Battle royale round played out (#612).** When a round resolves, the arena plays it out instead of jumping to the
  new position: each seat's turn in initiative order, a move sliding its marbles and pushing the line ahead as in a
  normal game (350 ms a turn), a marble pushed off the arena or onto a void cell falling with the ejection effect, a
  fizzled or held seat's marbles lifted and ringed for 250 ms, a seat out taking no time. Then the breach: the cracked
  cells sink away and the marbles on them fall (800 ms). Each line of the reveal appears on the plate as its turn
  starts, and the end banner waits for the end. A press or a key ends it at once, then does its usual job; an order (a
  target press, Hold) during it ends it first. Reduced motion: no animation, the arena jumps to the new position and
  the whole reveal shows. body[data-reveal] is "turn", "breach" or "done", for the e2e tests.
- **Copy diagnostics.** A button in the bottom-right corner, in every mode, icon only (#297: its name is the tooltip and the accessible name, at least 44 px on a phone), styled like the
  others but kept apart from the play buttons and off the board, even at phone width. It copies
  the diagnostics text (tech.md section 10) and the note line says "diagnostics copied". When the
  browser refuses the clipboard, the text appears in a box above the button, selected from its
  start, with the accent border, and the note says "diagnostics selected: copy them by hand". The
  box goes away once it loses focus. Both strings are kept verbatim for the e2e tests (#220).
- **Daily result card.** When a daily fight is over, under Retry: a read-only box with the text to
  share (game-design.md section 7.6), as wide as its text, with the accent border, then a Copy
  result button. Held upright, the rows of buttons leave no room above the board, so the card sits
  in the bottom-left corner, under the board, with Copy result beside Copy diagnostics. On a phone
  held upright Copy result is a 44 px touch target like Copy diagnostics, and the box above them both
  may be as wide as the window, so its first line does not wrap (#619). Wider than
  tall, the column stops above the Copy diagnostics corner, so neither the card nor a button
  scrolls under it. Like the buttons, the card never covers the plate or a cell. Copy puts the
  text in the clipboard and the note line says "result copied". When the browser refuses the
  clipboard, the text in the box is selected from its start for the player to copy by hand, and
  the note says "result selected: copy it by hand". Both strings are kept verbatim for the e2e
  tests. The card shows only at the end of a daily fight, never in a plain boss fight (#196).
- **Export game, Import game.** Two items of the settings menu, after Sound (#287), for local
  games only: hidden during online, boss and daily games (#219, file format in tech.md section 8).
  The hub (Ship) has no game on: it hides them too until a game leaves it, and a file still being
  read when the player opens the hub is dropped (#589).
  Export game downloads the game, Import game opens the browser's file picker. A refused file adds a
  short note to the HUD, kept verbatim for the e2e tests: "import refused: not a game file", "import
  refused: unknown file version", "import refused: illegal move in the file".
- **Palette.** An item of the settings menu sharing a row with Theme (#381): cycles Default, Protan,
  Deutan, Tritan and High contrast, and recolours the marbles, the rim light, tells and the HUD accent dot.
  Saved locally.
- **A bot that cannot answer (#736).** When the bot worker fails (its wasm did not start, or the search threw),
  the bot turn, the boss turn, the evaluation bar and the hint end instead of waiting for ever: the game is
  not "thinking" any more, a hint that was asked is off, and the HUD adds one note, kept verbatim for the e2e
  tests: "The bot could not answer: press New game".
- **A loading plate (#901).** From the first paint, a fixed plate (`#loading`, `role="status"`, the word "Loading" and a
  turning hex ring) sits over the page, so nothing shifts and a blank or half-lit screen never looks broken. When the
  bay is mounted (`mountBay` runs, a missing bay too), it fades out over 0.3 s (class `done`) and is hidden 400 ms
  later. Under automation (`navigator.webdriver`) it is hidden at once, so a check waiting on `data-bay` never sees it
  fade. Under reduced motion the ring is still and there is no fade. A failed start hides it, so it never covers
  `#boot-error`.
- **A failed start (#737).** If the wasm or the renderer cannot start, a box (`#boot-error`, `role="alert"`) covers
  the page with "The game could not start: <reason>" and a Reload button (`#boot-reload`), instead of a blank
  page with greyed buttons. The strings are kept verbatim for the e2e tests.
- The HUD is a live region (`role="status"`, `aria-live="polite"`) so a screen reader hears the
  turn change. `#hud` and its text are read by the e2e tests: ids and strings do not change.

### 4.1 Evaluation bar

Local hot-seat and bot games show who is ahead, from our own engine (#191). Online and boss games
never show it (fair play, #164): starting one hides it for good. The hub (Ship) has no game on: it
hides the bar and drops the evaluation in flight until a game leaves it (#583).

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
(fair play, #164): starting one hides it for good, like the evaluation bar. The hub hides it too
until a game leaves it (#583).

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

### 4.3 Auto-play

An Auto-play toggle in the fight HUD, next to Hint, lets the bot play the player's side (#792). It is on offer in
a bot game, at the hot-seat table (the bot plays whichever side is to move), in the offline battle royale and in a boss
fight, never online (a versus room, a co-op fight, an online battle royale: the button is hidden), not in the hub and not with
`?bot=off`, the test flag that takes the bot away.

- **Play.** With it on, the bot (Web Worker, the current difficulty, `answer` with `player` for a boss fight) plays the
  player's move no sooner than 700 ms after the last (`AUTO_DELAY_MS`), through the same path as the bot's own reply, so
  the thinking guard shuts the board to clicks meanwhile. The bot's own side plays as ever. In the battle royale it
  commits the royale bot's order for the player's seat, once the reveal of the last round has ended.
- **Stop.** Any time: a second press turns it off, and a move being searched is dropped. It turns itself off when the game
  is over, replaced (New game, Retry, an import, another mode) or left for the hub.
- **Boss.** A boss fight needs that boss's medal (the medals, #791): without it the button is greyed
  and the reason is written next to it: "Beat The Echo once to unlock Auto-play against it".
- **Source.** The rule of availability lives in `client/src/autoplay.ts`. The boss move for the player's side is
  `Encounter.player_move` (the search of the boss budget, so the difficulty scales it), a plain game asks `best_move`.
- The label "Auto-play" is kept verbatim for the e2e tests.

### 4.4 Replay

Every game that keeps a move log has a Replay button, beside Hint and Auto-play on their row: a local or bot game, a boss fight, a daily
fight, an online room (as a view only) and an imported game file (#793). It is greyed until the first move and
hidden in the hub and in a battle royale.

- **Bar.** Replay opens the replay bar on the live position, in the bottom-right column above the evaluation
  bar (it covers no cell): a slider over the plies of the log, the label "Move N of M" (with "(live)" at the
  end), and First, Previous, Next, Last and Live buttons. The keys: Left steps back (and opens the replay of a
  game with moves), Right steps forward, Escape is Live. Left and Right are the camera while Free Cam is on, and
  are left to a text field or the slider when one has the focus.
- **Position.** The board, the side to move, the score, the end banner and, in a boss fight, the boss plate
  and its tells show the stepped position. It is built by replaying the first N moves of the log on a new engine,
  so the boss state at each ply is the engine's, deterministic; nothing is stored.
- **Auto-play.** Opening the replay turns Auto-play off.
- **View only.** While the bar is open no move can be played, no group is selected and no hint is asked: clicks,
  drags and the keyboard play do nothing on the board.
- **Live.** Live (or Escape) closes the bar on the current position, and the game goes on. A move that arrives
  meanwhile, the bot's reply or a peer's move, does the same: the bar closes on the live position. New game, an
  import, Retry and any other new game also close it.
- The buttons keep their labels "Replay" and "Live" for the e2e tests.

## 5. Board framing

The canvas fills the window. A window taller than wide keeps the horizontal view of a square one
(the vertical field of view grows past 40 degrees), so the whole board fits the width of a phone held
upright, and the picture moves down by a quarter of the spare height, which leaves the top to the
plate and the buttons (#227). A fight against The Pulsar opens drawn back, along the same line, just
far enough that the six pulsars off the corners and the counter above each fit the window too, and
Reset view goes back there (#691). None of them lies under the HUD plate either: the picture slides
sideways, as little as clears the plate (on a phone held sideways, to the right), and draws back only
when no slide does (#695). A new window size, such as a phone turned upright, fits that view again
while the player has not moved the camera; once he orbits or zooms, his view stays until Reset view
(#696). A co-op Pulsar fight opens on the same view. The chrome adds a rim only: a fixed, non-interactive radial gradient
from transparent at 65 % to near-black (`#0b0d0f` at 75 % opacity) at 100 %, the same in both themes because the 3D deck is dark either way (fog at the rim, never over the cells). No border or
frame is drawn around the canvas, the 3D deck is the frame. The rim is removed with clear-board
mode once that toggle exists (#32), and it has no motion.

## 6. Motion

- HUD changes fade in over 160 ms (opacity only, ease-out). Nothing moves, nothing slides.
- No looping CSS animation on the page. Camera drift belongs to the renderer, not to this file. The end of a game plays one short animation that ends by itself (section 4, End banner).
- Reduced motion, a toggle of the settings menu (#379), sets every transition and animation duration to 0
  (`:root[data-motion='reduced']`), and the renderer swaps the ejection tumble for a plain fade, drops the
  spatter and the slide. Until the player presses it, it follows `prefers-reduced-motion`; the choice is saved
  locally like the volume sliders and Theme. One pure function, `motionReduced` in `client/src/settings.ts`, decides it.
- The Overseer's speech bubble (#741) is a fixed element over its pedestal: monospace, pale text on near-black (an
  angry one white on dark red), 3:1 and more on every skin, sized with the UI scale and at most 16 rem wide. Typing is
  17 characters a second with a 1 px colour split of the text for 25 ms per character (not a flash) and a soft blip on
  the effects bus; it holds 3 s (angry: 1 s) after the last character, fades over 400 ms, and the angry one shakes
  for as long as it shows. Reduced motion shows the whole text at once, with no split and no shake. Screen readers get
  the whole line at once. Strings: "The vents now burn your marbles too." (HUD, 2 plies) and the 6 angry lines
  (game-design.md section 7.11). On its defeat the bubble types its farewell (typed and held like a taunt) once
  its marble has exploded, and an angry line due on that ply is dropped (#789).
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
