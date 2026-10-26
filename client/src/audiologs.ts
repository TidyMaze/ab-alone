// The audio logs (docs/specs/world.md section 4): short recordings left on the decks, one per deck, 60 s at most,
// written from the facts of sections 2 and 3 and the lore terminals (lore.ts). There is no voice acting (section
// 11): a log is a synthesized recording (room tone, footsteps, machinery, the Choir's hum) made of the same voices
// as the other sounds (sound.ts), and its words exist only in the transcript. Data, and the two lookups of the player
// (#516).
import type { Deck } from './deck';
import { knockVoices, tellVoices, type Envelope, type Voice } from './sound';

/** A transcript line, shown `at` seconds after the log starts. A line in brackets is a sound, not words. */
export interface LogLine {
  at: number;
  text: string;
}

export interface AudioLog {
  id: string;
  deck: Deck;
  title: string;
  seconds: number;
  voices: readonly Voice[];
  lines: readonly LogLine[];
}

/** Up to `gain` over `fade` seconds from `from`, held, then down to silence at `to`. */
const hold = (from: number, to: number, gain: number, fade = 1.5): Envelope => [
  [from, 0],
  [from + fade, gain],
  [to - fade, gain],
  [to, 0],
];
/** A hit: up in 4 ms, then dies away over `decay` seconds. */
const hit = (at: number, peak: number, decay: number): Envelope => [
  [at, 0],
  [at + 0.004, peak],
  [at + decay, 0],
];
/** The same voices, `t` seconds later. */
const later = (t: number, voices: readonly Voice[]): Voice[] =>
  voices.map((voice) => ({ ...voice, env: voice.env.map(([s, g]) => [s + t, g] as const) }));
/** `count` sounds from `at`, one every `gap` seconds. */
const every = (at: number, count: number, gap: number, voice: (t: number) => Voice[]): Voice[] =>
  Array.from({ length: count }, (_, i) => voice(at + i * gap)).flat();

/** The room under the whole recording: a lowpassed noise bed below `cutoff` Hz and a steady hum at `hz`. */
const room = (seconds: number, cutoff: number, hz: number, gain: number): Voice[] => [
  { source: 'noise', filter: { type: 'lowpass', freq: [cutoff, cutoff], q: 0.7 }, env: hold(0, seconds, gain) },
  { source: 'sine', freq: [hz, hz], env: hold(0, seconds, gain / 2) },
];
/** A footstep: a dull heel knock, brighter on a metal grating than on a deck plate. */
const step =
  (cutoff: number) =>
  (at: number): Voice[] => [
    { source: 'noise', filter: { type: 'lowpass', freq: [cutoff, cutoff / 2], q: 1 }, env: hit(at, 0.5, 0.09) },
  ];
/** Machinery: the clank of a crane or a pipe, a short knock of noise around `hz`. */
const clank =
  (hz: number) =>
  (at: number): Voice[] => [
    { source: 'noise', filter: { type: 'bandpass', freq: [hz, hz * 0.7], q: 6 }, env: hit(at, 0.3, 0.25) },
  ];
/** A chair or a frame under weight: a low falling creak. */
const creak = (at: number, hz: number): Voice[] => [
  { source: 'triangle', freq: [hz, hz * 0.75], env: hold(at, at + 0.6, 0.3, 0.1) },
];
/** A breath of steam or of whispers: a band of noise that swells and fades over `seconds`. */
const breath =
  (hz: number, gain: number, seconds: number) =>
  (at: number): Voice[] => [
    {
      source: 'noise',
      filter: { type: 'bandpass', freq: [hz, hz * 0.8], q: 2 },
      env: hold(at, at + seconds, gain, seconds / 3),
    },
  ];
/** The console's two-note chime on the bridge. */
const chime = (at: number): Voice[] => [
  { source: 'sine', freq: [880, 880], env: hit(at, 0.2, 0.4) },
  { source: 'sine', freq: [1320, 1320], env: hit(at + 0.15, 0.15, 0.5) },
];
/** The Choir's hum: the low, middle and high groups come in one after the other, `gap` seconds apart, a fifth apart,
 * and hold until `to`. */
const hum = (from: number, to: number, gap: number): Voice[] =>
  [147, 220, 330].map(
    (hz, i): Voice => ({ source: 'sine', freq: [hz, hz], env: hold(from + i * gap, to, 0.18 - i * 0.04, 4) }),
  );

export const AUDIO_LOGS: readonly AudioLog[] = [
  {
    id: 'mess-first-game',
    deck: 'mess',
    title: 'Mess recorder, the first game after the order',
    seconds: 50,
    voices: [
      ...room(50, 220, 60, 0.2),
      ...creak(1, 180),
      ...every(2.5, 6, 0.15, (t) => later(t, knockVoices(330))),
      ...every(16, 4, 0.9, (t) => later(t, knockVoices(247))),
      ...every(31, 3, 0.25, (t) => later(t, knockVoices(196))),
      ...every(44, 6, 0.55, step(400)),
    ],
    lines: [
      { at: 1, text: '[The galley hum. A chair scrapes. Marbles poured onto a board.]' },
      { at: 5, text: 'Recording. The captain wants a record, so this is the record.' },
      { at: 10, text: 'First dispute under the new order. Two loaders, one bunk. They set fourteen each.' },
      { at: 16, text: '[Marbles knock on the board.]' },
      { at: 19, text: 'Nobody is shouting. That is new. Somebody even said please.' },
      { at: 25, text: 'Our dealer came over from the card table to keep the count. Says the cards can wait.' },
      { at: 31, text: '[A marble goes over the rim and drops.]' },
      { at: 34, text: 'Six out. The bunk is settled. The loser shook hands and walked off. That is the idea.' },
      { at: 40, text: 'TALLY: Dispute closed. Entered.' },
      { at: 44, text: '[Footsteps leave. The hum stays.]' },
      { at: 47, text: 'The captain did not come down to watch. End of recording.' },
    ],
  },
  {
    id: 'cargo-night-shift',
    deck: 'cargo',
    title: "Night loader's suit recorder",
    seconds: 52,
    voices: [
      ...room(52, 120, 40, 0.3),
      { source: 'triangle', freq: [55, 55], env: hold(0.5, 45.5, 0.1) },
      ...every(1, 15, 3, clank(700)),
      ...every(11, 6, 0.6, step(900)),
      ...later(28, tellVoices('crack')),
      ...later(46, tellVoices('crack')),
    ],
    lines: [
      { at: 1, text: '[A wide, cold bay. A crane runs somewhere above.]' },
      { at: 5, text: 'Night shift, bay two. The suit says core temperature fine. I say fine.' },
      { at: 11, text: '[Boots on the grating.]' },
      {
        at: 14,
        text: 'Glove change at the hour, like the sheet says. My left hand did not want to come out of the glove.',
      },
      { at: 21, text: 'It came out. It is only stiff. The skin is a little dull. That is the cold.' },
      { at: 28, text: '[The frame creaks.]' },
      {
        at: 30,
        text: 'The loadmaster is leaning on the frame again. Says it helps his back. He has not moved all shift.',
      },
      { at: 37, text: 'I asked him for a game at the break. He said play fast. Then he laughed. I think he laughed.' },
      { at: 45, text: '[The crane stops. Only the frame now.]' },
      { at: 48, text: 'Still clocked in. Still on time. End.' },
    ],
  },
  {
    id: 'furnace-end-of-watch',
    deck: 'furnace',
    title: 'Smelter deck, end of watch',
    seconds: 55,
    voices: [
      ...room(55, 300, 50, 0.35),
      ...[1, 8, 19, 30, 41].flatMap(breath(2800, 0.25, 1.2)),
      ...hum(12, 52, 10),
    ],
    lines: [
      { at: 1, text: '[The smelters roar. Steam vents in short breaths.]' },
      { at: 5, text: 'End of the watch. The crew asked me to record the song, for the ones on the next shift.' },
      { at: 12, text: '[The low group starts to hum.]' },
      { at: 15, text: 'Low first. That is the oldest of us. They do not move much now, so they sit by the vents.' },
      { at: 22, text: '[The middle group comes in.]' },
      {
        at: 25,
        text: 'Then the middle. Then the high. One after the other, never all at once. That is the only rule of it.',
      },
      { at: 32, text: '[The high group comes in.]' },
      { at: 35, text: 'Power is down again. Tally keeps the smelters lit anyway. It says the arenas need the heat.' },
      { at: 42, text: 'Nobody stops singing to answer it. Nobody has stopped in a week.' },
      { at: 48, text: '[The hum fades under the roar.]' },
      { at: 51, text: 'I am going to sit by the vents for a minute. It is warm there. End of the watch.' },
    ],
  },
  {
    id: 'chapel-names',
    deck: 'chapel',
    title: 'Chapel recorder, left on the rail',
    seconds: 56,
    voices: [
      ...room(56, 160, 100, 0.12),
      ...every(1, 5, 2, breath(3000, 0.05, 1.4)),
      { source: 'noise', filter: { type: 'bandpass', freq: [3000, 1500], q: 1.5 }, env: hit(12, 0.6, 0.15) },
      { source: 'noise', filter: { type: 'lowpass', freq: [250, 250], q: 0.7 }, env: hold(12.2, 55.5, 0.04) },
      ...every(29, 4, 0.7, step(400)),
      ...later(31.5, tellVoices('flip')),
      ...every(52, 2, 1.8, breath(3000, 0.06, 1.6)),
    ],
    lines: [
      { at: 1, text: '[A small room. Wire hums. Someone whispers names.]' },
      {
        at: 5,
        text: 'I come here to say the names. Somebody has to say them out loud, or they are only in the ledger.',
      },
      { at: 12, text: '[A match. A candle.]' },
      { at: 15, text: 'Ines. Marek. Both of the Halloran twins. Old Dunn from the galley.' },
      {
        at: 22,
        text: 'The stones in the bowl moved again when the lights went low. Only a little. I did not take one.',
      },
      { at: 29, text: '[Footsteps behind. The small bell.]' },
      { at: 32, text: 'The chaplain is here, with two others. They only stand beside me. Nobody touches me.' },
      { at: 39, text: 'Three of them now, around the rail. They are warm. I can feel it from here.' },
      { at: 46, text: 'I am going to finish the names first. Ines. Marek.' },
      { at: 52, text: '[The whispers take up the names.]' },
    ],
  },
  {
    id: 'bridge-crew-count',
    deck: 'bridge',
    title: 'Bridge, console recorder',
    seconds: 53,
    voices: [
      ...room(53, 90, 120, 0.12),
      { source: 'sine', freq: [4200, 4200], env: hold(0, 53, 0.01) },
      ...[1, 4, 13, 24, 46].flatMap(chime),
      ...creak(43, 140),
    ],
    lines: [
      { at: 1, text: '[A clean, cold hum. The console chimes.]' },
      { at: 4, text: 'TALLY: Crew count.' },
      { at: 7, text: 'Not now, Tally. Bridge, recording for the log. The docking clamp will not let go.' },
      { at: 13, text: 'TALLY: Release condition: the books balanced.' },
      { at: 17, text: 'We asked it what that means. It said a winner.' },
      { at: 24, text: 'TALLY: Crew count. Crew clear: nine.' },
      {
        at: 29,
        text: 'Nine. It was eleven at the start of the week. The captain has not left the chair since yesterday.',
      },
      { at: 36, text: 'The captain says keep our posts. Whatever happens, keep our posts. So we keep them.' },
      { at: 43, text: '[A chair creaks. Nobody gets up.]' },
      { at: 46, text: 'TALLY: Bridge crew: at posts. Entered.' },
      { at: 50, text: 'End of log.' },
    ],
  },
];

/** The audio log of `deck`: every deck has one (audiologs.test.ts). */
export const logOf = (deck: Deck): AudioLog => AUDIO_LOGS.find((log) => log.deck === deck)!;

/** The transcript line shown `seconds` after `log` started: the last line reached, null before the first. */
export const lineAt = (log: AudioLog, seconds: number): string | null =>
  log.lines.filter((line) => line.at <= seconds).at(-1)?.text ?? null;
