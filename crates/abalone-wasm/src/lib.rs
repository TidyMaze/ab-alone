//! Thin wasm-bindgen bridge over `abalone-core`. No game logic lives here: it only converts
//! between core types and flat integer arrays (decision #74, local transport, no network).
//!
//! Encodings, all stable and documented:
//! - Board: 61 bytes, row by row from `r = -4` to `r = 4`, inside a row by `q` ascending.
//!   Value `0` empty, `1` Black, `2` White, `3` vanished (a cell a boss removed, The Hull).
//!   Index 0 is `(q=0, r=-4)`, index 60 is `(q=0, r=4)`.
//! - Cracks (The Hull): records of 3 integers `[q, r, plies_left]`, back to back.
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

use abalone_core::board::{Board, Cell, RADIUS};
use abalone_core::encounter::chaplain::{chaplain_boss, chaplain_tell};
use abalone_core::encounter::choir::{
    choir_boss, Army, Choir, ChoirError, ARMY_SIZE, CYCLE, PHASE_ARMIES,
};
use abalone_core::encounter::echo::{echo_boss, echo_move, mirror_move};
use abalone_core::encounter::hull::hull_boss;
use abalone_core::encounter::{marbles, BossDef, Encounter as CoreEncounter, PveResult};
use abalone_core::game::{DrawReason, Game, Outcome};
use abalone_core::moves::{legal_moves, Direction, Move, Player};
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

/// The 61 cells of the hexagon in board order, see the module docs.
fn cells() -> impl Iterator<Item = (i32, i32)> {
    (-RADIUS..=RADIUS)
        .flat_map(|r| (-RADIUS..=RADIUS).map(move |q| (q, r)))
        .filter(|&(q, r)| (q + r).abs() <= RADIUS)
}

/// The 61 cells of the hexagon, vanished ones included, so the indices never shift.
fn board_bytes(board: &Board) -> Vec<u8> {
    cells()
        .map(|(q, r)| match board.get(q, r) {
            Some(Cell::Empty) => 0,
            Some(Cell::Black) => 1,
            Some(Cell::White) => 2,
            None => VANISHED,
        })
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
    announce: fn(&Move) -> Option<Move>,
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

fn echo_announce(mv: &Move) -> Option<Move> {
    Some(mirror_move(mv))
}

/// Reply of a boss that plays standard Abalone: its node-limited search.
fn search_reply(enc: &CoreEncounter) -> Option<Move> {
    enc.boss_search().map(|r| r.mv)
}

fn no_announce(_mv: &Move) -> Option<Move> {
    None
}

fn no_flips(_enc: &CoreEncounter) -> Vec<(i32, i32)> {
    Vec::new()
}

const BOSSES: [BossEntry; 4] = [
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
            Fight::Plain(_) => (self.entry.def)().phase_marbles.len(),
            Fight::Choir(_) => PHASE_ARMIES.len(),
        };
        steps as u8 + 1
    }

    /// The phase notches on the arena frame (#356, docs/specs/world.md section 6 rule 4):
    /// `[lit, dark]`, one lit notch per boss marble left until the next phase, one dark notch per
    /// boss marble lost since this phase began. Empty in the last phase. The Choir's next phase
    /// comes when its smallest army is wiped.
    pub fn phase_notches(&self) -> Vec<u8> {
        let phase = self.phase() as usize;
        match &self.fight {
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
        decode(mv)
            .ok()
            .and_then(|m| (self.entry.announce)(&m))
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

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use abalone_core::board::Board;
    use abalone_core::encounter::choir::{ALTO_START, BASS_START, TENOR_START};
    use abalone_core::moves::{legal_moves, Player};

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
    fn boss_list_is_data_driven_and_starts_with_the_echo() {
        assert_eq!(
            boss_ids(),
            vec![
                "echo".to_string(),
                "hull".to_string(),
                "choir".to_string(),
                "chaplain".to_string()
            ]
        );
        assert_eq!(boss_name("echo"), Some("The Echo".to_string()));
        assert_eq!(boss_name("hull"), Some("The Hull".to_string()));
        assert_eq!(boss_name("choir"), Some("The Choir".to_string()));
        assert_eq!(boss_name("chaplain"), Some("The Chaplain".to_string()));
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
        for id in boss_ids() {
            let first = replies(&id, 2_374_354_862);
            assert_eq!(first.0.len(), 4);
            assert_eq!(replies(&id, 2_374_354_862), first, "{id} replays the same");
        }
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
