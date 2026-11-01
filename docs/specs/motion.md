---
id: motion
type: architecture-design
status: draft
title: "Motion: tokens and budget"
parent: ui
---

# Motion: tokens and budget

Status: draft, for #1036 story 1 (`Refs #1036`). One topic: the numbers every animation uses. No code in this spec. Stories 2 to 9 of #1036 build on it and add no number of their own.

Sources read: `client/src/slide.ts` (`SLIDE_MS` 200 ms, ease out), `client/src/ui.css` (`hud-in` 160 ms, `bubble-shake` 120 ms, boss `.frag` 400 ms, `frag-refill` 450 ms, `end-*` 1.2 to 1.6 s, and the rule at `:root[data-motion='reduced']`), `client/src/settings.ts` (`motionReduced(system, saved)`, row `reduced-motion`).

## 1. Principles

1. **Motion explains, it does not decorate.** It answers one question: what just changed, or what can I press.
2. **Tokens only.** A duration or an easing is a named token (section 2). No literal `ms` in a new rule.
3. **Budget per interaction.** One move: one main motion plus at most one accent, both done in 400 ms. Only a celebration (a win, a boss kill) may run longer, at most 1.2 s, and any input skips it.
4. **Motion never delays input.** The game state changes at once; the animation only shows it. The next move, a press on the dock or a sheet is accepted while a motion runs, and a new move finishes the running one.
5. **Cheap.** CSS `transform` and `opacity` (and `translate`, `scale`) only. No layout property, no per-frame allocation, no new dependency. Checked with the FPS panel on a 360 px viewport.
6. **Nothing covered.** A moving element never covers the board, a marble, the HUD or a control, and a panel keeps its final hit area from the first frame (no layout shift, no blocked press while it animates). This includes the thumb dock and its sheets (thumb-dock.md, #1032).
7. **No flash.** No effect flashes more than 3 times a second (as `alien.ts` already holds for the egg glow).

## 2. Tokens

CSS variables on `:root`. The JS side reads the same values (`SLIDE_MS` becomes `MOTION.base`).

| Token | Value | Easing | Where used |
|---|---|---|---|
| `--motion-instant` | 80 ms | `--ease-out` | Button pressed state, focus ring |
| `--motion-fast` | 120 ms | `--ease-out` | Illegal-move shake, chip flash, check mark |
| `--motion-base` | 200 ms | `--ease-out` | Marble slide (`SLIDE_MS`), sheet and menu open, cross-fade, HUD tally count |
| `--motion-slow` | 320 ms | `--ease-in-out` | Boss bar fill, panel close with a long travel |
| `--motion-celebrate` | 1200 ms (cap) | `--ease-out` | Win and loss beat, ejection arc, boss kill |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | - | Things that arrive |
| `--ease-in` | `cubic-bezier(0.5, 0, 0.9, 0.4)` | - | Things that leave (close, fade out) |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | - | Bars and values that change in place |

Existing literals (`hud-in` 160 ms, `bubble-shake` 120 ms, `.frag` 400 ms) move to the nearest token when their story touches them; this spec does not ask for a sweep.

## 3. Reduced motion

One switch, already in the code: `motionReduced(system, saved)` (the Reduced motion row, else `prefers-reduced-motion`), applied as `data-motion='reduced'` on the root.

- A `reducedMotion()` helper returns that value to JS. JS animations (slide, tally, ejection) read it and jump to the end state.
- Under `data-motion='reduced'` the five duration tokens compute to `0ms`, so every rule that uses a token is cut with no extra code. The existing catch-all rule stays as a net for literals.
- **Cut the motion, keep the information.** Each story below names what stays: the end state, a static marker, or the text. Looping and pulsing effects stop; a state that was only shown by moving (last move, a refused move) gets a static mark.
- A unit test checks that the tokens are `0ms` under reduced motion.

## 4. Acceptance of the other stories

**2. Board move and last move.** A pushed chain slides on `--motion-base` with a tiny squash on arrival (`--motion-fast`); the last move pulses once on its origin and target cells. The next input is accepted at once; replay and online play are unaffected. Reduced: marbles jump to the cell and the last move shows a steady outline.

**3. Ejection and end.** An ejected marble arcs off the edge and fades in `--motion-celebrate`; a win or loss beat in the HUD plate (`body[data-over]`) runs at most 1.2 s and any input skips it. Reduced: the marble is removed at once and the result banner shows without the beat.

**4. Menus and buttons.** Settings, Game modes and the dock sheets open with a slide and fade on `--motion-base` and close on `--motion-base` with `--ease-in`; buttons ease their pressed and focus states on `--motion-instant`. No layout shift, hit area live from the first frame. Reduced: panels appear and vanish at once; the focus ring stays.

**5. HUD tally.** The captured count rises to its new value on `--motion-base`. The final value is always exact, and the text (not only the motion) carries the number. Reduced: the number changes at once.

**6. Boss feedback.** The boss bar fills on `--motion-slow`; phase chips flash once on `--motion-fast`; a fragment break shows one small burst on `--motion-base`. Reduced: the bar jumps, a changed phase chip keeps a steady highlight until the next move, no burst.

**7. Illegal move and Hint.** A refused move shakes the selection once on `--motion-fast` and shows at most one toast line; the Hint arrow draws in on `--motion-base`. Reduced: no shake, the toast line stays; the arrow appears whole.

**8. Result confirms.** After Daily result or Copy result (`#daily-copy`), a check mark draws on `--motion-fast` and the button label reads "Copied". Reduced: the check and the label show at once.

**9. Transitions.** One cross-fade on `--motion-base` between menu, a game and the Open world. It never delays the start of a game: the game is live and takes input while the fade runs. Reduced: a hard cut.

## 5. Measures: frame time on a phone viewport, before and after (#1036)

Method (#1036, 2026-11-01): headed Chromium (`--enable-gpu`) on an Apple laptop with a 60 Hz display, `vite build --mode e2e` of each
commit served by `vite preview` on port 5995, one run at a time through `heavy.sh`, load average (1 minute) 3 to 4 at each
start (14 at the end of the leak run). "Before" = a4c7d8e2, the commit just before the first animation task (#1106, PR #1114);
"after" = `main` at 8d4f4988, which also holds unrelated later changes (the Dungeon button, the 80 ms step, the guide). Each
scenario runs 12 s after a 4 s settle: Open world `?openworld=7` with the hero walking (arrow keys, 600 ms down, 150 ms up,
right/down/left/up in turn), normal zoom 1, widest zoom 6 (wheel), and idle; a boss fight against The Echo (medal set,
`?nodes=50`) with Auto-play on, 32 plies at 1280x720; the same two at a phone viewport 390x844, touch, device ratio 2.
`navigator.webdriver` is hidden so the ambience particles run. Measured in the page: the rAF interval of an extra loop, the
time spent in the page's own rAF callbacks per frame (draw cost on the main thread, not the GPU), `longtask` entries, and the
CDP `TaskDuration` per second. Two runs of "before" and two of "after" (four for the board fight and phone board, after a
132 and 182 ms frames appeared once, in the first "after" run, and not in three others).

**The 60 Hz cap hides the difference.** The rAF interval is the same in every run: mean 16.67 ms, 95th percentile 18.2 to 18.6
ms (vsync steps), 0 long tasks in all 32 runs, 0 page errors, adaptive pixel ratio never stepped down (1 on desktop, 1.5 on the
phone viewport). So frame time cannot show a difference smaller than the 16.7 ms frame; the callback cost can, and is the number
to read (it is the CPU part only: the GPU time is not measured, the display waits for it). Mean callback ms per frame
(95th percentile in brackets), mean of the runs:

| Scenario | Before | After | Change |
|---|---|---|---|
| Open world walk, zoom 1 | 1.31 (2.5) | 1.86 (2.8) | +0.55 |
| Open world walk, widest zoom 6 | 1.81 (2.9) | 1.96 (3.2) | +0.15 |
| Open world idle, zoom 1 | 1.46 (1.9) | 1.57 (2.1) | +0.11 |
| Open world walk, phone 390x844 | 1.55 (2.5) | 1.41 (2.1) | -0.14 |
| Boss fight, auto-play, 1280x720 | 2.65 (3.8) | 2.06 (2.8) | -0.59 |
| Boss fight, widest board zoom | 2.66 (3.8) | 2.35 (3.2) | -0.31 |
| Boss fight, phone 390x844 | 2.50 (3.5) | 1.87 (2.8) | -0.63 |

TaskDuration per second (main thread, ms, mean of the runs): Open world walk 106 / 147 at normal zoom, 147 / 156 widest, 112 / 118
idle; board fight 197 / 157 (desktop), 198 / 178 (widest), phone 126 / 114 (Open world), 182 / 140 (board).

Reading for this spec: on the phone viewport the Open world walk (-0.14 ms) and the board fight (-0.63 ms) cost no more than
before; the 60 Hz frame interval holds (95th percentile 18.2 to 18.3 ms), 0 long tasks, the adaptive resolution never stepped
down. The board fight is cheaper after than before on desktop too (about -0.6 ms), which no animation task explains by itself:
other changes between the two commits, or the machine, may account for it; nothing here attributes it. The phone is a
390x844 viewport on a laptop, not a phone CPU or GPU: a real device was not measured. One frame of 132 ms (phone board) and one of
182 ms (desktop board) showed up in the first "after" run and in none of the three repeats; unexplained, not reproduced.
