//! The Choir (#44, docs/specs/game-design.md section 7.2): three boss armies of four marbles,
//! Alto, Tenor and Bass, on a radius 3 board. Only one army moves per boss turn, in a fixed
//! cycle, and the army that moves next is the tell. Which army owns which boss marble lives in
//! [`Choir`], next to the encounter, and follows every move and push.
//!
//! P1: three armies. P2: one army is wiped, the two others alternate and the army in turn plays
//! a free extra move on every fourth boss turn. P3: one army is left, it plays every turn and
//! cannot push (no sumito).

use crate::board::{Board, Cell};
use crate::encounter::{BossDef, Encounter};
use crate::game::{Game, GameError};
use crate::moves::{Move, Player};
use crate::search::Weights;

type P = (i32, i32);

/// Radius of the Choir board: the outer ring of the standard board is void.
pub const CHOIR_RADIUS: i32 = 3;
/// Marbles per boss army.
pub const ARMY_SIZE: usize = 4;
/// Player marbles at the start.
pub const PLAYER_MARBLES: usize = 10;
/// Alto start, the back row. Boss side is the top of the board (r < 0).
pub const ALTO_START: [P; ARMY_SIZE] = [(0, -3), (1, -3), (2, -3), (3, -3)];
/// Tenor start, the middle row.
pub const TENOR_START: [P; ARMY_SIZE] = [(-1, -2), (0, -2), (1, -2), (2, -2)];
/// Bass start, the front row, closest to the player: the intended opener.
pub const BASS_START: [P; ARMY_SIZE] = [(-2, -1), (-1, -1), (0, -1), (1, -1)];
/// Player start: the two bottom rows and one marble ahead of them.
pub const PLAYER_START: [P; PLAYER_MARBLES] = [
    (-3, 3),
    (-2, 3),
    (-1, 3),
    (0, 3),
    (-3, 2),
    (-2, 2),
    (-1, 2),
    (0, 2),
    (1, 2),
    (0, 1),
];
/// Boss turns between two free extra moves in P2. TUNE.
pub const FREE_MOVE_EVERY: u32 = 4;
/// Phase (0 based) where the free extra move exists.
pub const FREE_MOVE_PHASE: usize = 1;
/// Last phase (0 based): the army left cannot push.
pub const LAST_PHASE: usize = 2;
/// P2 starts with this many armies left or fewer, P3 with this many. TUNE.
pub const PHASE_ARMIES: [usize; 2] = [2, 1];
/// Positions the boss search may visit per move. TUNE.
pub const CHOIR_NODE_BUDGET: u32 = 1500;
/// Seed of the encounter: the Choir has no seeded hook.
pub const CHOIR_SEED: u64 = 0;

/// Alto pushes: ejections count triple. TUNE.
pub const ALTO_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 150,
    centre: 3,
    cohesion: 2,
};
/// Tenor flanks: pressing the opponent towards the edge counts a lot. TUNE.
pub const TENOR_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 50,
    centre: 20,
    cohesion: 2,
};
/// Bass anchors: staying in one cluster counts a lot. TUNE.
pub const BASS_WEIGHTS: Weights = Weights {
    marbles: 100,
    ejected: 50,
    centre: 3,
    cohesion: 20,
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
        todo!()
    }

    /// The evaluation weights of the army, its style.
    pub fn weights(self) -> Weights {
        todo!()
    }
}

/// Why [`Choir::play`] refused a move.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChoirError {
    /// The game refused it (game over, illegal move).
    Game(GameError),
    /// A boss move that uses a marble of an army that is not in turn.
    WrongArmy,
    /// A boss move that pushes a player marble, in P3.
    NoPush,
}

/// A game against the Choir. The player is Black and moves first, the boss is White.
#[derive(Clone, Debug)]
pub struct Choir {
    enc: Encounter,
    /// Boss marble cell and its army, kept through every move and push.
    members: Vec<(P, Army)>,
    /// Index in [`CYCLE`] of the army that moves next, before wiped armies are skipped.
    cycle_pos: usize,
    /// Boss turns finished.
    boss_turns: u32,
    /// The army in turn has a free extra move to play now.
    free_move: bool,
}

/// The Choir board with no marble: the standard board with its outer ring void.
fn arena() -> Board {
    todo!()
}

/// `true` when `mv` changes the Black marbles: a push or an ejection.
fn pushes(board: &Board, mv: &Move) -> bool {
    let _ = (board, mv);
    todo!()
}

impl Choir {
    /// The start layout: 12 boss marbles in three armies, 10 player marbles.
    pub fn start() -> Self {
        todo!()
    }

    pub fn game(&self) -> &Game {
        todo!()
    }

    /// `None` while the game runs. A draw is a loss for the player.
    pub fn result(&self) -> Option<crate::encounter::PveResult> {
        todo!()
    }

    /// The army that owns the boss marble on `cell`.
    pub fn army_at(&self, cell: P) -> Option<Army> {
        let _ = cell;
        todo!()
    }

    /// Marbles `army` has left.
    pub fn army_marbles(&self, army: Army) -> u8 {
        let _ = army;
        todo!()
    }

    /// The army that moves next, the tell. `None` when the game is over.
    pub fn tell(&self) -> Option<Army> {
        todo!()
    }

    /// Current phase, 0 at the start.
    pub fn phase(&self) -> usize {
        todo!()
    }

    /// Plays `mv` for the side to move. A boss move must use marbles of the army in turn only.
    pub fn play(&mut self, mv: &Move) -> Result<(), ChoirError> {
        let _ = mv;
        todo!()
    }

    /// The boss move for its turn: the army in turn, its own weights, node-limited. `None` on the
    /// player's turn or when the game is over.
    pub fn boss_move(&self) -> Option<Move> {
        todo!()
    }
}

/// The Choir boss definition. Its phases come from the armies left, not from a marble count, so
/// `phase_marbles` is empty and [`Choir::phase`] is the phase.
pub fn choir_boss() -> BossDef {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::RADIUS;
    use crate::encounter::PveResult;
    use crate::game::Outcome;
    use crate::moves::Direction::{E, SE, SW, W};
    use crate::moves::{legal_moves, Direction, MoveError};
    use Army::{Alto, Bass, Tenor};

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    /// A position: `armies` are the boss marbles by army, `cycle_pos` the army in turn.
    fn choir_from(
        black: &[P],
        armies: &[(Army, &[P])],
        to_move: Player,
        ejected: [u8; 2],
        cycle_pos: usize,
    ) -> Choir {
        let mut board = arena();
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
        Choir {
            enc: Encounter::new(
                Game::from_position(board, to_move, ejected),
                choir_boss(),
                CHOIR_SEED,
            ),
            members,
            cycle_pos,
            boss_turns: 0,
            free_move: false,
        }
    }

    /// Alto and Tenor at their start, Bass wiped.
    fn bass_wiped() -> Choir {
        choir_from(
            &PLAYER_START,
            &[(Alto, &ALTO_START), (Tenor, &TENOR_START)],
            Player::Black,
            [0, 0],
            0,
        )
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

    fn count(board: &Board, cell: Cell) -> usize {
        (-RADIUS..=RADIUS)
            .flat_map(|q| (-RADIUS..=RADIUS).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r) == Some(cell))
            .count()
    }

    fn on_board(board: &Board) -> usize {
        (-RADIUS..=RADIUS)
            .flat_map(|q| (-RADIUS..=RADIUS).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r).is_some())
            .count()
    }

    #[test]
    fn layout_has_a_radius_3_board_and_the_right_counts() {
        let c = Choir::start();
        let board = c.game().board();
        assert_eq!(on_board(board), 37, "radius 3 board");
        assert_eq!(board.get(3, 0), Some(Cell::Empty));
        assert_eq!(board.get(4, 0), None, "outer ring is void");
        assert_eq!(count(board, Cell::Black), PLAYER_MARBLES);
        assert_eq!(count(board, Cell::White), 3 * ARMY_SIZE);
        assert_eq!(PLAYER_MARBLES, 10);
        assert_eq!(ARMY_SIZE, 4);
        for army in CYCLE {
            assert_eq!(c.army_marbles(army), 4);
            for cell in army.start() {
                assert_eq!(board.get(cell.0, cell.1), Some(Cell::White));
                assert_eq!(c.army_at(cell), Some(army));
            }
        }
        for cell in PLAYER_START {
            assert_eq!(board.get(cell.0, cell.1), Some(Cell::Black));
            assert_eq!(c.army_at(cell), None);
        }
        assert_eq!(c.army_at((4, 0)), None);
        assert_eq!(c.game().to_move(), Player::Black);
        assert_eq!(c.phase(), 0);
        assert_eq!(c.result(), None);
    }

    #[test]
    fn the_boss_definition_has_no_marble_phases() {
        let b = choir_boss();
        assert_eq!(b.name, "The Choir");
        assert!(b.phase_marbles.is_empty());
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
    fn the_cycle_is_alto_tenor_bass_and_only_the_army_in_turn_moves() {
        let mut c = Choir::start();
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
    }

    #[test]
    fn a_move_of_an_army_out_of_turn_is_refused_and_changes_nothing() {
        let mut c = Choir::start();
        black_move(&mut c);
        assert_eq!(c.tell(), Some(Alto));
        let history = c.game().history().len();
        let tenor = mv(&[(-1, -2)], SW);
        assert_eq!(c.play(&tenor), Err(ChoirError::WrongArmy));
        let mixed = mv(&[(1, -2), (2, -3)], SE);
        assert_eq!(c.play(&mixed), Err(ChoirError::WrongArmy), "two armies");
        assert_eq!(c.game().history().len(), history);
        assert_eq!(c.tell(), Some(Alto));
        let alto = c.boss_move().unwrap();
        c.play(&alto).unwrap();
        assert_eq!(c.tell(), Some(Tenor));
    }

    #[test]
    fn the_player_moves_through_the_game_rules() {
        let mut c = Choir::start();
        let bad = mv(&[(0, 0)], E);
        assert_eq!(
            c.play(&bad),
            Err(ChoirError::Game(GameError::Move(MoveError::NotOwnMarble)))
        );
        assert_eq!(c.boss_move(), None, "player's turn");
    }

    #[test]
    fn a_wiped_army_skips_its_turn_and_the_cycle_shortens() {
        // Alto and Bass only: Tenor (index 1) is skipped, then the cycle wraps to Alto.
        let mut c = choir_from(
            &PLAYER_START,
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

    #[test]
    fn membership_follows_boss_moves_and_player_pushes() {
        let mut c = Choir::start();
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
        assert_eq!(c.army_marbles(Alto), 4);
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
    fn p2_starts_when_an_army_is_wiped_by_a_player_ejection() {
        let mut c = choir_from(
            &[(1, 0), (2, 0), (-3, 3)],
            &[(Bass, &[(3, 0)]), (Alto, &[(0, -3)]), (Tenor, &[(-3, 0)])],
            Player::Black,
            [0, 0],
            0,
        );
        assert_eq!(c.phase(), 0);
        c.play(&mv(&[(1, 0), (2, 0)], E)).unwrap();
        assert_eq!(c.army_marbles(Bass), 0);
        assert_eq!(c.phase(), 1);
        assert_eq!(c.tell(), Some(Alto));
    }

    #[test]
    fn p2_gives_the_army_in_turn_a_free_extra_move_every_4th_turn() {
        let mut c = bass_wiped();
        assert_eq!(c.phase(), 1);
        let mut turns = Vec::new();
        for _ in 0..8 {
            black_move(&mut c);
            turns.push(boss_turn(&mut c));
        }
        assert_eq!(
            turns,
            [
                vec![Alto],
                vec![Tenor],
                vec![Alto],
                vec![Tenor, Tenor],
                vec![Alto],
                vec![Tenor],
                vec![Alto],
                vec![Tenor, Tenor],
            ]
        );
        assert_eq!(c.game().outcome(), None);
    }

    /// Alto alone, three marbles in line next to a lone Black marble they can push.
    fn p3_push_position(black_ejected: [u8; 2]) -> Choir {
        choir_from(
            &[(2, 0), (-3, 3), (-2, 3)],
            &[(Alto, &[(-1, 0), (0, 0), (1, 0), (3, -3)])],
            Player::White,
            black_ejected,
            0,
        )
    }

    #[test]
    fn p3_the_last_army_cannot_push_but_plays_every_turn() {
        let mut c = p3_push_position([0, 0]);
        assert_eq!(c.phase(), 2);
        let push = mv(&[(-1, 0), (0, 0), (1, 0)], E);
        assert_eq!(c.play(&push), Err(ChoirError::NoPush));
        assert_eq!(c.game().history().len(), 0);
        for _ in 0..6 {
            assert_eq!(c.tell(), Some(Alto));
            let m = c.boss_move().unwrap();
            assert!(!pushes(c.game().board(), &m), "{m:?}");
            c.play(&m).unwrap();
            assert_eq!(
                c.game().to_move(),
                Player::Black,
                "no free extra move in P3"
            );
            black_move(&mut c);
        }
    }

    #[test]
    fn p3_never_takes_the_winning_push_but_p2_does() {
        let alto: &[P] = &[(0, 0), (1, 0), (2, 0), (3, -3)];
        let setup = |armies: &[(Army, &[P])]| {
            choir_from(&[(3, 0), (-3, 3)], armies, Player::White, [0, 5], 0)
        };
        let p3 = setup(&[(Alto, alto)]);
        let m = p3.boss_move().unwrap();
        assert!(!pushes(p3.game().board(), &m));
        let mut p2 = setup(&[(Alto, alto), (Tenor, &[(-3, 0)])]);
        assert_eq!(p2.phase(), 1);
        let m = p2.boss_move().unwrap();
        assert!(pushes(p2.game().board(), &m));
        p2.play(&m).unwrap();
        assert_eq!(p2.result(), Some(PveResult::Lost));
    }

    #[test]
    fn the_same_play_gives_the_same_game() {
        let run = || {
            let mut c = Choir::start();
            let mut log = Vec::new();
            for _ in 0..6 {
                black_move(&mut c);
                log.push((c.tell(), boss_turn(&mut c)));
            }
            (c.game().board().clone(), log, c.boss_move())
        };
        assert_eq!(run(), run());
        let c = Choir::start();
        let mut c = c;
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
