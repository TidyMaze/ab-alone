//! Thin wasm-bindgen bridge over `abalone-core`. No game logic lives here: it only converts
//! between core types and flat integer arrays (decision #74, local transport, no network).
//!
//! Encodings, all stable and documented:
//! - Board: 61 bytes, row by row from `r = -4` to `r = 4`, inside a row by `q` ascending.
//!   Value `0` empty, `1` Black, `2` White, `3` vanished (a cell a boss removed, The Hull),
//!   `4` to `7` a marble of battle royale seats 3 to 6.
//!   Index 0 is `(q=0, r=-4)`, index 60 is `(q=0, r=4)`. The radius 5 board of The Ballast Mind
//!   has 91: the same 61, then its outer ring, row by row from `r = -5`, `q` ascending.
//! - Cracks (The Hull): records of 3 integers `[q, r, plies_left]`, back to back.
//! - Eggs (The Alien): records of 3 integers `[q, r, player_turns_left]`, back to back.
//! - Trains (The Rail Yard): records of 6 integers `[line, player_turns_left, entry_q, entry_r,
//!   exit_q, exit_r]`, back to back: the train runs its line from the entry cell to the exit cell
//!   (docs/specs/game-design.md section 7.8 numbers the lines).
//! - Cell list (The Chaplain): pairs `[q, r]`, back to back.
//! - Armies (The Choir): records of 3 integers `[q, r, army]`, back to back. Army `0` Alto,
//!   `1` Tenor, `2` Bass, the order of the cycle. On the Choir's radius 3 board the outer ring
//!   is `3`, like a vanished cell.
//! - Side and winner: `1` Black, `2` White.
//! - Status: `0` running, `1` Black won, `2` White won, `3` draw.
//! - Draw reason: `0` none, `1` threefold repetition, `2` 100 plies without ejection.
//! - Result of an encounter: `0` playing, `1` won, `2` lost (a draw is a loss).
//! - Move: 8 integers `[n, dir, q0, r0, q1, r1, q2, r2]`, `n` in 1..=3 marbles, unused
//!   coordinates are `0`. `dir`: `0` E, `1` W, `2` NE, `3` SW, `4` NW, `5` SE.
//!   `legal_moves` returns the records back to back.
//! - Score (the evaluation bar): the search score for the side to move, in centi-marbles (one
//!   marble is 100). A won game scores 1 000 000 minus the plies to the win, a lost one the
//!   opposite, a draw 0: beyond +/-500 000 the game is decided.
//! - Battle royale (`Royale`). A seat is a number from `0` to `seats - 1`.
//!   - Arena: 217 bytes, row by row from `r = -8` to `r = 8`, inside a row by `q` ascending, the
//!     order of `cellsFor(8)` in `client/src/board.ts`. Index 0 is `(q=0, r=-8)`, index 216 is
//!     `(q=0, r=8)`. The board codes above: `0` empty, `1` and `2` seats 0 and 1, `4` to `7`
//!     seats 2 to 5, `3` void. A cracked cell, which goes void at the end of the next round, adds
//!     `8` to its code: `8` cracked and empty, `9` a cracked cell with a seat 0 marble.
//!   - Legal orders (`legal_orders(seat)`): the seat's move records, back to back.
//!   - Orders: records of 9 integers `[seat, n, dir, q0, r0, q1, r1, q2, r2]`, a seat then its
//!     move record, back to back. A seat with no record holds, like the empty order of the client.
//!   - Round log: the round number, then one record of 3 integers `[seat, outcome, ejected]` per
//!     turn in initiative order. Outcome `0` applied, `1` fizzled (illegal at its turn, a pass),
//!     `2` held, `3` out (no marble left at its turn). `ejected` is the seat whose marble the
//!     move ejected, `-1` for none.
//!   - Cracks: records of 3 integers `[q, r, rounds_left]`, back to back.
//!   - Placement: one record of 2 integers `[place, points]` per seat in seat order, places from
//!     `1`, empty while the game runs.
//!   - State hash: 16 lowercase hex digits, the same on every peer for the same state.

use abalone_core::board::{Board, Cell, MAX_RADIUS, RADIUS};
use abalone_core::encounter::alien::{alien_boss, alien_move, alien_start};
use abalone_core::encounter::ballast::{ballast_boss, ballast_move, ballast_start, ballast_tell};
use abalone_core::encounter::chaplain::{chaplain_boss, chaplain_tell};
use abalone_core::encounter::choir::{
    choir_boss, Army, Choir, ChoirError, ARMY_SIZE, CYCLE, PHASE_ARMIES,
};
use abalone_core::encounter::echo::{echo_boss, echo_move, mirror_move};
use abalone_core::encounter::hull::hull_boss;
use abalone_core::encounter::railyard::{
    railyard_boss, railyard_move, railyard_start, track_cells,
};
use abalone_core::encounter::{marbles, BossDef, Encounter as CoreEncounter, PveResult};
use abalone_core::game::{DrawReason, Game, Outcome};
use abalone_core::moves::{legal_moves, legal_moves_for, Direction, Move, Player};
use abalone_core::royale::{
    self, Order as RoyaleOrder, Outcome as RoyaleOutcome, RoundLog, Turn as RoyaleTurn,
};
use abalone_core::search::{best_move, position_score};
use wasm_bindgen::prelude::*;

/// Integers per move record.
pub const MOVE_STRIDE: usize = 8;

/// Direction codes, the index is the code.
const DIRECTIONS: [Direction; 6] = [
    Direction::E,
    Direction::W,
    Direction::NE,
    Direction::SW,
    Direction::NW,
    Direction::SE,
];

/// The player of a side code: `1` Black, anything else White.
fn player(side: u8) -> Player {
    if side == 1 {
        Player::Black
    } else {
        Player::White
    }
}

fn side_code(player: Player) -> u8 {
    match player {
        Player::Black => 1,
        Player::White => 2,
    }
}

/// Status code of a game, see the module docs.
pub fn status_code(outcome: Option<Outcome>) -> u8 {
    match outcome {
        None => 0,
        Some(Outcome::Win(player)) => side_code(player),
        Some(Outcome::Draw) => 3,
    }
}

/// Draw reason code, see the module docs.
pub fn draw_reason_code(reason: Option<DrawReason>) -> u8 {
    match reason {
        None => 0,
        Some(DrawReason::Repetition) => 1,
        Some(DrawReason::NoEjectionCap) => 2,
    }
}

fn encode(mv: &Move) -> [i32; MOVE_STRIDE] {
    let mut record = [0; MOVE_STRIDE];
    record[0] = mv.cells.len() as i32;
    record[1] = DIRECTIONS.iter().position(|&d| d == mv.dir).unwrap_or(0) as i32;
    for (i, &(q, r)) in mv.cells.iter().enumerate() {
        record[2 + 2 * i] = q;
        record[3 + 2 * i] = r;
    }
    record
}

fn decode(record: &[i32]) -> Result<Move, String> {
    if record.len() != MOVE_STRIDE {
        return Err(format!("move needs {MOVE_STRIDE} integers"));
    }
    let n = usize::try_from(record[0])
        .ok()
        .filter(|n| (1..=3).contains(n))
        .ok_or("marble count must be 1 to 3")?;
    let dir = usize::try_from(record[1])
        .ok()
        .and_then(|i| DIRECTIONS.get(i))
        .copied()
        .ok_or("direction must be 0 to 5")?;
    let cells = (0..n)
        .map(|i| (record[2 + 2 * i], record[3 + 2 * i]))
        .collect();
    Ok(Move { cells, dir })
}

/// One opaque game instance handed to JavaScript.
#[wasm_bindgen]
pub struct Engine {
    game: Game,
}

#[wasm_bindgen]
impl Engine {
    /// A new game: standard layout, Black to move.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine {
        Engine { game: Game::new() }
    }

    /// Side to move: `1` Black, `2` White.
    pub fn to_move(&self) -> u8 {
        side_code(self.game.to_move())
    }

    /// Legal moves of the side to move, flat records of `MOVE_STRIDE` integers. Empty once the
    /// game is over.
    pub fn legal_moves(&self) -> Vec<i32> {
        if self.game.outcome().is_some() {
            return Vec::new();
        }
        legal_moves(self.game.board(), self.game.to_move())
            .iter()
            .flat_map(encode)
            .collect()
    }

    /// Plays one move record. `Err` carries the reason, the game is left unchanged.
    pub fn play(&mut self, mv: &[i32]) -> Result<(), String> {
        let mv = decode(mv)?;
        self.game.play(&mv).map_err(|e| format!("{e:?}"))
    }

    /// Opponent marbles ejected by a side: `1` Black, `2` White. The game ends at 6.
    pub fn ejected(&self, side: u8) -> u8 {
        self.game.ejected(player(side))
    }

    /// Ejections a side needs to win: `1` Black, `2` White.
    pub fn win_ejections(&self, side: u8) -> u8 {
        self.game.win_ejections(player(side))
    }

    /// The 61 cells, see the module docs for the order.
    pub fn board(&self) -> Vec<u8> {
        board_bytes(self.game.board())
    }

    /// The bot's reply for the side to move, one move record, searching at most `nodes`
    /// positions. Empty once the game is over.
    pub fn best_move(&self, nodes: u32) -> Vec<i32> {
        best_move(&self.game, nodes)
            .map(|mv| encode(&mv).to_vec())
            .unwrap_or_default()
    }

    /// Score of the position for the side to move, searching at most `nodes` positions. See the
    /// module docs.
    pub fn evaluate(&self, nodes: u32) -> i32 {
        position_score(&self.game, nodes)
    }

    /// Winner or draw state, see the module docs.
    pub fn status(&self) -> u8 {
        status_code(self.game.outcome())
    }

    /// Draw reason code, `0` when the game is not a draw. See the module docs.
    pub fn draw_reason(&self) -> u8 {
        draw_reason_code(self.game.draw_reason())
    }
}

/// Board value of a cell a boss removed.
const VANISHED: u8 = 3;

/// Added to the code of a cracked cell of the battle royale arena.
const CRACKED: u8 = 8;

/// The cells of the hexagon of `radius` in board order, see the module docs.
fn cells_of(radius: i32) -> impl Iterator<Item = (i32, i32)> {
    (-radius..=radius)
        .flat_map(move |r| (-radius..=radius).map(move |q| (q, r)))
        .filter(move |&(q, r)| (q + r).abs() <= radius)
}

/// The 61 cells of the hexagon in board order, see the module docs.
fn cells() -> impl Iterator<Item = (i32, i32)> {
    cells_of(RADIUS)
}

/// Board code of `(q, r)`, see the module docs.
fn cell_code(board: &Board, q: i32, r: i32) -> u8 {
    match board.get(q, r) {
        Some(Cell::Empty) => 0,
        Some(Cell::Black) => 1,
        Some(Cell::White) => 2,
        Some(seat) => seat as u8 + 1,
        None => VANISHED,
    }
}

/// The cells of a board in board order, see the module docs: the 61, then the outer ring of a
/// radius 5 board.
fn board_cells(radius: i32) -> impl Iterator<Item = (i32, i32)> {
    let ring = |(q, r): (i32, i32)| q.abs().max(r.abs()).max((q + r).abs());
    cells().chain(cells_of(radius).filter(move |&c| ring(c) > RADIUS))
}

/// The cells of the board, vanished ones included, so the indices never shift.
fn board_bytes(board: &Board) -> Vec<u8> {
    board_cells(board.radius())
        .map(|(q, r)| cell_code(board, q, r))
        .collect()
}

/// Result code of an encounter, see the module docs.
pub fn result_code(result: Option<PveResult>) -> u8 {
    match result {
        None => 0,
        Some(PveResult::Won) => 1,
        Some(PveResult::Lost) => 2,
    }
}

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

/// The Alien sets up its own 8 marbles.
fn alien_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(alien_start(seed))
}

/// The Rail Yard announces its first train at the start.
fn railyard_fight(_def: BossDef, seed: u64) -> Fight {
    Fight::Plain(railyard_start(seed))
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

const BOSSES: [BossEntry; 7] = [
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
];

/// `[lit, dark]` notches for `left` boss marbles in a phase that began at `from` and ends at `to`,
/// none when there is no next phase. A converted marble (The Chaplain) adds a lit notch.
fn notches(left: u8, from: u8, to: Option<u8>) -> Vec<u8> {
    to.map_or_else(Vec::new, |to| vec![left - to, from.saturating_sub(left)])
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
    2 // 2: The Alien's phases count the player's ejections (#621)
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
        Vec::new()
    }

    /// Player marbles that flip at the end of the next boss turn if nothing moves (The Chaplain),
    /// a cell list. Empty for the other bosses.
    pub fn flips(&self) -> Vec<i32> {
        match &self.fight {
            Fight::Plain(e) => cell_list(&(self.entry.flips)(e)),
            Fight::Choir(_) => Vec::new(),
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

/// Integers per battle royale order: the seat, then its move record.
const ORDER_STRIDE: usize = MOVE_STRIDE + 1;

/// Round log outcome codes, see the module docs.
const APPLIED: i32 = 0;
const FIZZLED: i32 = 1;
const HELD: i32 = 2;
const OUT: i32 = 3;

/// One turn of a round log as `[seat, outcome, ejected]`, see the module docs.
fn turn_record(turn: &RoyaleTurn) -> [i32; 3] {
    let outcome = match turn.outcome {
        RoyaleOutcome::Applied => APPLIED,
        RoyaleOutcome::Fizzled(_) => FIZZLED,
        RoyaleOutcome::Held => HELD,
        RoyaleOutcome::Out => OUT,
    };
    let ejected = turn.ejected.map_or(-1, |seat| seat as i32);
    [turn.seat as i32, outcome, ejected]
}

/// A seat's order as its move record, empty for a hold.
fn order_record(order: &RoyaleOrder) -> Vec<i32> {
    match order {
        RoyaleOrder::Move(mv) => encode(mv).to_vec(),
        RoyaleOrder::Hold => Vec::new(),
    }
}

/// A battle royale handed to JavaScript (docs/specs/tech.md section 6): the state between
/// rounds, the log of the last round and the seed of its bots.
#[wasm_bindgen]
pub struct Royale {
    state: royale::Royale,
    log: Option<RoundLog>,
    seed: u64,
}

#[wasm_bindgen]
impl Royale {
    /// A new game of 3 to 6 `seats` on the radius 8 arena, round 1. `seed` drives the bots: the
    /// same state and seed give the same bot orders.
    #[wasm_bindgen(constructor)]
    pub fn new(seats: usize, seed: u32) -> Result<Royale, String> {
        let state = royale::start(seats).map_err(|e| format!("{e:?}"))?;
        Ok(Royale {
            state,
            log: None,
            seed: u64::from(seed),
        })
    }

    /// The 217 cells of the arena, see the module docs.
    pub fn board(&self) -> Vec<u8> {
        let board = self.state.board();
        cells_of(MAX_RADIUS)
            .map(|(q, r)| {
                let cracked = board.cracks().iter().any(|&(c, _)| c == (q, r));
                cell_code(board, q, r) + if cracked { CRACKED } else { 0 }
            })
            .collect()
    }

    /// Resolves one round from the orders, see the module docs. `Err` carries the reason and
    /// leaves the game unchanged: a malformed order, an unknown or repeated seat, a game over.
    pub fn resolve(&mut self, orders: &[i32]) -> Result<(), String> {
        if !orders.len().is_multiple_of(ORDER_STRIDE) {
            return Err(format!("an order needs {ORDER_STRIDE} integers"));
        }
        let orders = orders
            .chunks(ORDER_STRIDE)
            .map(|o| {
                let seat = usize::try_from(o[0]).map_err(|_| "seat must be 0 or more")?;
                Ok((seat, RoyaleOrder::Move(decode(&o[1..])?)))
            })
            .collect::<Result<Vec<_>, String>>()?;
        let (state, log) =
            royale::resolve_round(&self.state, &orders).map_err(|e| format!("{e:?}"))?;
        self.state = state;
        self.log = Some(log);
        Ok(())
    }

    /// The last round resolved, see the module docs. Empty before the first one.
    pub fn round_log(&self) -> Vec<i32> {
        self.log.as_ref().map_or_else(Vec::new, |log| {
            let turns = log.turns.iter().flat_map(turn_record);
            std::iter::once(log.round as i32).chain(turns).collect()
        })
    }

    /// Cracked cells as `[q, r, rounds_left]` records: they go void at the end of the next round.
    pub fn cracks(&self) -> Vec<i32> {
        self.state
            .board()
            .cracks()
            .iter()
            .flat_map(|&((q, r), left)| [q, r, i32::from(left)])
            .collect()
    }

    /// Hash of the whole state, which every peer compares after a round, as 16 hex digits.
    pub fn state_hash(&self) -> String {
        format!("{:016x}", self.state.hash())
    }

    /// The bot order of `seat` for the next round, a move record, empty for a hold or a seat the
    /// game does not have.
    pub fn bot_order(&self, seat: usize) -> Vec<i32> {
        if seat >= self.state.seats() {
            return Vec::new();
        }
        order_record(&royale::bot::order(&self.state, seat, self.seed))
    }

    /// Every legal move of `seat`'s marbles on the arena, records back to back like
    /// `legal_moves`, empty for a seat the game does not have or with no marble left.
    pub fn legal_orders(&self, seat: usize) -> Vec<i32> {
        if seat >= self.state.seats() {
            return Vec::new();
        }
        legal_moves_for(self.state.board(), royale::seat_cell(seat))
            .iter()
            .flat_map(encode)
            .collect()
    }

    /// Each seat's `[place, points]` in seat order once the game is over, empty before.
    pub fn placement(&self) -> Vec<i32> {
        self.state.standings().map_or_else(Vec::new, |standings| {
            standings
                .iter()
                .flat_map(|s| [s.place as i32, s.points as i32])
                .collect()
        })
    }
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use abalone_core::board::Board;
    use abalone_core::encounter::ballast::{
        BALLAST_BOSS_START, BALLAST_PILLARS, BALLAST_PLAYER_START,
    };
    use abalone_core::encounter::choir::{ALTO_START, BASS_START, TENOR_START};
    use abalone_core::moves::{legal_moves, Direction, Player};

    fn count(cells: &[u8], value: u8) -> usize {
        cells.iter().filter(|&&c| c == value).count()
    }

    #[test]
    fn new_game_black_to_move_and_running() {
        let engine = Engine::new();
        assert_eq!(engine.to_move(), 1);
        assert_eq!(engine.status(), 0);
    }

    #[test]
    fn default_is_a_new_game() {
        assert_eq!(Engine::default().board(), Engine::new().board());
    }

    #[test]
    fn board_has_61_cells_14_per_side() {
        let cells = Engine::new().board();
        assert_eq!(cells.len(), 61);
        assert_eq!(count(&cells, 1), 14);
        assert_eq!(count(&cells, 2), 14);
        assert_eq!(count(&cells, 0), 33);
    }

    #[test]
    fn board_bytes_give_seats_3_to_6_the_codes_4_to_7() {
        let mut board = Board::empty();
        board.set(0, -4, Cell::Seat3);
        board.set(1, -4, Cell::Seat4);
        board.set(2, -4, Cell::Seat5);
        board.set(3, -4, Cell::Seat6);
        board.void(4, -4);
        assert_eq!(board_bytes(&board)[..6], [4, 5, 6, 7, VANISHED, 0]);
    }

    #[test]
    fn board_order_is_rows_from_r_minus_4_q_ascending() {
        let cells = Engine::new().board();
        // (0,-4) is White, (0,4) is Black, the centre (0,0) is empty.
        assert_eq!(cells[0], 2);
        assert_eq!(cells[60], 1);
        assert_eq!(cells[30], 0);
        // Row r=-4 has 5 cells, row r=-3 starts at index 5 with (q=-1).
        assert_eq!(cells[5], 2);
        // Row r=2 starts at index 5+6+7+8+9+8 = 43 with q=-4, so (q=-2, r=2) is index 45.
        assert_eq!(cells[45], 1);
    }

    #[test]
    fn legal_moves_match_the_core_count() {
        let expected = legal_moves(&Board::standard(), Player::Black).len();
        let flat = Engine::new().legal_moves();
        assert_eq!(flat.len(), expected * MOVE_STRIDE);
        for record in flat.chunks(MOVE_STRIDE) {
            assert!((1..=3).contains(&record[0]));
            assert!((0..=5).contains(&record[1]));
        }
    }

    #[test]
    fn play_a_legal_move_switches_side_and_changes_board() {
        let mut engine = Engine::new();
        let before = engine.board();
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        assert_eq!(engine.play(&first), Ok(()));
        assert_eq!(engine.to_move(), 2);
        assert_ne!(engine.board(), before);
    }

    #[test]
    fn play_rejects_malformed_records() {
        let mut engine = Engine::new();
        assert!(engine.play(&[]).is_err());
        assert!(engine.play(&[1, 0, 0, 0]).is_err());
        assert!(engine.play(&[0, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[4, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[-1, 0, 0, 0, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[1, 6, 0, 4, 0, 0, 0, 0]).is_err());
        assert!(engine.play(&[1, -1, 0, 4, 0, 0, 0, 0]).is_err());
        assert_eq!(engine.to_move(), 1);
    }

    #[test]
    fn play_rejects_an_illegal_move_with_the_core_reason() {
        let mut engine = Engine::new();
        // (0,-4) is a White marble, Black may not move it.
        let err = engine.play(&[1, 0, 0, -4, 0, 0, 0, 0]).unwrap_err();
        assert_eq!(err, "Move(NotOwnMarble)");
        assert_eq!(engine.to_move(), 1);
    }

    /// Both sides play their first legal move until the game ends.
    fn play_until_over(engine: &mut Engine) {
        while engine.status() == 0 {
            let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
            engine.play(&first).unwrap();
        }
    }

    #[test]
    fn a_drawn_game_reports_draw_and_refuses_moves() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert_eq!(engine.status(), 3);
        assert!((1..=2).contains(&engine.draw_reason()));
        assert!(engine.legal_moves().is_empty());
        assert!(engine.play(&[1, 0, 0, 0, 0, 0, 0, 0]).is_err());
    }

    #[test]
    fn best_move_is_one_legal_record() {
        let engine = Engine::new();
        let record = engine.best_move(300);
        assert_eq!(record.len(), MOVE_STRIDE);
        assert!(engine
            .legal_moves()
            .chunks(MOVE_STRIDE)
            .any(|m| m == record.as_slice()));
    }

    #[test]
    fn best_move_can_be_played_and_the_bot_answers_for_white() {
        let mut engine = Engine::new();
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        let reply = engine.best_move(300);
        assert_eq!(engine.play(&reply), Ok(()));
        assert_eq!(engine.to_move(), 1);
    }

    #[test]
    fn best_move_is_empty_once_the_game_is_over() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert!(engine.best_move(300).is_empty());
    }

    #[test]
    fn evaluate_is_the_core_position_score_for_the_side_to_move() {
        use abalone_core::search::{position_score, WIN};
        let mut engine = Engine::new();
        let start = engine.evaluate(2000);
        assert_eq!(start, position_score(&Game::new(), 2000));
        assert!(start.abs() < WIN / 2, "a running game is not decided");
        let first = engine.legal_moves()[..MOVE_STRIDE].to_vec();
        engine.play(&first).unwrap();
        assert_eq!(engine.evaluate(2000), position_score(&engine.game, 2000));
    }

    #[test]
    fn evaluate_a_drawn_game_is_zero() {
        let mut engine = Engine::new();
        play_until_over(&mut engine);
        assert_eq!(engine.evaluate(300), 0);
    }

    #[test]
    fn a_game_is_won_at_6_ejections_for_both_sides() {
        let engine = Engine::new();
        assert_eq!((engine.win_ejections(1), engine.win_ejections(2)), (6, 6));
    }

    #[test]
    fn ejected_counts_start_at_zero_for_both_sides() {
        let engine = Engine::new();
        assert_eq!(engine.ejected(1), 0);
        assert_eq!(engine.ejected(2), 0);
    }

    #[test]
    fn status_codes() {
        assert_eq!(status_code(None), 0);
        assert_eq!(status_code(Some(Outcome::Win(Player::Black))), 1);
        assert_eq!(status_code(Some(Outcome::Win(Player::White))), 2);
        assert_eq!(status_code(Some(Outcome::Draw)), 3);
    }

    #[test]
    fn draw_reason_codes() {
        use abalone_core::game::DrawReason;
        assert_eq!(draw_reason_code(None), 0);
        assert_eq!(draw_reason_code(Some(DrawReason::Repetition)), 1);
        assert_eq!(draw_reason_code(Some(DrawReason::NoEjectionCap)), 2);
    }

    // Encounter bridge: a game against a boss, the player is Black.

    fn fight() -> Encounter {
        Encounter::new("echo", 7).unwrap()
    }

    fn first_move(fight: &Encounter) -> Vec<i32> {
        fight.legal_moves()[..MOVE_STRIDE].to_vec()
    }

    #[test]
    fn the_engine_version_is_2_since_the_alien_phases_count_the_ejections() {
        assert_eq!(engine_version(), 2);
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
                "railyard".to_string()
            ]
        );
        assert_eq!(boss_name("echo"), Some("The Echo".to_string()));
        assert_eq!(boss_name("hull"), Some("The Hull".to_string()));
        assert_eq!(boss_name("choir"), Some("The Choir".to_string()));
        assert_eq!(boss_name("chaplain"), Some("The Chaplain".to_string()));
        assert_eq!(boss_name("ballast"), Some("The Ballast Mind".to_string()));
        assert_eq!(boss_name("alien"), Some("The Alien".to_string()));
        assert_eq!(boss_name("railyard"), Some("The Rail Yard".to_string()));
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

    // The Alien (#588): 8 boss marbles, seeded eggs that count down in player turns and hatch.

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

    // The Rail Yard (#626): trains announced 5 player turns ahead sweep a whole line.

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

    // The Ballast Mind (#47, #564): a radius 5 board with six void pillars, 16 boss marbles.

    /// Ring of `(q, r)`: its distance from the centre.
    fn ring((q, r): (i32, i32)) -> i32 {
        q.abs().max(r.abs()).max((q + r).abs())
    }

    #[test]
    fn the_ballast_mind_announces_echo_in_phase_3() {
        let entry = boss_entry("ballast").unwrap();
        let f1 = Encounter::new("ballast", 1).unwrap();
        assert!(f1.tell_move(&first_move(&f1)).is_empty(), "no echo in P1");

        // Set up P3 with a history of moves
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
        for id in ["echo", "hull", "choir", "chaplain", "alien", "railyard"] {
            assert_eq!(Encounter::new(id, 7).unwrap().board().len(), 61, "{id}");
        }
        assert_eq!(Engine::new().board().len(), 61);
    }

    // The Choir (#183): its own wrapper, a radius 3 board and three armies.

    fn choir() -> Encounter {
        Encounter::new("choir", 7).unwrap()
    }

    /// Cells of `army` in the `[q, r, army]` records of `armies()`.
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
        // A Bass marble, (-2, -1), to SW: legal on the board, but Alto is in turn.
        assert_eq!(
            f.play(&[1, 3, -2, -1, 0, 0, 0, 0]).unwrap_err(),
            "WrongArmy"
        );
        assert_eq!(f.to_move(), 2);
    }

    #[test]
    fn result_codes() {
        use abalone_core::encounter::PveResult;
        assert_eq!(result_code(None), 0);
        assert_eq!(result_code(Some(PveResult::Won)), 1);
        assert_eq!(result_code(Some(PveResult::Lost)), 2);
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

    // Phase notches on the arena frame (#356): one lit notch per boss marble left until the next
    // phase, one dark notch per boss marble lost since this phase began.

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
    }

    #[test]
    fn the_alien_phases_and_notches_count_the_ejections_not_its_marbles() {
        // The Alien start with 2 hatched marbles, `n` ejections already credited to the player.
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

    // Battle royale (#499).

    /// Index of `(q, r)` in the 217 arena bytes: rows from `r = -8`, `q` ascending, like
    /// `cellsFor(8)` in `client/src/board.ts`.
    fn arena_index(q: i32, r: i32) -> usize {
        (-8..=8)
            .flat_map(|r| ((-8).max(-8 - r)..=8.min(8 - r)).map(move |q| (q, r)))
            .position(|c| c == (q, r))
            .unwrap()
    }

    /// The 8-integer record of a one-marble move, with its seat in front.
    fn seat_move(seat: i32, dir: i32, q: i32, r: i32) -> Vec<i32> {
        vec![seat, 1, dir, q, r, 0, 0, 0, 0]
    }

    /// Resolves rounds where every seat holds until the game is over.
    fn hold_to_the_end(g: &mut Royale) {
        while g.placement().is_empty() {
            g.resolve(&[]).unwrap();
        }
    }

    #[test]
    fn a_royale_starts_with_217_cells_and_10_marbles_per_seat() {
        let g = Royale::new(3, 7).unwrap();
        let cells = g.board();
        assert_eq!(cells.len(), 217);
        assert_eq!(count(&cells, 1), 10);
        assert_eq!(count(&cells, 2), 10);
        assert_eq!(count(&cells, 4), 10);
        assert_eq!(count(&cells, 0), 187);
        let cells = Royale::new(6, 7).unwrap().board();
        for code in [1, 2, 4, 5, 6, 7] {
            assert_eq!(count(&cells, code), 10, "seat code {code}");
        }
        assert!(g.cracks().is_empty());
        assert!(g.round_log().is_empty(), "no round resolved yet");
        assert!(g.placement().is_empty(), "the game is not over");
    }

    #[test]
    fn a_royale_needs_3_to_6_seats() {
        for seats in [0, 2, 7] {
            assert!(Royale::new(seats, 7).is_err(), "{seats} seats");
        }
    }

    #[test]
    fn the_arena_order_is_rows_from_r_minus_8_q_ascending() {
        assert_eq!(arena_index(0, -8), 0);
        assert_eq!(arena_index(0, 8), 216);
        let cells = Royale::new(3, 7).unwrap().board();
        // Seat 1 on the bottom wedge, seat 2 two wedges on, seat 3 four wedges on.
        assert_eq!(cells[211], 1, "(-5, 8)");
        assert_eq!(cells[30], 2, "(-3, -5)");
        assert_eq!(cells[68], 4, "(8, -3)");
        assert_eq!(cells[arena_index(-5, 8)], 1);
        assert_eq!(cells[arena_index(0, 0)], 0);
    }

    #[test]
    fn the_breach_marks_the_cracked_ring_then_voids_it() {
        let mut g = Royale::new(3, 7).unwrap();
        for _ in 0..12 {
            g.resolve(&[]).unwrap();
        }
        let cells = g.board();
        assert_eq!(
            cells[arena_index(-5, 8)],
            1 | CRACKED,
            "a cracked cell keeps its marble"
        );
        assert_eq!(cells[arena_index(-4, 8)], 1 | CRACKED);
        assert_eq!(cells[arena_index(0, 8)], CRACKED, "a cracked empty cell");
        assert_eq!(cells[arena_index(0, 0)], 0);
        let cracks = g.cracks();
        assert_eq!(
            cracks.len(),
            48 * 3,
            "the whole rim, as [q, r, rounds left]"
        );
        assert!(cracks.chunks(3).all(|c| c[2] == 1));
        assert!(cracks.chunks(3).any(|c| c[..2] == [-5, 8]));
        g.resolve(&[]).unwrap();
        let cells = g.board();
        assert_eq!(cells.len(), 217, "a void cell keeps its slot");
        assert_eq!(count(&cells, VANISHED), 48);
        assert_eq!(cells[arena_index(-5, 8)], VANISHED);
        assert_eq!(count(&cells, 1), 7, "the 3 rim marbles went with the rim");
        assert!(g.cracks().is_empty());
    }

    #[test]
    fn resolve_plays_the_orders_and_logs_each_turn_in_initiative_order() {
        let mut g = Royale::new(3, 7).unwrap();
        let start = g.state_hash();
        let order = g.bot_order(0);
        assert_eq!(order.len(), MOVE_STRIDE);
        // Seat 2 orders a move of a seat 1 marble: it fizzles.
        let mut orders = vec![0];
        orders.extend(&order);
        orders.extend(seat_move(1, 4, -2, 6));
        g.resolve(&orders).unwrap();
        assert_eq!(
            g.round_log(),
            vec![1, 0, APPLIED, -1, 1, FIZZLED, -1, 2, HELD, -1]
        );
        assert_ne!(g.state_hash(), start);
        // Round 2 starts at seat 2.
        g.resolve(&[]).unwrap();
        assert_eq!(
            g.round_log(),
            vec![2, 1, HELD, -1, 2, HELD, -1, 0, HELD, -1]
        );
    }

    #[test]
    fn resolve_refuses_bad_orders_and_leaves_the_game_unchanged() {
        let mut g = Royale::new(3, 7).unwrap();
        let start = g.state_hash();
        let ok = seat_move(0, 4, -2, 6);
        let mut twice = ok.clone();
        twice.extend(&ok);
        for orders in [
            vec![0, 1, 4],                    // not records of 9 integers
            seat_move(-1, 4, -2, 6),          // no such seat
            seat_move(3, 4, -2, 6),           // a 3-seat game has seats 0 to 2
            twice,                            // two orders for seat 0
            vec![0, 0, 4, -2, 6, 0, 0, 0, 0], // no marble
        ] {
            assert!(g.resolve(&orders).is_err(), "{orders:?}");
        }
        assert_eq!(g.state_hash(), start);
        assert!(g.round_log().is_empty());
    }

    #[test]
    fn turn_records_code_every_outcome_and_the_ejected_seat() {
        use abalone_core::moves::MoveError;
        let turn = |outcome, ejected| RoyaleTurn {
            seat: 2,
            outcome,
            ejected,
        };
        assert_eq!(
            turn_record(&turn(RoyaleOutcome::Applied, Some(1))),
            [2, APPLIED, 1]
        );
        assert_eq!(
            turn_record(&turn(RoyaleOutcome::Fizzled(MoveError::Blocked), None)),
            [2, FIZZLED, -1]
        );
        assert_eq!(turn_record(&turn(RoyaleOutcome::Held, None)), [2, HELD, -1]);
        assert_eq!(turn_record(&turn(RoyaleOutcome::Out, None)), [2, OUT, -1]);
    }

    #[test]
    fn a_bot_order_is_a_legal_record_the_same_for_the_same_seed() {
        let g = Royale::new(4, 7).unwrap();
        for seat in 0..4 {
            let order = g.bot_order(seat);
            assert_eq!(order, Royale::new(4, 7).unwrap().bot_order(seat));
            let mut orders = vec![seat as i32];
            orders.extend(&order);
            let mut played = Royale::new(4, 7).unwrap();
            played.resolve(&orders).unwrap();
            // Round 1 plays the seats in seat order.
            let turn = 1 + 3 * seat;
            assert_eq!(
                played.round_log()[turn..turn + 3],
                [seat as i32, APPLIED, -1]
            );
        }
        assert!(g.bot_order(4).is_empty(), "a 4-seat game has seats 0 to 3");
        assert!(
            order_record(&RoyaleOrder::Hold).is_empty(),
            "a hold is empty"
        );
    }

    #[test]
    fn legal_orders_are_the_move_records_of_one_seat() {
        let g = Royale::new(3, 7).unwrap();
        let orders = g.legal_orders(0);
        assert!(!orders.is_empty());
        assert_eq!(orders.len() % MOVE_STRIDE, 0);
        // Each one plays when seat 0 leads round 1.
        for record in orders.chunks(MOVE_STRIDE) {
            let mut played = Royale::new(3, 7).unwrap();
            let mut order = vec![0];
            order.extend(record);
            played.resolve(&order).unwrap();
            assert_eq!(played.round_log()[1..4], [0, APPLIED, -1], "{record:?}");
        }
        assert!(
            orders
                .chunks(MOVE_STRIDE)
                .any(|o| o == [1, 4, -2, 6, 0, 0, 0, 0]),
            "(-2, 6) NW"
        );
        assert_ne!(g.legal_orders(1), orders, "seat 1 moves its own marbles");
        assert!(
            g.legal_orders(3).is_empty(),
            "a 3-seat game has seats 0 to 2"
        );
    }

    #[test]
    fn the_state_hash_is_16_hex_digits_that_tell_states_apart() {
        let g = Royale::new(3, 7).unwrap();
        let hash = g.state_hash();
        assert_eq!(hash.len(), 16);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(hash, Royale::new(3, 9).unwrap().state_hash());
        assert_ne!(hash, Royale::new(4, 7).unwrap().state_hash());
    }

    #[test]
    fn placement_gives_each_seat_its_place_and_points_once_over() {
        let mut g = Royale::new(3, 7).unwrap();
        hold_to_the_end(&mut g);
        // Nobody moved: the void of ring 6 takes the last 3 marbles of every seat at once, a
        // shared first place.
        assert_eq!(g.round_log()[0], 25);
        assert_eq!(g.placement(), vec![1, 10, 1, 10, 1, 10]);
        assert!(g.resolve(&[]).is_err(), "the game is over");
    }
}
