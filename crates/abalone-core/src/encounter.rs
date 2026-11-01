//! Encounter framework: a game against a boss (docs/specs/game-design.md section 3.3,
//! docs/specs/rules.md section 10.3). Standard move and sumito rules stay unchanged; a boss only
//! adds phases, a tell and a rule hook on top. Everything is a pure function of the game and the
//! seed, so the same seed and the same player moves give the same boss moves.

pub mod alien;
pub mod assembly;
pub mod ballast;
pub mod chaplain;
pub mod choir;
pub mod dual;
pub mod echo;
pub mod fixture;
pub mod hull;
pub mod ladder;
pub mod magnetizer;
pub mod overseer;
pub mod pulsar;
pub mod railyard;
pub mod stalker;
pub mod swarm;
pub mod telemetry;
pub mod unstable;

use crate::board::{Board, Cell};
use crate::encounter::dual::carried_dual;
use crate::encounter::magnetizer::{carried_announce, carried_poles, settle, Repulsion};
use crate::encounter::unstable::carried_unstable;
use crate::game::{Game, GameError, Outcome};
use crate::moves::{Move, Player};
use crate::search::{search, SearchResult};

/// `special(ply, phase)`: the special that fires at the end of ply number `ply` (1 is the first
/// ply of the game), as a tell id, or `None`.
pub type SpecialFn = fn(u32, usize) -> Option<u8>;

/// `hook(board, tell_id, seed)`: the board after the special `tell_id` fires. Pure: the same
/// arguments give the same board.
pub type HookFn = fn(&Board, u8, u64) -> Board;

/// `conversions(board)`: the marbles that change side at the end of a turn, `[to the player, to
/// the boss]`.
pub type ConversionsFn = fn(&Board) -> [u8; 2];

/// A boss: data plus pure hook functions.
#[derive(Clone, Debug)]
pub struct BossDef {
    pub name: &'static str,
    /// Phase `n` starts when the boss has at most `phase_marbles[n - 1]` marbles, highest first.
    pub phase_marbles: Vec<u8>,
    /// Or when the player has ejected at least `phase_ejections[n - 1]` boss marbles, lowest
    /// first (The Alien, whose brood grows). A boss uses one of the two.
    pub phase_ejections: Vec<u8>,
    pub special: SpecialFn,
    pub hook: HookFn,
    /// Conversions of the board before the hook, `[to the player, to the boss]`, that move the
    /// player's ejection credit: +1 each way down to 0 (The Chaplain). `None` for the other bosses.
    pub conversions: Option<ConversionsFn>,
    /// Positions the boss search may visit per move. Never a clock.
    pub node_budget: u32,
}

/// How a finished encounter ended, for the player.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PveResult {
    Won,
    Lost,
}

/// A game against a boss. The player is Black, the boss is White.
#[derive(Clone, Debug)]
pub struct Encounter {
    game: Game,
    boss: BossDef,
    seed: u64,
    /// The repulsions of the last ply, in order (The Magnetizer).
    repulsions: Vec<Repulsion>,
    /// The cells whose polarity the last ply's hook set, before the board settled again.
    assigned: Vec<(i32, i32)>,
    /// The board just before the last ply's hook and the special id it fired with.
    hooked: Option<(Board, u8)>,
    /// The seed the last ply's hook ran with.
    hook_seed: u64,
    /// The marbles the last ply's hook removed, with what they were (The Overseer's burns).
    removed: Vec<((i32, i32), Cell)>,
    /// Player turns before the boss wins, for a fight on a clock (The Overseer's neurotoxin).
    turn_limit: Option<u32>,
    /// Count the marbles a hook removes by colour, when it flips none (The Ballast Mind borrows
    /// the Pulsar's pulse, which moves marbles).
    by_colour: bool,
    /// The highest phase reached: a boss that converts (The Chaplain) heals, and its phase stays.
    phase_reached: usize,
    /// Each main move gives the other side its mirror as a bonus move (The Echo).
    echo: bool,
    /// The free moves the Echo's last move offers the player, until a main move (The Echo).
    offer: Vec<Move>,
    /// The plies that were free moves the player took (The Echo).
    free_taken: usize,
    /// The player sees only what is near their marbles (The Stalker).
    stalker: bool,
    /// The boss marbles a refused move revealed, until the player's next played move (The Stalker).
    revealed: Vec<(i32, i32)>,
}

/// Marbles of `color` on `board`.
pub fn marbles(board: &Board, color: Cell) -> u8 {
    let mut n = 0;
    let radius = board.radius();
    for q in -radius..=radius {
        for r in -radius..=radius {
            n += u8::from(board.get(q, r) == Some(color));
        }
    }
    n
}

/// The marbles a hook removed and what they were, in `q` then `r` order: their cell is now empty
/// or gone. A flip keeps the marble and removes nothing (rules.md OPEN-13).
fn removed(before: &Board, after: &Board) -> Vec<((i32, i32), Cell)> {
    let mut out = Vec::new();
    let radius = before.radius();
    for q in -radius..=radius {
        for r in -radius..=radius {
            let gone = matches!(after.get(q, r), Some(Cell::Empty) | None);
            match before.get(q, r) {
                Some(cell @ (Cell::Black | Cell::White | Cell::Core)) if gone => {
                    out.push(((q, r), cell));
                }
                _ => {}
            }
        }
    }
    out
}

/// The removed marbles that count for the boss (Black) and for the player (White, and a core).
fn removals(removed: &[((i32, i32), Cell)]) -> [u8; 2] {
    let black = removed.iter().filter(|m| m.1 == Cell::Black).count() as u8;
    [black, removed.len() as u8 - black]
}

/// Black and White marbles fewer on `after` than on `before`.
pub(crate) fn losses(before: &Board, after: &Board) -> [u8; 2] {
    [Cell::Black, Cell::White].map(|c| marbles(before, c) - marbles(after, c))
}

/// `true` when neither side has more marbles on `after` than on `before`: no flip, no hatch.
fn no_gain(before: &Board, after: &Board) -> bool {
    [Cell::Black, Cell::White]
        .into_iter()
        .all(|c| marbles(after, c) <= marbles(before, c))
}

/// Where `marks` sit after `mv`: marks on moved or pushed marbles shift one step, in order.
pub(crate) fn carried_marks(board: &Board, mv: &Move, marks: &[(i32, i32)]) -> Vec<(i32, i32)> {
    let (dq, dr) = mv.dir.vector();
    let mut moved = mv.cells.clone();
    for &(q, r) in &mv.cells {
        if !mv.cells.contains(&(q + dq, r + dr)) {
            let mut cell = (q + dq, r + dr);
            while matches!(board.get(cell.0, cell.1), Some(Cell::Black | Cell::White)) {
                moved.push(cell);
                cell = (cell.0 + dq, cell.1 + dr);
            }
        }
    }
    marks
        .iter()
        .map(|&(q, r)| {
            if moved.contains(&(q, r)) {
                (q + dq, r + dr)
            } else {
                (q, r)
            }
        })
        .collect()
}

/// The Chaplain's martyr after `mv`: its cell follows a move or a push, and it is spent once that
/// cell holds no boss marble any more (pushed off the board).
fn carried_martyr(before: &Board, mv: &Move, board: &Board) -> Option<Option<(i32, i32)>> {
    before.martyr().map(|cell| {
        let (q, r) = carried_marks(before, mv, &[cell?])[0];
        (board.get(q, r) == Some(Cell::White)).then_some((q, r))
    })
}

/// The seed of the hooks that run at the end of ply `ply` of the fight `seed`.
pub(crate) fn ply_seed(seed: u64, ply: u64) -> u64 {
    seed ^ ply.wrapping_mul(0x9E37_79B9_7F4A_7C15)
}

fn no_special(_ply: u32, _phase: usize) -> Option<u8> {
    None
}

fn keep_board(board: &Board, _id: u8, _seed: u64) -> Board {
    board.clone()
}

/// Boss with no special rule and one phase change, to prove the framework.
pub fn trivial_boss() -> BossDef {
    BossDef {
        name: "Trivial",
        phase_marbles: vec![10],
        phase_ejections: Vec::new(),
        special: no_special,
        hook: keep_board,
        conversions: None,
        node_budget: 200,
    }
}

impl Encounter {
    pub fn new(game: Game, boss: BossDef, seed: u64) -> Self {
        Self {
            game,
            boss,
            seed,
            repulsions: Vec::new(),
            assigned: Vec::new(),
            hooked: None,
            hook_seed: 0,
            removed: Vec::new(),
            turn_limit: None,
            by_colour: false,
            phase_reached: 0,
            echo: false,
            offer: Vec::new(),
            free_taken: 0,
            stalker: false,
            revealed: Vec::new(),
        }
    }

    /// The same fight, where each move gives the other side its mirror as a bonus move.
    pub fn echoing(mut self) -> Self {
        self.echo = true;
        self
    }

    /// The same fight, whose hooks' losses count by colour as long as no marble flips.
    pub fn counting_by_colour(mut self) -> Self {
        self.by_colour = true;
        self
    }

    /// The board just before the last ply's hook and the special id it fired with, `None` when the
    /// last ply fired no hook (The Pulsar draws its pulse from it).
    pub fn hooked(&self) -> Option<&(Board, u8)> {
        self.hooked.as_ref()
    }

    /// The seed the last ply's hook ran with, to replay its picks (The Unstable Core's shockwave).
    pub fn hook_seed(&self) -> u64 {
        self.hook_seed
    }

    /// The same fight, lost by the player at the end of its `turns`-th turn when it has not won.
    pub fn with_turn_limit(mut self, turns: u32) -> Self {
        self.turn_limit = Some(turns);
        self
    }

    /// Player turns left before the boss wins on the clock, `None` for a fight with no clock.
    pub fn turns_left(&self) -> Option<u32> {
        let played = (self.game.history().len() as u32).div_ceil(2);
        self.turn_limit.map(|n| n.saturating_sub(played))
    }

    /// The marbles the last ply's hook removed, with what they were, in `q` then `r` order.
    pub fn removed(&self) -> &[((i32, i32), Cell)] {
        &self.removed
    }

    /// The repulsions of the last ply, in the order they happened (The Magnetizer).
    pub fn repulsions(&self) -> &[Repulsion] {
        &self.repulsions
    }

    /// The cells of the player marbles that got a polarity at the end of the last ply.
    pub fn assigned(&self) -> &[(i32, i32)] {
        &self.assigned
    }

    pub fn game(&self) -> &Game {
        &self.game
    }

    /// Current phase, 0 at the start.
    pub fn phase(&self) -> usize {
        let left = marbles(self.game.board(), Cell::White);
        self.phase_of(left, self.game.ejected(Player::Black))
    }

    /// The phase once the fight reaches `board` from now, for a ply of the boss search tree: the
    /// player is credited its ejections now plus the boss marbles missing from `board`, and the
    /// phase never goes below the current one. Pure. It holds only for a boss whose marbles leave
    /// the board by ejection alone: no conversion (The Chaplain) and no brood (The Alien).
    pub fn phase_after(&self, board: &Board) -> usize {
        let root = marbles(self.game.board(), Cell::White);
        let left = marbles(board, Cell::White);
        let ejected = self.game.ejected(Player::Black);
        let now = self.phase_of(root, ejected);
        let gone = root.saturating_sub(left);
        self.phase_of(left, ejected + gone).max(now)
    }

    /// The phase with `left` boss marbles on the board and `ejected` credited to the player.
    fn phase_of(&self, left: u8, ejected: u8) -> usize {
        let by_marbles = self.boss.phase_marbles.iter().filter(|&&t| left <= t);
        let by_ejections = self.boss.phase_ejections.iter().filter(|&&t| ejected >= t);
        (by_marbles.count() + by_ejections.count()).max(self.phase_reached)
    }

    /// The special that fires right after the next ply, visible one ply ahead.
    pub fn tell(&self) -> Option<u8> {
        if self.game.outcome().is_some() {
            return None;
        }
        (self.boss.special)(self.game.history().len() as u32 + 1, self.phase())
    }

    /// Plays `mv` for the side to move, then settles the polarities, then fires the hook when the
    /// tell announced it and settles again.
    pub fn play(&mut self, mv: &Move) -> Result<(), GameError> {
        if self.echo && echo::take_free(self, mv) {
            return Ok(());
        }
        self.latch_phase();
        if self.stalker {
            stalker::refuse(self, mv)?;
        }
        dual::refuse(self.game.board(), self.game.to_move(), mv)?;
        let told = self.tell();
        let before = self.game.board().clone();
        self.game.play(mv)?;
        self.revealed.clear();
        self.carry_marks(&before, mv);
        self.repulsions.clear();
        self.assigned.clear();
        self.hooked = None;
        self.removed.clear();
        let ply = self.game.history().len() as u64;
        let seed = ply_seed(self.seed, ply);
        self.settle(seed);
        if let (Some(id), None) = (told, self.game.outcome()) {
            let board = (self.boss.hook)(self.game.board(), id, seed);
            let poles = self.game.board().polarities();
            self.assigned = board
                .polarities()
                .iter()
                .filter(|p| !poles.contains(p))
                .map(|&(c, _)| c)
                .collect();
            self.credit_removals(&board);
            if let Some(conversions) = self.boss.conversions {
                let [to_player, to_boss] = conversions(self.game.board());
                self.game
                    .credit_conversions(Player::Black, to_player, to_boss);
            }
            self.hooked = Some((self.game.board().clone(), id));
            self.hook_seed = seed;
            self.game.replace_board(board);
            self.settle(!seed);
        }
        if self.turns_left() == Some(0) && self.game.to_move() == Player::White {
            self.game.end(Player::White);
        }
        self.end_when_wiped();
        if self.echo {
            echo::play_bonuses(self, mv);
        }
        self.latch_phase();
        Ok(())
    }

    /// Keeps the highest phase reached, for a boss that heals through conversions.
    fn latch_phase(&mut self) {
        if self.boss.conversions.is_some() {
            self.phase_reached = self.phase();
        }
    }

    /// A side with no marble left has no move and loses (a conversion can wipe either side).
    fn end_when_wiped(&mut self) {
        let (cell, winner) = match self.game.to_move() {
            Player::Black => (Cell::Black, Player::White),
            Player::White => (Cell::White, Player::Black),
        };
        if marbles(self.game.board(), cell) == 0 {
            self.game.end(winner);
        }
    }

    /// Keeps the converted marks that still sit on a White marble after `mv`, and the polarities
    /// and the announce on a Black one.
    fn carry_marks(&mut self, before: &Board, mv: &Move) {
        let board = self.game.board();
        let kept: Vec<_> = carried_marks(before, mv, before.converted())
            .into_iter()
            .filter(|&(q, r)| board.get(q, r) == Some(Cell::White))
            .collect();
        let poles = carried_poles(before, mv, board);
        let announce = carried_announce(before, mv, board);
        let unstable = carried_unstable(before, mv, board);
        let martyr = carried_martyr(before, mv, board);
        let dual = carried_dual(before, mv, board);
        if kept != board.converted()
            || poles != board.polarities()
            || announce != board.announce()
            || unstable.as_ref() != board.unstable()
            || martyr != board.martyr()
            || dual != board.dual()
        {
            let mut next = board.clone();
            next.set_martyr(martyr);
            next.set_converted(kept);
            next.set_polarities(poles);
            next.set_announce(announce);
            next.set_unstable(unstable);
            next.set_dual(dual);
            self.game.replace_board(next);
        }
    }

    /// Repels the pairs of opposite polarities until none is left, while the game runs, and
    /// credits the ejections.
    fn settle(&mut self, seed: u64) {
        if self.game.outcome().is_some() {
            return;
        }
        let mut seen = Vec::new();
        let (board, credits) = settle(self.game.board(), seed, &mut |b, pair| {
            seen.push(Repulsion {
                pair,
                before: b.clone(),
            });
        });
        if seen.is_empty() {
            return;
        }
        self.game.replace_board(board);
        self.game.credit(Player::Black, credits[0]);
        self.game.credit(Player::White, credits[1]);
        self.repulsions.extend(seen);
    }

    /// A marble a hook removed counts for the opponent of its colour, a core for the player (The
    /// Overseer). A pulse (The Pulsar) or a belt (The Assembly Line) moves marbles and flips none, so
    /// their losses are counted by colour, and so are The Unstable Core's overloads, collapse and
    /// shockwaves.
    fn credit_removals(&mut self, after: &Board) {
        let before = self.game.board();
        let colour = before.pulsar().is_some()
            || before.belts().is_some()
            || before.unstable().is_some()
            || (self.by_colour && no_gain(before, after));
        let [lost_black, lost_white] = if colour {
            losses(before, after)
        } else {
            self.removed = removed(before, after);
            removals(&self.removed)
        };
        self.game.credit(Player::White, lost_black);
        self.game.credit(Player::Black, lost_white);
    }

    /// The boss search for its turn: node-limited by the boss budget, `None` on the player's turn
    /// or when the game is over.
    pub fn boss_search(&self) -> Option<SearchResult> {
        if self.game.to_move() != Player::White {
            return None;
        }
        search(&self.game, self.boss.node_budget)
    }

    /// The same search for the player's turn (auto-play, #792): `None` on the boss's turn or when
    /// the game is over.
    pub fn player_search(&self) -> Option<SearchResult> {
        if self.game.to_move() != Player::Black {
            return None;
        }
        search(&self.game, self.boss.node_budget)
    }

    /// Scales the boss node budget by a percentage (e.g. 50, 100, 200). Minimum is 1.
    pub fn scale_node_budget(&mut self, percent: u32) {
        self.boss.node_budget = (self.boss.node_budget as u64 * percent as u64 / 100).max(1) as u32;
    }

    /// `None` while the game runs. A draw is a loss for the player.
    pub fn result(&self) -> Option<PveResult> {
        self.game.outcome().map(|o| match o {
            Outcome::Win(Player::Black) => PveResult::Won,
            _ => PveResult::Lost,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::MAX_RADIUS;
    use crate::moves::Direction::{E, NE, SW, W};
    use crate::moves::{legal_moves, Direction, Player};

    type P = (i32, i32);

    fn cells_of(board: &Board, color: Cell) -> Vec<P> {
        let mut out = Vec::new();
        for q in -MAX_RADIUS..=MAX_RADIUS {
            for r in -MAX_RADIUS..=MAX_RADIUS {
                if board.get(q, r) == Some(color) {
                    out.push((q, r));
                }
            }
        }
        out
    }

    fn position(black: &[P], white: &[P], to_move: Player, ejected: [u8; 2]) -> Game {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        Game::from_position(board, to_move, ejected)
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    /// Removes the White marble picked by the seed.
    fn clear_white(board: &Board, _id: u8, seed: u64) -> Board {
        let whites = cells_of(board, Cell::White);
        let (q, r) = whites[(seed as usize) % whites.len()];
        let mut out = board.clone();
        out.set(q, r, Cell::Empty);
        out
    }

    /// Fires special 7 at the end of every third ply.
    fn every_third(ply: u32, _phase: usize) -> Option<u8> {
        ply.is_multiple_of(3).then_some(7)
    }

    fn every_ply(_ply: u32, _phase: usize) -> Option<u8> {
        Some(1)
    }

    fn boss(special: SpecialFn) -> BossDef {
        BossDef {
            name: "test",
            phase_marbles: vec![],
            phase_ejections: Vec::new(),
            special,
            hook: clear_white,
            conversions: None,
            node_budget: 200,
        }
    }

    /// Moves the first White marble one cell east and removes the second one.
    fn shift_and_drop(board: &Board, _id: u8, _seed: u64) -> Board {
        let whites = cells_of(board, Cell::White);
        let mut out = board.clone();
        out.set(whites[0].0, whites[0].1, Cell::Empty);
        out.set(whites[0].0 + 1, whites[0].1, Cell::White);
        out.set(whites[1].0, whites[1].1, Cell::Empty);
        out
    }

    /// Flips the first Black marble to White.
    fn flip_black(board: &Board, _id: u8, _seed: u64) -> Board {
        let (q, r) = cells_of(board, Cell::Black)[0];
        let mut out = board.clone();
        out.set(q, r, Cell::White);
        out
    }

    fn counting_encounter(hook: HookFn, by_colour: bool) -> Encounter {
        let game = position(&[(0, 3), (0, 2)], &[(-3, 0), (3, 0)], Player::Black, [0, 0]);
        let mut boss = boss(every_ply);
        boss.hook = hook;
        let enc = Encounter::new(game, boss, 0);
        if by_colour {
            enc.counting_by_colour()
        } else {
            enc
        }
    }

    #[test]
    fn a_hook_that_moves_marbles_counts_its_losses_by_colour_when_asked() {
        let mut plain = counting_encounter(shift_and_drop, false);
        plain.play(&mv(&[(0, 3)], E)).unwrap();
        assert_eq!(
            plain.game().ejected(Player::Black),
            2,
            "the moved marble counts"
        );
        let mut coloured = counting_encounter(shift_and_drop, true);
        coloured.play(&mv(&[(0, 3)], E)).unwrap();
        assert_eq!(coloured.game().ejected(Player::Black), 1);
        assert_eq!(coloured.game().ejected(Player::White), 0);
    }

    #[test]
    fn a_flip_credits_nothing_even_when_counting_by_colour() {
        let mut enc = counting_encounter(flip_black, true);
        enc.play(&mv(&[(0, 3)], E)).unwrap();
        assert_eq!(marbles(enc.game().board(), Cell::White), 3);
        assert_eq!(enc.game().ejected(Player::Black), 0);
        assert_eq!(enc.game().ejected(Player::White), 0);
    }

    #[test]
    fn ply_seed_is_the_fight_seed_mixed_with_the_ply() {
        assert_eq!(ply_seed(5, 0), 5);
        assert_ne!(ply_seed(5, 1), ply_seed(5, 2));
        assert_ne!(ply_seed(5, 1), ply_seed(6, 1));
    }

    fn step(enc: &mut Encounter) {
        let m = legal_moves(enc.game().board(), enc.game().to_move())[0].clone();
        enc.play(&m).unwrap();
    }

    fn white_count(enc: &Encounter) -> u8 {
        marbles(enc.game().board(), Cell::White)
    }

    #[test]
    fn marbles_counts_one_color() {
        let board = Board::standard();
        assert_eq!(marbles(&board, Cell::Black), 14);
        assert_eq!(marbles(&board, Cell::Empty), 33);
    }

    #[test]
    fn trivial_boss_has_one_phase_change_and_no_special() {
        let b = trivial_boss();
        assert_eq!(b.phase_marbles, vec![10]);
        assert_eq!((b.special)(1, 0), None);
        let board = Board::standard();
        assert_eq!((b.hook)(&board, 0, 0), board);
    }

    #[test]
    fn phase_changes_at_the_marble_count() {
        let game = position(&[(2, 0), (3, 0)], &[(4, 0), (-4, 4)], Player::Black, [0, 0]);
        let mut b = trivial_boss();
        b.phase_marbles = vec![1];
        let mut enc = Encounter::new(game, b, 0);
        assert_eq!(enc.phase(), 0);
        enc.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(white_count(&enc), 1);
        assert_eq!(enc.phase(), 1);
    }

    /// A fight on `white` boss marbles with `ejected` credited to the player, P2 at 3, P3 at 5.
    fn by_ejections(white: &[P], ejected: u8) -> Encounter {
        let mut b = trivial_boss();
        b.phase_marbles = Vec::new();
        b.phase_ejections = vec![3, 5];
        let game = position(&[(0, 0)], white, Player::White, [ejected, 0]);
        Encounter::new(game, b, 0)
    }

    #[test]
    fn the_phase_after_a_board_credits_the_boss_marbles_gone_since_the_root() {
        let three = [(4, 0), (-4, 4), (0, -4)];
        let one_gone = position(&[(0, 0)], &three[..2], Player::White, [0, 0]);
        let root = by_ejections(&three, 0);
        assert_eq!(root.phase_after(root.game().board()), 0, "nothing gone");
        assert_eq!(root.phase_after(one_gone.board()), 0, "1 of 3");
        let root = by_ejections(&three, 2);
        assert_eq!(root.phase(), 0);
        assert_eq!(root.phase_after(one_gone.board()), 1, "2 + 1: P2 at 3");
        let root = by_ejections(&three, 4);
        assert_eq!(root.phase_after(one_gone.board()), 2, "4 + 1: P3 at 5");
    }

    #[test]
    fn the_phase_after_a_board_is_never_below_the_root_phase() {
        let root = by_ejections(&[(4, 0)], 3);
        assert_eq!(root.phase(), 1);
        assert_eq!(root.phase_after(root.game().board()), 1);
        let more = position(&[(0, 0)], &[(4, 0), (-4, 4)], Player::White, [0, 0]);
        assert_eq!(
            root.phase_after(more.board()),
            1,
            "more boss marbles than the root: no underflow"
        );
    }

    #[test]
    fn phase_stays_zero_above_the_threshold() {
        let enc = Encounter::new(Game::new(), trivial_boss(), 0);
        assert_eq!(enc.phase(), 0);
    }

    #[test]
    fn tell_is_set_one_ply_before_the_special_fires() {
        let mut enc = Encounter::new(Game::new(), boss(every_third), 0);
        let mut told = Vec::new();
        let mut fired = Vec::new();
        for _ in 0..6 {
            let before = white_count(&enc);
            told.push(enc.tell());
            step(&mut enc);
            fired.push(white_count(&enc) < before);
        }
        assert_eq!(
            told,
            vec![None, None, Some(7), None, None, Some(7)],
            "tell shows exactly one ply ahead"
        );
        assert_eq!(fired, vec![false, false, true, false, false, true]);
        assert_eq!(enc.game().outcome(), None);
    }

    #[test]
    fn hook_is_deterministic_for_the_same_seed() {
        let run = |seed| {
            let mut enc = Encounter::new(Game::new(), boss(every_third), seed);
            for _ in 0..6 {
                step(&mut enc);
            }
            enc.game().board().clone()
        };
        assert_eq!(run(5), run(5));
        let boards: Vec<Board> = (0..8).map(run).collect();
        assert!(
            boards.iter().any(|b| *b != boards[0]),
            "seed changes the hook"
        );
    }

    #[test]
    fn pve_draw_is_a_loss_for_the_player() {
        let game = position(&[(0, 0)], &[(4, -4)], Player::Black, [0, 0]);
        let mut enc = Encounter::new(game, trivial_boss(), 0);
        let cycle = [
            mv(&[(0, 0)], E),
            mv(&[(4, -4)], SW),
            mv(&[(1, 0)], W),
            mv(&[(3, -3)], NE),
        ];
        for m in cycle.iter().cycle().take(8) {
            assert_eq!(enc.result(), None);
            enc.play(m).unwrap();
        }
        assert_eq!(enc.game().outcome(), Some(crate::game::Outcome::Draw));
        assert_eq!(enc.result(), Some(PveResult::Lost));
    }

    #[test]
    fn player_win_is_a_win_and_ends_the_tell() {
        let game = position(&[(2, 0), (3, 0)], &[(4, 0), (-4, 4)], Player::Black, [5, 0]);
        let mut enc = Encounter::new(game, boss(every_ply), 0);
        assert_eq!(enc.tell(), Some(1));
        enc.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
        assert_eq!(enc.tell(), None);
        assert_eq!(white_count(&enc), 1, "no hook after the game ended");
        assert!(enc.boss_search().is_none());
    }

    #[test]
    fn boss_win_is_a_loss() {
        let game = position(
            &[(-4, 0), (3, 3)],
            &[(-2, 0), (-3, 0)],
            Player::White,
            [0, 5],
        );
        let mut enc = Encounter::new(game, trivial_boss(), 0);
        enc.play(&mv(&[(-2, 0), (-3, 0)], W)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Lost));
    }

    #[test]
    fn refused_move_changes_nothing() {
        let mut enc = Encounter::new(Game::new(), boss(every_ply), 0);
        let bad = mv(&[(0, 0)], E);
        assert!(enc.play(&bad).is_err());
        assert_eq!(enc.game().history().len(), 0);
        assert_eq!(white_count(&enc), 14);
    }

    #[test]
    fn boss_move_is_legal_and_uses_the_node_budget() {
        for budget in [30, 300] {
            let mut b = trivial_boss();
            b.node_budget = budget;
            let mut enc = Encounter::new(Game::new(), b, 0);
            assert!(enc.boss_search().is_none(), "player's turn");
            step(&mut enc);
            let found = enc.boss_search().unwrap();
            assert!(found.nodes > 0 && found.nodes <= budget);
            let legal = legal_moves(enc.game().board(), Player::White);
            assert!(legal.contains(&found.mv));
            assert_eq!(enc.boss_search(), Some(found), "same position, same move");
        }
    }

    #[test]
    fn player_move_is_legal_and_uses_the_node_budget() {
        for budget in [30, 300] {
            let mut b = trivial_boss();
            b.node_budget = budget;
            let mut enc = Encounter::new(Game::new(), b, 0);
            let found = enc.player_search().unwrap();
            assert!(found.nodes > 0 && found.nodes <= budget);
            assert!(legal_moves(enc.game().board(), Player::Black).contains(&found.mv));
            step(&mut enc);
            assert!(enc.player_search().is_none(), "boss's turn");
        }
    }

    #[test]
    fn scale_node_budget_scales_the_budget_proportionally() {
        let mut enc = Encounter::new(Game::new(), trivial_boss(), 0);
        assert_eq!(enc.boss.node_budget, 200);
        enc.scale_node_budget(50);
        assert_eq!(enc.boss.node_budget, 100);
        enc.scale_node_budget(200);
        assert_eq!(enc.boss.node_budget, 200);
        enc.scale_node_budget(0);
        assert_eq!(enc.boss.node_budget, 1, "floor of 1");
    }

    fn clear_black(board: &Board, _id: u8, _seed: u64) -> Board {
        let mut out = board.clone();
        let (q, r) = cells_of(board, Cell::Black)[0];
        out.set(q, r, Cell::Empty);
        out
    }

    fn flip_white(board: &Board, _id: u8, _seed: u64) -> Board {
        let mut out = board.clone();
        let (q, r) = cells_of(board, Cell::White)[0];
        out.set(q, r, Cell::Black);
        out
    }

    fn boss_with(hook: HookFn) -> BossDef {
        BossDef {
            hook,
            ..boss(every_ply)
        }
    }

    #[test]
    fn hook_removing_a_marble_credits_the_opponent() {
        let mut enc = Encounter::new(Game::new(), boss_with(clear_white), 0);
        step(&mut enc);
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(enc.game().ejected(Player::White), 0);
        let mut enc = Encounter::new(Game::new(), boss_with(clear_black), 0);
        step(&mut enc);
        assert_eq!(enc.game().ejected(Player::White), 1);
        assert_eq!(enc.game().ejected(Player::Black), 0);
    }

    #[test]
    fn hook_flip_is_not_an_ejection() {
        let mut enc = Encounter::new(Game::new(), boss_with(flip_white), 0);
        step(&mut enc);
        assert_eq!(white_count(&enc), 13);
        assert_eq!(enc.game().ejected(Player::Black), 0);
        assert_eq!(enc.game().ejected(Player::White), 0);
    }

    /// Flips the first White marble to Black and removes the second one.
    fn flip_one_remove_one(board: &Board, _id: u8, _seed: u64) -> Board {
        let whites = cells_of(board, Cell::White);
        let mut out = board.clone();
        out.set(whites[0].0, whites[0].1, Cell::Black);
        out.set(whites[1].0, whites[1].1, Cell::Empty);
        out
    }

    #[test]
    fn hook_flip_and_removal_credit_only_the_removal() {
        let mut enc = Encounter::new(Game::new(), boss_with(flip_one_remove_one), 0);
        step(&mut enc);
        assert_eq!(enc.game().ejected(Player::Black), 1);
        assert_eq!(enc.game().ejected(Player::White), 0);
    }

    #[test]
    fn hook_removal_can_win_the_game() {
        let game = position(&[(0, 0)], &[(4, -4), (3, -4)], Player::Black, [5, 0]);
        let mut enc = Encounter::new(game, boss_with(clear_white), 0);
        enc.play(&mv(&[(0, 0)], E)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
    }
    /// Fills (4,-3) with a Black marble: a White marble in the corner is walled in.
    fn wall_in(board: &Board, _id: u8, _seed: u64) -> Board {
        let mut out = board.clone();
        out.set(4, -3, Cell::Black);
        out
    }

    #[test]
    fn a_side_the_hook_walls_in_passes_after_the_hook() {
        let game = position(
            &[(3, -4), (3, -3), (-4, 4)],
            &[(4, -4)],
            Player::Black,
            [0, 0],
        );
        let mut boss = boss(every_ply);
        boss.hook = wall_in;
        let mut enc = Encounter::new(game, boss, 0);
        enc.play(&mv(&[(-4, 4)], E)).unwrap();
        assert_eq!(enc.game().to_move(), Player::Black, "the boss passed");
        assert_eq!(enc.game().passed(), Some(Player::White));
        assert_eq!(enc.result(), None);
        assert_eq!(enc.boss_search(), None);
        assert!(enc.player_search().is_some());
    }

    #[test]
    fn a_side_with_no_marble_left_loses() {
        // Black's pair pushes the lone White marble off the rim: White has none left.
        let game = position(&[(2, 0), (3, 0)], &[(4, 0)], Player::Black, [0, 0]);
        let mut enc = Encounter::new(game, boss(no_special), 0);
        enc.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Won));
        // White's pair pushes the lone Black marble off: Black has none left.
        let game = position(&[(4, 0)], &[(2, 0), (3, 0)], Player::White, [0, 0]);
        let mut enc = Encounter::new(game, boss(no_special), 0);
        enc.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(enc.result(), Some(PveResult::Lost));
        // A side that still has a marble plays on.
        let game = position(
            &[(2, 0), (3, 0), (0, 3)],
            &[(4, 0), (0, -3)],
            Player::Black,
            [0, 0],
        );
        let mut enc = Encounter::new(game, boss(no_special), 0);
        enc.play(&mv(&[(2, 0), (3, 0)], E)).unwrap();
        assert_eq!(enc.result(), None);
    }
}
