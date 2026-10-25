// The lore terminal entries (docs/specs/world.md section 4): short logs on in-world screens, two per deck, 120 words
// at most each, written from the facts of sections 2 and 3. Data only, never required to progress.
import type { Deck } from './deck';

export interface LoreEntry {
  id: string;
  deck: Deck;
  title: string;
  body: string;
}

export const LORE: readonly LoreEntry[] = [
  {
    id: 'mess-house-rule',
    deck: 'mess',
    title: "Captain's order, pinned above table four",
    body:
      'From today every dispute aboard is settled on a board. Not with fists, not with tools, not in the corridors. ' +
      'Sit down, set fourteen each, play it out. Push six off and the argument is yours, and the other side lets it ' +
      'go. Whoever goes over the rim is out, like the old airlock drill, and stays out. Tally keeps the score and ' +
      'its count is final. I would rather lose a game than lose one more of you to that glass. This is so nobody ' +
      'else gets hurt. Underneath, in marker: He has not come down to play since.',
  },
  {
    id: 'mess-corner-table',
    deck: 'mess',
    title: 'Galley log, unsigned',
    body:
      'There is still one of us at the corner table. It used to deal the cards there every night. It does not eat ' +
      'now. It does not answer. It only plays. You move, and it gives your move back to you, turned around like a ' +
      'mirror, every time. It is round and black and warm to the touch, and it still waits for you to go first. If ' +
      'you sit down with it, look hard at your own move before you make it. What you are about to do shows you ' +
      'what it will do back. Tally, at the end of the shift: Mess: one remaining.',
  },
  {
    id: 'cargo-assay',
    deck: 'cargo',
    title: 'Assay note, ore bay two',
    body:
      'The new vein on Hollow is not slag. It is glass, and it holds heat like nothing on the sheet. Rest a warm ' +
      'hand on a sample and it starts to take the hand. Not a burn. It takes it. The skin goes dull, then hard, ' +
      'from the outside in. Gloves buy an hour. Suits buy a shift. The night loaders say it does not hurt. They ' +
      'say they are fine. They are slower every day, and rounder, and they still clock in on time.',
  },
  {
    id: 'cargo-loadmaster',
    deck: 'cargo',
    title: "Loadmaster's frame log",
    body:
      'The frame is cracking again. I hear it through my back now, since I cannot step away from it. The glass ' +
      'took me where I leaned: shoulder first, then the spine, then all of me, into the steel. I hold the bay ' +
      'together the way I always did. If you want a game with me, play fast. Every turn the frame gives a little ' +
      'more, and the plates under your marbles go with it. When it creaks, count. That is me telling you which ' +
      'plate is next. Tally says the bay is still on the books. So am I.',
  },
  {
    id: 'furnace-power',
    deck: 'furnace',
    title: 'Smelter deck, maintenance tag',
    body:
      'Power is at eleven percent. Gravity holds only where someone still lives. Tally keeps the ship running for ' +
      'the matches and for nothing else, so the smelters stay lit and the arenas stay warm. The shells gather by ' +
      'the vents in rows, pulsing slow. Do not stand still near them. Slag-glass remembers heat, and it fuses to ' +
      'anything warm that touches it for long. Your suit light is the warmest thing left on this deck.',
  },
  {
    id: 'furnace-watch-song',
    deck: 'furnace',
    title: 'Written inside a locker door',
    body:
      'The furnace crew sang at the end of every watch. Three groups, low, middle and high, one after the other, ' +
      'so the heat felt shorter. They still do. You will hear them before you see them. They play the same way ' +
      'they sang: one group moves, then the next, then the next, never all at once. Listen for which voice hums ' +
      'next and you will know where the push comes from. They are not angry with you. They are only finishing ' +
      'the shift.',
  },
  {
    id: 'chapel-door',
    deck: 'chapel',
    title: 'Notice wired to the chapel door',
    body:
      'We built this room from what was left: cable for the rail, cargo cloth for the hangings, candles from the ' +
      'galley stores. Light one if you knew them. Do not take the black stones from the bowl. They are not ' +
      'stones. They are some of us, and they are warm, and they move a little when the lights are low. Their ' +
      'names are on the wall in marker. Say one if you can. The ledger has the names too, but Tally lists them ' +
      'as cargo now.',
  },
  {
    id: 'chapel-sermon',
    deck: 'chapel',
    title: "Sermon notes, in the chaplain's hand",
    body:
      'Do not be afraid of the shell. It is not an ending. It is a coat against the cold, given freely. Our crew ' +
      'are not lost. They are made smooth and whole and quiet. I have felt it start in my own fingers and I am ' +
      'grateful. To those of you still clear: I will not force you. I will only stand beside you, with two ' +
      'others, until you understand. Three of us around you, and you will see it too. You will be warm again.',
  },
  {
    id: 'bridge-clamp',
    deck: 'bridge',
    title: 'TALLY: docking clamp',
    body:
      'Docking clamp: locked. Release condition: one winner, five seats beaten. Seats: mess, cargo, furnace, ' +
      'chapel, bridge. Bridge seat: Tally. Crew clear: one. Draws entered as losses. Fourteen and fourteen. Six ' +
      'out. A winner. The books must balance. Then the clamp.',
  },
  {
    id: 'bridge-last-orders',
    deck: 'bridge',
    title: "Captain's console, last entry",
    body:
      'Tally, my hands are going and I will stop answering soon. Keep the rule after I go. Every dispute on a ' +
      'board. Whoever is pushed out stays out. Keep the bridge crew at their posts, whatever they become. Keep ' +
      'the books. That is all of it. End of entry. Appended by TALLY: Orders logged. Orders kept. Bridge crew: at ' +
      'posts. Captain: present. Seated. Not answering.',
  },
];
