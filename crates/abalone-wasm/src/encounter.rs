//! Boss encounter mode bridge to WebAssembly.

use crate::convert::{
    board_bytes, board_cells, cells, code, decode, draw_reason_code, encode, player, result_code,
    side_code, status_code,
};
use abalone_core::board::{Board, Cell};
use abalone_core::encounter::alien::{alien_boss, alien_move, alien_start};
use abalone_core::encounter::assembly::{
    assembly_boss, assembly_move, assembly_start, assembly_tell, belt_cells, last_belts, Fate,
};
use abalone_core::encounter::ballast::{
    ballast_boss, ballast_fired, ballast_last_pulse, ballast_move, ballast_next,
    ballast_pulse_tell, ballast_start, Borrowed,
};
use abalone_core::encounter::chaplain::{chaplain_boss, chaplain_move, chaplain_tell};
use abalone_core::encounter::choir::{choir_boss, Army, Choir, ChoirError, CYCLE, PHASE_EJECTIONS};
use abalone_core::encounter::dual::{dual_boss, dual_landed, dual_move, dual_start};
use abalone_core::encounter::echo::{
    echo_bonuses, echo_boss, echo_free_moves, echo_free_taken, echo_move, echo_start, echo_tell,
};
use abalone_core::encounter::hull::{hull_boss, hull_move};
use abalone_core::encounter::magnetizer::{magnetizer_boss, magnetizer_move};
use abalone_core::encounter::overseer::{overseer_boss, overseer_move, overseer_start};
use abalone_core::encounter::pulsar::{
    last_pulse, pulsar_boss, pulsar_move, pulsar_start, pulsar_tell,
};
use abalone_core::encounter::railyard::{
    railyard_boss, railyard_move, railyard_start, track_cells,
};
use abalone_core::encounter::stalker::{stalker_boss, stalker_start};
use abalone_core::encounter::swarm::{Swarm, SWARM_PHASE_TURNS};
use abalone_core::encounter::unstable::{
    last_events, unstable_boss, unstable_move, unstable_start, unstable_tell,
};
use abalone_core::encounter::{BossDef, Encounter as CoreEncounter};
use abalone_core::game::Game;
use abalone_core::moves::{legal_moves, Move, Player};
use wasm_bindgen::prelude::*;

/// Army code of the Choir, see the module docs: its place in the cycle.
fn army_code(army: Army) -> i32 {
    CYCLE.iter().position(|&a| a == army).expect("in the cycle") as i32
}

/// What an [`Encounter`] runs: a boss on the standard board with its hooks, the Choir, which
/// has its own board, armies and move rules, or the Swarm, with its waves and its pass.
enum Fight {
    Plain(CoreEncounter),
    Choir(Choir),
    Swarm(Swarm),
}

impl Fight {
    fn game(&self) -> &Game {
        match self {
            Fight::Plain(e) => e.game(),
            Fight::Choir(c) => c.game(),
            Fight::Swarm(s) => s.game(),
        }
    }
}

/// Notches of a boss whose phases come from the player's ejections: `[lit, dark]`, one lit notch
/// per ejection left until the next phase, one dark notch per ejection since this phase began.
/// Empty in the last phase.
fn ejection_notches(game: &Game, thresholds: &[u8], phase: usize) -> Vec<u8> {
    let done = game.ejected(Player::Black);
    let steps: Vec<u8> = std::iter::once(0)
        .chain(thresholds.iter().copied())
        .collect();
    steps
        .get(phase + 1)
        .map_or_else(Vec::new, |&to| vec![to - done, done - steps[phase]])
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

/// The Choir sets up its own board and armies; the seed breaks the ties of the army removals.
fn choir_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Choir(Choir::start(seed))
}

/// The Ballast Mind sets up its own radius 5 board.
fn ballast_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(ballast_start(seed))
}

/// The Alien sets up its own 7 marbles.
fn alien_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(alien_start(seed))
}

/// The Rail Yard announces its first train at the end of the player's turn 1, seen on turn 2.
fn railyard_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(railyard_start(seed))
}

/// The Pulsar draws its first pulsar at the start.
fn pulsar_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(pulsar_start(seed))
}

/// The Assembly Line draws the first way of its centre belt at the start.
fn assembly_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(assembly_start(seed))
}

/// The Overseer sets up its cores, its incinerators and its clock.
fn overseer_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(overseer_start(seed))
}

/// The Unstable Core starts with no charge on the board.
fn unstable_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(unstable_start(seed))
}

/// The Dual Room sets up its two rooms and the void between them.
fn dual_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(dual_start(seed))
}

/// The Stalker starts on the standard board, under its fog.
fn stalker_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(stalker_start(seed))
}

/// The Swarm runs its own fight: only the name of its definition is read.
fn swarm_boss() -> BossDef {
    BossDef {
        name: "The Swarm",
        phase_ejections: Vec::new(),
        ..choir_boss()
    }
}

/// The Swarm starts with 11 player marbles and its first wave announced.
fn swarm_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Swarm(Swarm::start(seed))
}

/// The Echo plays its bonus mirrors inside `play`.
fn echo_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(echo_start(seed))
}

/// The first bonus move the other side gets from `mv`: the mirror the client draws as a ghost.
fn echo_announce(enc: Option<&CoreEncounter>, mv: &Move) -> Option<Move> {
    enc.and_then(|e| echo_bonuses(e, mv).into_iter().next())
}

/// Reply of a boss that plays standard Abalone: its node-limited search.
fn search_reply(enc: &CoreEncounter) -> Option<Move> {
    enc.boss_search().map(|r| r.mv)
}

fn no_announce(_enc: Option<&CoreEncounter>, _mv: &Move) -> Option<Move> {
    None
}

fn no_flips(_enc: &CoreEncounter) -> Vec<(i32, i32)> {
    Vec::new()
}

const BOSSES: [BossEntry; 15] = [
    BossEntry {
        id: "echo",
        goal: "Every move is mirrored for free for the other side: the Echo plays yours at once, you may take its mirror before your own move; after 3 ejections older moves too. Eject 6 to win; lose 6 or draw to lose.",
        def: echo_boss,
        start: echo_fight,
        reply: echo_move,
        announce: echo_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "hull",
        goal:
            "One cell cracks at a time and ejects marbles. Eject 6 to win; lose 6 or draw to lose.",
        def: hull_boss,
        start: plain_fight,
        reply: hull_move,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "choir",
        goal: "One army moves per turn; the weakest army leaves after 3 and 5 ejections. Eject 6 to win; lose 6 or draw to lose.",
        def: choir_boss,
        start: choir_fight,
        reply: search_reply,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "chaplain",
        goal: "A marble beside 4 foes switches sides: a boss marble that joins you counts as an ejection, one that joins it takes one back. At 4 ejections a martyr explodes. Eject 6 to win; lose 6 or draw to lose.",
        def: chaplain_boss,
        start: plain_fight,
        reply: chaplain_move,
        announce: no_announce,
        flips: chaplain_tell,
    },
    BossEntry {
        id: "ballast",
        goal:
            "Void pillars; every 2 turns it borrows a crack, a pulse, a polarity or a conversion. Eject 8 to win; lose 12 or draw to lose.",
        def: ballast_boss,
        start: ballast_fight,
        reply: ballast_move,
        announce: no_announce,
        flips: no_flips,
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
    BossEntry {
        id: "assembly",
        goal: "Belts carry every marble off the board; later, presses strike. Eject 6 to win; lose 6 or draw to lose.",
        def: assembly_boss,
        start: assembly_fight,
        reply: assembly_move,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "core",
        goal: "Centre cells charge marbles, a charged marble weighs more in a push, 4 blow it off. Eject 6 to win; lose 6 or draw to lose.",
        def: unstable_boss,
        start: unstable_fight,
        reply: unstable_move,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "dual",
        goal: "Two rooms split by a void: a marble ejected over the rim or into the void comes back in the other room; at 5 a bridge fills the void. Eject 6 to win; lose 6 or draw to lose.",
        def: dual_boss,
        start: dual_fight,
        reply: dual_move,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "stalker",
        goal: "The stalker sees your whole army. You see its marbles only near your own, and a move may be stopped by one you cannot see. Eject 6 to win; lose 6 or draw to lose.",
        def: stalker_boss,
        start: stalker_fight,
        reply: search_reply,
        announce: no_announce,
        flips: no_flips,
    },
    BossEntry {
        id: "swarm",
        goal: "No swarm marble at the start: a wave lands on its marks on the far rim every turn, and the swarm moves. Survive 30 turns to win; the swarm wins once it ejects 2 of your marbles.",
        def: swarm_boss,
        start: swarm_fight,
        reply: search_reply,
        announce: no_announce,
        flips: no_flips,
    },
];

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

/// The announced martyr of `board` as `[q, r]`, empty when none waits.
fn martyr_cell(board: &Board) -> Vec<i32> {
    match board.martyr() {
        Some(Some((q, r))) => vec![q, r],
        _ => Vec::new(),
    }
}

fn cell_list(cells: &[(i32, i32)]) -> Vec<i32> {
    cells.iter().flat_map(|&(q, r)| [q, r]).collect()
}

/// The code of a borrowed effect in the bridge, see `Encounter::ballast_next`.
fn effect_code(effect: Borrowed) -> i32 {
    match effect {
        Borrowed::HullCrack => 0,
        Borrowed::PulsarPulse(_) => 1,
        Borrowed::MagnetizerPolarity => 2,
        Borrowed::ChaplainConversion => 3,
    }
}

fn boss_entry(id: &str) -> Option<&'static BossEntry> {
    BOSSES.iter().find(|b| b.id == id)
}

/// The engine version a peer carries in its `Hello` (docs/specs/tech.md section 9): peers on different
/// versions refuse to play, they would compute different games. Bump it with any change that makes the same
/// moves give another game: a rule, a boss reply, a layout.
#[wasm_bindgen]
pub fn engine_version() -> u32 {
    18 // 18: The Ballast Mind borrows an effect every 2 turns, win at 8 ejections, lose at 12 (#1209); 17: The Swarm is the 15th boss, 30 turns of waves (#1008); 16: The Stalker is the 14th boss, a fog the engine knows (#1118); 15: The Dual Room's boss search drops the pull to the centre, the void's middle (#982); 14: The Echo offers the player's bonus, taken by playing it, declined by any other move (#958); 13: The Dual Room's side-4 rooms, a void that ejects and a bridge at 5 (#955); 12: The Echo searches 100 nodes, a win a bonus gives is seen at once, a replaced board checks repetition (#951); 11: The Echo's mirrors are free bonus moves both ways, two phases (#859); 10: The Ballast Mind's player starts with 16 marbles, as many as the boss (#838); 9: The Chaplain's conversions move its health, +1 credit per boss marble won, -1 per player marble lost (#810); 8: The Ballast Mind borrows a boss effect every 3 turns (#749); 7: The Chaplain converts both sides at 4 and sends a martyr at 4 ejections (#748); 6: The Hull cracks one announced cell by turns, the Echo keeps one effect (#745); 5: The Choir's rework (#747); 4: Magnetizer signs alternate, Rail Yard train on turn 2, Alien 7 marbles and near eggs (#740)
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
    /// The bonus plies the last `play` added after its move (The Echo).
    bonuses: Vec<Move>,
}

#[wasm_bindgen]
impl Encounter {
    /// A new encounter against boss `boss_id`. The same id and seed always give the same fight.
    #[wasm_bindgen(constructor)]
    pub fn new(boss_id: &str, seed: u32) -> Result<Encounter, String> {
        let entry = boss_entry(boss_id).ok_or_else(|| format!("unknown boss {boss_id}"))?;
        let fight = (entry.start)((entry.def)(), u64::from(seed));
        Ok(Encounter {
            fight,
            entry,
            bonuses: Vec::new(),
        })
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
            Fight::Swarm(s) => s.phase() as u8,
        }
    }

    /// Number of phases, for the HUD notches.
    pub fn phases(&self) -> u8 {
        let steps = match &self.fight {
            Fight::Plain(_) => {
                let def = (self.entry.def)();
                def.phase_marbles.len() + def.phase_ejections.len()
            }
            Fight::Choir(_) => PHASE_EJECTIONS.len(),
            Fight::Swarm(_) => SWARM_PHASE_TURNS.len(),
        };
        steps as u8 + 1
    }

    /// The phase notches on the arena frame (#356, docs/specs/world.md section 6 rule 4):
    /// `[lit, dark]`, one lit notch per ejection credited to the player left until the next phase,
    /// one dark notch per ejection since this phase began. Empty in the last phase. Every boss
    /// has its phases by the ejections (#749 was the last by boss marbles).
    pub fn phase_notches(&self) -> Vec<u8> {
        let phase = self.phase() as usize;
        match &self.fight {
            Fight::Plain(e) => {
                ejection_notches(e.game(), &(self.entry.def)().phase_ejections, phase)
            }
            Fight::Choir(c) => ejection_notches(c.game(), &PHASE_EJECTIONS, phase),
            Fight::Swarm(_) => Vec::new(),
        }
    }

    /// The ejections that begin each phase after the first, in order (the boss health bar of the
    /// HUD marks them, #788). The Swarm's phases go by turns: the boss replies done when each begins.
    pub fn phase_ejections(&self) -> Vec<u8> {
        match &self.fight {
            Fight::Plain(_) => (self.entry.def)().phase_ejections,
            Fight::Choir(_) => PHASE_EJECTIONS.to_vec(),
            Fight::Swarm(_) => SWARM_PHASE_TURNS.iter().map(|&t| t as u8 - 1).collect(),
        }
    }

    /// Id of the board special that fires after the next ply, `-1` when none.
    pub fn tell(&self) -> i32 {
        match &self.fight {
            Fight::Plain(e) => e.tell().map_or(-1, i32::from),
            _ => -1,
        }
    }

    /// The reply the boss announces for the player move `mv`, one move record, empty when the
    /// record is malformed or the boss announces nothing.
    pub fn tell_move(&self, mv: &[i32]) -> Vec<i32> {
        let enc = match &self.fight {
            Fight::Plain(e) => Some(e),
            _ => None,
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
        let game = self.fight.game();
        let moves = match &self.fight {
            Fight::Choir(c) => c.legal_moves(),
            _ if game.outcome().is_none() => legal_moves(game.board(), game.to_move()),
            _ => Vec::new(),
        };
        moves.iter().flat_map(encode).collect()
    }

    /// Plays one move record for the side to move. `Err` carries the reason.
    pub fn play(&mut self, mv: &[i32]) -> Result<(), String> {
        let mv = decode(mv)?;
        let before = self.fight.game().history().len();
        match &mut self.fight {
            Fight::Plain(e) => e.play(&mv).map_err(|e| format!("{e:?}")),
            Fight::Choir(c) => c.play(&mv).map_err(|e| match e {
                ChoirError::Game(e) => format!("{e:?}"),
                other => format!("{other:?}"),
            }),
            Fight::Swarm(s) => s.play(&mv).map_err(|e| format!("{e:?}")),
        }?;
        self.bonuses = self.fight.game().history()[before + 1..]
            .iter()
            .map(|p| p.mv.clone())
            .collect();
        Ok(())
    }

    /// The Stalker's core fight, `None` for the other bosses.
    fn stalking(&self) -> Option<&CoreEncounter> {
        match &self.fight {
            Fight::Plain(e) if self.entry.id == "stalker" => Some(e),
            _ => None,
        }
    }

    /// The player's sight in cells (The Stalker), `0` for the other bosses.
    pub fn sight(&self) -> u8 {
        self.stalking().map_or(0, CoreEncounter::sight)
    }

    /// `[sight, ejections before it narrows]`, the second `-1` in the last phase; empty for the other bosses.
    pub fn stalker(&self) -> Vec<i32> {
        self.stalking().map_or_else(Vec::new, |e| {
            let left = self.phase_notches().first().map_or(-1, |&n| i32::from(n));
            vec![i32::from(e.sight()), left]
        })
    }

    /// The board as the player sees it: the 61 cells, the boss marbles out of sight empty (The Stalker). The full board
    /// for the other bosses.
    pub fn seen_board(&self) -> Vec<u8> {
        self.stalking()
            .map_or_else(|| self.board(), |e| board_bytes(&e.seen_board()))
    }

    /// The moves the player is offered, flat records: those of the seen board (The Stalker). `legal_moves` for the others.
    pub fn seen_moves(&self) -> Vec<i32> {
        self.stalking().map_or_else(
            || self.legal_moves(),
            |e| e.seen_moves().iter().flat_map(encode).collect(),
        )
    }

    /// The cells the player sees, `[q, r]` pairs (The Stalker); empty for the other bosses.
    pub fn visible(&self) -> Vec<i32> {
        self.stalking()
            .map_or_else(Vec::new, |e| cell_list(&e.visible()))
    }

    /// The boss marbles a refused move revealed until the next played move, `[q, r]` pairs (The Stalker).
    pub fn revealed(&self) -> Vec<i32> {
        self.stalking()
            .map_or_else(Vec::new, |e| cell_list(e.revealed()))
    }

    /// The bonus plies the last move played added after it (The Echo: the mirror moves of the
    /// other side), flat move records in order. Empty for the other bosses.
    pub fn last_bonuses(&self) -> Vec<i32> {
        self.bonuses.iter().flat_map(encode).collect()
    }

    /// The free moves The Echo offers the player now, flat move records: playing one keeps the
    /// player to move, any other move declines them all (#958). Empty for the other bosses.
    pub fn free_moves(&self) -> Vec<i32> {
        match &self.fight {
            Fight::Plain(e) => echo_free_moves(e).iter().flat_map(encode).collect(),
            _ => Vec::new(),
        }
    }

    /// The plies that were the Echo's free moves the player took (#958): a co-op seat's turn is its
    /// main move and the free moves before it. `0` for the other bosses.
    pub fn free_taken(&self) -> u32 {
        match &self.fight {
            Fight::Plain(e) => echo_free_taken(e) as u32,
            _ => 0,
        }
    }

    /// The bonus moves the other side would get if the side to move played `mv` (The Echo), records
    /// of 9: `1` when that bonus would not be offered (a free move that would lose the player the
    /// game), `0` else, then the move record. Empty for the other bosses and a malformed record.
    pub fn echo_tell(&self, mv: &[i32]) -> Vec<i32> {
        let (Fight::Plain(e), Ok(mv)) = (&self.fight, decode(mv)) else {
            return Vec::new();
        };
        if self.entry.id != "echo" {
            return Vec::new();
        }
        echo_tell(e, &mv)
            .iter()
            .flat_map(|(m, skipped)| std::iter::once(i32::from(*skipped)).chain(encode(m)))
            .collect()
    }

    /// The boss move, one record, using the boss node budget. Empty on the player's turn or when
    /// the fight is over. It is not played.
    pub fn boss_move(&self) -> Vec<i32> {
        let mv = match &self.fight {
            Fight::Plain(e) => (self.entry.reply)(e),
            Fight::Choir(c) => c.boss_move(),
            Fight::Swarm(s) => s.boss_move(),
        };
        mv.map(|m| encode(&m).to_vec()).unwrap_or_default()
    }

    /// The player's move for auto-play (#792), one record, searched with the boss node budget (so the
    /// difficulty scales it too). Empty on the boss's turn or when the fight is over. It is not played.
    pub fn player_move(&self) -> Vec<i32> {
        let mv = match &self.fight {
            Fight::Plain(e) => e.player_search().map(|r| r.mv),
            Fight::Choir(c) => c.player_move(),
            Fight::Swarm(s) => s.player_search(s.budget(), &|_| true).map(|r| r.mv),
        };
        mv.map(|m| encode(&m).to_vec()).unwrap_or_default()
    }

    /// Scales the boss search node budget by a percentage relative to baseline (e.g. 50, 100, 200).
    pub fn scale_node_budget(&mut self, percent: u32) {
        match &mut self.fight {
            Fight::Plain(e) => e.scale_node_budget(percent),
            Fight::Choir(c) => c.scale_node_budget(percent),
            Fight::Swarm(s) => s.scale_node_budget(percent),
        }
    }

    /// The 61 cells, board specials included.
    pub fn board(&self) -> Vec<u8> {
        board_bytes(self.fight.game().board())
    }

    /// Cracked cells (The Hull) as `[q, r, player_turns_left]` records, empty for the other bosses.
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
    /// empty for the other bosses. The Ballast Mind gives the pulse it announces for its next turn
    /// (`player_turns_left` 1), empty otherwise.
    pub fn pulsar(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        pulsar_tell(e)
            .or_else(|| {
                (self.entry.id == "ballast")
                    .then(|| ballast_pulse_tell(e))
                    .flatten()
                    .map(|(pulsar, force)| (pulsar, 1, force))
            })
            .map_or_else(Vec::new, |(pulsar, left, force)| {
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
        last_pulse(e)
            .or_else(|| {
                (self.entry.id == "ballast")
                    .then(|| ballast_last_pulse(e))
                    .flatten()
            })
            .map_or_else(Vec::new, |(pulsar, before, moved)| {
                std::iter::once(i32::from(pulsar))
                    .chain(board_bytes(&before).into_iter().map(i32::from))
                    .chain(cell_list(&moved))
                    .collect()
            })
    }

    /// The effect The Ballast Mind announces for its next borrowing turn: `0` the Hull's crack, `1`
    /// the Pulsar's pulse, `2` the Magnetizer's polarity, `3` the Chaplain's conversion; `-1`
    /// when none is due next turn, for the other bosses too.
    pub fn ballast_next(&self) -> i32 {
        let Fight::Plain(e) = &self.fight else {
            return -1;
        };
        if self.entry.id != "ballast" {
            return -1;
        }
        ballast_next(e).map_or(-1, effect_code)
    }

    /// The effect The Ballast Mind borrowed on the last ply, as `[code, q, r, q, r...]`: the code of
    /// `ballast_next`, then the cells it touched (the marks it left and the cells that changed).
    /// Empty when the last ply borrowed nothing, for the other bosses too.
    pub fn ballast_fired(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        (self.entry.id == "ballast")
            .then(|| ballast_fired(e))
            .flatten()
            .map_or_else(Vec::new, |(effect, cells)| {
                std::iter::once(effect_code(effect))
                    .chain(cell_list(&cells))
                    .collect()
            })
    }

    /// The Assembly Line's belts as `[turns_left, then one record of 6 per belt]`, the centre belt
    /// first: `[row, q0, len, dir, shift, strike]`, see the module docs. Empty for the other bosses.
    pub fn belts(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        assembly_tell(e).map_or_else(Vec::new, |(left, tell)| {
            std::iter::once(i32::from(left))
                .chain(tell.iter().enumerate().flat_map(|(belt, t)| {
                    let cells = belt_cells(belt);
                    let dir = match (t.running, t.forward) {
                        (false, _) => 0,
                        (true, true) => 1,
                        (true, false) => -1,
                    };
                    let strike = t.strike.map_or(-1, |s| {
                        (usize::from(s) + usize::from(t.shift)) as i32 % cells.len() as i32
                    });
                    [
                        cells[0].1,
                        cells[0].0,
                        cells.len() as i32,
                        dir,
                        i32::from(t.shift),
                        strike,
                    ]
                }))
                .collect()
        })
    }

    /// What the belts and presses did to the marbles on the last ply, records of 6 integers
    /// `[q, r, to_q, to_r, fate, board_code]`: fate `0` carried, `1` fell off the end (the target
    /// is the cell past it), `2` struck. Empty when the last ply fired no belt.
    pub fn last_belts(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        last_belts(e)
            .iter()
            .flat_map(|c| {
                let fate = match c.fate {
                    Fate::Moved => 0,
                    Fate::Fell => 1,
                    Fate::Struck => 2,
                };
                [
                    c.from.0,
                    c.from.1,
                    c.to.0,
                    c.to.1,
                    fate,
                    i32::from(code(Some(c.cell))),
                ]
            })
            .collect()
    }

    /// The Dual Room's bridge and announced return as `[bridged, side, q, r]`, side `0` when no
    /// marble is coming. Empty for the other bosses.
    pub fn dual(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        e.game().board().dual().map_or_else(Vec::new, |d| {
            let (side, (q, r)) = d
                .coming
                .map_or((0, (0, 0)), |(cell, at)| (i32::from(code(Some(cell))), at));
            vec![i32::from(d.bridged), side, q, r]
        })
    }

    /// The marble that landed at the end of the last ply (The Dual Room) as `[side, q, r]`, empty
    /// when none did.
    pub fn last_return(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        dual_landed(e).map_or_else(Vec::new, |(cell, (q, r))| {
            vec![i32::from(code(Some(cell))), q, r]
        })
    }

    /// The charged marbles (The Unstable Core) as `[q, r, charges]` records, empty for the other
    /// bosses.
    pub fn charges(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        e.game().board().unstable().map_or_else(Vec::new, |u| {
            u.charges
                .iter()
                .flat_map(|&((q, r), n)| [q, r, i32::from(n)])
                .collect()
        })
    }

    /// The Unstable Core's next events as `[core, collapsing, wedge, shock_in]`: the core stands (`1`
    /// or `0`), it collapses at the end of your next turn, the wedge the next shockwave hits (`-1`
    /// until announced), and the turns before it (`-1` before P3). Empty for the other bosses.
    pub fn unstable(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        unstable_tell(e).map_or_else(Vec::new, |t| {
            vec![
                i32::from(t.core),
                i32::from(t.collapsing),
                t.wedge.map_or(-1, i32::from),
                t.shock_in.map_or(-1, i32::from),
            ]
        })
    }

    /// What the last ply's hook did to the board (The Unstable Core): the
    /// overload count, `1` when the core collapsed, the shockwave's wedge (`-1` none), the shove
    /// count, the 61 board codes just before the hook, the overloaded cells, then the shoved
    /// marbles as `[from_q, from_r, to_q, to_r]`. Empty when nothing happened.
    pub fn last_unstable(&self) -> Vec<i32> {
        let Fight::Plain(e) = &self.fight else {
            return Vec::new();
        };
        last_events(e).map_or_else(Vec::new, |(before, events)| {
            let (wedge, moves) = events
                .shock
                .map_or((-1, Vec::new()), |(w, m)| (i32::from(w), m));
            [
                events.overloaded.len() as i32,
                i32::from(events.collapsed),
                wedge,
                moves.len() as i32,
            ]
            .into_iter()
            .chain(board_bytes(&before).into_iter().map(i32::from))
            .chain(cell_list(&events.overloaded))
            .chain(
                moves
                    .iter()
                    .flat_map(|&((fq, fr), (tq, tr))| [fq, fr, tq, tr]),
            )
            .collect()
        })
    }

    /// Player marbles the last ply flipped to the boss (The Chaplain), a cell list: the preview of
    /// a hovered move. Empty for the other bosses.
    pub fn flips(&self) -> Vec<i32> {
        match &self.fight {
            Fight::Plain(e) => cell_list(&(self.entry.flips)(e)),
            _ => Vec::new(),
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

    /// The Chaplain's announced martyr as `[q, r]`, empty when none waits to explode.
    pub fn martyr(&self) -> Vec<i32> {
        martyr_cell(self.fight.game().board())
    }

    /// The marbles of either side whose polarity the last ply set (The Magnetizer), a cell list.
    pub fn assigned(&self) -> Vec<i32> {
        match &self.fight {
            Fight::Plain(e) => cell_list(e.assigned()),
            _ => Vec::new(),
        }
    }

    /// The incinerator cells (The Overseer), a cell list. Empty for the other bosses.
    pub fn incinerators(&self) -> Vec<i32> {
        cell_list(self.fight.game().board().incinerators())
    }

    /// The marbles the last ply removed as `[q, r, code]` records, the board code of what was
    /// removed: The Overseer's burns, or the army The Choir removed (White marbles).
    pub fn removed(&self) -> Vec<i32> {
        let removed: Vec<_> = match &self.fight {
            Fight::Plain(e) => e.removed().to_vec(),
            Fight::Choir(c) => c.last_removal().map_or_else(Vec::new, |(_, cells)| {
                cells.iter().map(|&cell| (cell, Cell::White)).collect()
            }),
            Fight::Swarm(_) => Vec::new(),
        };
        removed
            .iter()
            .flat_map(|&((q, r), cell)| [q, r, i32::from(code(Some(cell)))])
            .collect()
    }

    /// Player turns left before the boss wins on the clock (The Overseer's neurotoxin), `-1` for
    /// a fight with no clock.
    pub fn turns_left(&self) -> i32 {
        match &self.fight {
            Fight::Plain(e) => e.turns_left().map_or(-1, |n| n as i32),
            _ => -1,
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
            _ => -1,
        }
    }

    /// Marbles ejected by a side: `1` Black, `2` White.
    pub fn ejected(&self, side: u8) -> u8 {
        self.fight.game().ejected(player(side))
    }

    /// Ejections a side needs to win: `1` Black, `2` White. `0` when that side does not win by
    /// ejections (the player against The Swarm).
    pub fn win_ejections(&self, side: u8) -> u8 {
        match self.fight.game().win_ejections(player(side)) {
            u8::MAX => 0,
            n => n,
        }
    }

    /// The Swarm's tell as `[turns_left, passed, q, r, ...]`: the boss replies left before the
    /// evac, `1` when its last reply was a pass, then the cells where the next wave lands. Empty for
    /// the other bosses.
    pub fn swarm(&self) -> Vec<i32> {
        let Fight::Swarm(s) = &self.fight else {
            return Vec::new();
        };
        [s.turns_left() as i32, i32::from(s.passed())]
            .into_iter()
            .chain(cell_list(s.announced()))
            .collect()
    }

    /// The cells where the Swarm's last wave landed, `[q, r]` pairs. Empty for the other bosses.
    pub fn swarm_landed(&self) -> Vec<i32> {
        let Fight::Swarm(s) = &self.fight else {
            return Vec::new();
        };
        cell_list(s.landed())
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
            Fight::Swarm(s) => s.result(),
        };
        result_code(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::convert::{cells_of, encode, DIRECTIONS, MOVE_STRIDE};
    use abalone_core::encounter::ballast::{
        BALLAST_BOSS_START, BALLAST_PILLARS, BALLAST_PLAYER_START,
    };
    use abalone_core::encounter::choir::{ALTO_START, BASS_START, TENOR_START};
    use abalone_core::encounter::fixture::Fixture;

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
    fn the_engine_version_is_18_since_the_ballast_mind_tuning_1209() {
        assert_eq!(engine_version(), 18);
    }

    #[test]
    fn the_echo_offers_the_player_a_free_move_that_keeps_the_turn() {
        let mut f = fight();
        assert!(f.free_moves().is_empty(), "no offer at the start");
        let mv = first_move(&f);
        f.play(&mv).unwrap();
        let reply = f.boss_move();
        f.play(&reply).unwrap();
        let free = f.free_moves();
        assert_eq!(free.len(), MOVE_STRIDE, "the mirror of the Echo's move");
        assert!(f.last_bonuses().is_empty(), "offered, not played");
        assert_eq!(f.free_taken(), 0);
        f.play(&free).unwrap();
        assert_eq!(f.free_taken(), 1, "co-op counts the turns without them");
        assert_eq!(f.to_move(), 1, "the player moves again");
        assert!(f.free_moves().is_empty());
        for id in ["hull", "choir"] {
            let mut other = Encounter::new(id, 1).unwrap();
            let mv = first_move(&other);
            other.play(&mv).unwrap();
            let reply = other.boss_move();
            other.play(&reply).unwrap();
            assert!(other.free_moves().is_empty(), "{id}");
            assert_eq!(other.free_taken(), 0, "{id}");
        }
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
                "overseer".to_string(),
                "assembly".to_string(),
                "core".to_string(),
                "dual".to_string(),
                "stalker".to_string(),
                "swarm".to_string()
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
        assert_eq!(boss_name("assembly"), Some("The Assembly Line".to_string()));
        assert_eq!(boss_name("core"), Some("The Unstable Core".to_string()));
        assert_eq!(boss_name("dual"), Some("The Dual Room".to_string()));
        assert_eq!(boss_name("stalker"), Some("The Stalker".to_string()));
        assert_eq!(boss_name("swarm"), Some("The Swarm".to_string()));
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
        assert_eq!(f.phases(), 2, "the Echo has two phases");
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
    fn player_move_is_a_legal_move_on_the_players_turn_only() {
        for id in ["echo", "choir"] {
            let mut f = Encounter::new(id, 7).unwrap();
            let mv = f.player_move();
            assert_eq!(mv.len(), MOVE_STRIDE);
            assert!(f
                .legal_moves()
                .chunks(MOVE_STRIDE)
                .any(|m| m == mv.as_slice()));
            f.play(&mv).unwrap();
            assert!(f.player_move().is_empty(), "the boss's turn");
        }
    }

    #[test]
    fn the_plain_reply_is_the_boss_search() {
        let mut enc = CoreEncounter::new(Game::new(), hull_boss(), 0);
        let first = legal_moves(enc.game().board(), Player::Black)[0].clone();
        enc.play(&first).unwrap();
        assert_eq!(search_reply(&enc), enc.boss_search().map(|r| r.mv));
        assert!(search_reply(&enc).is_some());
    }

    #[test]
    fn boss_move_is_empty_on_the_players_turn() {
        assert!(fight().boss_move().is_empty());
    }

    #[test]
    fn the_echo_plays_the_mirror_as_a_bonus_and_the_tell_announces_it() {
        let mut f = fight();
        let mv = first_move(&f);
        let announced = f.tell_move(&mv);
        assert_eq!(announced.len(), MOVE_STRIDE);
        let before = f.board();
        f.play(&mv).unwrap();
        assert_eq!(
            f.to_move(),
            2,
            "the Echo plays its own move after the bonus"
        );
        let mirrored = decode(&announced).unwrap();
        let (q, r) = mirrored.cells[0];
        let i = board_cells(4).position(|c| c == (q, r)).unwrap();
        assert_eq!(
            (before[i], f.board()[i]),
            (2, 0),
            "the bonus moved its marble"
        );
        let reply = f.boss_move();
        assert_eq!(f.play(&reply), Ok(()));
        assert_eq!(f.to_move(), 1);
        assert!(
            f.tell_move(&reply).is_empty(),
            "no bonus for the side not to move"
        );
    }

    #[test]
    fn the_echo_tells_its_bonus_and_lists_the_bonus_plies_played() {
        let mut f = fight();
        let mv = first_move(&f);
        let mirror = f.tell_move(&mv);
        let tell: Vec<i32> = std::iter::once(0).chain(mirror.iter().copied()).collect();
        assert_eq!(f.echo_tell(&mv), tell, "not skipped, then the record");
        assert!(f.echo_tell(&[1, 2]).is_empty(), "malformed record");
        assert!(f.last_bonuses().is_empty());
        f.play(&mv).unwrap();
        assert_eq!(f.last_bonuses(), mirror, "the Echo's bonus ply");
        assert!(f.play(&[1, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert_eq!(f.last_bonuses(), mirror, "a refused move keeps them");
        for id in ["hull", "choir"] {
            let mut other = Encounter::new(id, 1).unwrap();
            let mv = first_move(&other);
            assert!(other.echo_tell(&mv).is_empty(), "{id}");
            other.play(&mv).unwrap();
            assert!(other.last_bonuses().is_empty(), "{id}");
        }
    }

    #[test]
    fn the_hull_and_the_ballast_mind_reply_with_a_legal_move() {
        for id in ["hull", "ballast"] {
            let mut f = Encounter::new(id, 1).unwrap();
            let mv = first_move(&f);
            f.play(&mv).unwrap();
            let reply = f.boss_move();
            assert!(!reply.is_empty(), "{id}");
            assert_eq!(f.play(&reply), Ok(()), "{id}");
        }
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
    fn the_hull_cracks_a_rim_cell_at_ply_8_and_it_vanishes_after_two_more_player_turns() {
        let mut f = Encounter::new("hull", 7).unwrap();
        assert_eq!(f.name(), "The Hull");
        for _ in 0..7 {
            ply(&mut f);
        }
        assert!(f.cracks().is_empty(), "no wave before ply 8");
        ply(&mut f);
        let cracks = f.cracks();
        assert_eq!(cracks.len(), 3, "one cell in P1, as [q, r, turns left]");
        let (q, r) = (cracks[0], cracks[1]);
        assert_eq!(cracks[2], 2);
        assert_ne!(f.board()[index(q, r)], 3, "cracked, not gone yet");
        ply(&mut f);
        assert_eq!(f.cracks(), vec![q, r, 1], "ticks at the player's move");
        ply(&mut f);
        assert_eq!(f.cracks(), vec![q, r, 1], "not at the boss reply");
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

    /// The plies of the recorded Chaplain win (the core fixture), the way the client replays a game.
    fn recorded() -> Vec<Vec<i32>> {
        let text = include_str!("../../abalone-core/tests/fixtures/chaplain.txt");
        let fixture = Fixture::parse(text).unwrap();
        assert_eq!(fixture.seed, RECORDED_SEED);
        fixture.moves.iter().map(|m| encode(m).to_vec()).collect()
    }

    /// The seed of the recorded game.
    const RECORDED_SEED: u64 = 10040;
    /// The plies after which the martyr is announced, and after which it exploded.
    const ANNOUNCED_AT: usize = 52;
    const EXPLODED_AT: usize = 54;

    /// The Chaplain after the first `plies` plies of the recorded game.
    fn chaplain(plies: usize) -> Encounter {
        let mut f = Encounter::new("chaplain", RECORDED_SEED as u32).unwrap();
        for mv in &recorded()[..plies] {
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
    fn the_chaplain_flips_lists_the_player_marbles_a_move_flips() {
        assert!(
            chaplain(0).flips().is_empty(),
            "nothing to flip at the start"
        );
        let flipped = (1..=EXPLODED_AT).find(|&k| !chaplain(k).flips().is_empty());
        let k = flipped.expect("a recorded ply flips a player marble");
        let (before, after) = (chaplain(k - 1), chaplain(k));
        for (q, r) in pairs(&after.flips()) {
            assert_eq!(at(&after.board(), q, r), 2, "now a boss marble");
            assert_eq!(at(&before.board(), q, r), 1, "it was a player marble");
        }
    }

    #[test]
    fn the_martyr_is_listed_while_it_waits_then_explodes_and_counts_for_the_player() {
        assert!(chaplain(ANNOUNCED_AT - 1).martyr().is_empty());
        let waiting = chaplain(ANNOUNCED_AT);
        let cell = pairs(&waiting.martyr())[0];
        assert_eq!(at(&waiting.board(), cell.0, cell.1), 2, "a boss marble");
        assert_eq!((waiting.phase(), waiting.phases()), (1, 2), "P2 of two");
        assert_eq!(waiting.ejected(1), 4);
        let boom = chaplain(EXPLODED_AT);
        assert!(boom.martyr().is_empty());
        assert_eq!(
            boom.removed(),
            vec![cell.0, cell.1, 2],
            "the martyr is the boss marble removed"
        );
        assert_eq!(boom.ejected(1), 5, "the 5th ejection");
        assert_eq!(boom.phase_notches(), Vec::<u8>::new(), "no P3");
    }

    /// The credit and the phase after each ply of the recorded game, played once.
    fn credit_track() -> Vec<(u8, u8)> {
        let mut f = Encounter::new("chaplain", RECORDED_SEED as u32).unwrap();
        recorded()
            .iter()
            .map(|mv| {
                f.play(mv).unwrap();
                (f.ejected(1), f.phase())
            })
            .collect()
    }

    #[test]
    fn a_conversion_to_the_boss_heals_it_and_the_phase_never_goes_back() {
        let track = credit_track();
        assert_eq!(track, credit_track(), "deterministic");
        assert!(
            track.windows(2).any(|w| w[1].0 < w[0].0),
            "the recorded game heals the boss"
        );
        assert!(track.windows(2).all(|w| w[1].1 >= w[0].1));
    }

    #[test]
    fn the_chaplain_lists_its_converted_marbles() {
        let k = (1..EXPLODED_AT)
            .find(|&k| !chaplain(k).converted().is_empty())
            .expect("a marble is converted in the recorded game");
        let f = chaplain(k);
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
        for id in boss_ids() {
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
    fn the_alien_starts_with_7_marbles_and_lays_an_egg_at_ply_4_that_counts_down() {
        let f = Encounter::new("alien", 7).unwrap();
        assert_eq!(f.name(), "The Alien");
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!((count(&f.board(), 1), count(&f.board(), 2)), (14, 7));
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
        assert_eq!((alien(&first[9].1), alien(&first[10].1)), (7, 8), "hatched");
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
    fn the_rail_yard_announces_its_first_train_on_turn_2_that_passes_after_5_player_turns() {
        // Seed 77: the first train runs the diagonal q + r = 0 from (4, -4), 3 marbles a side on it.
        let f = Encounter::new("railyard", 77).unwrap();
        assert_eq!(f.name(), "The Rail Yard");
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!((count(&f.board(), 1), count(&f.board(), 2)), (14, 14));
        assert!(f.trains().is_empty(), "no train at the start");
        let run = yard(77, 11);
        assert_eq!(run[0].0, vec![22, 5, 4, -4, -4, 4], "the end of turn 1");
        assert_eq!(run[1].0[1], 5, "not after the boss move");
        assert_eq!(run[2].0[1], 4, "down after the player move");
        assert_eq!(run[8].0, vec![22, 1, 4, -4, -4, 4]);
        assert!(run[10].0.is_empty(), "passed after the player's 6th move");
        let on_line = |board: &[u8]| (-4..=4).filter(|&q| board[index(q, -q)] != 0).count();
        assert_eq!(on_line(&run[10].1), 0, "the diagonal is swept");
    }

    #[test]
    fn two_rail_yard_encounters_with_the_same_seed_and_moves_run_the_same_trains() {
        // Every peer of a co-op fight, the daily and a Retry replay the same trains (#626).
        let first = yard(2_374_354_862, 24);
        assert_eq!(yard(2_374_354_862, 24), first);
        let runs: Vec<_> = (0..4).map(|seed| yard(seed, 3)).collect();
        assert!(
            runs.iter().any(|r| *r != runs[0]),
            "the seed picks the tracks"
        );
    }

    /// The e2e fixture of client/e2e/magnetizer.spec.ts (seed 120, core magnetizer tests): move
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
        let f = Encounter::new("magnetizer", 120).unwrap();
        assert_eq!(f.name(), "The Magnetizer");
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!(f.polarities(), vec![0; 61]);
        assert!(f.repulsions().is_empty() && f.assigned().is_empty() && f.announce().is_empty());
        let run = magnet_run(120, 11);
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
        let mut f = Encounter::new("magnetizer", 120).unwrap();
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
        assert_eq!(magnet_run(120, 23), magnet_run(120, 23));
        assert!((0..4).any(|seed| magnet_run(seed, 4) != magnet_run(120, 4)));
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
    fn the_stalker_shows_the_player_a_fogged_board_and_its_sight() {
        let f = Encounter::new("stalker", 3).unwrap();
        assert_eq!(f.name(), "The Stalker");
        assert!(f.goal().starts_with("The stalker sees your whole army."));
        assert_eq!((f.phase(), f.phases(), f.sight()), (0, 3, 3));
        assert_eq!(f.stalker(), vec![3, 3], "sight 3, 3 ejections to go");
        assert!(f.board().contains(&2) && !f.seen_board().contains(&2));
        assert_eq!(f.seen_moves(), f.legal_moves(), "nothing blocks the start");
        assert!(f.revealed().is_empty() && !f.visible().is_empty());
        let other = Encounter::new("hull", 3).unwrap();
        assert_eq!(other.seen_board(), other.board());
        assert_eq!(other.seen_moves(), other.legal_moves());
        assert!(other.stalker().is_empty() && other.visible().is_empty());
        assert_eq!(other.sight(), 0);
    }

    #[test]
    fn the_stalker_in_its_last_phase_sees_1_and_narrows_no_more() {
        let fight = Fight::Plain(
            CoreEncounter::new(
                Game::from_position(Board::standard(), Player::Black, [5, 0]),
                stalker_boss(),
                0,
            )
            .stalking(),
        );
        let f = Encounter {
            fight,
            entry: boss_entry("stalker").unwrap(),
            bonuses: Vec::new(),
        };
        assert_eq!(f.stalker(), vec![1, -1]);
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
        assert_eq!(
            Encounter {
                fight,
                entry,
                bonuses: Vec::new(),
            }
            .pulsar(),
            vec![0, 3, 0]
        );
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

    // The Unstable Core (#751): charged marbles weigh more in a push.

    /// The fixtures of the core tests and client/e2e/unstable.spec.ts: one marble per ply
    /// `[q, r, dir]`, the pair pushing three (7 plies) and the 25-ply fight to the shockwave.
    const CORE_PUSH: [&[[i32; 2]]; 7] = [
        &[[0, 2], [0, 3]],
        &[[-1, -3]],
        &[[0, 1], [0, 2]],
        &[[-2, -2]],
        &[[0, 0], [0, 1]],
        &[[-1, -3]],
        &[[0, -1], [0, 0]],
    ];
    const CORE_PUSH_DIRS: [i32; 7] = [4, 3, 4, 2, 4, 3, 4];

    fn record(cells: &[[i32; 2]], dir: i32) -> Vec<i32> {
        let mut rec = vec![cells.len() as i32, dir];
        rec.extend(cells.iter().flatten());
        rec.resize(8, 0);
        rec
    }

    #[test]
    fn the_core_follows_the_weighted_rule_in_its_legal_moves() {
        let mut f = Encounter::new("core", 1).unwrap();
        assert_eq!(f.charges(), Vec::<i32>::new());
        assert_eq!(
            f.unstable(),
            vec![1, 0, -1, -1],
            "core up, nothing announced, before P3"
        );
        let push = record(CORE_PUSH[6], CORE_PUSH_DIRS[6]);
        for i in 0..6 {
            f.play(&record(CORE_PUSH[i], CORE_PUSH_DIRS[i])).unwrap();
        }
        assert_eq!(f.charges(), vec![0, -1, 3, 0, 0, 2]);
        assert!(f
            .legal_moves()
            .chunks(MOVE_STRIDE)
            .any(|m| m == push.as_slice()));
        f.play(&push).unwrap();
        assert_eq!(f.ejected(1), 1);
        assert_eq!(f.charges(), vec![0, -2, 2, 0, -1, 3]);
        assert!(f.last_unstable().is_empty(), "nothing to show");
        let plain = Encounter::new("echo", 1).unwrap();
        assert!(plain.charges().is_empty() && plain.unstable().is_empty());
        assert!(plain.last_unstable().is_empty() && choir().charges().is_empty());
        assert!(choir().unstable().is_empty() && choir().last_unstable().is_empty());
    }

    const CORE_FULL: [[i32; 3]; 25] = [
        [1, 3, 2],
        [0, -2, 5],
        [2, 2, 3],
        [2, -2, 3],
        [1, 3, 2],
        [0, -3, 5],
        [2, 2, 3],
        [3, -3, 3],
        [1, 3, 2],
        [1, -2, 3],
        [2, 2, 3],
        [2, -2, 3],
        [1, 3, 2],
        [1, -3, 5],
        [2, 2, 3],
        [4, -3, 3],
        [1, 3, 2],
        [0, -2, 5],
        [2, 2, 3],
        [3, -2, 2],
        [1, 3, 2],
        [4, -3, 3],
        [2, 2, 3],
        [3, -2, 2],
        [1, 3, 2],
    ];

    /// The board, the next events, the last ply's events and the charges after each ply.
    type CoreStep = (Vec<u8>, Vec<i32>, Vec<i32>, Vec<i32>);

    fn core_run(seed: u32) -> Vec<CoreStep> {
        let mut f = Encounter::new("core", seed).unwrap();
        CORE_FULL
            .iter()
            .map(|&[q, r, dir]| {
                f.play(&[1, dir, q, r, 0, 0, 0, 0]).unwrap();
                (f.board(), f.unstable(), f.last_unstable(), f.charges())
            })
            .collect()
    }

    #[test]
    fn the_core_exposes_overloads_the_collapse_and_the_shockwave() {
        let run = core_run(1);
        let over = &run[7].2; // ply 8: the boss marble on (0, -1) overloads
        assert_eq!(over[..4], [1, 0, -1, 0]);
        assert_eq!(over[4 + index(0, -1)], 2, "the board before the hook");
        assert_eq!(over[4 + 61..], [0, -1]);
        assert!(run[8].2.is_empty());
        assert_eq!(
            run[17].1[..2],
            [1, 1],
            "the boss ply of P2 announces the collapse"
        );
        let collapse = &run[18].2;
        assert_eq!(collapse[..4], [0, 1, -1, 0]);
        assert_eq!(run[18].1[..2], [0, 0], "the core is gone");
        assert_eq!(run[18].0[index(0, 0)], 3, "a vanished cell");
        assert_eq!(
            run[19].1,
            vec![0, 0, -1, 3],
            "P3: 3 turns to the first shockwave"
        );
        assert_eq!(run[20].1[3], 2);
        assert!(
            run[22].1[2] >= 0 && run[22].1[3] == 1,
            "the wedge is announced"
        );
        let shock = &run[24].2;
        assert_eq!(shock[0], 0);
        assert!(
            shock[2] >= 0 && shock[3] > 0,
            "a wedge and the marbles it shoved"
        );
        assert_eq!(shock.len(), 4 + 61 + 4 * shock[3] as usize);
        assert_eq!(run[24].1, vec![0, 0, -1, 3], "the clock restarts");
    }

    #[test]
    fn two_core_encounters_with_the_same_seed_and_moves_give_the_same_fight() {
        assert_eq!(core_run(1), core_run(1));
        assert!((0..8).any(|seed| core_run(seed)[24] != core_run(1)[24]));
    }

    #[test]
    fn the_core_replies_with_a_legal_move() {
        let mut f = Encounter::new("core", 3).unwrap();
        f.scale_node_budget(10);
        ply(&mut f);
        let mv = f.boss_move();
        assert_eq!(mv.len(), MOVE_STRIDE);
        f.play(&mv).unwrap();
        assert_eq!(f.to_move(), 1);
    }

    fn ring((q, r): (i32, i32)) -> i32 {
        q.abs().max(r.abs()).max((q + r).abs())
    }

    fn play_plies(f: &mut Encounter, plies: usize) {
        for _ in 0..plies {
            let mv = first_move(f);
            f.play(&mv).unwrap();
        }
    }

    #[test]
    fn the_ballast_mind_announces_its_borrowed_effect_a_turn_ahead_and_shows_its_pulse() {
        let mut codes = Vec::new();
        for seed in 0..400 {
            let mut f = Encounter::new("ballast", seed).unwrap();
            play_plies(&mut f, 1);
            assert_eq!(f.ballast_next(), -1, "seed {seed}");
            play_plies(&mut f, 1);
            let next = f.ballast_next();
            codes.push(next);
            let tell = f.pulsar();
            assert_eq!(tell.is_empty(), next != 1, "seed {seed}");
            if next == 1 {
                assert!(tell[0] < 6 && tell[1] == 1 && tell[2] >= 0, "seed {seed}");
            }
            assert!(
                f.ballast_fired().is_empty(),
                "seed {seed}: nothing fired yet"
            );
            play_plies(&mut f, 2);
            assert_eq!(f.last_pulse().is_empty(), next != 1, "seed {seed}");
            let fired = f.ballast_fired();
            assert_eq!(
                fired[0], next,
                "the code of the effect, then cells, seed {seed}"
            );
            assert_eq!(fired.len() % 2, 1, "seed {seed}");
            assert!(f.pulsar().is_empty(), "seed {seed}");
        }
        for code in 0..4 {
            assert!(codes.contains(&code), "code {code}");
        }
        for id in ["hull", "choir"] {
            let mut other = Encounter::new(id, 1).unwrap();
            play_plies(&mut other, 4);
            assert_eq!(other.ballast_next(), -1, "{id}");
            assert!(
                other.ballast_fired().is_empty() && other.pulsar().is_empty(),
                "{id}"
            );
        }
    }

    #[test]
    fn the_ballast_mind_plays_on_radius_5_with_its_pillars_the_61_cells_first() {
        let f = Encounter::new("ballast", 7).unwrap();
        assert_eq!(f.name(), "The Ballast Mind");
        assert_eq!(f.to_move(), 1);
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!((f.win_ejections(1), f.win_ejections(2)), (8, 12));
        assert_eq!(f.tell(), 0, "the Hull tick");
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
        assert_eq!((count(&board, 1), count(&board, 2)), (16, 16));
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
            "assembly",
            "core",
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
    fn the_choir_starts_on_the_standard_board_with_three_armies_of_six() {
        let f = choir();
        assert_eq!(f.name(), "The Choir");
        assert_eq!(
            (f.to_move(), f.phase(), f.phases(), f.result()),
            (1, 0, 3, 0)
        );
        let cells = f.board();
        assert_eq!(cells.len(), 61, "the board keeps its 61 slots");
        assert_eq!(count(&cells, 3), 0, "no hole: the standard board");
        assert_eq!((count(&cells, 1), count(&cells, 2)), (14, 18));
        assert_eq!(f.armies().len(), 18 * 3);
        assert_eq!(army_cells(&f, 0), ALTO_START.to_vec());
        assert_eq!(army_cells(&f, 1), TENOR_START.to_vec());
        assert_eq!(army_cells(&f, 2), BASS_START.to_vec());
        assert_eq!(f.next_army(), 0, "Alto moves first");
        assert_eq!((f.win_ejections(1), f.win_ejections(2)), (6, 6));
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
    fn the_choir_reports_the_army_it_removed_at_the_third_ejection() {
        let mut board = Board::empty();
        let mut members = Vec::new();
        for (cell, color, army) in [
            ((2, 0), Cell::Black, None),
            ((3, 0), Cell::Black, None),
            ((-4, 4), Cell::Black, None),
            ((4, 0), Cell::White, Some(Army::Alto)),
            ((0, -3), Cell::White, Some(Army::Alto)),
            ((1, -3), Cell::White, Some(Army::Alto)),
            ((-3, 0), Cell::White, Some(Army::Tenor)),
            ((-2, -2), Cell::White, Some(Army::Tenor)),
            ((-4, 1), Cell::White, Some(Army::Bass)),
        ] {
            board.set(cell.0, cell.1, color);
            members.extend(army.map(|a| (cell, a)));
        }
        let game = Game::from_position(board, Player::Black, [2, 0]);
        let mut f = Encounter {
            fight: Fight::Choir(Choir::from_position(game, members, 7)),
            entry: boss_entry("choir").unwrap(),
            bonuses: Vec::new(),
        };
        assert!(f.removed().is_empty());
        assert_eq!(f.phase_notches(), vec![1, 2]);
        f.play(&[2, 0, 2, 0, 3, 0, 0, 0]).unwrap();
        assert_eq!(
            (f.phase(), f.ejected(1)),
            (1, 3),
            "the removal is no ejection"
        );
        assert_eq!(f.removed(), vec![-4, 1, 2], "the Bass marble, a White one");
        assert_eq!(army_cells(&f, 2), vec![]);
        assert_eq!(f.phase_notches(), vec![2, 0]);
    }

    #[test]
    fn the_choir_refuses_an_army_out_of_turn_and_illegal_moves() {
        let mut f = choir();
        assert_eq!(
            f.play(&[1, 0, 0, -3, 0, 0, 0, 0]).unwrap_err(),
            "Move(NotOwnMarble)"
        );
        f.play(&forward(&f)).unwrap();
        assert_eq!(f.play(&[1, 3, 1, -2, 0, 0, 0, 0]).unwrap_err(), "WrongArmy");
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
    fn every_boss_starts_with_its_first_phase_notches_lit() {
        let lit = |id: &str| Encounter::new(id, 1).unwrap().phase_notches();
        assert_eq!(lit("echo"), vec![3, 0], "P2 after 3 ejections");
        assert_eq!(lit("hull"), vec![3, 0], "P2 after 3 ejections");
        assert_eq!(lit("chaplain"), vec![4, 0], "P2 after 4 ejections");
        assert_eq!(lit("choir"), vec![3, 0], "P2 after 3 ejections");
        assert_eq!(lit("ballast"), vec![3, 0], "P2 after 3 ejections");
        assert_eq!(lit("alien"), vec![2, 0], "P2 after 2 ejections");
        assert_eq!(lit("railyard"), vec![3, 0], "P2 after 3 ejections");
        assert_eq!(lit("pulsar"), vec![3, 0], "P2 after 3 ejections");
        assert_eq!(lit("assembly"), vec![3, 0], "P2 after 3 ejections");
        assert_eq!(lit("core"), vec![3, 0], "P2 after 3 ejections");
    }

    #[test]
    fn phase_ejections_lists_the_ejections_that_begin_each_phase() {
        let steps = |id: &str| Encounter::new(id, 1).unwrap().phase_ejections();
        assert_eq!(steps("hull"), vec![3, 5]);
        assert_eq!(steps("choir"), vec![3, 5], "the Choir has its own table");
        assert_eq!(steps("alien"), vec![2, 4]);
        for id in [
            "echo", "hull", "chaplain", "choir", "ballast", "alien", "railyard", "pulsar",
            "assembly", "core",
        ] {
            let f = Encounter::new(id, 1).unwrap();
            assert_eq!(f.phase_ejections().len() + 1, f.phases() as usize, "{id}");
            assert_eq!(
                f.phase_ejections()[0],
                f.phase_notches()[0],
                "{id}: the first notches count to the first step"
            );
        }
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
                bonuses: Vec::new(),
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
        let mut board = Board::empty();
        for (q, r) in [(2, 0), (3, 0)] {
            board.set(q, r, Cell::Black);
        }
        for (q, r) in [(4, 0), (-4, 4)] {
            board.set(q, r, Cell::White);
        }
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let mut f = Encounter {
            fight: Fight::Plain(abalone_core::encounter::echo::echo_fight(game, 1)),
            entry: boss_entry("echo").unwrap(),
            bonuses: Vec::new(),
        };
        let push = Move {
            cells: vec![(2, 0), (3, 0)],
            dir: abalone_core::moves::Direction::E,
        };
        f.play(&encode(&push)).unwrap(); // Black pushes it off, 2 against 1
        assert_eq!(f.ejected(1), 1);
        assert_eq!(f.phase_notches(), vec![2, 1], "P2 after 3 ejections");
    }

    // The Assembly Line (#744): belts carry every marble off the board, and presses strike.

    /// The fixture of the core assembly tests and client/e2e/assembly.spec.ts (seed 1, the centre
    /// belt first runs toward +q): one marble per move, `[q, r, dir]`.
    const ASSEMBLY_FIXTURE: [[i32; 3]; 33] = [
        [-4, 3, 2],
        [2, -2, 5],
        [-4, 4, 4],
        [2, -1, 5],
        [-4, 3, 4],
        [3, 0, 0],
        [-4, 2, 5],
        [0, -2, 3],
        [-4, 3, 4],
        [-1, -1, 3],
        [-4, 2, 5],
        [-3, 0, 1],
        [-4, 3, 4],
        [-1, -3, 3],
        [-4, 2, 5],
        [-2, -2, 3],
        [-4, 3, 4],
        [-3, -1, 3],
        [-4, 2, 5],
        [1, -2, 3],
        [-4, 3, 4],
        [-1, -1, 1],
        [-4, 2, 5],
        [0, -3, 3],
        [-4, 3, 4],
        [-1, -2, 3],
        [-4, 2, 5],
        [1, -3, 3],
        [-4, 3, 4],
        [0, -4, 3],
        [-4, 2, 2],
        [-1, -3, 0],
        [-3, 2, 4],
    ];

    /// The board, the belts and the last belts after each of the first `plies` plies of the fixture.
    fn assembly_run(seed: u32, plies: usize) -> Vec<(Vec<u8>, Vec<i32>, Vec<i32>)> {
        let mut f = Encounter::new("assembly", seed).unwrap();
        ASSEMBLY_FIXTURE[..plies]
            .iter()
            .map(|&[q, r, dir]| {
                f.play(&[1, dir, q, r, 0, 0, 0, 0]).unwrap();
                (f.board(), f.belts(), f.last_belts())
            })
            .collect()
    }

    #[test]
    fn the_assembly_line_exposes_the_belts_and_what_they_did_to_the_marbles() {
        let f = Encounter::new("assembly", 1).unwrap();
        assert_eq!(f.name(), "The Assembly Line");
        assert_eq!((f.phase(), f.phases()), (0, 3));
        assert_eq!(
            f.belts(),
            vec![5, 0, -4, 9, 1, 0, -1, -1, -3, 8, 0, 0, -1, 1, -4, 8, 0, 0, -1],
            "5 turns to the reversal; only the centre belt runs, toward +q"
        );
        assert!(f.last_belts().is_empty());
        let run = assembly_run(1, 33);
        assert!(run[0].2.is_empty(), "nothing on the belts");
        assert_eq!(
            run[6].2,
            vec![4, 0, 5, 0, 1, 2],
            "a boss marble fell off the east end"
        );
        assert_eq!(
            run[6].1[..7],
            [1, 0, -4, 9, 1, 4, -1],
            "the next move is the last toward +q"
        );
        assert_eq!(
            run[9].1[..7],
            [5, 0, -4, 9, -1, 5, -1],
            "reversed after turn 5"
        );
        assert_eq!(
            run[20].1[7..13],
            [-1, -3, 8, -1, 7, -1],
            "P2: the side belts run against it"
        );
        assert_eq!(
            run[30].1[6], 0,
            "the centre slot 5 is on cell (5 + 4) % 9 = 0 of its belt, announced"
        );
        assert_eq!(run[30].1[12], 7, "upper belt slot 3 on cell (3 + 4) % 8");
        assert_eq!(run[30].1[18], 1, "lower belt slot 5 on cell (5 + 4) % 8");
        assert!(run[31].2.is_empty(), "the boss ply moves no belt");
        assert_eq!(
            run[32].2,
            vec![-3, 1, -2, 1, 0, 1, -2, 1, -1, 1, 0, 1, -2, 1, -2, 1, 2, 1],
            "your two marbles on the lower belt carried, the one now on (-2, 1) struck"
        );
        let mut f = Encounter::new("assembly", 1).unwrap();
        for &[q, r, dir] in &ASSEMBLY_FIXTURE {
            f.play(&[1, dir, q, r, 0, 0, 0, 0]).unwrap();
        }
        assert_eq!((f.ejected(1), f.ejected(2), f.phase()), (5, 1, 2));
        assert!(choir().belts().is_empty() && choir().last_belts().is_empty());
        assert!(Encounter::new("echo", 1).unwrap().belts().is_empty());
    }

    #[test]
    fn two_assembly_encounters_with_the_same_seed_and_moves_give_the_same_belts() {
        assert_eq!(assembly_run(1, 33), assembly_run(1, 33));
        assert!((0..8).any(|seed| assembly_run(seed, 1)[0].1 != assembly_run(1, 1)[0].1));
    }

    #[test]
    fn the_assembly_line_replies_with_a_legal_move() {
        let mut f = Encounter::new("assembly", 3).unwrap();
        ply(&mut f);
        let mv = f.boss_move();
        assert_eq!(mv.len(), MOVE_STRIDE);
        f.play(&mv).unwrap();
        assert_eq!(f.to_move(), 1);
    }

    // The Dual Room (#947, #955): two rooms split by a void, an ejected marble comes back in the other one.

    /// The plies of the recorded Dual Room fight (crates/abalone-core/tests/fixtures/dual.txt), shared
    /// with client/src/test/dual-game.ts and client/e2e/dual.spec.ts: its fight seed is 1.
    fn dual_plies() -> Vec<Vec<i32>> {
        let text = include_str!("../../abalone-core/tests/fixtures/dual.txt");
        let names = ["E", "W", "NE", "SW", "NW", "SE"];
        text.split("moves:\n")
            .nth(1)
            .unwrap()
            .lines()
            .map(|line| {
                let (cells, dir) = line.split_once(' ').unwrap();
                let cells = cells
                    .split(';')
                    .map(|c| {
                        let (q, r) = c.split_once(',').unwrap();
                        (q.parse().unwrap(), r.parse().unwrap())
                    })
                    .collect();
                let dir = DIRECTIONS[names.iter().position(|&d| d == dir).unwrap()];
                encode(&Move { cells, dir }).to_vec()
            })
            .collect()
    }

    /// The ply that ejects the first boss marble, announced on (0, -2), and the 5th ejection, which
    /// raises the bridge.
    const DUAL_RETURN_AT: usize = 19;
    const DUAL_BRIDGE_AT: usize = 41;

    /// The Dual Room after the first `plies` plies of the recorded fight.
    fn dual_room(plies: usize) -> Encounter {
        let mut f = Encounter::new("dual", 1).unwrap();
        for mv in &dual_plies()[..plies] {
            f.play(mv).unwrap();
        }
        f
    }

    fn dual_slot(q: i32, r: i32) -> usize {
        board_cells(7).position(|c| c == (q, r)).unwrap()
    }

    #[test]
    fn the_dual_room_goal_names_the_void_and_the_bridge() {
        assert_eq!(
            boss_goal("dual").unwrap(),
            "Two rooms split by a void: a marble ejected over the rim or into the void comes back in the other room; at 5 a bridge fills the void. Eject 6 to win; lose 6 or draw to lose."
        );
    }

    #[test]
    fn the_dual_room_board_holds_its_two_rooms_in_169_codes() {
        let f = Encounter::new("dual", 1).unwrap();
        let cells = f.board();
        assert_eq!(cells.len(), 169);
        assert_eq!(
            count(&cells, 3),
            169 - 74,
            "every cell off the two rooms is vanished, the void too"
        );
        assert_eq!((count(&cells, 1), count(&cells, 2)), (16, 10));
        assert_eq!(
            cells[dual_slot(-2, 7)],
            1,
            "the player's far side of the south room"
        );
        assert_eq!(
            cells[dual_slot(0, -1)],
            2,
            "the boss near the void in the north room"
        );
        assert_eq!(cells[dual_slot(0, 0)], 3, "the void");
        assert_eq!(f.dual(), vec![0, 0, 0, 0], "no bridge, nothing comes back");
        assert!(f.last_return().is_empty());
    }

    #[test]
    fn the_dual_room_announces_a_return_and_lands_it_one_ply_later() {
        assert_eq!(dual_room(DUAL_RETURN_AT - 1).dual(), vec![0, 0, 0, 0]);
        let ejected = dual_room(DUAL_RETURN_AT);
        assert_eq!(ejected.ejected(1), 1);
        assert_eq!(
            ejected.dual(),
            vec![0, 2, 0, -2],
            "a boss marble lands on (0, -2)"
        );
        assert!(ejected.last_return().is_empty());
        let landed = dual_room(DUAL_RETURN_AT + 1);
        assert_eq!(landed.last_return(), vec![2, 0, -2]);
        assert_eq!(landed.board()[dual_slot(0, -2)], 2);
        assert_eq!(landed.ejected(1), 1, "the ejection still counts");
    }

    #[test]
    fn the_fifth_dual_room_ejection_raises_the_bridge() {
        let before = dual_room(DUAL_BRIDGE_AT - 1);
        assert_eq!((before.dual()[0], before.phase()), (0, 1));
        assert_eq!(before.board()[dual_slot(0, 0)], 3);
        let after = dual_room(DUAL_BRIDGE_AT);
        assert_eq!(after.dual(), vec![1, 0, 0, 0], "up, and the 5th is gone");
        assert_eq!((after.phase(), after.ejected(1)), (2, 5));
        let board = after.board();
        for q in -2..=2 {
            assert_eq!(board[dual_slot(q, 0)], 0, "the bridge's empty cells");
        }
        assert_eq!(count(&board, 3), 169 - 79);
        assert_eq!(dual_plies().len(), DUAL_BRIDGE_AT);
    }

    #[test]
    fn the_same_seed_and_plies_give_the_same_dual_room_fight() {
        for plies in [DUAL_RETURN_AT, 31] {
            let (a, b) = (dual_room(plies), dual_room(plies));
            assert_eq!(a.board(), b.board());
            assert_eq!(a.dual(), b.dual());
            assert_eq!(a.boss_move(), b.boss_move());
            assert!(!a.boss_move().is_empty());
        }
        assert!(fight().dual().is_empty() && fight().last_return().is_empty());
        assert!(choir().dual().is_empty() && choir().last_return().is_empty());
    }

    /// The plies of the recorded Swarm win (the core fixture), the way the client replays a game.
    fn swarm_plies() -> (u32, Vec<Vec<i32>>) {
        let text = include_str!("../../abalone-core/tests/fixtures/swarm.txt");
        let fixture = Fixture::parse(text).unwrap();
        let plies = fixture.moves.iter().map(|m| encode(m).to_vec()).collect();
        (fixture.seed as u32, plies)
    }

    /// The Swarm after the first `plies` plies of the recorded win.
    fn swarm(plies: usize) -> Encounter {
        let (seed, moves) = swarm_plies();
        let mut f = Encounter::new("swarm", seed).unwrap();
        for mv in &moves[..plies] {
            f.play(mv).unwrap();
        }
        f
    }

    #[test]
    fn the_swarm_starts_with_11_player_marbles_and_its_first_wave_announced() {
        let f = swarm(0);
        assert_eq!(f.name(), "The Swarm");
        assert!(f.goal().contains("ejects 2 of your marbles"));
        assert_eq!((count(&f.board(), 1), count(&f.board(), 2)), (11, 0));
        assert_eq!(
            (f.phase(), f.phases(), f.phase_ejections()),
            (0, 3, vec![14, 24])
        );
        assert!(f.phase_notches().is_empty(), "its phases go by turns");
        let tell = f.swarm();
        assert_eq!(tell[..2], [30, 0], "30 turns left, no pass");
        assert_eq!(tell.len(), 4, "one announced cell");
        assert!(f.swarm_landed().is_empty());
        assert_eq!(
            (f.win_ejections(1), f.win_ejections(2)),
            (0, 2),
            "the player does not win by ejections"
        );
        assert_eq!((f.tell(), f.turns_left(), f.next_army()), (-1, -1, -1));
        assert!(f.tell_move(&first_move(&f)).is_empty() && f.free_moves().is_empty());
        assert_eq!(f.free_taken(), 0);
        assert!(f.flips().is_empty() && f.assigned().is_empty() && f.removed().is_empty());
        assert!(fight().swarm().is_empty() && fight().swarm_landed().is_empty());
        assert!(choir().swarm().is_empty());
        assert_eq!(fight().win_ejections(1), 6);
    }

    #[test]
    fn the_swarm_lands_its_announced_wave_and_counts_the_turns_down() {
        let f = swarm(0);
        let announced = f.swarm()[2..].to_vec();
        let f = swarm(1);
        assert_eq!(f.swarm_landed(), announced, "the wave lands on its mark");
        assert_eq!(at(&f.board(), announced[0], announced[1]), 2);
        assert_eq!(f.to_move(), 2);
        let f = swarm(2);
        assert_eq!(f.swarm()[0], 29);
        assert!(!f.boss_move().is_empty() || f.to_move() == 1);
        assert!(f.boss_move().is_empty(), "the player's turn");
        assert!(!f.player_move().is_empty());
    }

    #[test]
    fn the_recorded_swarm_win_replays_the_same_through_wasm() {
        // The daily, a Retry and every co-op peer replay the same waves (#795).
        let (_, moves) = swarm_plies();
        let (a, b) = (swarm(moves.len()), swarm(moves.len()));
        assert_eq!(a.result(), 1, "the evac after the 30th reply");
        assert_eq!(a.swarm(), vec![0, 0], "no turn left, nothing announced");
        assert_eq!((a.board(), a.swarm_landed()), (b.board(), b.swarm_landed()));
        for plies in [7, 21] {
            let (a, b) = (swarm(plies), swarm(plies));
            assert_eq!((a.swarm(), a.board()), (b.swarm(), b.board()));
        }
        let first = swarm(0).swarm();
        let other = |seed| Encounter::new("swarm", seed).unwrap().swarm();
        assert!(
            (1..4).map(other).any(|s| s != first),
            "the seed picks the cells"
        );
    }

    #[test]
    fn a_swarm_with_no_move_passes_through_wasm() {
        use abalone_core::encounter::swarm::{allowed_rim, Swarm};
        let mut board = Board::empty();
        for &(q, r) in allowed_rim().iter().chain([(0, 0)].iter()) {
            board.set(q, r, Cell::Black);
        }
        let game = Game::from_position(board, Player::Black, [0, 0]);
        let mut f = Encounter {
            fight: Fight::Swarm(Swarm::from_position(game, 7, 0)),
            entry: boss_entry("swarm").unwrap(),
            bonuses: Vec::new(),
        };
        let mv = f
            .legal_moves()
            .chunks(MOVE_STRIDE)
            .find(|m| m[0] == 1 && m[2] == 0 && m[3] == 0)
            .unwrap()
            .to_vec();
        f.play(&mv).unwrap();
        assert_eq!(f.to_move(), 1, "the swarm passed");
        assert_eq!(f.swarm()[..2], [29, 1]);
        f.scale_node_budget(50);
        assert_eq!(f.result(), 0);
        assert!(
            f.play(&[1, 0, 0, 0, 0, 0, 0, 0]).is_err(),
            "no marble left on (0, 0)"
        );
    }
}
