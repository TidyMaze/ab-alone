import { describe, expect, it } from 'vitest';
import { coopStatus, onlineStatus, Presence } from './presence';

describe('Presence', () => {
  it('knows no key at first, and never the empty key of a free seat', () => {
    const p = new Presence();
    expect(p.of('kb')).toBe('waiting');
    expect(p.of('')).toBe('waiting');
  });

  it('is here once a peer proved the key, gone when that peer leaves, here again on reconnect', () => {
    const p = new Presence();
    p.hello('b', 'kb');
    expect(p.of('kb')).toBe('here');
    expect(p.leave('b')).toBe(true);
    expect(p.of('kb')).toBe('gone');
    p.hello('b2', 'kb'); // the transport may name the peer differently once it is back
    expect(p.of('kb')).toBe('here');
  });

  it('follows the key, not any peer: another peer leaving changes nothing', () => {
    const p = new Presence();
    p.hello('b', 'kb');
    p.hello('c', 'kc');
    expect(p.leave('c')).toBe(true);
    expect(p.leave('x')).toBe(false); // a peer that never proved a key
    expect(p.of('kb')).toBe('here');
    expect(p.of('kc')).toBe('gone');
  });

  it('keeps a key here while one of its peers is still connected', () => {
    const p = new Presence();
    p.hello('b', 'kb');
    p.hello('b2', 'kb'); // back on a new peer before the old one timed out
    p.leave('b');
    expect(p.of('kb')).toBe('here');
  });
});

describe('onlineStatus', () => {
  it('room creator alone: own color and waiting', () => {
    // #1038: the title already says whose turn it is, the waiting line keeps to the wait (no "You are Black.").
    expect(onlineStatus(1, 'player', 'waiting', false, 2)).toEqual({ text: 'Waiting for an opponent...', tone: 'waiting' });
  });

  it('marks an agent opponent in the line, here or disconnected, and a human one stays unmarked', () => {
    expect(onlineStatus(1, 'player', 'here', true, 2)).toEqual({ text: 'You are Black. White (agent) is here.', tone: 'here' });
    expect(onlineStatus(2, 'player', 'gone', true, 2)).toEqual({ text: 'You are White. Black (agent) is disconnected.', tone: 'gone' });
    expect(onlineStatus(1, 'player', 'here', false, 2)).toEqual({ text: 'You are Black. White is here.', tone: 'here' });
  });

  it('joiner: joining until seated, then the creator is here', () => {
    expect(onlineStatus(2, 'pending', 'here', false, 2)).toEqual({ text: 'Joining as White...', tone: 'waiting' });
    expect(onlineStatus(2, 'player', 'here', false, 2)).toEqual({ text: 'You are White. Black is here.', tone: 'here' });
  });

  it('names the opponent for either side, here or disconnected', () => {
    expect(onlineStatus(1, 'player', 'here', false, 2)).toEqual({ text: 'You are Black. White is here.', tone: 'here' });
    expect(onlineStatus(1, 'player', 'gone', false, 2)).toEqual({ text: 'You are Black. White is disconnected.', tone: 'gone' });
    expect(onlineStatus(2, 'player', 'gone', false, 2)).toEqual({ text: 'You are White. Black is disconnected.', tone: 'gone' });
  });

  it('names the sides after the glass: side 1 wearing the pale glass is White', () => {
    expect(onlineStatus(1, 'player', 'here', false, 1)).toEqual({ text: 'You are White. Black is here.', tone: 'here' });
    expect(onlineStatus(2, 'player', 'gone', false, 1)).toEqual({ text: 'You are Black. White is disconnected.', tone: 'gone' });
  });

  it('room full: watching', () => {
    expect(onlineStatus(2, 'spectator', 'here', false, 2)).toEqual({ text: 'Room is full, watching', tone: 'watching' });
  });
});

describe('coopStatus, #530', () => {
  it('names the partner, never a colour: both seats play Black against the boss', () => {
    expect(coopStatus('player', 'waiting', false)).toEqual({ text: 'Waiting for a partner...', tone: 'waiting' });
    expect(coopStatus('player', 'here', false)).toEqual({ text: 'Your partner is here.', tone: 'here' });
    expect(coopStatus('player', 'gone', false)).toEqual({ text: 'Your partner is disconnected.', tone: 'gone' });
  });

  it('marks an agent partner in the line', () => {
    expect(coopStatus('player', 'here', true)).toEqual({ text: 'Your partner (agent) is here.', tone: 'here' });
  });

  it('joining the fight until seated, and watching once the room is full', () => {
    expect(coopStatus('pending', 'here', false)).toEqual({ text: 'Joining the fight...', tone: 'waiting' });
    expect(coopStatus('spectator', 'here', false)).toEqual({ text: 'Room is full, watching', tone: 'watching' });
  });
});
