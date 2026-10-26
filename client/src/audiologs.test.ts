import { describe, expect, it } from 'vitest';
import { AUDIO_LOGS } from './audiologs';
import { DECK_NAMES } from './deck';

// The audio logs (docs/specs/world.md section 4): one per deck, 60 s at most, a synthesized recording whose words
// exist only in the transcript (section 11: no voice acting).
describe('AUDIO_LOGS (world.md section 4)', () => {
  it('every deck has one log', () => {
    for (const deck of DECK_NAMES) expect(AUDIO_LOGS.filter((log) => log.deck === deck)).toHaveLength(1);
    expect(AUDIO_LOGS).toHaveLength(DECK_NAMES.length);
  });

  it('a log lasts 60 s at most', () => {
    for (const log of AUDIO_LOGS) {
      expect(log.seconds, log.id).toBeGreaterThan(0);
      expect(log.seconds, log.id).toBeLessThanOrEqual(60);
    }
  });

  it('every log has a unique id, a title, a recording and a transcript', () => {
    expect(new Set(AUDIO_LOGS.map((log) => log.id)).size).toBe(AUDIO_LOGS.length);
    for (const log of AUDIO_LOGS) {
      expect(log.id).toMatch(/^[a-z]+(-[a-z]+)+$/);
      expect(log.title.trim()).not.toBe('');
      expect(log.voices.length, log.id).toBeGreaterThan(0);
      expect(log.lines.length, log.id).toBeGreaterThan(0);
      for (const line of log.lines) expect(line.text.trim(), log.id).not.toBe('');
    }
  });

  it('the transcript times increase and stay inside the log', () => {
    for (const log of AUDIO_LOGS) {
      const times = log.lines.map((line) => line.at);
      expect(times[0], log.id).toBeGreaterThanOrEqual(0);
      times.slice(1).forEach((at, i) => expect(at, log.id).toBeGreaterThan(times[i]!));
      expect(times.at(-1), log.id).toBeLessThan(log.seconds);
    }
  });

  it('every voice plays inside the log, its times increasing, silent at both ends', () => {
    for (const log of AUDIO_LOGS) {
      for (const { env } of log.voices) {
        expect(env.length, log.id).toBeGreaterThanOrEqual(3);
        expect(env[0]![0], log.id).toBeGreaterThanOrEqual(0);
        env.slice(1).forEach(([t], i) => expect(t, log.id).toBeGreaterThan(env[i]![0]));
        expect(env.at(-1)![0], log.id).toBeLessThanOrEqual(log.seconds);
        expect([env[0]![1], env.at(-1)![1]], log.id).toEqual([0, 0]);
      }
    }
  });

  it('every frequency is above 0, since the glides are exponential', () => {
    for (const log of AUDIO_LOGS) {
      for (const voice of log.voices) {
        const freq = voice.source === 'noise' ? voice.filter.freq : voice.freq;
        for (const hz of freq) expect(hz, log.id).toBeGreaterThan(0);
      }
    }
  });
});
