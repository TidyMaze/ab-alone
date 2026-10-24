import type { Role } from './session';

const SIDE_NAMES: Record<number, string> = { 1: 'Black', 2: 'White' };

/** `waiting`: the key never showed up. `here`: a peer that proved it is connected. `gone`: it was here and left. */
export type Seen = 'waiting' | 'here' | 'gone';

/**
 * Which keys are connected. A key is here while a peer that proved it with a valid Hello is still
 * connected, so the presence of a seat follows the key bound to it, never just any peer.
 */
export class Presence {
  private readonly peers = new Map<string, string>(); // transport peer -> public key
  private readonly met = new Set<string>();

  /** `peer` sent a valid Hello signed by `pub`. */
  hello(peer: string, pub: string): void {
    this.peers.set(peer, pub);
    this.met.add(pub);
  }

  /** The transport lost `peer`. False when it never proved a key. */
  leave(peer: string): boolean {
    return this.peers.delete(peer);
  }

  of(pub: string): Seen {
    if ([...this.peers.values()].includes(pub)) return 'here';
    return this.met.has(pub) ? 'gone' : 'waiting';
  }
}

export interface OnlineStatus {
  text: string;
  tone: Seen | 'watching';
}

/** The HUD status line of an online game, see docs/specs/ui.md section 4. The e2e tests read these strings. */
export function onlineStatus(side: number, role: Role, opponent: Seen, agent = false): OnlineStatus {
  const me = SIDE_NAMES[side];
  const them = SIDE_NAMES[3 - side] + (agent ? ' (agent)' : ''); // the opponent's Hello carried the agent flag
  if (role === 'spectator') return { text: 'Room is full, watching', tone: 'watching' };
  if (role === 'pending') return { text: `Joining as ${me}...`, tone: 'waiting' };
  if (opponent === 'here') return { text: `You are ${me}. ${them} is here.`, tone: 'here' };
  if (opponent === 'gone') return { text: `You are ${me}. ${them} is disconnected.`, tone: 'gone' };
  return { text: `You are ${me}. Waiting for an opponent...`, tone: 'waiting' };
}
