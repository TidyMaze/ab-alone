//! The Alien (#588, docs/specs/game-design.md section 7.7): a brood that grows. It starts with 8
//! marbles and lays an egg on an empty cell every 2nd boss turn. An egg is a mark on the board
//! (`Board::eggs`), never a marble, so it changes no move or push. A marble that ends a ply on it
//! crushes it; otherwise it hatches into a new Alien marble after 4 player turns. The egg cell is
//! picked by a seeded integer PRNG of the fight seed and the ply, so every peer gets the same eggs.

use crate::board::{Board, Cell};
use crate::encounter::hull::mix;
use crate::encounter::{BossDef, Encounter};
use crate::game::Game;
use crate::moves::{apply, Move, Player};
use crate::search::{search_with, DEFAULT_WEIGHTS};

type P = (i32, i32);

/// The Alien's 8 start marbles: its back row (5), the 2 middle cells of its second row and the
/// centre cell of its third row, a wedge symmetric about the board's middle line.
pub const ALIEN_START: [P; 8] = [
    (0, -4),
    (1, -4),
    (2, -4),
    (3, -4),
    (4, -4),
    (1, -3),
    (2, -3),
    (1, -2),
];
/// Boss turns between two lays, per phase. TUNE.
pub const ALIEN_LAY_EVERY: [u32; 3] = [2, 1, 1];
/// Player turns before a new egg hatches, per phase. TUNE.
pub const ALIEN_HATCH_TURNS: [u8; 3] = [4, 4, 3];
/// Eggs on the board at most: a lay with this many out is skipped. TUNE.
pub const ALIEN_EGG_CAP: usize = 3;
/// P2 and P3 start after this many ejections credited to the player, not at a count of marbles
/// left: the hatches add marbles, and the fight ends at 6 ejections (#621). TUNE.
pub const ALIEN_PHASE_EJECTIONS: [u8; 2] = [2, 4];
/// Positions the boss search may visit per move (about depth 3, as the Hull). TUNE.
pub const ALIEN_NODE_BUDGET: u32 = 3000;
/// Special id at the end of a player turn: the eggs count down and hatch.
pub const ALIEN_PLAYER_END: u8 = 0;
/// Special id at the end of a boss turn with no lay. A lay's id is the new egg's counter.
pub const ALIEN_BOSS_END: u8 = 1;
const _: () = assert!(
    ALIEN_HATCH_TURNS[2] > ALIEN_BOSS_END,
    "a lay id is never a turn id"
);

/// Special id of the ply that just ended: the player's (odd plies, Black moves first), a boss
/// turn with no lay, or a lay with the counter of the phase.
fn special(ply: u32, phase: usize) -> Option<u8> {
    Some(if ply % 2 == 1 {
        ALIEN_PLAYER_END
    } else if (ply / 2).is_multiple_of(ALIEN_LAY_EVERY[phase]) {
        ALIEN_HATCH_TURNS[phase]
    } else {
        ALIEN_BOSS_END
    })
}

/// End of a ply: an egg under a marble is crushed. Then a player turn counts the eggs down and
/// hatches the ones at zero into Alien marbles, and a lay puts one egg on an empty cell picked by
/// `seed`, unless `ALIEN_EGG_CAP` eggs are out.
fn hook(board: &Board, id: u8, seed: u64) -> Board {
    let mut out = board.clone();
    let mut eggs: Vec<_> = board
        .eggs()
        .iter()
        .copied()
        .filter(|&((q, r), _)| board.get(q, r) == Some(Cell::Empty))
        .collect();
    if id == ALIEN_PLAYER_END {
        for egg in &mut eggs {
            egg.1 -= 1;
            if egg.1 == 0 {
                out.set(egg.0 .0, egg.0 .1, Cell::White);
            }
        }
        eggs.retain(|&(_, left)| left > 0);
    } else if id != ALIEN_BOSS_END && eggs.len() < ALIEN_EGG_CAP {
        let radius = board.radius();
        let free: Vec<P> = (-radius..=radius)
            .flat_map(|q| (-radius..=radius).map(move |r| (q, r)))
            .filter(|&(q, r)| board.get(q, r) == Some(Cell::Empty))
            .filter(|&c| eggs.iter().all(|&(e, _)| e != c))
            .collect();
        if !free.is_empty() {
            eggs.push((free[(mix(seed) % free.len() as u64) as usize], id));
        }
    }
    out.set_eggs(eggs);
    out
}

/// The Alien boss definition.
pub fn alien_boss() -> BossDef {
    BossDef {
        name: "The Alien",
        phase_marbles: Vec::new(),
        phase_ejections: ALIEN_PHASE_EJECTIONS.to_vec(),
        special,
        hook,
        node_budget: ALIEN_NODE_BUDGET,
    }
}

/// A new encounter: the player is Black on the standard layout and moves first.
pub fn alien_start(seed: u64) -> Encounter {
    let mut board = Board::standard();
    let radius = board.radius();
    for q in -radius..=radius {
        for r in -radius..=radius {
            if board.get(q, r) == Some(Cell::White) {
                board.set(q, r, Cell::Empty);
            }
        }
    }
    for (q, r) in ALIEN_START {
        board.set(q, r, Cell::White);
    }
    Encounter::new(
        Game::from_position(board, Player::Black, [0, 0]),
        alien_boss(),
        seed,
    )
}

/// The boss reply: its node-limited search, among the moves that leave every egg empty when
/// there is one. `None` on the player's turn or when the game is over.
pub fn alien_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    let board = enc.game().board();
    let spares_eggs = |mv: &Move| {
        let (after, _) = apply(board, Player::White, mv).expect("a legal move");
        board
            .eggs()
            .iter()
            .all(|&((q, r), _)| after.get(q, r) == Some(Cell::Empty))
    };
    search_with(enc.game(), ALIEN_NODE_BUDGET, DEFAULT_WEIGHTS, &spares_eggs)
        .or_else(|| enc.boss_search())
        .map(|r| r.mv)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Cell, MAX_RADIUS};
    use crate::encounter::marbles;
    use crate::moves::Direction::E;
    use crate::moves::{apply, legal_moves, Direction};

    type Egg = (P, u8);

    fn cells() -> impl Iterator<Item = P> {
        (-MAX_RADIUS..=MAX_RADIUS).flat_map(|q| (-MAX_RADIUS..=MAX_RADIUS).map(move |r| (q, r)))
    }

    fn board(black: &[P], white: &[P], eggs: &[Egg]) -> Board {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        board.set_eggs(eggs.to_vec());
        board
    }

    fn fight(black: &[P], white: &[P], eggs: &[Egg], to_move: Player, seed: u64) -> Encounter {
        let game = Game::from_position(board(black, white, eggs), to_move, [0, 0]);
        Encounter::new(game, alien_boss(), seed)
    }

    fn eggs(enc: &Encounter) -> Vec<Egg> {
        enc.game().board().eggs().to_vec()
    }

    fn whites(enc: &Encounter) -> u8 {
        marbles(enc.game().board(), Cell::White)
    }

    /// True when `mv` leaves every egg of `board` empty.
    fn spares_eggs(board: &Board, player: Player, mv: &Move) -> bool {
        let (after, _) = apply(board, player, mv).unwrap();
        board
            .eggs()
            .iter()
            .all(|&((q, r), _)| after.get(q, r) == Some(Cell::Empty))
    }

    /// Plays the first legal move of the side to move that crushes no egg.
    fn quiet(enc: &mut Encounter) {
        let game = enc.game();
        let mv = legal_moves(game.board(), game.to_move())
            .into_iter()
            .find(|m| spares_eggs(game.board(), game.to_move(), m))
            .unwrap();
        enc.play(&mv).unwrap();
        assert_eq!(enc.game().outcome(), None, "the test game goes on");
    }

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    #[test]
    fn boss_definition_matches_the_spec() {
        let b = alien_boss();
        assert_eq!(b.name, "The Alien");
        assert!(b.phase_marbles.is_empty());
        assert_eq!(b.phase_ejections, vec![2, 4]);
        assert_eq!(b.node_budget, ALIEN_NODE_BUDGET);
    }

    #[test]
    fn the_fight_starts_with_8_alien_marbles_against_14_and_no_egg() {
        let enc = alien_start(0);
        let b = enc.game().board();
        assert_eq!(marbles(b, Cell::Black), 14);
        assert_eq!(marbles(b, Cell::White), 8);
        assert!(ALIEN_START
            .iter()
            .all(|&(q, r)| b.get(q, r) == Some(Cell::White)));
        assert!(b.eggs().is_empty());
        assert_eq!(enc.game().to_move(), Player::Black);
        assert_eq!(enc.phase(), 0);
        assert_eq!(enc.game().win_ejections(Player::Black), 6);
        assert_eq!(enc.game().win_ejections(Player::White), 6);
        for &(q, r) in &ALIEN_START {
            assert_eq!(b.get(-q - r, r), Some(Cell::White), "symmetric start");
        }
    }

    #[test]
    fn special_schedule_follows_the_turn_and_the_phase() {
        let table = [
            ((1, 0), ALIEN_PLAYER_END),
            ((2, 0), ALIEN_BOSS_END),
            ((4, 0), 4),
            ((6, 0), ALIEN_BOSS_END),
            ((8, 0), 4),
            ((3, 1), ALIEN_PLAYER_END),
            ((2, 1), 4),
            ((6, 1), 4),
            ((2, 2), 3),
            ((5, 2), ALIEN_PLAYER_END),
        ];
        for ((ply, phase), id) in table {
            assert_eq!(special(ply, phase), Some(id), "ply {ply}, phase {phase}");
        }
    }

    #[test]
    fn a_lay_puts_one_egg_on_an_empty_cell_never_on_a_marble_or_an_egg() {
        let start = alien_start(0).game().board().clone();
        let mut start = start;
        start.set_eggs(vec![((0, 0), 2), ((1, 0), 1)]);
        let mut picked = Vec::new();
        for seed in 0..64 {
            let out = hook(&start, 4, seed);
            let e = out.eggs();
            assert_eq!(e.len(), 3);
            assert_eq!(
                &e[..2],
                &[((0, 0), 2), ((1, 0), 1)],
                "old eggs keep their count"
            );
            let ((q, r), left) = e[2];
            assert_eq!(left, 4);
            assert_eq!(start.get(q, r), Some(Cell::Empty));
            assert!(![(0, 0), (1, 0)].contains(&(q, r)));
            picked.push((q, r));
        }
        picked.sort();
        picked.dedup();
        assert!(picked.len() > 10, "the seed spreads the eggs");
    }

    #[test]
    fn no_lay_at_the_cap_on_a_boss_turn_without_a_lay_or_on_a_full_board() {
        let three = board(&[], &[], &[((0, 0), 4), ((1, 0), 3), ((2, 0), 2)]);
        assert_eq!(hook(&three, 4, 7).eggs(), three.eggs(), "cap of 3");
        let one = board(&[], &[], &[((0, 0), 4)]);
        assert_eq!(hook(&one, ALIEN_BOSS_END, 7).eggs(), one.eggs());
        let all: Vec<P> = cells()
            .filter(|&(q, r)| Board::empty().get(q, r).is_some())
            .collect();
        let full = board(&all, &[], &[]);
        assert!(hook(&full, 4, 7).eggs().is_empty(), "no empty cell");
    }

    #[test]
    fn a_player_turn_counts_the_eggs_down_and_an_egg_at_zero_hatches() {
        let laid = board(&[(3, 0)], &[(-3, 0)], &[((0, 0), 2), ((1, 0), 1)]);
        let out = hook(&laid, ALIEN_PLAYER_END, 7);
        assert_eq!(out.eggs(), &[((0, 0), 1)]);
        assert_eq!(out.get(1, 0), Some(Cell::White), "a new Alien marble");
        assert_eq!(out.get(0, 0), Some(Cell::Empty));
        assert_eq!(marbles(&out, Cell::White), 2);
        let boss_turn = hook(&laid, ALIEN_BOSS_END, 7);
        assert_eq!(boss_turn.eggs(), laid.eggs(), "a boss turn does not count");
    }

    #[test]
    fn a_marble_on_an_egg_crushes_it_and_nothing_hatches() {
        for id in [ALIEN_PLAYER_END, ALIEN_BOSS_END, 4] {
            let on = board(&[(1, 0)], &[(2, 0)], &[((1, 0), 1), ((2, 0), 3)]);
            let out = hook(&on, id, 7);
            assert!(
                out.eggs().iter().all(|&(c, _)| c != (1, 0) && c != (2, 0)),
                "id {id}"
            );
            assert_eq!(out.get(1, 0), Some(Cell::Black));
            assert_eq!(out.get(2, 0), Some(Cell::White));
            assert_eq!(marbles(&out, Cell::White), 1);
        }
    }

    #[test]
    fn a_move_or_push_onto_an_egg_crushes_it_for_either_side() {
        // (black, white, side to move, move, egg cell)
        let table: [(&[P], &[P], Player, Move); 4] = [
            (&[(0, 0)], &[(-3, 0)], Player::Black, mv(&[(0, 0)], E)),
            (
                &[(-1, 0), (0, 0)],
                &[(1, 0)],
                Player::Black,
                mv(&[(-1, 0), (0, 0)], E),
            ),
            (&[(-3, 0)], &[(0, 0)], Player::White, mv(&[(0, 0)], E)),
            (
                &[(1, 0)],
                &[(-1, 0), (0, 0)],
                Player::White,
                mv(&[(-1, 0), (0, 0)], E),
            ),
        ];
        for (i, (black, white, to_move, m)) in table.into_iter().enumerate() {
            let egg = if black.len() + white.len() == 2 {
                (1, 0)
            } else {
                (2, 0)
            };
            let mut enc = fight(black, white, &[(egg, 4), ((-4, 4), 4)], to_move, 0);
            enc.play(&m).unwrap();
            let left: Vec<P> = eggs(&enc).iter().map(|&(c, _)| c).collect();
            assert_eq!(left, vec![(-4, 4)], "case {i}: crushed, the far egg stays");
            let total = marbles(enc.game().board(), Cell::Black) + whites(&enc);
            assert_eq!(usize::from(total), black.len() + white.len(), "case {i}");
        }
    }

    #[test]
    fn p1_lays_an_egg_every_2nd_boss_turn_that_hatches_after_4_player_turns() {
        let mut enc = alien_start(3);
        let mut counts = Vec::new();
        for _ in 0..4 {
            quiet(&mut enc);
            counts.push(eggs(&enc).len());
        }
        assert_eq!(counts, vec![0, 0, 0, 1], "the first egg after ply 4");
        let (cell, left) = eggs(&enc)[0];
        assert_eq!(left, 4);
        assert_eq!(enc.game().board().get(cell.0, cell.1), Some(Cell::Empty));
        let mut lefts = Vec::new();
        for _ in 5..=10 {
            quiet(&mut enc);
            lefts.push(eggs(&enc)[0]);
        }
        assert_eq!(
            lefts,
            [3, 3, 2, 2, 1, 1].map(|n| (cell, n)),
            "down after each player turn"
        );
        assert_eq!(eggs(&enc).len(), 2, "the second egg after ply 8");
        assert_eq!(whites(&enc), 8);
        quiet(&mut enc);
        assert_eq!(enc.game().board().get(cell.0, cell.1), Some(Cell::White));
        assert!(eggs(&enc).iter().all(|&(c, _)| c != cell));
        assert_eq!(whites(&enc), 9, "hatched after ply 11");
        assert_eq!(
            enc.game().ejected(Player::Black),
            0,
            "a hatch is no ejection"
        );
    }

    /// Black's lone marble and `n` Alien marbles on the far left, `ejected` Alien marbles already
    /// credited to the player.
    fn with_alien_marbles(n: usize, ejected: u8, seed: u64) -> Encounter {
        let left = [(-4, 0), (-4, 1), (-4, 2), (-4, 3), (-4, 4)];
        let game = Game::from_position(
            board(&[(2, 2)], &left[..n], &[]),
            Player::Black,
            [ejected, 0],
        );
        Encounter::new(game, alien_boss(), seed)
    }

    /// A fight where eggs hatched: the 8 start marbles and 5 hatched ones, `ejected` of them
    /// already credited to the player.
    fn brood_after(ejected: u8) -> Encounter {
        let hatched = [(-4, 0), (-4, 1), (-4, 2), (-4, 3), (-4, 4)];
        let white: Vec<P> = ALIEN_START.iter().chain(&hatched).copied().collect();
        let game = Game::from_position(board(&[(2, 2)], &white, &[]), Player::Black, [ejected, 0]);
        Encounter::new(game, alien_boss(), 1)
    }

    #[test]
    fn the_phase_follows_the_ejections_credited_to_the_player_not_the_brood() {
        let phases: Vec<usize> = (0..=5).map(|n| brood_after(n).phase()).collect();
        assert_eq!(
            phases,
            vec![0, 0, 1, 1, 2, 2],
            "P2 after 2 ejections, P3 after 4"
        );
        assert_eq!(
            with_alien_marbles(3, 0, 1).phase(),
            0,
            "few marbles left, none ejected"
        );
    }

    #[test]
    fn p2_lays_every_boss_turn_up_to_the_cap() {
        let mut enc = with_alien_marbles(5, 2, 1);
        assert_eq!(enc.phase(), 1);
        let mut counts = Vec::new();
        for _ in 0..8 {
            quiet(&mut enc);
            counts.push(eggs(&enc).len());
        }
        assert_eq!(counts, vec![0, 1, 1, 2, 2, 3, 3, 3]);
        assert_eq!(
            eggs(&enc).iter().map(|e| e.1).collect::<Vec<_>>(),
            [1, 2, 3]
        );
    }

    #[test]
    fn p3_eggs_hatch_after_3_player_turns() {
        let mut enc = with_alien_marbles(3, 4, 1);
        assert_eq!(enc.phase(), 2);
        quiet(&mut enc);
        quiet(&mut enc);
        let (cell, left) = eggs(&enc)[0];
        assert_eq!(left, 3);
        for _ in 3..=6 {
            quiet(&mut enc);
        }
        assert_eq!(eggs(&enc)[0], (cell, 1));
        quiet(&mut enc);
        assert_eq!(enc.game().board().get(cell.0, cell.1), Some(Cell::White));
        assert_eq!(whites(&enc), 4, "hatched after ply 7");
    }

    /// The eggs and the Alien marble count after each of 16 quiet plies.
    fn brood(seed: u64) -> Vec<(Vec<Egg>, u8)> {
        let mut enc = alien_start(seed);
        (0..16)
            .map(|_| {
                quiet(&mut enc);
                (eggs(&enc), whites(&enc))
            })
            .collect()
    }

    #[test]
    fn the_same_seed_and_moves_lay_the_same_eggs_and_the_seed_matters() {
        assert_eq!(brood(11), brood(11));
        let runs: Vec<_> = (0..8).map(brood).collect();
        assert!(
            runs.iter().any(|r| *r != runs[0]),
            "the seed changes the cells"
        );
    }

    #[test]
    fn the_alien_never_ends_a_move_on_its_eggs_while_it_can() {
        let ring = [(1, 0), (-1, 0), (1, -1), (-1, 1), (0, -1)];
        let eggs: Vec<Egg> = ring.iter().map(|&c| (c, 4)).collect();
        let enc = fight(&[(-4, 4)], &[(0, 0)], &eggs, Player::White, 0);
        let m = alien_move(&enc).unwrap();
        assert_eq!(m, mv(&[(0, 0)], Direction::SE), "the one free neighbour");

        let mut all = eggs.clone();
        all.push(((0, 1), 4));
        let enc = fight(&[(-4, 4)], &[(0, 0)], &all, Player::White, 0);
        let m = alien_move(&enc).unwrap();
        assert!(
            legal_moves(enc.game().board(), Player::White).contains(&m),
            "a move anyway"
        );
    }

    #[test]
    fn the_alien_replies_only_on_its_turn() {
        let mut enc = alien_start(0);
        assert_eq!(alien_move(&enc), None);
        quiet(&mut enc);
        let m = alien_move(&enc).unwrap();
        assert!(legal_moves(enc.game().board(), Player::White).contains(&m));
    }
}
