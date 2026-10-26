//! Boss encounter mode bridge to WebAssembly.

use crate::convert::{
    board_bytes, board_cells, cells, code, decode, draw_reason_code, encode, player, result_code,
    side_code, status_code,
};
use abalone_core::board::{Board, Cell};
use abalone_core::encounter::alien::{alien_boss, alien_move, alien_start};
use abalone_core::encounter::ballast::{ballast_boss, ballast_move, ballast_start, ballast_tell};
use abalone_core::encounter::chaplain::{chaplain_boss, chaplain_tell};
use abalone_core::encounter::choir::{
    choir_boss, Army, Choir, ChoirError, ARMY_SIZE, CYCLE, PHASE_ARMIES,
};
use abalone_core::encounter::echo::{echo_boss, echo_move, mirror_move};
use abalone_core::encounter::hull::hull_boss;
use abalone_core::encounter::magnetizer::{magnetizer_boss, magnetizer_move};
use abalone_core::encounter::overseer::{overseer_boss, overseer_move, overseer_start};
use abalone_core::encounter::pulsar::{
    last_pulse, pulsar_boss, pulsar_move, pulsar_start, pulsar_tell,
};
use abalone_core::encounter::railyard::{
    railyard_boss, railyard_move, railyard_start, track_cells,
};
use abalone_core::encounter::{marbles, BossDef, Encounter as CoreEncounter};
use abalone_core::game::Game;
use abalone_core::moves::{legal_moves, Move, Player};
use wasm_bindgen::prelude::*;

/// Army code of the Choir, see the module docs: its place in the cycle.
fn army_code(army: Army) -> i32 {
    CYCLE.iter().position(|&a| a == army).expect("in the cycle") as i32
}

/// What an [`Encounter`] runs: a boss on the standard board with its hooks, or the Choir, which
/// has its own board, armies and move rules.
enum Fight {
    Plain(CoreEncounter),
    Choir(Choir),
}

impl Fight {
    fn game(&self) -> &Game {
        match self {
            Fight::Plain(e) => e.game(),
            Fight::Choir(c) => c.game(),
        }
    }
}

/// One boss of the roster. Adding a boss is one line in [`BOSSES`].
struct BossEntry {
    id: &'static str,
    /// The goal the player reads before the first move: the rule that differs, and how it is won or lost.
    goal: &'static str,
    def: fn() -> BossDef,
    /// The fight for this boss definition and seed.
    start: fn(BossDef, u64) -> Fight,
    /// The boss move for the current position of a plain fight, `None` on the player's turn or
    /// when over.
    reply: fn(&CoreEncounter) -> Option<Move>,
    /// The reply the boss announces for a player move, drawn by the client as a ghost.
    announce: fn(Option<&CoreEncounter>, &Move) -> Option<Move>,
    /// Player marbles of a plain fight that flip at the end of the next boss turn.
    flips: fn(&CoreEncounter) -> Vec<(i32, i32)>,
}

/// A boss on the standard board, Black to move.
fn plain_fight(def: BossDef, seed: u64) -> Fight {
    Fight::Plain(CoreEncounter::new(Game::new(), def, seed))
}

/// The Choir sets up its own board, and its play does not depend on a seed.
fn choir_fight(_def: BossDef, _seed: u64) -> Fight {
    Fight::Choir(Choir::start())
}

/// The Ballast Mind sets up its own radius 5 board.
fn ballast_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(ballast_start(seed))
}

/// The Alien sets up its own 7 marbles.
fn alien_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(alien_start(seed))
}

/// The Rail Yard announces its first train at the end of the player's turn 2.
fn railyard_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(railyard_start(seed))
}

/// The Pulsar draws its first pulsar at the start.
fn pulsar_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(pulsar_start(seed))
}

/// The Overseer sets up its cores, its incinerators and its clock.
fn overseer_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(overseer_start(seed))
}

fn ballast_flips(enc: &CoreEncounter) -> Vec<(i32, i32)> {
    ballast_tell(enc).flips
}

fn echo_announce(_enc: Option<&CoreEncounter>, mv: &Move) -> Option<Move> {
    Some(mirror_move(mv))
}

/// Reply of a boss that plays standard Abalone: its node-limited search.
fn search_reply(enc: &CoreEncounter) -> Option<Move> {
    enc.boss_search().map(|r| r.mv)
}

fn no_announce(_enc: Option<&CoreEncounter>, _mv: &Move) -> Option<Move> {
    None
}

fn ballast_announce(enc: Option<&CoreEncounter>, _mv: &Move) -> Option<Move> {
    enc.and_then(|e| ballast_tell(e).echo)
}

fn no_flips(_enc: &CoreEncounter) -> Vec<(i32, i32)> {
    Vec::new()
}

const BOSSES: [BossEntry; 10] = [
    BossEntry {
        id: "echo",
        goal: "It mirrors your move. Eject 6 to win; lose 6 or draw to lose.",
        def: echo_boss,
        start: plain_fight,
        reply: echo_move,
        announce: echo_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "hull",
        goal: "Rim cells crack and eject marbles. Eject 6 to win; lose 6 or draw to lose.",
        def: hull_boss,
        start: plain_fight,
        reply: search_reply,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "choir",
        goal: "One army moves per turn. Eject 10 to win; lose 6 or draw to lose.",
        def: choir_boss,
        start: choir_fight,
        reply: search_reply,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "chaplain",
        goal: "Marbles beside 3 of its flip to it. Eject 6 to win; lose 6 or draw to lose.",
        def: chaplain_boss,
        start: plain_fight,
        reply: search_reply,
        announce: no_announce,
        flips: chaplain_tell,
    },
    BossEntry {
        id: "ballast",
        goal:
            "Void pillars; later cracks, flips and echoes. Eject 12 to win; lose 6 or draw to lose.",
        def: ballast_boss,
        start: ballast_fight,
        reply: ballast_move,
        announce: ballast_announce,
        flips: ballast_flips,
    },
    BossEntry {
        id: "alien",
        goal: "Its eggs hatch; land on one to crush it. Eject 6 to win; lose 6 or draw to lose.",
        def: alien_boss,
        start: alien_fight,
        reply: alien_move,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "railyard",
        goal: "Trains sweep the marked lines. Eject 6 to win; lose 6 or draw to lose.",
        def: railyard_boss,
        start: railyard_fight,
        reply: railyard_move,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "magnetizer",
        goal:
            "Your + and − marbles repel and push any line. Eject 6 to win; lose 6 or draw to lose.",
        def: magnetizer_boss,
        start: plain_fight,
        reply: magnetizer_move,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "pulsar",
        goal: "Pulses push every lone marble or pair away. Eject 6 to win; lose 6 or draw to lose.",
        def: pulsar_boss,
        start: pulsar_fight,
        reply: pulsar_move,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "overseer",
        goal:
            "Push its cores onto the vents. Eject 6 to win, cores count; lose 6, draw or 40 turns.",
        def: overseer_boss,
        start: overseer_fight,
        reply: overseer_move,
        announce: no_announce,
        flips: no_flips,
    },
];

/// `[lit, dark]` notches for `left` boss marbles in a phase that began at `from` and ends at `to`,
/// none when there is no next phase. A converted marble (The Chaplain) adds a lit notch.
fn notches(left: u8, from: u8, to: Option<u8>) -> Vec<u8> {
    to.map_or_else(Vec::new, |to| vec![left - to, from.saturating_sub(left)])
}

/// The polarity of every cell of `board`, in the board order: `0` none, `1` +, `-1` −.
fn polarity_cells(board: &Board) -> Vec<i32> {
    board_cells(board.radius())
        .map(|c| {
            board
                .polarities()
                .iter()
                .find(|p| p.0 == c)
                .map_or(0, |p| i32::from(p.1))
        })
        .collect()
}

fn cell_list(cells: &[(i32, i32)]) -> Vec<i32> {
    cells.iter().flat_map(|&(q, r)| [q, r]).collect()
}

fn boss_entry(id: &str) -> Option<&'static BossEntry> {
    BOSSES.iter().find(|b| b.id == id)
}

/// The engine version a peer carries in its `Hello` (docs/specs/tech.md section 9): peers on different
/// versions refuse to play, they would compute different games. Bump it with any change that makes the same
/// moves give another game: a rule, a boss reply, a layout.
#[wasm_bindgen]
pub fn engine_version() -> u32 {
    3 // 3: The Magnetizer's new rhythm, announce, flip and spent pairs (#671)
}

/// Ids of the bosses the client can start, in play order.
#[wasm_bindgen]
pub fn boss_ids() -> Vec<String> {
    BOSSES.iter().map(|b| b.id.to_string()).collect()
}

/// Display name of a boss id, `None` when unknown.
#[wasm_bindgen]
pub fn boss_name(id: &str) -> Option<String> {
    boss_entry(id).map(|b| (b.def)().name.to_string())
}

/// The goal of a boss id, the text the client shows before the first move. `None` when unknown.
#[wasm_bindgen]
pub fn boss_goal(id: &str) -> Option<String> {
    boss_entry(id).map(|b| b.goal.to_string())
}

/// A game against a boss: the player is Black, the boss is White. Same encodings as [`Engine`].
#[wasm_bindgen]
pub struct Encounter {
    fight: Fight,
    entry: &'static BossEntry,
}

#[wasm_bindgen]
impl Encounter {
    /// A new encounter against boss `boss_id`. The same id and seed always give the same fight.
    #[wasm_bindgen(constructor)]
    pub fn new(boss_id: &str, seed: u32) -> Result<Encounter, String> {
        let entry = boss_entry(boss_id).ok_or_else(|| format!("unknown boss {boss_id}"))?;
        let fight = (entry.start)((entry.def)(), u64::from(seed));
        Ok(Encounter { fight, entry })
    }

    pub fn name(&self) -> String {
        (self.entry.def)().name.to_string()
    }

    pub fn goal(&self) -> String {
        self.entry.goal.to_string()
    }

    /// Side to move: `1` Black, `2` White.
    pub fn to_move(&self) -> u8 {
        side_code(self.fight.game().to_move())
    }

    /// Current phase, `0` for P1.
    pub fn phase(&self) -> u8 {
        match &self.fight {
            Fight::Plain(e) => e.phase() as u8,
            Fight::Choir(c) => c.phase() as u8,
        }
    }

    /// Number of phases, for the HUD notches.
    pub fn phases(&self) -> u8 {
        let steps = match &self.fight {
            Fight::Plain(_) => {
                let def = (self.entry.def)();
                def.phase_marbles.len() + def.phase_ejections.len()
            }
            Fight::Choir(_) => PHASE_ARMIES.len(),
        };
        steps as u8 + 1
    }

    /// The phase notches on the arena frame (#356, docs/specs/world.md section 6 rule 4):
    /// `[lit, dark]`, one lit notch per boss marble left until the next phase, one dark notch per
    /// boss marble lost since this phase began. Empty in the last phase. The Choir's next phase
    /// comes when its smallest army is wiped. The Alien's phases count the ejections credited to
    /// the player (#621): one lit notch per ejection left until the next phase, one dark notch per
    /// ejection since this phase began.
    pub fn phase_notches(&self) -> Vec<u8> {
        let phase = self.phase() as usize;
        match &self.fight {
            Fight::Plain(e) if !(self.entry.def)().phase_ejections.is_empty() => {
                let done = e.game().ejected(Player::Black);
                let steps: Vec<u8> = std::iter::once(0)
                    .chain((self.entry.def)().phase_ejections)
                    .collect();
                steps
                    .get(phase + 1)
                    .map_or_else(Vec::new, |&to| vec![to - done, done - steps[phase]])
            }
            Fight::Plain(e) => {
                let start = (self.entry.start)((self.entry.def)(), 0);
                let steps: Vec<u8> = std::iter::once(marbles(start.game().board(), Cell::White))
                    .chain((self.entry.def)().phase_marbles)
                    .collect();
                let left = marbles(e.game().board(), Cell::White);
                notches(left, steps[phase], steps.get(phase + 1).copied())
            }
            Fight::Choir(c) => {
                let army = CYCLE.iter().map(|&a| c.army_marbles(a)).filter(|&n| n > 0);
                let next = (phase < PHASE_ARMIES.len()).then_some(0);
                notches(army.min().unwrap_or(0), ARMY_SIZE as u8, next)
            }
        }
    }

    /// Id of the board special that fires after the next ply, `-1` when none.
    pub fn tell(&self) -> i32 {
        match &self.fight {
            Fight::Plain(e) => e.tell().map_or(-1, i32::from),
            Fight::Choir(_) => -1,
        }
    }

    /// The reply the boss announces for the player move `mv`, one move record, empty when the
    /// record is malformed or the boss announces nothing.
    pub fn tell_move(&self, mv: &[i32]) -> Vec<i32> {
        let enc = match &self.fight {
            Fight::Plain(e) => Some(e),
            Fight::Choir(_) => None,
        };
        decode(mv)
            .ok()
            .and_then(|m| (self.entry.announce)(enc, &m))
            .map(|m| encode(&m).to_vec())
            .unwrap_or_default()
    }

    /// Legal moves of the side to move, flat records. Empty once the fight is over. On the Choir's
    /// turn, only the moves of the army in turn.
    pub fn legal_moves(&self) -> Vec<i32> {
        let moves = match &self.fight {
            Fight::Plain(e) if e.game().outcome().is_none() => {
                legal_moves(e.game().board(), e.game().to_move())
            }
            Fight::Plain(_) => Vec::new(),
            Fight::Choir(c) => c.legal_moves(),
        };
        moves.iter().flat_map(encode).collect()
    }

    /// Plays one move record for the side to move. `Err` carries the reason.
    pub fn play(&mut self, mv: &[i32]) -> Result<(), String> {
        let mv = decode(mv)?;
        match &mut self.fight {
            Fight::Plain(e) => e.play(&mv).map_err(|e| format!("{e:?}")),
            Fight::Choir(c) => c.play(&mv).map_err(|e| match e {
                ChoirError::Game(e) => format!("{e:?}"),
                other => format!("{other:?}"),
            }),
        }
    }

    /// The boss move, one record, using the boss node budget. Empty on the player's turn or when
    /// the fight is over. It is not played.
    pub fn boss_move(&self) -> Vec<i32> {
        let mv = match &self.fight {
            Fight::Plain(e) => (self.entry.reply)(e),
            Fight::Choir(c) => c.boss_move(),
        };
        mv.map(|m| encode(&m).to_vec()).unwrap_or_default()
    }

    /// Scales the boss search node budget by a percentage relative to baseline (e.g. 50, 100, 200).
    pub fn scale_node_budget(&mut self, percent: u32) {
        match &mut self.fight {
            Fight::Plain(e) => e.scale_node_budget(percent),
            Fight::Choir(c) => c.scale_node_budget(percent),
        }
    }

    /// The 61 cells, board specials included. On the Choir's radius 3 board the outer ring is `3`.
    pub fn board(&self) -> Vec<u8> {
        board_bytes(self.fight.game().board())
    }

    /// Cracked cells (The Hull) as `[q, r, plies_left]` records, empty for the other bosses.
    pub fn cracks(&self) -> Vec<i32> {
        self.fight
            .game()
            .board()
            .cracks()
            .iter()
            .flat_map(|&((q, r), left)| [q, r, i32::from(left)])
            .collect()
    }

    /// Alien eggs as `[q, r, player_turns_left]` records, empty for the other bosses.
    pub fn eggs(&self) -> Vec<i32> {
        self.fight
            .game()
            .board()
            .eggs()
            .iter()
            .flat_map(|&((q, r), left)| [q, r, i32::from(left)])
            .collect()
    }

    /// Rail Yard trains as `[line, player_turns_left, entry_q, entry_r, exit_q, exit_r]` records,
    /// empty for the other bosses.
    pub fn trains(&self) -> Vec<i32> {
        self.fight
            .game()
            .board()
            .trains()
            .iter()
            .flat_map(|&(track, left)| {
                let cells = track_cells(track);
                let ((eq, er), (xq, xr)) = (cells[0], cells[cells.len() - 1]);
                [i32::from(track / 2), i32::from(left), eq, er, xq, xr]
            })
            .collect()
    }

    /// The Pulsar's next pulse as `[pulsar, player_turns_left, force]`, force `0` for infinite,
    /// empty for the other bosses.
    pub fn pulsar(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        pulsar_tell(e).map_or_else(Vec::new, |(pulsar, left, force)| {
            vec![
                i32::from(pulsar),
                i32::from(left),
                i32::from(force.unwrap_or(0)),
            ]
        })
    }

    /// The pulse of the last ply (The Pulsar): the pulsar, the 61 board codes just before it, then
    /// the cells it moved from, see the module docs. Empty when the last ply fired no pulse.
    pub fn last_pulse(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        last_pulse(e).map_or_else(Vec::new, |(pulsar, before, moved)| {
            std::iter::once(i32::from(pulsar))
                .chain(board_bytes(&before).into_iter().map(i32::from))
                .chain(cell_list(&moved))
                .collect()
        })
    }

    /// Player marbles that flip at the end of the next boss turn if nothing moves (The Chaplain),
    /// a cell list. Empty for the other bosses.
    pub fn flips(&self) -> Vec<i32> {
        match &self.fight {
            Fight::Plain(e) => cell_list(&(self.entry.flips)(e)),
            Fight::Choir(_) => Vec::new(),
        }
    }

    /// The polarity of every cell (The Magnetizer), all `0` for the other bosses.
    pub fn polarities(&self) -> Vec<i32> {
        polarity_cells(self.fight.game().board())
    }

    /// The repulsions of the last ply in order (The Magnetizer), records of 126 integers, see the
    /// module docs. Empty for the other bosses.
    pub fn repulsions(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        e.repulsions()
            .iter()
            .flat_map(|rep| {
                let [(qa, ra), (qb, rb)] = rep.pair;
                let codes = board_bytes(&rep.before).into_iter().map(i32::from);
                [qa, ra, qb, rb]
                    .into_iter()
                    .chain(codes)
                    .chain(polarity_cells(&rep.before))
            })
            .collect()
    }

    /// The marble announced for the next assignment and its coming sign (The Magnetizer) as
    /// `[q, r, sign]`, empty when none is announced or the marble left the board.
    pub fn announce(&self) -> Vec<i32> {
        match self.fight.game().board().announce() {
            Some((Some((q, r)), sign)) => vec![q, r, i32::from(sign)],
            _ => Vec::new(),
        }
    }

    /// The player marbles whose polarity the last ply set (The Magnetizer), a cell list.
    pub fn assigned(&self) -> Vec<i32> {
        match &self.fight {
            Fight::Plain(e) => cell_list(e.assigned()),
            Fight::Choir(_) => Vec::new(),
        }
    }

    /// The incinerator cells (The Overseer), a cell list. Empty for the other bosses.
    pub fn incinerators(&self) -> Vec<i32> {
        cell_list(self.fight.game().board().incinerators())
    }

    /// The marbles the last ply's hook removed (The Overseer's burns) as `[q, r, code]` records,
    /// the board code of what burnt.
    pub fn removed(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        e.removed()
            .iter()
            .flat_map(|&((q, r), cell)| [q, r, i32::from(code(Some(cell)))])
            .collect()
    }

    /// Player turns left before the boss wins on the clock (The Overseer's neurotoxin), `-1` for
    /// a fight with no clock.
    pub fn turns_left(&self) -> i32 {
        match &self.fight {
            Fight::Plain(e) => e.turns_left().map_or(-1, |n| n as i32),
            Fight::Choir(_) => -1,
        }
    }

    /// Boss marbles that were player marbles (The Chaplain), a cell list.
    pub fn converted(&self) -> Vec<i32> {
        cell_list(self.fight.game().board().converted())
    }

    /// Boss marbles of the Choir and their army as `[q, r, army]` records, in board order. Empty
    /// for the other bosses.
    pub fn armies(&self) -> Vec<i32> {
        let Fight::Choir(c) = &self.fight else {
            return Vec::new();
        };
        cells()
            .filter_map(|cell| c.army_at(cell).map(|a| [cell.0, cell.1, army_code(a)]))
            .flatten()
            .collect()
    }

    /// The Choir army that moves next (the tell), `-1` for the other bosses and once over.
    pub fn next_army(&self) -> i32 {
        match &self.fight {
            Fight::Choir(c) => c.tell().map_or(-1, army_code),
            Fight::Plain(_) => -1,
        }
    }

    /// Marbles ejected by a side: `1` Black, `2` White.
    pub fn ejected(&self, side: u8) -> u8 {
        self.fight.game().ejected(player(side))
    }

    /// Ejections a side needs to win: `1` Black, `2` White. 6, but 10 for the player against the
    /// Choir (Decision #131).
    pub fn win_ejections(&self, side: u8) -> u8 {
        self.fight.game().win_ejections(player(side))
    }

    /// Game status, see the module docs.
    pub fn status(&self) -> u8 {
        status_code(self.fight.game().outcome())
    }

    /// Draw reason code, `0` when not a draw.
    pub fn draw_reason(&self) -> u8 {
        draw_reason_code(self.fight.game().draw_reason())
    }

    /// `0` playing, `1` won, `2` lost. A draw is a loss.
    pub fn result(&self) -> u8 {
        let result = match &self.fight {
            Fight::Plain(e) => e.result(),
            Fight::Choir(c) => c.result(),
        };
        result_code(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convert::{cells_of, MOVE_STRIDE};
    use abalone_core::encounter::ballast::{
        BALLAST_BOSS_START, BALLAST_PILLARS, BALLAST_PLAYER_START,
    };
    use abalone_core::encounter::choir::{ALTO_START, BASS_START, TENOR_START};
    use abalone_core::moves::Direction;

    fn count(cells: &[u8], value: u8) -> usize {
        cells.iter().filter(|&&c| c == value).count()
    }

    fn fight() -> Encounter {
        Encounter::new("echo", 7).unwrap()
    }

    fn first_move(fight: &Encounter) -> Vec<i32> {
        fight.legal_moves()[..MOVE_STRIDE].to_vec()
    }

    #[test]
    fn the_engine_version_is_3_since_the_magnetizer_s_new_rules() {
        assert_eq!(engine_version(), 3);
    }

    #[test]
    fn boss_list_is_data_driven_and_starts_with_the_echo() {
        assert_eq!(
            boss_ids(),
            vec![
                "echo".to_string(),
                "hull".to_string(),
                "choir".to_string(),
                "chaplain".to_string(),
                "ballast".to_string(),
                "alien".to_string(),
                "railyard".to_string(),
                "magnetizer".to_string(),
                "pulsar".to_string(),
                "overseer".to_string()
            ]
        );
        assert_eq!(boss_name("echo"), Some("The Echo".to_string()));
        assert_eq!(boss_name("hull"), Some("The Hull".to_string()));
        assert_eq!(boss_name("choir"), Some("The Choir".to_string()));
        assert_eq!(boss_name("chaplain"), Some("The Chaplain".to_string()));
        assert_eq!(boss_name("ballast"), Some("The Ballast Mind".to_string()));
        assert_eq!(boss_name("alien"), Some("The Alien".to_string()));
        assert_eq!(boss_name("railyard"), Some("The Rail Yard".to_string()));
        assert_eq!(boss_name("magnetizer"), Some("The Magnetizer".to_string()));
        assert_eq!(boss_name("pulsar"), Some("The Pulsar".to_string()));
        assert_eq!(boss_name("overseer"), Some("The Overseer".to_string()));
        assert_eq!(boss_name("nobody"), None);
    }

    #[test]
    fn every_boss_in_the_daily_rotation_has_a_goal() {
        for id in boss_ids() {
            assert!(
                boss_goal(&id).is_some_and(|g| !g.is_empty()),
                "{id} has no goal"
            );
            assert_eq!(
                Encounter::new(&id, 1).unwrap().goal(),
                boss_goal(&id).unwrap()
            );
        }
        assert_eq!(boss_goal("nobody"), None);
    }

    #[test]
    fn an_unknown_boss_is_refused() {
        assert_eq!(
            Encounter::new("nobody", 0).err(),
            Some("unknown boss nobody".to_string())
        );
    }

    #[test]
    fn a_new_encounter_starts_on_phase_one_with_black_to_move() {
        let f = fight();
        assert_eq!(f.name(), "The Echo");
        assert_eq!(f.to_move(), 1);
        assert_eq!(f.phase(), 0);
        assert_eq!(f.phases(), 3);
        assert_eq!(f.result(), 0);
        assert_eq!(f.status(), 0);
        assert_eq!(f.draw_reason(), 0);
        assert_eq!(f.tell(), -1, "the Echo has no board special");
        assert!(f.cracks().is_empty(), "the Echo cracks nothing");
        assert!(f.eggs().is_empty(), "the Echo lays no egg");
        assert!(f.trains().is_empty(), "the Echo runs no train");
        assert!(f.flips().is_empty(), "the Echo flips nothing");
        assert!(f.converted().is_empty());
        assert!(f.armies().is_empty(), "the Echo has no armies");
        assert_eq!(f.next_army(), -1);
        assert_eq!((f.win_ejections(1), f.win_ejections(2)), (6, 6));
        assert_eq!(f.ejected(1), 0);
        assert_eq!(f.ejected(2), 0);
        let cells = f.board();
        assert_eq!(cells.len(), 61);
        assert_eq!(count(&cells, 1), 14);
        assert_eq!(count(&cells, 2), 14);
    }

    #[test]
    fn encounter_play_switches_side_and_changes_the_board() {
        let mut f = fight();
        let before = f.board();
        let mv = first_move(&f);
        assert_eq!(f.play(&mv), Ok(()));
        assert_eq!(f.to_move(), 2);
        assert_ne!(f.board(), before);
    }

    #[test]
    fn encounter_play_refuses_bad_records_and_illegal_moves() {
        let mut f = fight();
        assert!(f.play(&[]).is_err());
        assert_eq!(
            f.play(&[1, 0, 0, -4, 0, 0, 0, 0]).unwrap_err(),
            "Move(NotOwnMarble)"
        );
        assert_eq!(f.to_move(), 1);
    }

    #[test]
    fn boss_move_is_empty_on_the_players_turn() {
        assert!(fight().boss_move().is_empty());
    }

    #[test]
    fn the_echo_mirrors_the_player_move_and_the_tell_announces_it() {
        let mut f = fight();
        let mv = first_move(&f);
        let announced = f.tell_move(&mv);
        assert_eq!(announced.len(), MOVE_STRIDE);
        f.play(&mv).unwrap();
        let reply = f.boss_move();
        assert_eq!(reply, announced, "the tell is the boss reply");
        assert_eq!(f.play(&reply), Ok(()));
        assert_eq!(f.to_move(), 1);
    }

    #[test]
    fn tell_move_is_empty_for_a_malformed_record() {
        assert!(fight().tell_move(&[1, 2]).is_empty());
    }

    #[test]
    fn boss_move_is_legal() {
        let mut f = fight();
        let mv = first_move(&f);
        f.play(&mv).unwrap();
        let reply = f.boss_move();
        assert!(f
            .legal_moves()
            .chunks(MOVE_STRIDE)
            .any(|m| m == reply.as_slice()));
    }

    #[test]
    fn scale_node_budget_scales_plain_and_choir_fights() {
        let mut f = fight();
        f.scale_node_budget(50);
        let mut choir = Encounter::new("choir", 0).unwrap();
        choir.scale_node_budget(200);
    }

    /// Index of `(q, r)` in the board bytes: rows from `r = -4`, `q` ascending.
    fn index(q: i32, r: i32) -> usize {
        cells().position(|c| c == (q, r)).unwrap()
    }

    /// One ply: the player's first legal move, or the boss move on its turn.
    fn ply(f: &mut Encounter) {
        let mv = if f.to_move() == 1 {
            first_move(f)
        } else {
            f.boss_move()
        };
        f.play(&mv).unwrap();
    }

    #[test]
    fn the_hull_cracks_a_rim_cell_at_ply_8_and_it_vanishes_two_plies_later() {
        let mut f = Encounter::new("hull", 7).unwrap();
        assert_eq!(f.name(), "The Hull");
        for _ in 0..7 {
            ply(&mut f);
        }
        assert!(f.cracks().is_empty(), "no wave before ply 8");
        ply(&mut f);
        let cracks = f.cracks();
        assert_eq!(cracks.len(), 3, "one cell in P1, as [q, r, plies left]");
        let (q, r) = (cracks[0], cracks[1]);
        assert_eq!(cracks[2], 2);
        assert_ne!(f.board()[index(q, r)], 3, "cracked, not gone yet");
        ply(&mut f);
        assert_eq!(f.cracks(), vec![q, r, 1]);
        ply(&mut f);
        assert!(f.cracks().is_empty());
        let cells = f.board();
        assert_eq!(cells.len(), 61, "a vanished cell keeps its slot");
        assert_eq!(count(&cells, 3), 1);
        assert_eq!(cells[index(q, r)], 3);
    }

    #[test]
    fn the_hull_announces_no_reply() {
        let f = Encounter::new("hull", 7).unwrap();
        assert!(f.tell_move(&first_move(&f)).is_empty());
    }

    /// Value of `(q, r)` in the board bytes.
    fn at(cells: &[u8], q: i32, r: i32) -> u8 {
        cells[index(q, r)]
    }

    /// The Chaplain replayed from `history`, the way the client previews a hovered move.
    fn chaplain(history: &[Vec<i32>]) -> Encounter {
        let mut f = Encounter::new("chaplain", 7).unwrap();
        for mv in history {
            f.play(mv).unwrap();
        }
        f
    }

    /// The player's first forward one-marble move (NE or NW), as the e2e test plays it.
    fn forward(f: &Encounter) -> Vec<i32> {
        f.legal_moves()
            .chunks(MOVE_STRIDE)
            .find(|m| m[0] == 1 && (m[1] == 2 || m[1] == 4))
            .unwrap()
            .to_vec()
    }

    /// Pairs of a flat `[q, r]` list.
    fn pairs(flat: &[i32]) -> Vec<(i32, i32)> {
        flat.chunks(2).map(|c| (c[0], c[1])).collect()
    }

    #[test]
    fn the_chaplain_flips_lists_the_player_marbles_a_move_exposes() {
        let mut history: Vec<Vec<i32>> = Vec::new();
        let mut f = chaplain(&history);
        assert!(f.flips().is_empty(), "nothing to flip at the start");
        let after = loop {
            assert!(
                history.len() < 24,
                "no move exposed a marble in 12 player turns"
            );
            let exposing = f.legal_moves().chunks(MOVE_STRIDE).find_map(|m| {
                let after = chaplain(&[history.clone(), vec![m.to_vec()]].concat());
                (!after.flips().is_empty()).then_some(after)
            });
            if let Some(after) = exposing {
                break after;
            }
            let mv = forward(&f);
            f.play(&mv).unwrap();
            history.push(mv);
            let reply = f.boss_move();
            f.play(&reply).unwrap();
            history.push(reply);
        };
        assert_eq!(
            after.to_move(),
            2,
            "the preview is the position after the move"
        );
        let cells = after.board();
        for (q, r) in pairs(&after.flips()) {
            assert_eq!(at(&cells, q, r), 1, "only player marbles flip");
        }
    }

    #[test]
    fn the_chaplain_lists_its_converted_marbles() {
        let mut f = chaplain(&[]);
        while f.converted().is_empty() {
            assert_eq!(f.result(), 0, "the fight ended before any conversion");
            let mv = if f.to_move() == 1 {
                forward(&f)
            } else {
                f.boss_move()
            };
            f.play(&mv).unwrap();
        }
        let cells = f.board();
        for (q, r) in pairs(&f.converted()) {
            assert_eq!(at(&cells, q, r), 2, "a converted marble is a boss marble");
        }
        assert!(
            f.tell_move(&forward(&f)).is_empty(),
            "the Chaplain announces no reply"
        );
    }

    /// The boss replies to four forward player moves, then the board and the cracks after them (the
    /// Hull cracks a seeded rim cell at ply 8).
    fn replies(id: &str, seed: u32) -> (Vec<Vec<i32>>, Vec<u8>, Vec<i32>) {
        let mut f = Encounter::new(id, seed).unwrap();
        let mut boss = Vec::new();
        for _ in 0..4 {
            f.play(&forward(&f)).unwrap();
            let reply = f.boss_move();
            f.play(&reply).unwrap();
            boss.push(reply);
        }
        (boss, f.board(), f.cracks())
    }

    #[test]
    fn the_same_seed_and_moves_give_the_same_boss_replies_for_every_boss() {
        // The daily challenge (#195) gives everyone one seed a day: the fight must replay the same.
        // The Ballast Mind searches 150 000 nodes a move, minutes in a debug build: ballast.rs
        // replays it on a small budget (`same_seed_gives_the_same_game`).
        for id in boss_ids().into_iter().filter(|id| id != "ballast") {
            let first = replies(&id, 2_374_354_862);
            assert_eq!(first.0.len(), 4);
            assert_eq!(replies(&id, 2_374_354_862), first, "{id} replays the same");
        }
    }

    /// The eggs and the board after each of `plies` plies: the player's first legal move, the
    /// boss move on its turn.
    fn brood(seed: u32, plies: usize) -> Vec<(Vec<i32>, Vec<u8>)> {
        let mut f = Encounter::new("alien", seed).unwrap();
        (0..plies)
            .map(|_| {
                ply(&mut f);
                (f.eggs(), f.board())
            })
            .collect()
    }

    #[test]
    fn the_alien_starts_with_8_marbles_and_lays_an_egg_at_ply_4_that_counts_down() {
        let f = Encounter::new("alien", 7).unwrap();
        assert_eq!(f.name(), "The Alien");
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!((count(&f.board(), 1), count(&f.board(), 2)), (14, 8));
        assert!(f.eggs().is_empty());
        let run = brood(7, 5);
        assert!(run[..3].iter().all(|(eggs, _)| eggs.is_empty()));
        let laid = &run[3].0;
        assert_eq!(laid.len(), 3, "one egg as [q, r, player turns left]");
        assert_eq!(laid[2], 4);
        assert_eq!(run[3].1[index(laid[0], laid[1])], 0, "on an empty cell");
        assert_eq!(
            run[4].0,
            vec![laid[0], laid[1], 3],
            "down after the player move"
        );
    }

    #[test]
    fn two_alien_encounters_with_the_same_seed_and_moves_lay_the_same_eggs() {
        // Every peer of a co-op fight, the daily and a Retry replay the same eggs and hatches (#588).
        // 12 plies: two lays and the first hatch, at the end of ply 11.
        let first = brood(2_374_354_862, 12);
        assert_eq!(brood(2_374_354_862, 12), first);
        let alien = |board: &[u8]| count(board, 2);
        assert_eq!((alien(&first[9].1), alien(&first[10].1)), (8, 9), "hatched");
        let runs: Vec<_> = (0..4).map(|seed| brood(seed, 4)).collect();
        assert!(
            runs.iter().any(|r| *r != runs[0]),
            "the seed picks the cells"
        );
    }

    /// The trains and the board after each of `plies` plies: the player's first legal move, the
    /// boss move on its turn.
    fn yard(seed: u32, plies: usize) -> Vec<(Vec<i32>, Vec<u8>)> {
        let mut f = Encounter::new("railyard", seed).unwrap();
        (0..plies)
            .map(|_| {
                ply(&mut f);
                (f.trains(), f.board())
            })
            .collect()
    }

    #[test]
    fn the_rail_yard_announces_a_train_at_the_start_that_passes_after_5_player_turns() {
        // Seed 3: the first train runs the diagonal q + r = 0 from (4, -4), 3 marbles a side on it.
        let f = Encounter::new("railyard", 3).unwrap();
        assert_eq!(f.name(), "The Rail Yard");
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!((count(&f.board(), 1), count(&f.board(), 2)), (14, 14));
        assert_eq!(f.trains(), vec![22, 5, 4, -4, -4, 4]);
        let run = yard(3, 9);
        assert_eq!(run[0].0[1], 4, "down after the player move");
        assert_eq!(run[1].0[1], 4, "not after the boss move");
        assert_eq!(run[7].0, vec![22, 1, 4, -4, -4, 4]);
        assert!(run[8].0.is_empty(), "passed after the player's 5th move");
        let on_line = |board: &[u8]| (-4..=4).filter(|&q| board[index(q, -q)] != 0).count();
        assert_eq!(on_line(&run[8].1), 0, "the diagonal is swept");
    }

    #[test]
    fn two_rail_yard_encounters_with_the_same_seed_and_moves_run_the_same_trains() {
        // Every peer of a co-op fight, the daily and a Retry replay the same trains (#626).
        let first = yard(2_374_354_862, 24);
        assert_eq!(yard(2_374_354_862, 24), first);
        let runs: Vec<_> = (0..4).map(|seed| yard(seed, 1)).collect();
        assert!(
            runs.iter().any(|r| *r != runs[0]),
            "the seed picks the tracks"
        );
    }

    /// The e2e fixture of client/e2e/magnetizer.spec.ts (seed 42, core magnetizer tests): move
    /// records, `[n, dir, q0, r0, q1, r1, q2, r2]`.
    const MAGNET_FIXTURE: [[i32; 8]; 23] = [
        [1, 4, 0, 2, 0, 0, 0, 0],
        [1, 5, 4, -3, 0, 0, 0, 0],
        [1, 4, 0, 1, 0, 0, 0, 0],
        [1, 5, 4, -2, 0, 0, 0, 0],
        [1, 4, 0, 0, 0, 0, 0, 0],
        [1, 5, 4, -1, 0, 0, 0, 0],
        [1, 4, 0, 3, 0, 0, 0, 0],
        [1, 5, 3, -3, 0, 0, 0, 0],
        [1, 4, 0, 2, 0, 0, 0, 0],
        [1, 5, 3, -2, 0, 0, 0, 0],
        [1, 4, 0, 1, 0, 0, 0, 0],
        [1, 5, 4, -4, 0, 0, 0, 0],
        [1, 4, 0, 1, 0, 0, 0, 0],
        [1, 5, 4, -3, 0, 0, 0, 0],
        [1, 4, 0, 0, 0, 0, 0, 0],
        [1, 5, 3, -4, 0, 0, 0, 0],
        [1, 2, -1, 2, 0, 0, 0, 0],
        [1, 5, 3, -3, 0, 0, 0, 0],
        [1, 4, 0, 1, 0, 0, 0, 0],
        [1, 5, 4, -2, 0, 0, 0, 0],
        [3, 4, 0, -2, 0, -1, 0, 0],
        [1, 3, 4, 0, 0, 0, 0, 0],
        [3, 4, 0, -3, 0, -2, 0, -1],
    ];

    /// The board, polarities, repulsions, assigned cells and announce after each of the first
    /// `plies` plies of the fixture.
    type MagnetPly = (Vec<u8>, Vec<i32>, Vec<i32>, Vec<i32>, Vec<i32>);

    fn magnet_run(seed: u32, plies: usize) -> Vec<MagnetPly> {
        let mut f = Encounter::new("magnetizer", seed).unwrap();
        MAGNET_FIXTURE[..plies]
            .iter()
            .map(|record| {
                f.play(record).unwrap();
                let state = (f.board(), f.polarities(), f.repulsions());
                (state.0, state.1, state.2, f.assigned(), f.announce())
            })
            .collect()
    }

    #[test]
    fn the_magnetizer_exposes_polarities_per_cell_the_announce_and_the_repulsions_in_order() {
        let f = Encounter::new("magnetizer", 42).unwrap();
        assert_eq!(f.name(), "The Magnetizer");
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!(f.polarities(), vec![0; 61]);
        assert!(f.repulsions().is_empty() && f.assigned().is_empty() && f.announce().is_empty());
        let run = magnet_run(42, 11);
        let polarized = |p: &[i32]| p.iter().filter(|&&s| s != 0).count();
        assert!(run[0].4.is_empty());
        let announce = &run[1].4;
        assert_eq!(
            announce.len(),
            3,
            "the start of turn 2 announces [q, r, sign] for turn 3"
        );
        assert_eq!(polarized(&run[1].1), 0);
        assert_eq!(polarized(&run[3].1), 1, "the start of turn 3");
        assert_eq!(run[3].3.len(), 2, "one cell assigned");
        assert_eq!(run[3].1[index(run[3].3[0], run[3].3[1])], announce[2]);
        let reps = &run[10].2;
        assert_eq!(reps.len(), 126, "one repulsion");
        assert_eq!(reps[..4], [0, -1, 0, 0]);
        let before = &reps[4..65];
        let poles = &reps[65..];
        assert_eq!(before[index(0, -4)], 2, "the boss column is still there");
        assert_eq!(poles[index(0, -1)], -poles[index(0, 0)]);
        assert_eq!(run[10].0[index(0, -4)], 2, "(0, -3) pushed onto it");
        assert_eq!(run[10].0[index(0, -1)], 0);
        assert_eq!(polarized(&run[10].1), 0, "the pair lost its signs");
        let mut f = Encounter::new("magnetizer", 42).unwrap();
        for record in &MAGNET_FIXTURE {
            f.play(record).unwrap();
        }
        assert_eq!((f.ejected(1), f.phase()), (3, 1), "P2 after 3 ejections");
        assert_eq!(Encounter::new("choir", 1).unwrap().repulsions(), vec![]);
        assert_eq!(Encounter::new("choir", 1).unwrap().assigned(), vec![]);
        assert_eq!(Encounter::new("choir", 1).unwrap().announce(), vec![]);
    }

    #[test]
    fn two_magnetizer_encounters_with_the_same_seed_and_moves_give_the_same_fight() {
        // Every peer of a co-op fight, the daily and a Retry replay the same polarities (#645).
        assert_eq!(magnet_run(42, 23), magnet_run(42, 23));
        assert!((0..4).any(|seed| magnet_run(seed, 4) != magnet_run(42, 4)));
    }

    /// The fixture of the core tests and client/e2e/overseer.spec.ts: `[n, dir, q0, r0, q1, r1]`.
    const OVERSEER_FIXTURE: [[i32; 6]; 24] = [
        [1, 4, 0, 2, 0, 0],
        [1, 5, 4, -3, 0, 0],
        [1, 4, -1, 2, 0, 0],
        [1, 5, 4, -2, 0, 0],
        [2, 0, -1, 1, 0, 1],
        [1, 5, 4, -4, 0, 0],
        [2, 0, 0, 1, 1, 1],
        [1, 5, 4, -3, 0, 0],
        [1, 2, -2, 2, 0, 0],
        [1, 5, 4, -2, 0, 0],
        [1, 2, -1, 3, 0, 0],
        [1, 5, 3, -3, 0, 0],
        [1, 4, 0, 2, 0, 0],
        [1, 0, 3, -2, 0, 0],
        [2, 1, -1, 1, 0, 1],
        [1, 5, 4, -2, 0, 0],
        [2, 1, -2, 1, -1, 1],
        [1, 5, 0, -2, 0, 0],
        [1, 2, -4, 3, 0, 0],
        [1, 5, 1, -2, 0, 0],
        [1, 0, -3, 2, 0, 0],
        [2, 0, 0, -1, 1, -1],
        [1, 0, -2, 2, 0, 0],
        [2, 0, 1, -1, 2, -1],
    ];

    #[test]
    fn the_overseer_exposes_its_cores_vents_clock_and_burns() {
        let mut f = Encounter::new("overseer", 153).unwrap();
        assert_eq!(f.name(), "The Overseer");
        assert_eq!((f.phase(), f.phases(), f.turns_left()), (0, 3, 40));
        let board = f.board();
        assert_eq!(
            (at(&board, 0, 0), at(&board, 2, -1)),
            (9, 8),
            "the Overseer, a core"
        );
        assert_eq!(count(&board, 8), 6);
        assert_eq!(
            f.incinerators(),
            vec![-3, -1, 4, -1, -4, 0, 4, 0, -4, 1, 3, 1]
        );
        let mut burns = Vec::new();
        for ply in OVERSEER_FIXTURE {
            let mut record = [0; MOVE_STRIDE];
            record[..6].copy_from_slice(&ply);
            f.play(&record).unwrap();
            burns.push(f.removed());
        }
        assert_eq!(burns[3], vec![4, -1, 2], "a boss marble burns in P1");
        assert_eq!(burns[6], vec![3, 1, 8], "the core (1, 1)");
        assert_eq!(burns[23], vec![4, -1, 8], "the boss's own push");
        assert_eq!((f.ejected(1), f.result(), f.turns_left()), (6, 1, 28));
        assert_eq!(Encounter::new("echo", 1).unwrap().turns_left(), -1);
        assert!(Encounter::new("echo", 1).unwrap().incinerators().is_empty());
        assert_eq!(Encounter::new("choir", 1).unwrap().turns_left(), -1);
        assert!(Encounter::new("choir", 1).unwrap().removed().is_empty());
    }

    #[test]
    fn the_overseer_replies_with_a_legal_move() {
        let mut f = Encounter::new("overseer", 3).unwrap();
        ply(&mut f);
        let mv = f.boss_move();
        assert_eq!(mv.len(), MOVE_STRIDE);
        f.play(&mv).unwrap();
        assert_eq!(f.to_move(), 1);
    }

    #[test]
    fn the_magnetizer_replies_with_a_legal_move() {
        let mut f = Encounter::new("magnetizer", 3).unwrap();
        ply(&mut f);
        let mv = f.boss_move();
        assert_eq!(mv.len(), MOVE_STRIDE);
        f.play(&mv).unwrap();
        assert_eq!(f.to_move(), 1);
    }

    // The Pulsar (#675): a pulsar pushes every line like a sumito of force 2, 3 or infinite.

    /// The fixture of the core pulsar tests and client/e2e/pulsar.spec.ts (seed 2, the first
    /// pulsar pushes NW): one marble per move, `[q, r, dir]`.
    const PULSAR_FIXTURE: [[i32; 3]; 13] = [
        [-2, 2, 4],
        [4, -3, 3],
        [-1, 2, 4],
        [0, -2, 3],
        [0, 2, 4],
        [3, -3, 0],
        [-2, 1, 4],
        [-1, -1, 1],
        [-1, 1, 4],
        [-2, -1, 1],
        [0, 1, 4],
        [-3, -1, 5],
        [-2, 0, 4],
    ];

    /// The board, the next pulse and the last pulse after each of the first `plies` plies of the
    /// fixture.
    fn pulsar_run(seed: u32, plies: usize) -> Vec<(Vec<u8>, Vec<i32>, Vec<i32>)> {
        let mut f = Encounter::new("pulsar", seed).unwrap();
        PULSAR_FIXTURE[..plies]
            .iter()
            .map(|&[q, r, dir]| {
                f.play(&[1, dir, q, r, 0, 0, 0, 0]).unwrap();
                (f.board(), f.pulsar(), f.last_pulse())
            })
            .collect()
    }

    #[test]
    fn the_pulsar_exposes_the_next_pulse_and_the_moves_of_the_last_one() {
        let f = Encounter::new("pulsar", 2).unwrap();
        assert_eq!(f.name(), "The Pulsar");
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!(f.pulsar(), vec![4, 3, 2], "NW, 3 turns, force 2");
        assert!(f.last_pulse().is_empty());
        let run = pulsar_run(2, 13);
        assert_eq!(run[3].1, vec![4, 1, 2], "on 1 before the first pulse");
        let pulse = &run[4].2;
        assert_eq!(pulse[0], 4);
        assert_eq!(pulse[1 + index(4, -4)], 2, "the board before the pulse");
        assert_eq!(pulse[62..], [1, 3, 4, -4], "(1, 3) and (4, -4) moved");
        assert_eq!(run[4].0[index(4, -4)], 0, "thrown off");
        assert!(run[5].2.is_empty(), "the boss ply fires none");
        assert_eq!(run[12].1[1..], [4, 3], "at rest after P2 starts: force 3");
        let mut f = Encounter::new("pulsar", 2).unwrap();
        for &[q, r, dir] in &PULSAR_FIXTURE {
            f.play(&[1, dir, q, r, 0, 0, 0, 0]).unwrap();
        }
        assert_eq!((f.ejected(1), f.phase()), (3, 1));
        assert!(choir().pulsar().is_empty() && choir().last_pulse().is_empty());
        assert!(Encounter::new("echo", 1).unwrap().pulsar().is_empty());
    }

    #[test]
    fn the_pulsar_reports_infinite_force_as_0() {
        let mut board = Board::standard();
        board.set_pulsar(Some((0, 0)));
        let fight = Fight::Plain(CoreEncounter::new(
            Game::from_position(board, Player::Black, [5, 0]),
            pulsar_boss(),
            0,
        ));
        let entry = boss_entry("pulsar").unwrap();
        assert_eq!(Encounter { fight, entry }.pulsar(), vec![0, 3, 0]);
    }

    #[test]
    fn two_pulsar_encounters_with_the_same_seed_and_moves_give_the_same_pulses() {
        // Every peer of a co-op fight, the daily and a Retry replay the same pulses (#675).
        assert_eq!(pulsar_run(2, 13), pulsar_run(2, 13));
        assert!((0..8).any(|seed| pulsar_run(seed, 1) != pulsar_run(2, 1)));
    }

    #[test]
    fn the_pulsar_replies_with_a_legal_move() {
        let mut f = Encounter::new("pulsar", 3).unwrap();
        ply(&mut f);
        let mv = f.boss_move();
        assert_eq!(mv.len(), MOVE_STRIDE);
        f.play(&mv).unwrap();
        assert_eq!(f.to_move(), 1);
    }

    fn ring((q, r): (i32, i32)) -> i32 {
        q.abs().max(r.abs()).max((q + r).abs())
    }

    #[test]
    fn the_ballast_mind_announces_echo_in_phase_3() {
        let entry = boss_entry("ballast").unwrap();
        let f1 = Encounter::new("ballast", 1).unwrap();
        assert!(f1.tell_move(&first_move(&f1)).is_empty(), "no echo in P1");

        let mut board = abalone_core::encounter::ballast::ballast_board();
        for (q, r) in [(-2, 3), (-2, 4), (-3, 4)] {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in &[(2, -3), (2, -4), (3, -4), (3, -5), (4, -5)] {
            board.set(q, r, Cell::White);
        }
        let mut enc = CoreEncounter::new(
            Game::from_position(board, Player::Black, [0, 0]),
            abalone_core::encounter::ballast::ballast_boss(),
            0,
        );
        let m1 = Move {
            cells: vec![(-2, 3)],
            dir: Direction::E,
        };
        enc.play(&m1).unwrap();
        enc.play(&Move {
            cells: vec![(4, -5)],
            dir: Direction::SE,
        })
        .unwrap();
        let m2 = Move {
            cells: vec![(-1, 3)],
            dir: Direction::E,
        };
        enc.play(&m2).unwrap();
        enc.play(&abalone_core::encounter::ballast::ballast_move(&enc).unwrap())
            .unwrap();
        assert_eq!(enc.game().to_move(), Player::Black);

        let f_p3 = Encounter {
            fight: Fight::Plain(enc),
            entry,
        };
        let hovered = first_move(&f_p3);
        let announced = f_p3.tell_move(&hovered);
        assert_eq!(
            decode(&announced).unwrap(),
            mirror_move(&m2),
            "P3 announces mirror of previous player move"
        );
    }

    #[test]
    fn the_ballast_mind_plays_on_radius_5_with_its_pillars_the_61_cells_first() {
        let f = Encounter::new("ballast", 7).unwrap();
        assert_eq!(f.name(), "The Ballast Mind");
        assert_eq!(f.to_move(), 1);
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!((f.win_ejections(1), f.win_ejections(2)), (12, 6));
        assert_eq!(f.tell(), -1, "no hook in P1");
        assert!(f.cracks().is_empty() && f.flips().is_empty());
        assert!(f.tell_move(&first_move(&f)).is_empty());
        let order: Vec<(i32, i32)> = cells()
            .chain(cells_of(5).filter(|&c| ring(c) == 5))
            .collect();
        assert_eq!(
            order.len(),
            91,
            "the 61 cells of the standard board, then ring 5"
        );
        let board = f.board();
        assert_eq!(board.len(), 91);
        for (i, &(q, r)) in order.iter().enumerate() {
            let expected = if BALLAST_PILLARS.contains(&(q, r)) {
                3
            } else if BALLAST_PLAYER_START.contains(&(q, r)) {
                1
            } else if BALLAST_BOSS_START.contains(&(q, r)) {
                2
            } else {
                0
            };
            assert_eq!(board[i], expected, "({q}, {r})");
        }
        assert_eq!((count(&board, 1), count(&board, 2)), (14, 16));
    }

    #[test]
    fn the_boards_of_the_other_bosses_keep_their_61_cells() {
        for id in [
            "echo",
            "hull",
            "choir",
            "chaplain",
            "alien",
            "railyard",
            "magnetizer",
            "pulsar",
            "overseer",
        ] {
            assert_eq!(Encounter::new(id, 7).unwrap().board().len(), 61, "{id}");
        }
    }

    fn choir() -> Encounter {
        Encounter::new("choir", 7).unwrap()
    }

    fn army_cells(f: &Encounter, army: i32) -> Vec<(i32, i32)> {
        f.armies()
            .chunks(3)
            .filter(|m| m[2] == army)
            .map(|m| (m[0], m[1]))
            .collect()
    }

    #[test]
    fn the_choir_starts_on_a_radius_3_board_with_three_armies_of_four() {
        let f = choir();
        assert_eq!(f.name(), "The Choir");
        assert_eq!(
            (f.to_move(), f.phase(), f.phases(), f.result()),
            (1, 0, 3, 0)
        );
        let cells = f.board();
        assert_eq!(cells.len(), 61, "the board keeps its 61 slots");
        assert_eq!(count(&cells, 3), 24, "the outer ring is a hole");
        assert_eq!((count(&cells, 1), count(&cells, 2)), (10, 12));
        assert_eq!(f.armies().len(), 12 * 3);
        assert_eq!(army_cells(&f, 0), ALTO_START.to_vec());
        assert_eq!(army_cells(&f, 1), TENOR_START.to_vec());
        assert_eq!(army_cells(&f, 2), BASS_START.to_vec());
        assert_eq!(f.next_army(), 0, "Alto moves first");
        assert_eq!(
            (f.win_ejections(1), f.win_ejections(2)),
            (10, 6),
            "Decision #131"
        );
        assert_eq!(f.tell(), -1, "no board special");
        assert!(f.cracks().is_empty() && f.flips().is_empty() && f.converted().is_empty());
        assert!(
            f.tell_move(&first_move(&f)).is_empty(),
            "the Choir announces no reply"
        );
    }

    #[test]
    fn the_choir_boss_moves_the_army_in_turn_and_the_tell_moves_on() {
        let mut f = choir();
        f.play(&forward(&f)).unwrap();
        assert_eq!((f.to_move(), f.next_army()), (2, 0));
        let alto = army_cells(&f, 0);
        let legal = f.legal_moves();
        for m in legal.chunks(MOVE_STRIDE) {
            let cells = (0..m[0] as usize).map(|i| (m[2 + 2 * i], m[3 + 2 * i]));
            assert!(cells.into_iter().all(|c| alto.contains(&c)), "Alto only");
        }
        let reply = f.boss_move();
        assert!(legal.chunks(MOVE_STRIDE).any(|m| m == reply.as_slice()));
        f.play(&reply).unwrap();
        assert_eq!(f.to_move(), 1);
        assert_eq!(f.next_army(), 1, "Tenor next");
        assert!(f.boss_move().is_empty(), "the player's turn");
    }

    #[test]
    fn the_choir_refuses_an_army_out_of_turn_and_illegal_moves() {
        let mut f = choir();
        assert_eq!(
            f.play(&[1, 0, 0, -3, 0, 0, 0, 0]).unwrap_err(),
            "Move(NotOwnMarble)"
        );
        f.play(&forward(&f)).unwrap();
        assert_eq!(
            f.play(&[1, 3, -2, -1, 0, 0, 0, 0]).unwrap_err(),
            "WrongArmy"
        );
        assert_eq!(f.to_move(), 2);
    }

    #[test]
    fn a_finished_encounter_reports_a_result_and_refuses_moves() {
        let mut f = fight();
        while f.result() == 0 {
            let mv = if f.to_move() == 1 {
                first_move(&f)
            } else {
                f.boss_move()
            };
            f.play(&mv).unwrap();
        }
        assert!((1..=2).contains(&f.result()));
        assert_ne!(f.status(), 0);
        assert!(f.legal_moves().is_empty());
        assert!(f.boss_move().is_empty());
        assert!(f.play(&[1, 0, 0, 0, 0, 0, 0, 0]).is_err());
    }

    #[test]
    fn notches_count_the_marbles_left_until_the_next_phase() {
        assert_eq!(notches(14, 14, Some(10)), vec![4, 0]);
        assert_eq!(notches(12, 14, Some(10)), vec![2, 2]);
        assert_eq!(
            notches(16, 14, Some(8)),
            vec![8, 0],
            "a converted marble adds a lit notch"
        );
        assert_eq!(
            notches(3, 5, None),
            Vec::<u8>::new(),
            "the last phase has no next one"
        );
    }

    #[test]
    fn every_boss_starts_with_its_first_phase_notches_lit() {
        let lit = |id: &str| Encounter::new(id, 1).unwrap().phase_notches();
        assert_eq!(lit("echo"), vec![4, 0], "14 boss marbles, P2 at 10");
        assert_eq!(lit("hull"), vec![4, 0], "14 boss marbles, P2 at 10");
        assert_eq!(lit("chaplain"), vec![6, 0], "14 boss marbles, P2 at 8");
        assert_eq!(lit("choir"), vec![4, 0], "P2 once an army of four is wiped");
        assert_eq!(lit("ballast"), vec![6, 0], "16 boss marbles, P2 at 10");
        assert_eq!(lit("alien"), vec![2, 0], "P2 after 2 ejections");
        assert_eq!(lit("railyard"), vec![3, 0], "P2 after 3 ejections");
        assert_eq!(lit("pulsar"), vec![3, 0], "P2 after 3 ejections");
    }

    #[test]
    fn the_alien_phases_and_notches_count_the_ejections_not_its_marbles() {
        let alien = |n: u8| {
            let mut board = alien_start(1).game().board().clone();
            board.set(-1, -3, Cell::White);
            board.set(0, -3, Cell::White);
            let game = Game::from_position(board, Player::Black, [n, 0]);
            Encounter {
                fight: Fight::Plain(CoreEncounter::new(game, alien_boss(), 1)),
                entry: boss_entry("alien").unwrap(),
            }
        };
        let seen: Vec<(u8, u8, Vec<u8>)> = (0..=5)
            .map(|n| {
                let f = alien(n);
                (f.phase(), f.phases(), f.phase_notches())
            })
            .collect();
        assert_eq!(
            seen,
            vec![
                (0, 3, vec![2, 0]),
                (0, 3, vec![1, 1]),
                (1, 3, vec![2, 0]),
                (1, 3, vec![1, 1]),
                (2, 3, vec![]),
                (2, 3, vec![]),
            ]
        );
    }

    #[test]
    fn an_ejected_boss_marble_puts_a_notch_out() {
        let mut f = fight();
        for mv in [
            [1, 4, 1, 3, 0, 0, 0, 0],  // Black (1, 3) to (1, 2)
            [1, 5, 2, -2, 0, 0, 0, 0], // White walks (2, -2) down to the rim at (2, 2)
            [1, 4, -2, 2, 0, 0, 0, 0], // Black waits
            [1, 5, 2, -1, 0, 0, 0, 0],
            [1, 5, -2, 1, 0, 0, 0, 0],
            [1, 5, 2, 0, 0, 0, 0, 0],
            [1, 4, -2, 2, 0, 0, 0, 0],
            [1, 5, 2, 1, 0, 0, 0, 0],
            [2, 0, 0, 2, 1, 2, 0, 0], // Black pushes it off, 2 against 1
        ] {
            f.play(&mv).unwrap();
        }
        assert_eq!(f.ejected(1), 1);
        assert_eq!(f.phase_notches(), vec![3, 1]);
    }
}
