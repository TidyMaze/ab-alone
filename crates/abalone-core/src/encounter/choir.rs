//! The Choir (#44, #747, docs/specs/game-design.md section 7.2): three boss armies of six marbles,
//! Alto, Tenor and Bass, in triangles on the standard board. Only one army moves per boss turn, in
//! a fixed cycle, and the army that moves next is the tell. Which army owns which boss marble
//! lives in [`Choir`], next to the encounter, and follows every move and push.
//!
//! P1: three armies. P2 (3 ejections) and P3 (5 ejections): the army with the fewest marbles left
//! is removed at once, not counted as an ejection (a tie is broken by the fight seed). In P3 the
//! last army plays two moves each boss turn.

use crate::board::{Board, Cell};
use crate::encounter::hull::mix;
use crate::encounter::{carried_marks, BossDef, Encounter, PveResult};
use crate::game::{Game, GameError};
use crate::moves::{legal_moves, Move, Player};
use crate::search::{search_with, Weights};

type P = (i32, i32);

/// Marbles per boss army.
pub const ARMY_SIZE: usize = 6;
/// Alto start: the left triangle, pointing up (one marble at the top, three at the bottom).
pub const ALTO_START: [P; ARMY_SIZE] = [(-1, -3), (-2, -2), (-1, -2), (-3, -1), (-2, -1), (-1, -1)];
/// Tenor start: the middle triangle, pointing down.
pub const TENOR_START: [P; ARMY_SIZE] = [(1, -4), (2, -4), (3, -4), (1, -3), (2, -3), (1, -2)];
/// Bass start: the right triangle, pointing up.
pub const BASS_START: [P; ARMY_SIZE] = [(4, -3), (3, -2), (4, -2), (2, -1), (3, -1), (4, -1)];
/// Ejections that start P2 and P3: the weakest army is removed at each. TUNE.
pub const PHASE_EJECTIONS: [u8; 2] = [3, 5];
/// The phase (0 based) where the last army plays twice each boss turn.
pub const LAST_PHASE: usize = 2;
/// Positions the boss search may visit per move. TUNE.
pub const CHOIR_NODE_BUDGET: u32 = 1500;

/// Alto pushes: ejections count triple. TUNE.
pub const ALTO_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 150,
    centre: 3,
    cohesion: 2,
    threat: 0,
    egg: 0,
};
/// Tenor flanks: pressing the opponent towards the edge counts a lot. TUNE.
pub const TENOR_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 50,
    centre: 20,
    cohesion: 2,
    threat: 0,
    egg: 0,
};
/// Bass anchors: staying in one cluster counts a lot. TUNE.
pub const BASS_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 50,
    centre: 3,
    cohesion: 20,
    threat: 0,
    egg: 0,
};

/// One boss army.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Army {
    Alto,
    Tenor,
    Bass,
}

/// The fixed cycle of the armies.
pub const CYCLE: [Army; 3] = [Army::Alto, Army::Tenor, Army::Bass];

impl Army {
    /// Where the army starts.
    pub fn start(self) -> [P; ARMY_SIZE] {
        match self {
            Army::Alto => ALTO_START,
            Army::Tenor => TENOR_START,
            Army::Bass => BASS_START,
        }
    }

    /// The evaluation weights of the army, its style.
    pub fn weights(self) -> Weights {
        match self {
            Army::Alto => ALTO_WEIGHTS,
            Army::Tenor => TENOR_WEIGHTS,
            Army::Bass => BASS_WEIGHTS,
        }
    }

    fn index(self) -> usize {
        CYCLE.iter().position(|&a| a == self).expect("in the cycle")
    }
}

/// Why [`Choir::play`] refused a move.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChoirError {
    /// The game refused it (game over, illegal move).
    Game(GameError),
    /// A boss move that uses a marble of an army that is not in turn.
    WrongArmy,
}

/// A game against the Choir. The player is Black and moves first, the boss is White.
#[derive(Clone, Debug)]
pub struct Choir {
    enc: Encounter,
    /// Boss marble cell and its army, kept through every move and push.
    members: Vec<(P, Army)>,
    /// Index in [`CYCLE`] of the army that moves next, before wiped armies are skipped.
    cycle_pos: usize,
    /// The last army has played the first of its two moves this boss turn.
    second_move: bool,
    /// The army the last ply removed and the cells it stood on (the sinking animation).
    last_removal: Option<(Army, Vec<P>)>,
}

impl Choir {
    /// The start layout: the standard board with 14 player marbles and 18 boss marbles in three
    /// armies. The `seed` breaks the ties between armies for the removal.
    pub fn start(seed: u64) -> Self {
        let mut board = Board::standard();
        for q in -4..=4 {
            for r in -4..=4 {
                if board.get(q, r) == Some(Cell::White) {
                    board.set(q, r, Cell::Empty);
                }
            }
        }
        let mut members = Vec::new();
        for army in CYCLE {
            for cell in army.start() {
                board.set(cell.0, cell.1, Cell::White);
                members.push((cell, army));
            }
        }
        Self::from_position(
            Game::from_position(board, Player::Black, [0, 0]),
            members,
            seed,
        )
    }

    /// A fight resumed from a position: `members` are the boss marbles with their army.
    pub fn from_position(game: Game, members: Vec<(P, Army)>, seed: u64) -> Self {
        Self {
            enc: Encounter::new(game, choir_boss(), seed),
            members,
            cycle_pos: 0,
            second_move: false,
            last_removal: None,
        }
    }

    pub fn game(&self) -> &Game {
        self.enc.game()
    }

    /// `None` while the game runs. A draw is a loss for the player.
    pub fn result(&self) -> Option<PveResult> {
        self.enc.result()
    }

    /// The army that owns the boss marble on `cell`.
    pub fn army_at(&self, cell: P) -> Option<Army> {
        self.members.iter().find(|m| m.0 == cell).map(|m| m.1)
    }

    /// Marbles `army` has left.
    pub fn army_marbles(&self, army: Army) -> u8 {
        self.members.iter().filter(|m| m.1 == army).count() as u8
    }

    /// The army the last ply removed and the cells it stood on, `None` when it removed none.
    pub fn last_removal(&self) -> Option<&(Army, Vec<P>)> {
        self.last_removal.as_ref()
    }

    /// `true` when `army` has at least one move it may play.
    fn can_move(&self, army: Army) -> bool {
        legal_moves(self.game().board(), Player::White)
            .iter()
            .any(|mv| mv.cells.iter().all(|&c| self.army_at(c) == Some(army)))
    }

    /// The army in turn: the next of the cycle that has marbles and a move it may play (#172).
    /// An army boxed in is skipped like a removed one. When no army can move, the next one with
    /// marbles: the boss then passes (see [`Choir::play`]). On the player's turn this reads the
    /// board as it is, so the tell can change with the player's move.
    fn army_in_turn(&self) -> Army {
        let from = |i: usize| CYCLE[(self.cycle_pos + i) % CYCLE.len()];
        (0..CYCLE.len())
            .map(from)
            .find(|&a| self.army_marbles(a) > 0 && self.can_move(a))
            .or_else(|| {
                (0..CYCLE.len())
                    .map(from)
                    .find(|&a| self.army_marbles(a) > 0)
            })
            .unwrap_or(CYCLE[self.cycle_pos])
    }

    /// The army that moves next, the tell. `None` when the game is over.
    pub fn tell(&self) -> Option<Army> {
        self.game().outcome().is_none().then(|| self.army_in_turn())
    }

    /// Current phase, 0 at the start: one more for each step of [`PHASE_EJECTIONS`] reached.
    pub fn phase(&self) -> usize {
        self.enc.phase()
    }

    /// Refuses a boss move that uses a marble outside the army in turn.
    fn check(&self, mv: &Move) -> Result<(), ChoirError> {
        let army = self.army_in_turn();
        if mv.cells.iter().any(|&c| self.army_at(c) != Some(army)) {
            return Err(ChoirError::WrongArmy);
        }
        Ok(())
    }

    /// Moves the side to move may play: every legal move for the player, for the boss the moves of
    /// the army in turn. Empty once the game is over.
    pub fn legal_moves(&self) -> Vec<Move> {
        let game = self.game();
        if game.outcome().is_some() {
            return Vec::new();
        }
        let moves = legal_moves(game.board(), game.to_move());
        if game.to_move() == Player::Black {
            return moves;
        }
        moves
            .into_iter()
            .filter(|m| self.check(m).is_ok())
            .collect()
    }

    /// Plays `mv` for the side to move. A boss move must use marbles of the army in turn only.
    pub fn play(&mut self, mv: &Move) -> Result<(), ChoirError> {
        let game = self.game();
        let boss_turn = game.to_move() == Player::White;
        if boss_turn && game.outcome().is_none() {
            self.check(mv)?;
        }
        let mover = self.army_in_turn();
        let cells: Vec<P> = self.members.iter().map(|m| m.0).collect();
        let carried = carried_marks(self.game().board(), mv, &cells);
        self.enc.play(mv).map_err(ChoirError::Game)?;
        let board = self.enc.game().board();
        self.members = carried
            .into_iter()
            .zip(&self.members)
            .filter(|(c, _)| board.get(c.0, c.1) == Some(Cell::White))
            .map(|(c, m)| (c, m.1))
            .collect();
        self.last_removal = None;
        if boss_turn {
            self.end_boss_move(mover);
        } else {
            while self.alive() > CYCLE.len() - self.phase() {
                self.remove_weakest();
            }
            if self.enc.game.outcome().is_none() && !self.can_move(self.army_in_turn()) {
                // No army can move: the boss passes (rules.md section 7) and the player goes again.
                self.enc.game.pass();
            }
        }
        Ok(())
    }

    /// Armies with marbles left.
    fn alive(&self) -> usize {
        CYCLE.iter().filter(|&&a| self.army_marbles(a) > 0).count()
    }

    /// Removes the army with the fewest marbles left, a tie broken by the fight seed and the ply.
    /// Its marbles leave the board and count for nobody.
    fn remove_weakest(&mut self) {
        let alive: Vec<Army> = CYCLE
            .into_iter()
            .filter(|&a| self.army_marbles(a) > 0)
            .collect();
        let fewest = alive.iter().map(|&a| self.army_marbles(a)).min();
        let weakest: Vec<Army> = alive
            .into_iter()
            .filter(|&a| Some(self.army_marbles(a)) == fewest)
            .collect();
        let ply = self.game().history().len() as u64;
        let army = weakest[(mix(self.enc.seed ^ ply) % weakest.len() as u64) as usize];
        let cells: Vec<P> = self
            .members
            .iter()
            .filter(|m| m.1 == army)
            .map(|m| m.0)
            .collect();
        let mut board = self.game().board().clone();
        for &(q, r) in &cells {
            board.set(q, r, Cell::Empty);
        }
        self.enc.game.replace_board(board);
        self.members.retain(|m| m.1 != army);
        self.last_removal = Some((army, cells));
    }

    /// After a boss move: in P3 the last army plays again (the player passes), else ends the
    /// boss turn.
    fn end_boss_move(&mut self, mover: Army) {
        if self.phase() == LAST_PHASE && !self.second_move {
            self.second_move = true;
            self.cycle_pos = mover.index();
            self.enc.game.pass();
        } else {
            self.second_move = false;
            self.cycle_pos = (mover.index() + 1) % CYCLE.len();
        }
    }

    /// The boss move for its turn: the army in turn, its own weights, node-limited. `None` on the
    /// player's turn or when the game is over. The army in turn always has a move: an army with none
    /// is skipped, and a boss with none passes.
    pub fn boss_move(&self) -> Option<Move> {
        if self.game().to_move() != Player::White {
            return None;
        }
        let allow = |mv: &Move| self.check(mv).is_ok();
        let weights = self.army_in_turn().weights();
        search_with(self.game(), self.enc.boss.node_budget, weights, &allow).map(|r| r.mv)
    }

    /// The player's move for auto-play (#792): node-limited like the boss's. `None` on the boss's
    /// turn or when the game is over.
    pub fn player_move(&self) -> Option<Move> {
        self.enc.player_search().map(|r| r.mv)
    }

    /// Scales the Choir node budget by a percentage relative to baseline.
    pub fn scale_node_budget(&mut self, percent: u32) {
        self.enc.scale_node_budget(percent);
    }
}

/// The Choir boss definition. Its phases come from the player's ejections, and each phase
/// removes an army (see [`Choir::play`]).
pub fn choir_boss() -> BossDef {
    BossDef {
        name: "The Choir",
        phase_marbles: Vec::new(),
        phase_ejections: PHASE_EJECTIONS.to_vec(),
        special: no_special,
        hook: keep_board,
        conversions: None,
        node_budget: CHOIR_NODE_BUDGET,
    }
}

fn no_special(_ply: u32, _phase: usize) -> Option<u8> {
    None
}

fn keep_board(board: &Board, _id: u8, _seed: u64) -> Board {
    board.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::MAX_RADIUS;
    use crate::game::Outcome;
    use crate::moves::Direction::{E, W};
    use crate::moves::{legal_moves, Direction, MoveError};
    use Army::{Alto, Bass, Tenor};

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn all_cells() -> impl Iterator<Item = P> {
        (-MAX_RADIUS..=MAX_RADIUS).flat_map(|q| (-MAX_RADIUS..=MAX_RADIUS).map(move |r| (q, r)))
    }

    fn cells_of(board: &Board, color: Cell) -> Vec<P> {
        all_cells()
            .filter(|&(q, r)| board.get(q, r) == Some(color))
            .collect()
    }

    fn distance(a: P, b: P) -> i32 {
        let (dq, dr) = (a.0 - b.0, a.1 - b.1);
        dq.abs().max(dr.abs()).max((dq + dr).abs())
    }

    /// A position: `armies` are the boss marbles by army, `cycle_pos` the army in turn.
    fn choir_from(
        black: &[P],
        armies: &[(Army, &[P])],
        to_move: Player,
        ejected: [u8; 2],
        cycle_pos: usize,
    ) -> Choir {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        let mut members = Vec::new();
        for &(army, cells) in armies {
            for &c in cells {
                board.set(c.0, c.1, Cell::White);
                members.push((c, army));
            }
        }
        let mut choir =
            Choir::from_position(Game::from_position(board, to_move, ejected), members, 0);
        choir.cycle_pos = cycle_pos;
        choir.scale_node_budget(5);
        choir
    }

    /// The start layout with a small search budget: the debug build is slow.
    fn fast_start(seed: u64) -> Choir {
        let mut c = Choir::start(seed);
        c.scale_node_budget(5);
        c
    }

    fn standard_black() -> Vec<P> {
        cells_of(&Board::standard(), Cell::Black)
    }

    fn black_move(c: &mut Choir) {
        let m = legal_moves(c.game().board(), Player::Black)[0].clone();
        c.play(&m).unwrap();
    }

    /// Plays the boss moves of one boss turn, until the player is to move again. Returns the army
    /// of each boss move, checked against the tell.
    fn boss_turn(c: &mut Choir) -> Vec<Army> {
        let mut movers = Vec::new();
        while c.game().to_move() == Player::White {
            let army = c.tell().unwrap();
            let m = c.boss_move().unwrap();
            assert!(m.cells.iter().all(|&cell| c.army_at(cell) == Some(army)));
            c.play(&m).unwrap();
            movers.push(army);
        }
        movers
    }

    /// The player ejects the Alto marble on (4, 0) with its two marbles: the third ejection when
    /// `ejected` is 2. Alto 5 marbles, Tenor `tenor`, Bass `bass`.
    fn ejecting(ejected: u8, tenor: &[P], bass: &[P]) -> Choir {
        let mut alto = vec![(4, 0), (0, -3), (1, -3), (2, -3)];
        if ejected == 2 {
            alto.push((3, -3));
        }
        let mut armies = vec![(Alto, alto.as_slice())];
        armies.push((Tenor, tenor));
        armies.push((Bass, bass));
        choir_from(
            &[(2, 0), (3, 0), (-4, 4)],
            &armies,
            Player::Black,
            [ejected, 0],
            0,
        )
    }

    const EJECT: fn() -> Move = || mv(&[(2, 0), (3, 0)], E);

    #[test]
    fn layout_is_the_standard_board_with_14_player_and_18_boss_marbles() {
        let c = fast_start(0);
        let board = c.game().board();
        assert_eq!(
            all_cells()
                .filter(|&(q, r)| board.get(q, r).is_some())
                .count(),
            61
        );
        assert_eq!(cells_of(board, Cell::Black), standard_black());
        assert_eq!(cells_of(board, Cell::White).len(), 18);
        assert_eq!(ARMY_SIZE, 6);
        for army in CYCLE {
            assert_eq!(c.army_marbles(army), 6);
            for cell in army.start() {
                assert_eq!(board.get(cell.0, cell.1), Some(Cell::White));
                assert_eq!(c.army_at(cell), Some(army));
            }
        }
        assert_eq!(c.army_at((0, 0)), None);
        assert_eq!(c.game().to_move(), Player::Black);
        assert_eq!(c.phase(), 0);
        assert_eq!(c.result(), None);
        assert_eq!(c.game().win_ejections(Player::Black), 6);
        assert_eq!(c.game().win_ejections(Player::White), 6);
    }

    #[test]
    fn the_armies_are_triangles_left_up_middle_down_right_up_one_cell_apart() {
        let rows = |a: Army| {
            let mut counts = Vec::new();
            for r in -4..=-1 {
                let n = a.start().iter().filter(|c| c.1 == r).count();
                if n > 0 {
                    counts.push((r, n));
                }
            }
            counts
        };
        assert_eq!(rows(Alto), [(-3, 1), (-2, 2), (-1, 3)], "left, pointing up");
        assert_eq!(
            rows(Tenor),
            [(-4, 3), (-3, 2), (-2, 1)],
            "middle, pointing down"
        );
        assert_eq!(
            rows(Bass),
            [(-3, 1), (-2, 2), (-1, 3)],
            "right, pointing up"
        );
        let x = |a: Army| a.start().iter().map(|c| 2 * c.0 + c.1).sum::<i32>();
        assert!(x(Alto) < x(Tenor) && x(Tenor) < x(Bass), "left to right");
        for a in CYCLE {
            for b in CYCLE.into_iter().filter(|&b| b != a) {
                for (ca, cb) in a
                    .start()
                    .into_iter()
                    .flat_map(|ca| b.start().map(|cb| (ca, cb)))
                {
                    assert!(distance(ca, cb) >= 2, "{ca:?} touches {cb:?}");
                }
            }
        }
    }

    #[test]
    fn the_boss_definition_phases_come_from_the_ejections() {
        let b = choir_boss();
        assert_eq!(b.name, "The Choir");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, PHASE_EJECTIONS);
        assert_eq!(PHASE_EJECTIONS, [3, 5]);
        assert_eq!(b.node_budget, CHOIR_NODE_BUDGET);
        assert_eq!((b.special)(1, 0), None);
        let board = Board::standard();
        assert_eq!((b.hook)(&board, 0, 0), board);
    }

    #[test]
    fn the_armies_have_distinct_weights_each_with_its_own_emphasis() {
        let [a, t, b] = CYCLE.map(Army::weights);
        assert_ne!(a, t);
        assert_ne!(t, b);
        assert_ne!(a, b);
        assert!(
            a.ejected > t.ejected && a.ejected > b.ejected,
            "Alto pushes"
        );
        assert!(t.centre > a.centre && t.centre > b.centre, "Tenor edges");
        assert!(
            b.cohesion > a.cohesion && b.cohesion > t.cohesion,
            "Bass clusters"
        );
    }

    #[test]
    fn p1_one_army_moves_per_boss_turn_alto_tenor_bass_alto() {
        let mut c = fast_start(0);
        let mut told = Vec::new();
        let mut moved = Vec::new();
        for _ in 0..6 {
            told.push(c.tell().unwrap());
            black_move(&mut c);
            moved.extend(boss_turn(&mut c));
        }
        let order = [Alto, Tenor, Bass, Alto, Tenor, Bass];
        assert_eq!(told, order);
        assert_eq!(moved, order);
        assert_eq!(c.game().outcome(), None);
        assert_eq!(c.last_removal(), None);
    }

    #[test]
    fn a_move_of_an_army_out_of_turn_is_refused_and_changes_nothing() {
        let mut c = fast_start(0);
        black_move(&mut c);
        assert_eq!(c.tell(), Some(Alto));
        let history = c.game().history().len();
        let tenor = legal_moves(c.game().board(), Player::White)
            .into_iter()
            .find(|m| m.cells.iter().all(|&x| c.army_at(x) == Some(Tenor)))
            .unwrap();
        assert_eq!(c.play(&tenor), Err(ChoirError::WrongArmy));
        assert_eq!(c.game().history().len(), history);
        assert_eq!(c.tell(), Some(Alto));
        let alto = c.boss_move().unwrap();
        c.play(&alto).unwrap();
        assert_eq!(c.tell(), Some(Tenor));
    }

    #[test]
    fn the_player_move_is_legal_on_the_players_turn_only() {
        let mut c = Choir::start(7);
        let legal = c.legal_moves();
        assert!(legal.contains(&c.player_move().unwrap()));
        c.play(&legal[0]).unwrap();
        assert_eq!(c.player_move(), None, "boss's turn");
    }

    #[test]
    fn the_player_moves_through_the_game_rules() {
        let mut c = fast_start(0);
        let bad = mv(&[(0, 0)], E);
        assert_eq!(
            c.play(&bad),
            Err(ChoirError::Game(GameError::Move(MoveError::NotOwnMarble)))
        );
        assert_eq!(c.boss_move(), None, "player's turn");
    }

    #[test]
    fn a_wiped_army_skips_its_turn_and_the_cycle_shortens() {
        let mut c = choir_from(
            &standard_black(),
            &[(Alto, &ALTO_START), (Bass, &BASS_START)],
            Player::Black,
            [0, 0],
            1,
        );
        assert_eq!(c.tell(), Some(Bass));
        let mut told = Vec::new();
        for _ in 0..3 {
            black_move(&mut c);
            told.push(boss_turn(&mut c)[0]);
        }
        assert_eq!(told, [Bass, Alto, Bass]);
    }

    /// Alto is one marble in the corner, boxed in by three Tenor marbles.
    fn boxed_in_alto() -> Choir {
        choir_from(
            &[(-4, 4)],
            &[
                (Alto, &[(4, -4)]),
                (Tenor, &[(3, -4), (4, -3), (3, -3)]),
                (Bass, &[(-3, 0)]),
            ],
            Player::White,
            [0, 0],
            0,
        )
    }

    #[test]
    fn an_army_with_no_legal_move_is_skipped_for_the_next_army_that_has_one() {
        let mut c = boxed_in_alto();
        assert_eq!(c.tell(), Some(Tenor), "Alto is boxed in, the tell skips it");
        let m = c.boss_move().expect("the boss is never stuck (#172)");
        assert!(m.cells.iter().all(|&cell| c.army_at(cell) == Some(Tenor)));
        c.play(&m).unwrap();
        assert_eq!(
            c.tell(),
            Some(Bass),
            "the cycle goes on after the army that moved"
        );
    }

    #[test]
    fn a_boss_with_no_legal_move_at_all_passes_and_the_player_moves_again() {
        // Alto is one marble in the corner, walled in by three Black marbles it cannot push.
        let mut c = choir_from(
            &[(3, -4), (4, -3), (3, -3), (-4, 4)],
            &[(Alto, &[(4, -4)])],
            Player::Black,
            [0, 0],
            0,
        );
        c.play(&mv(&[(-4, 4)], E)).unwrap();
        assert_eq!(c.game().to_move(), Player::Black, "the boss passed");
        assert_eq!(c.result(), None);
        assert_eq!(c.boss_move(), None, "player's turn");
        c.play(&mv(&[(-3, 4)], E)).unwrap();
        assert_eq!(c.game().to_move(), Player::Black);
    }

    #[test]
    fn membership_follows_boss_moves_and_player_pushes() {
        let mut c = fast_start(0);
        black_move(&mut c);
        let m = c.boss_move().unwrap();
        c.play(&m).unwrap();
        let (dq, dr) = m.dir.vector();
        for &(q, r) in &m.cells {
            assert_eq!(
                c.army_at((q + dq, r + dr)),
                Some(Alto),
                "moved with the army"
            );
        }
        assert_eq!(c.army_marbles(Alto), 6);
        // A player push shifts a Bass marble to (3, 0).
        let mut c = choir_from(
            &[(0, 0), (1, 0)],
            &[(Bass, &[(2, 0)]), (Alto, &[(0, -3)])],
            Player::Black,
            [0, 0],
            0,
        );
        c.play(&mv(&[(0, 0), (1, 0)], E)).unwrap();
        assert_eq!(c.army_at((3, 0)), Some(Bass));
        assert_eq!(c.army_at((2, 0)), None);
        assert_eq!(c.army_marbles(Bass), 1);
    }

    #[test]
    fn p2_the_weakest_army_is_removed_at_the_third_ejection_and_is_not_an_ejection() {
        let mut c = ejecting(2, &[(-3, 0), (-2, -2), (-1, -2)], &[(-4, 1), (-4, 2)]);
        assert_eq!(c.phase(), 0);
        c.play(&EJECT()).unwrap();
        assert_eq!(
            c.game().ejected(Player::Black),
            3,
            "the removal is not counted"
        );
        assert_eq!(c.phase(), 1);
        assert_eq!(c.army_marbles(Bass), 0, "Bass had the fewest");
        assert_eq!((c.army_marbles(Alto), c.army_marbles(Tenor)), (4, 3));
        assert_eq!(c.game().board().get(-4, 1), Some(Cell::Empty));
        assert_eq!(c.game().board().get(-4, 2), Some(Cell::Empty));
        assert_eq!(c.last_removal(), Some(&(Bass, vec![(-4, 1), (-4, 2)])));
        assert_eq!(c.result(), None);
        // The two others alternate; the removal is shown for that ply only.
        assert_eq!(boss_turn(&mut c), [Alto]);
        assert_eq!(c.last_removal(), None);
        black_move(&mut c);
        assert_eq!(boss_turn(&mut c), [Tenor]);
        black_move(&mut c);
        assert_eq!(boss_turn(&mut c), [Alto]);
    }

    #[test]
    fn a_tie_for_the_weakest_is_broken_by_the_seed_and_is_repeatable() {
        let removed = |seed: u64| {
            let mut c = ejecting(2, &[(-3, 0), (-2, -2)], &[(-4, 1), (-4, 2)]);
            c.enc.seed = seed;
            c.play(&EJECT()).unwrap();
            c.last_removal().unwrap().0
        };
        let all: Vec<Army> = (0..16).map(removed).collect();
        assert!(all.contains(&Tenor) && all.contains(&Bass));
        assert!(!all.contains(&Alto));
        assert_eq!(all, (0..16).map(removed).collect::<Vec<_>>());
    }

    #[test]
    fn p3_the_weakest_of_two_is_removed_at_the_fifth_ejection_and_the_last_plays_twice() {
        let mut c = ejecting(4, &[(-3, 0), (-2, -2)], &[]);
        assert_eq!(c.phase(), 1);
        c.play(&EJECT()).unwrap();
        assert_eq!(c.game().ejected(Player::Black), 5);
        assert_eq!(c.phase(), 2);
        assert_eq!(c.army_marbles(Tenor), 0);
        assert_eq!(c.army_marbles(Alto), 3);
        assert_eq!(c.last_removal().map(|r| r.0), Some(Tenor));
        assert_eq!(c.result(), None);
        for _ in 0..3 {
            assert_eq!(boss_turn(&mut c), [Alto, Alto]);
            assert_eq!(c.game().to_move(), Player::Black);
            black_move(&mut c);
        }
    }

    #[test]
    fn the_player_still_wins_at_6_ejections_and_loses_at_6() {
        let mut c = choir_from(
            &[(2, 0), (3, 0), (-4, 4)],
            &[(Alto, &[(4, 0), (0, -3), (1, -3)])],
            Player::Black,
            [5, 0],
            0,
        );
        c.play(&EJECT()).unwrap();
        assert_eq!(c.game().ejected(Player::Black), 6);
        assert_eq!(c.result(), Some(PveResult::Won));
        assert_eq!(c.tell(), None);
        let lost = choir_from(&[(0, 0)], &[(Alto, &[(3, -3)])], Player::White, [0, 6], 0);
        assert_eq!(lost.result(), Some(PveResult::Lost));
    }

    #[test]
    fn legal_moves_are_all_the_players_and_only_the_army_in_turn_for_the_boss() {
        let mut c = fast_start(0);
        assert_eq!(
            c.legal_moves(),
            legal_moves(c.game().board(), Player::Black)
        );
        black_move(&mut c);
        let boss = c.legal_moves();
        assert!(!boss.is_empty());
        assert!(boss.len() < legal_moves(c.game().board(), Player::White).len());
        for m in &boss {
            assert!(m.cells.iter().all(|&cell| c.army_at(cell) == Some(Alto)));
        }
        assert!(boss.contains(&c.boss_move().unwrap()));
        let over = choir_from(&[(0, 0)], &[(Alto, &[(3, -3)])], Player::White, [6, 0], 0);
        assert!(over.legal_moves().is_empty());
    }

    #[test]
    fn the_same_play_gives_the_same_game() {
        let run = || {
            let mut c = fast_start(3);
            let mut log = Vec::new();
            for _ in 0..6 {
                black_move(&mut c);
                log.push((c.tell(), boss_turn(&mut c)));
            }
            (c.game().board().clone(), log, c.boss_move())
        };
        assert_eq!(run(), run());
        let mut c = fast_start(3);
        black_move(&mut c);
        assert_eq!(c.boss_move(), c.boss_move());
    }

    #[test]
    fn a_finished_game_has_no_tell_and_refuses_moves() {
        let mut c = choir_from(&[(0, 0)], &[(Alto, &[(3, -3)])], Player::White, [6, 0], 0);
        assert_eq!(c.result(), Some(PveResult::Won));
        assert_eq!(c.game().outcome(), Some(Outcome::Win(Player::Black)));
        assert_eq!(c.tell(), None);
        assert_eq!(c.boss_move(), None);
        assert_eq!(
            c.play(&mv(&[(3, -3)], W)),
            Err(ChoirError::Game(GameError::GameOver))
        );
    }
}
