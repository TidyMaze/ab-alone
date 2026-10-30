//! Boss 4, The Echo (docs/specs/game-design.md section 7.4): when a move of one side can be
//! played in point symmetry by the other side, that mirror is played at once for the other side
//! as a free bonus move, both ways, then that side plays its own move. In P2 the other side also
//! gets the mirror of one older move that was never echoed, when it is legal now.

use crate::board::Board;
use crate::encounter::{losses, BossDef, Encounter};
use crate::game::{Game, Outcome};
use crate::moves::{apply, Direction, Move, Player};
use crate::search::{search_phased, DEFAULT_WEIGHTS};

/// P2 starts after this many ejections credited to the player. There is no P3.
pub const ECHO_PHASE_EJECTIONS: [u8; 1] = [3];
/// Positions the boss search may visit. Starting value, to tune (calibration knob).
pub const ECHO_NODE_BUDGET: u32 = 400;

fn no_special(_ply: u32, _phase: usize) -> Option<u8> {
    None
}

fn keep_board(board: &Board, _id: u8, _seed: u64) -> Board {
    board.clone()
}

/// The Echo: no board special, its twist is the bonus moves of [`Encounter::play`].
pub fn echo_boss() -> BossDef {
    BossDef {
        name: "The Echo",
        phase_marbles: Vec::new(),
        phase_ejections: ECHO_PHASE_EJECTIONS.to_vec(),
        special: no_special,
        hook: keep_board,
        conversions: None,
        node_budget: ECHO_NODE_BUDGET,
    }
}

/// A fight against the Echo from `game`.
pub fn echo_fight(game: Game, seed: u64) -> Encounter {
    Encounter::new(game, echo_boss(), seed).echoing()
}

/// A fight against the Echo on the standard board.
pub fn echo_start(seed: u64) -> Encounter {
    echo_fight(Game::new(), seed)
}

fn opposite(dir: Direction) -> Direction {
    match dir {
        Direction::E => Direction::W,
        Direction::W => Direction::E,
        Direction::NE => Direction::SW,
        Direction::SW => Direction::NE,
        Direction::NW => Direction::SE,
        Direction::SE => Direction::NW,
    }
}

fn other(player: Player) -> Player {
    match player {
        Player::Black => Player::White,
        Player::White => Player::Black,
    }
}

/// The point reflection of `mv` through the board center.
pub fn mirror_move(mv: &Move) -> Move {
    Move {
        cells: mv.cells.iter().map(|&(q, r)| (-q, -r)).collect(),
        dir: opposite(mv.dir),
    }
}

/// `true` when the mirror of `mv` is legal for `receiver` on `board`.
fn playable(board: &Board, receiver: Player, mv: &Move) -> bool {
    apply(board, receiver, &mirror_move(mv)).is_ok()
}

/// The index in the memory of `board` of the latest move of `mover` whose mirror `receiver` may
/// play now.
fn older(board: &Board, mover: Player, receiver: Player) -> Option<usize> {
    board
        .echoes()
        .iter()
        .rposition(|(side, mv)| *side == mover && playable(board, receiver, mv))
}

/// `board` with its memory changed by `change`.
fn remember(board: &Board, change: impl FnOnce(&mut Vec<(Player, Move)>)) -> Board {
    let mut echoes = board.echoes().to_vec();
    change(&mut echoes);
    let mut out = board.clone();
    out.set_echoes(echoes);
    out
}

/// `true` when playing `bonus` ends the game as a loss for the side to move, who receives it (a
/// draw is a player loss). Such a bonus is skipped.
fn loses(game: &Game, bonus: &Move) -> bool {
    let receiver = game.to_move();
    let mut after = game.clone();
    after.play_bonus(bonus).expect("a legal bonus");
    match after.outcome() {
        Some(Outcome::Win(winner)) => winner != receiver,
        Some(Outcome::Draw) => receiver == Player::Black,
        None => false,
    }
}

/// Plays `bonus` for the side to move, which moves again, unless it would lose it the game.
fn bonus(enc: &mut Encounter, bonus: &Move) {
    if !loses(&enc.game, bonus) {
        enc.game.play_bonus(bonus).expect("a legal bonus");
    }
}

/// The bonus moves after the main move `mv` of [`Encounter::play`], while the game runs: the
/// mirror of `mv` for the other side when it is legal, then in P2 the mirror of the latest older
/// move of the same side never echoed and legal now. A bonus is never mirrored itself. A move
/// whose mirror was illegal is remembered on the board; an echoed or skipped one is not.
pub(crate) fn play_bonuses(enc: &mut Encounter, mv: &Move) {
    if enc.game.outcome().is_some() {
        return;
    }
    let receiver = enc.game.to_move();
    let mover = other(receiver);
    let legal = playable(enc.game.board(), receiver, mv);
    if legal {
        bonus(enc, &mirror_move(mv));
    }
    if enc.phase() > 0 && enc.game.outcome().is_none() {
        if let Some(i) = older(enc.game.board(), mover, receiver) {
            let old = enc.game.board().echoes()[i].1.clone();
            let board = remember(enc.game.board(), |e| {
                e.remove(i);
            });
            enc.game.replace_board(board);
            bonus(enc, &mirror_move(&old));
        }
    }
    if !legal {
        let board = remember(enc.game.board(), |e| e.push((mover, mv.clone())));
        enc.game.replace_board(board);
    }
}

/// The bonus moves the other side gets when the side to move plays `mv`, in order: the tell.
/// Empty when `mv` is illegal or gives none.
pub fn echo_bonuses(enc: &Encounter, mv: &Move) -> Vec<Move> {
    let mut after = enc.clone();
    let before = enc.game().history().len() + 1;
    if after.play(mv).is_err() {
        return Vec::new();
    }
    after.game().history()[before..]
        .iter()
        .map(|p| p.mv.clone())
        .collect()
}

/// The bonus moves inside the search tree, after `mover` played `mv` (`before` the board before
/// it, `after` the board after it, `ejected` the credits before it): the mirror for the other
/// side, then in P2 the latest older one, with the ejections they credit. The tree does not see
/// the repetitions, so it never skips a bonus.
pub(crate) fn echo_step(
    before: &Board,
    mover: Player,
    mv: &Move,
    after: Board,
    ejected: [u8; 2],
) -> (Board, [u8; 2]) {
    let receiver = other(mover);
    let r = usize::from(receiver == Player::White);
    let p2 = ECHO_PHASE_EJECTIONS[0];
    // The player's credit after the main move: only a player push from one short counts.
    let mut player = ejected[0];
    if mover == Player::Black && player + 1 == p2 {
        player += losses(before, &after)[1];
    }
    let mut credits = [0, 0];
    let mut board = after;
    let mirror = mirror_move(mv);
    let legal = match apply(&board, receiver, &mirror) {
        Ok((next, ejects)) => {
            board = next;
            credits[r] += u8::from(ejects);
            true
        }
        Err(_) => false,
    };
    if player + credits[0] >= p2 {
        if let Some(i) = older(&board, mover, receiver) {
            let old = mirror_move(&board.echoes()[i].1);
            board = remember(&board, |e| {
                e.remove(i);
            });
            let (next, ejects) = apply(&board, receiver, &old).expect("legal now");
            board = next;
            credits[r] += u8::from(ejects);
        }
    }
    if !legal {
        board = remember(&board, |e| e.push((mover, mv.clone())));
    }
    (board, credits)
}

/// The search of `enc`'s side to move where every ply of the tree plays the bonus mirrors, both
/// ways, and the phase follows the credits. Only root moves `allow` accepts are chosen.
pub fn echo_search(enc: &Encounter, budget: u32, allow: &dyn Fn(&Move) -> bool) -> Option<Move> {
    search_phased(enc.game(), budget, DEFAULT_WEIGHTS, allow, &echo_step, None).map(|r| r.mv)
}

/// The boss reply: its node-limited search, which plays the bonus mirrors in the tree. `None` on
/// the player's turn or when the game is over.
pub fn echo_move(enc: &Encounter) -> Option<Move> {
    if enc.game().to_move() != Player::White {
        return None;
    }
    echo_search(enc, enc.boss.node_budget, &|_| true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::game::{Game, Outcome};
    use crate::moves::Direction::{E, NE, NW, SE, SW, W};
    use crate::moves::{legal_moves, Direction, Player};
    use crate::search::{search_with, DEFAULT_WEIGHTS};

    type P = (i32, i32);

    fn mv(cells: &[P], dir: Direction) -> Move {
        Move {
            cells: cells.to_vec(),
            dir,
        }
    }

    fn reflect(cells: &[P]) -> Vec<P> {
        cells.iter().map(|&(q, r)| (-q, -r)).collect()
    }

    /// The fight on `black` and `white`, Black to move. With `swap`, the same position seen from
    /// the other side: the board reflected and the colours swapped, White to move, so the same
    /// test checks the rule both ways. `ejected` is not swapped.
    fn fight(swap: bool, black: &[P], white: &[P], ejected: [u8; 2]) -> Encounter {
        let (black, white, to_move) = if swap {
            (reflect(white), reflect(black), Player::White)
        } else {
            (black.to_vec(), white.to_vec(), Player::Black)
        };
        at(&black, &white, to_move, ejected)
    }

    fn at(black: &[P], white: &[P], to_move: Player, ejected: [u8; 2]) -> Encounter {
        let mut board = Board::empty();
        for &(q, r) in black {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in white {
            board.set(q, r, Cell::White);
        }
        echo_fight(Game::from_position(board, to_move, ejected), 7)
    }

    /// `mv` as played in the fight of [`fight`] with the same `swap`.
    fn side_mv(swap: bool, cells: &[P], dir: Direction) -> Move {
        let m = mv(cells, dir);
        if swap {
            mirror_move(&m)
        } else {
            m
        }
    }

    /// The side that moves first in the fight of [`fight`], and the other one.
    fn sides(swap: bool) -> (Player, Player) {
        if swap {
            (Player::White, Player::Black)
        } else {
            (Player::Black, Player::White)
        }
    }

    fn plies(e: &Encounter) -> Vec<Move> {
        e.game().history().iter().map(|p| p.mv.clone()).collect()
    }

    #[test]
    fn mirror_reflects_cells_and_direction() {
        assert_eq!(mirror_move(&mv(&[(0, 2)], SE)), mv(&[(0, -2)], NW));
        assert_eq!(
            mirror_move(&mv(&[(1, 0), (2, 0)], E)),
            mv(&[(-1, 0), (-2, 0)], W)
        );
        for (d, m) in [(E, W), (W, E), (NE, SW), (SW, NE), (NW, SE), (SE, NW)] {
            assert_eq!(mirror_move(&mv(&[(1, 2)], d)), mv(&[(-1, -2)], m));
        }
    }

    #[test]
    fn echo_boss_has_two_phases_p2_at_the_third_ejection() {
        let boss = echo_boss();
        assert!(boss.phase_marbles.is_empty());
        assert_eq!(boss.phase_ejections, vec![3], "P2 after 3, no P3");
        assert_eq!(boss.node_budget, ECHO_NODE_BUDGET);
        assert_eq!((boss.special)(1, 0), None);
        let board = Board::standard();
        assert_eq!((boss.hook)(&board, 0, 0), board);
        for (ejected, phase) in [(0, 0), (2, 0), (3, 1), (5, 1)] {
            assert_eq!(
                fight(false, &[(0, 3)], &[(0, -3)], [ejected, 0]).phase(),
                phase
            );
        }
        let start = echo_start(3);
        assert_eq!(start.game().board(), &Board::standard());
        assert_eq!(start.game().to_move(), Player::Black);
    }

    #[test]
    fn the_other_side_gets_the_mirror_as_a_bonus_both_ways() {
        for swap in [false, true] {
            let (first, second) = sides(swap);
            let mut e = fight(swap, &[(0, 2)], &[(0, -2)], [0, 0]);
            let played = side_mv(swap, &[(0, 2)], SE);
            e.play(&played).unwrap();
            assert_eq!(plies(&e), vec![played.clone(), mirror_move(&played)]);
            let mirrored = mirror_move(&played).cells[0];
            let target = (mirrored.0, mirrored.1 + if swap { 1 } else { -1 });
            assert_eq!(e.game().board().get(target.0, target.1), Some(cell(second)));
            assert_eq!(e.game().to_move(), second, "then it plays its own move");
            assert!(e.game().board().echoes().is_empty());
            assert_ne!(first, second);
        }
    }

    fn cell(side: Player) -> Cell {
        match side {
            Player::Black => Cell::Black,
            Player::White => Cell::White,
        }
    }

    #[test]
    fn an_illegal_mirror_is_no_bonus_and_is_remembered() {
        for swap in [false, true] {
            let (first, second) = sides(swap);
            let mut e = fight(swap, &[(0, 2)], &[(0, -2), (-1, -2)], [0, 0]);
            let played = side_mv(swap, &[(0, 2)], E);
            e.play(&played).unwrap();
            assert_eq!(plies(&e), vec![played.clone()]);
            assert_eq!(e.game().to_move(), second);
            assert_eq!(e.game().board().echoes(), &[(first, played)]);
        }
    }

    /// Black: a lone marble to move, a blocker, a spare marble and a rim pair. White: the mirror
    /// of the lone marble, its blocker and a rim marble.
    const OLD_BLACK: [P; 5] = [(0, 2), (2, 2), (-3, 4), (2, 0), (3, 0)];
    const OLD_WHITE: [P; 3] = [(0, -2), (-1, -2), (4, 0)];

    /// The first side plays `a` (mirror blocked), then the second side unblocks it with a move
    /// whose own mirror is blocked.
    fn older_setup(swap: bool, ejected: [u8; 2]) -> (Encounter, Move, Move) {
        let mut e = fight(swap, &OLD_BLACK, &OLD_WHITE, ejected);
        let a = side_mv(swap, &[(0, 2)], E);
        let w = side_mv(swap, &[(-1, -2)], W);
        e.play(&a).unwrap();
        e.play(&w).unwrap();
        assert_eq!(plies(&e), vec![a.clone(), w.clone()], "no bonus yet");
        (e, a, w)
    }

    #[test]
    fn p2_also_echoes_the_latest_older_move_whose_mirror_is_legal_now_both_ways() {
        for swap in [false, true] {
            let (first, second) = sides(swap);
            let b = side_mv(swap, &[(-3, 4)], E);
            let (mut e, a, w) = older_setup(swap, [3, 0]);
            e.play(&b).unwrap();
            assert_eq!(
                plies(&e),
                vec![a.clone(), w.clone(), b.clone(), mirror_move(&a)]
            );
            assert_eq!(e.game().to_move(), second);
            assert_eq!(e.game().board().echoes(), &[(second, w), (first, b)]);
        }
    }

    #[test]
    fn p1_never_echoes_an_older_move() {
        for swap in [false, true] {
            let (first, second) = sides(swap);
            let b = side_mv(swap, &[(-3, 4)], E);
            let (mut e, a, w) = older_setup(swap, [2, 0]);
            e.play(&b).unwrap();
            assert_eq!(plies(&e), vec![a.clone(), w.clone(), b.clone()]);
            assert_eq!(
                e.game().board().echoes(),
                &[(first, a), (second, w), (first, b)]
            );
        }
    }

    #[test]
    fn the_third_ejection_starts_p2_at_once() {
        let push = mv(&[(2, 0), (3, 0)], E);
        let (mut e, a, w) = older_setup(false, [2, 0]);
        e.play(&push).unwrap();
        assert_eq!(e.game().ejected(Player::Black), 3);
        assert_eq!(e.phase(), 1);
        assert_eq!(plies(&e), vec![a.clone(), w, push, mirror_move(&a)]);
    }

    #[test]
    fn a_bonus_is_never_echoed_back_in_p2_either() {
        for swap in [false, true] {
            let (_, second) = sides(swap);
            let mut e = fight(swap, &[(0, 2), (-3, 4)], &[(0, -2), (3, -4)], [3, 0]);
            let a = side_mv(swap, &[(0, 2)], SE);
            e.play(&a).unwrap();
            let back = side_mv(swap, &[(0, -3)], SE);
            e.play(&back).unwrap();
            // The second side's bonus, the mirror of `a`, is legal again for the first side, but
            // a bonus is never mirrored: only the mirror of `back` is played.
            assert_eq!(
                plies(&e),
                vec![a.clone(), mirror_move(&a), back.clone(), mirror_move(&back)]
            );
            assert_eq!(e.game().to_move(), sides(swap).0);
            assert!(e.game().board().echoes().is_empty());
            assert_ne!(e.game().to_move(), second);
        }
    }

    #[test]
    fn a_bonus_that_would_lose_the_receiver_the_game_is_skipped() {
        // Both sides shuffle one marble, each move mirrored: the fourth main move brings the
        // start position back a third time on the bonus. A draw is a player loss, so the
        // player's bonus is skipped (counted as echoed); the boss's bonus is played.
        for swap in [false, true] {
            let (first, second) = sides(swap);
            let mut e = fight(swap, &[(0, 2)], &[(0, -2)], [0, 0]);
            let there = side_mv(swap, &[(0, 2)], SE);
            let back = side_mv(swap, &[(0, -3)], SE);
            for m in [&there, &back, &there, &back] {
                e.play(m).unwrap();
            }
            if swap {
                assert_eq!(
                    e.game().outcome(),
                    Some(Outcome::Draw),
                    "the boss bonus is played"
                );
                assert_eq!(e.game().history().len(), 8);
            } else {
                assert_eq!(e.game().outcome(), None, "the player's bonus is skipped");
                assert_eq!(e.game().history().len(), 7);
                assert_eq!(e.game().to_move(), first);
                assert!(
                    e.game().board().echoes().is_empty(),
                    "skipped counts as echoed"
                );
            }
            assert_ne!(first, second);
        }
    }

    #[test]
    fn a_bonus_can_win_the_game_and_ends_it() {
        // The first side's pair steps east on an empty row; the mirror pushes a marble of the
        // first side off the west rim: the 6th ejection of the second side.
        for swap in [false, true] {
            let (_, second) = sides(swap);
            let ejected = if swap { [5, 0] } else { [0, 5] };
            let mut e = fight(
                swap,
                &[(2, 0), (3, 0), (-4, 0)],
                &[(-2, 0), (-3, 0)],
                ejected,
            );
            let played = side_mv(swap, &[(2, 0), (3, 0)], E);
            e.play(&played).unwrap();
            assert_eq!(plies(&e), vec![played.clone(), mirror_move(&played)]);
            assert_eq!(e.game().outcome(), Some(Outcome::Win(second)));
            assert_eq!(echo_move(&e), None);
        }
    }

    #[test]
    fn a_main_move_that_wins_stops_the_game_before_its_bonus() {
        // Both sides at 5: the mover's push is its 6th ejection, its mirror would be the
        // other side's 6th. The mover is credited first and the bonus is never played.
        for swap in [false, true] {
            let (first, _) = sides(swap);
            let mut e = fight(
                swap,
                &[(2, 0), (3, 0), (-4, 0)],
                &[(4, 0), (-2, 0), (-3, 0)],
                [5, 5],
            );
            let push = side_mv(swap, &[(2, 0), (3, 0)], E);
            e.play(&push).unwrap();
            assert_eq!(plies(&e), vec![push]);
            assert_eq!(e.game().outcome(), Some(Outcome::Win(first)));
        }
    }

    #[test]
    fn the_tell_lists_the_bonus_moves_a_move_gives() {
        let e = fight(false, &[(0, 2)], &[(0, -2), (-1, -2)], [0, 0]);
        let played = mv(&[(0, 2)], SE);
        assert_eq!(echo_bonuses(&e, &played), vec![mirror_move(&played)]);
        assert!(
            echo_bonuses(&e, &mv(&[(0, 2)], E)).is_empty(),
            "blocked mirror"
        );
        assert!(
            echo_bonuses(&e, &mv(&[(0, -2)], E)).is_empty(),
            "illegal move"
        );
        let (older, a, _) = older_setup(false, [3, 0]);
        let b = mv(&[(-3, 4)], E);
        assert_eq!(
            echo_bonuses(&older, &b),
            vec![mirror_move(&a)],
            "the older move"
        );
        assert_eq!(older.game().history().len(), 2, "nothing is played");
    }

    #[test]
    fn the_step_plays_the_bonus_in_the_tree_and_credits_it() {
        let black = [(2, 0), (3, 0), (-4, 0)];
        let white = [(-2, 0), (-3, 0)];
        let e = fight(false, &black, &white, [0, 0]);
        let before = e.game().board().clone();
        let played = mv(&[(2, 0), (3, 0)], E);
        let (after, _) = apply(&before, Player::Black, &played).unwrap();
        let (board, credits) = echo_step(&before, Player::Black, &played, after, [0, 0]);
        assert_eq!(credits, [0, 1], "the mirror ejects for White");
        assert_eq!(board.get(-4, 0), Some(Cell::White));
        assert!(board.echoes().is_empty());
    }

    #[test]
    fn the_step_remembers_an_illegal_mirror_and_plays_an_older_one_in_p2() {
        let before = fight(false, &OLD_BLACK, &OLD_WHITE, [3, 0])
            .game()
            .board()
            .clone();
        let a = mv(&[(0, 2)], E);
        let (after, _) = apply(&before, Player::Black, &a).unwrap();
        let (board, credits) = echo_step(&before, Player::Black, &a, after, [3, 0]);
        assert_eq!(credits, [0, 0]);
        assert_eq!(board.echoes(), &[(Player::Black, a.clone())]);
        let w = mv(&[(-1, -2)], W);
        let (after, _) = apply(&board, Player::White, &w).unwrap();
        let (board, _) = echo_step(&board, Player::White, &w, after, [3, 0]);
        let b = mv(&[(-3, 4)], E);
        for (ejected, older) in [([3, 0], true), ([2, 0], false)] {
            let (after, _) = apply(&board, Player::Black, &b).unwrap();
            let (out, _) = echo_step(&board, Player::Black, &b, after, ejected);
            assert_eq!(out.get(-1, -2) == Some(Cell::White), older, "{ejected:?}");
        }
        // The push that is the player's 3rd ejection starts P2 inside the tree too.
        let push = mv(&[(2, 0), (3, 0)], E);
        let (after, _) = apply(&board, Player::Black, &push).unwrap();
        let (out, _) = echo_step(&board, Player::Black, &push, after, [2, 0]);
        assert_eq!(
            out.get(-1, -2),
            Some(Cell::White),
            "P2 from the 3rd ejection"
        );
    }

    #[test]
    fn the_boss_search_sees_the_bonus_it_gives_away() {
        // Two pushes eject a player marble: the west one hands the player a mirror push that
        // ejects a boss marble, the south one gives no mirror. The plain search takes the west
        // one first; the Echo's search, which plays the bonus mirrors, takes the south one.
        let e = at(
            &[(-4, 0), (0, 4), (2, 0), (3, 0)],
            &[(-2, 0), (-3, 0), (0, 2), (0, 3), (4, 0)],
            Player::White,
            [0, 0],
        );
        let west = mv(&[(-3, 0), (-2, 0)], W);
        let south = mv(&[(0, 2), (0, 3)], SE);
        let plain = search_with(e.game(), ECHO_NODE_BUDGET, DEFAULT_WEIGHTS, &|_| true);
        assert_eq!(plain.map(|r| r.mv), Some(west));
        assert_eq!(echo_move(&e), Some(south));
    }

    #[test]
    fn no_reply_on_the_players_turn_or_after_the_end() {
        let e = echo_start(1);
        assert_eq!(echo_move(&e), None);
        let mut e = e;
        e.play(&legal_moves(e.game().board(), Player::Black)[0].clone())
            .unwrap();
        let reply = echo_move(&e).unwrap();
        assert!(legal_moves(e.game().board(), Player::White).contains(&reply));
    }

    #[test]
    fn same_seed_same_game() {
        let run = || {
            let mut e = echo_start(3);
            for _ in 0..8 {
                let m = if e.game().to_move() == Player::White {
                    echo_move(&e).unwrap()
                } else {
                    legal_moves(e.game().board(), Player::Black)[0].clone()
                };
                e.play(&m).unwrap();
            }
            plies(&e)
        };
        assert_eq!(run(), run());
    }
}
