//! The troop's push in the Open world (docs/specs/openworld.md sections 3 and 4): an Abalone inline
//! push (`rules.md` section 5) of a line of 2 or 3 troop marbles against a smaller line of enemy
//! marbles, on the cells of the world. Water and the edge of the world eject the last enemy; a
//! blocked cell or a marble beyond the enemy line refuses the push.

use crate::moves::Direction;
use crate::world::Terrain;

/// Where an ejected marble falls: into water, or off the edge of the world.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fall {
    Water,
    Edge,
}

/// What happens to the last enemy of a push.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    /// The last enemy moves to this cell.
    Slides((i32, i32)),
    /// The last enemy falls and leaves the map.
    Ejected(Fall),
}

/// A legal push: the direction, the pushing line (back to front), the enemy line (first to last),
/// the outcome of the last enemy and the number of ejections (0 or 1).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Push {
    pub dir: Direction,
    pub troop: Vec<(i32, i32)>,
    pub enemies: Vec<(i32, i32)>,
    pub last: Outcome,
    pub ejections: u8,
}

/// The best legal push of `troop` against `enemies` on the cells given by `terrain` (`None` off the
/// world). Most ejections first, then the lowest `(r, q)` of the back marble, then the lowest
/// direction index. `None` when no push is legal.
pub fn best_push(
    troop: &[(i32, i32)],
    enemies: &[(i32, i32)],
    terrain: impl Fn(i32, i32) -> Option<Terrain>,
) -> Option<Push> {
    let _ = (troop, enemies, terrain);
    None
}

/// Plays `push` on the troop and the enemies: the pushing marbles and the enemy line move one cell
/// along `push.dir` (the troop keeps its order), an ejected enemy is removed. Returns the cells the
/// ejected enemies stood on before the push.
pub fn apply_push(
    troop: &mut Vec<(i32, i32)>,
    enemies: &mut Vec<(i32, i32)>,
    push: &Push,
) -> Vec<(i32, i32)> {
    let _ = (troop, enemies, push);
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{Board, Cell};
    use crate::moves::{apply, legal_moves, Direction::*, Player};

    type P = (i32, i32);

    /// A world of grass, with the given special cells, and `None` beyond the hex of `radius`.
    fn world(special: &[(P, Terrain)], radius: i32) -> impl Fn(i32, i32) -> Option<Terrain> + '_ {
        move |q, r| {
            if q.abs() > radius || r.abs() > radius || (q + r).abs() > radius {
                return None;
            }
            Some(
                special
                    .iter()
                    .find(|(c, _)| *c == (q, r))
                    .map_or(Terrain::Grass, |&(_, t)| t),
            )
        }
    }

    /// Grass with no edge in reach of these tests.
    const WIDE: i32 = 50;

    fn plain() -> impl Fn(i32, i32) -> Option<Terrain> {
        world(&[], WIDE)
    }

    /// The six directions with their axial vectors, written out here as the rule states them.
    const DIRS: [(Direction, P); 6] = [
        (E, (1, 0)),
        (W, (-1, 0)),
        (NE, (1, -1)),
        (SW, (-1, 1)),
        (NW, (0, -1)),
        (SE, (0, 1)),
    ];

    fn push(
        dir: Direction,
        troop: &[P],
        enemies: &[P],
        last: Outcome,
        ejections: u8,
    ) -> Option<Push> {
        Some(Push {
            dir,
            troop: troop.to_vec(),
            enemies: enemies.to_vec(),
            last,
            ejections,
        })
    }

    #[test]
    fn two_pushes_one_on_open_ground() {
        let p = best_push(&[(0, 0), (1, 0)], &[(2, 0)], plain());
        assert_eq!(
            p,
            push(E, &[(0, 0), (1, 0)], &[(2, 0)], Outcome::Slides((3, 0)), 0)
        );
    }

    #[test]
    fn three_pushes_one_on_open_ground() {
        // The 2-line (1,0)-(2,0) is legal too, but its back marble is not the lowest.
        let p = best_push(&[(0, 0), (1, 0), (2, 0)], &[(3, 0)], plain());
        assert_eq!(
            p,
            push(
                E,
                &[(0, 0), (1, 0), (2, 0)],
                &[(3, 0)],
                Outcome::Slides((4, 0)),
                0
            )
        );
    }

    #[test]
    fn three_pushes_two_on_open_ground() {
        let p = best_push(&[(0, 0), (1, 0), (2, 0)], &[(3, 0), (4, 0)], plain());
        assert_eq!(
            p,
            push(
                E,
                &[(0, 0), (1, 0), (2, 0)],
                &[(3, 0), (4, 0)],
                Outcome::Slides((5, 0)),
                0
            )
        );
    }

    #[test]
    fn two_does_not_push_two() {
        assert_eq!(
            best_push(&[(0, 0), (1, 0)], &[(2, 0), (3, 0)], plain()),
            None
        );
    }

    #[test]
    fn three_does_not_push_three() {
        let p = best_push(
            &[(0, 0), (1, 0), (2, 0)],
            &[(3, 0), (4, 0), (5, 0)],
            plain(),
        );
        assert_eq!(p, None);
    }

    #[test]
    fn enemies_running_on_past_the_line_are_all_counted() {
        // Two enemies right behind a 2-line are a run of 2, which a 2-line does not push.
        assert_eq!(
            best_push(&[(-1, 0), (0, 0)], &[(1, 0), (2, 0)], plain()),
            None
        );
    }

    #[test]
    fn single_marble_pushes_nothing() {
        assert_eq!(best_push(&[(0, 0)], &[(1, 0)], plain()), None);
    }

    #[test]
    fn each_of_the_six_directions_pushes() {
        for (dir, (dq, dr)) in DIRS {
            let p = best_push(&[(-dq, -dr), (0, 0)], &[(dq, dr)], plain());
            assert_eq!(
                p,
                push(
                    dir,
                    &[(-dq, -dr), (0, 0)],
                    &[(dq, dr)],
                    Outcome::Slides((2 * dq, 2 * dr)),
                    0
                ),
                "direction {dir:?}"
            );
        }
    }

    #[test]
    fn push_into_water_ejects_the_last_enemy() {
        let water = [((5, 0), Terrain::Water)];
        let p = best_push(
            &[(0, 0), (1, 0), (2, 0)],
            &[(3, 0), (4, 0)],
            world(&water, WIDE),
        );
        assert_eq!(
            p,
            push(
                E,
                &[(0, 0), (1, 0), (2, 0)],
                &[(3, 0), (4, 0)],
                Outcome::Ejected(Fall::Water),
                1
            )
        );
    }

    #[test]
    fn push_off_the_world_ejects_the_last_enemy() {
        // The hex of radius 4: the enemy on (4,0) is on the edge, (5,0) is off the world.
        let p = best_push(&[(2, 0), (3, 0)], &[(4, 0)], world(&[], 4));
        assert_eq!(
            p,
            push(
                E,
                &[(2, 0), (3, 0)],
                &[(4, 0)],
                Outcome::Ejected(Fall::Edge),
                1
            )
        );
    }

    #[test]
    fn push_into_an_obstacle_is_refused() {
        for blocked in [
            Terrain::Tree,
            Terrain::Boulder,
            Terrain::Wall,
            Terrain::Peak,
        ] {
            let obstacle = [((3, 0), blocked)];
            let p = best_push(&[(0, 0), (1, 0)], &[(2, 0)], world(&obstacle, WIDE));
            assert_eq!(p, None, "{blocked:?} beyond the enemy");
        }
    }

    #[test]
    fn push_into_a_friendly_marble_is_refused() {
        // (3,0) is a troop marble: the 2-line (0,0)-(1,0) cannot push (2,0) into it.
        let p = best_push(&[(0, 0), (1, 0), (3, 0)], &[(2, 0)], plain());
        assert_eq!(p, None);
    }

    #[test]
    fn a_friendly_marble_in_the_enemy_place_makes_that_push_illegal() {
        // (2,0) is a troop marble: the 2-line (0,0)-(1,0) has no enemy in front. The 3-line pushes
        // the two enemies on (3,0)-(4,0), and it is the only legal push.
        let p = best_push(&[(0, 0), (1, 0), (2, 0)], &[(3, 0), (4, 0)], plain());
        assert_eq!(
            p,
            push(
                E,
                &[(0, 0), (1, 0), (2, 0)],
                &[(3, 0), (4, 0)],
                Outcome::Slides((5, 0)),
                0
            )
        );
    }

    #[test]
    fn no_legal_push_is_none() {
        assert_eq!(best_push(&[(0, 0), (1, 0)], &[], plain()), None);
    }

    #[test]
    fn an_ejection_beats_a_lower_back_marble() {
        // The 2-line (2,0)-(3,0) ejects (4,0) off the edge; the 2-line (-2,-1)-(-1,-1) slides, and
        // its back marble has the lower (r, q), but ejections come first.
        let troop = [(2, 0), (3, 0), (-2, -1), (-1, -1)];
        let p = best_push(&troop, &[(4, 0), (0, -1)], world(&[], 4));
        assert_eq!(
            p,
            push(
                E,
                &[(2, 0), (3, 0)],
                &[(4, 0)],
                Outcome::Ejected(Fall::Edge),
                1
            )
        );
    }

    #[test]
    fn equal_ejections_lowest_r_of_the_back_marble_wins() {
        // Back marbles (r, q): (-1, 3) for the line on row -1, (0, -2) for the line on row 0.
        let troop = [(-2, 0), (-1, 0), (3, -1), (4, -1)];
        let p = best_push(&troop, &[(0, 0), (5, -1)], plain());
        assert_eq!(
            p,
            push(
                E,
                &[(3, -1), (4, -1)],
                &[(5, -1)],
                Outcome::Slides((6, -1)),
                0
            )
        );
    }

    #[test]
    fn equal_r_lowest_q_of_the_back_marble_wins() {
        // Both lines are on row 0, with back marbles (0, -2) and (0, 2).
        let troop = [(-2, 0), (-1, 0), (2, 0), (3, 0)];
        let p = best_push(&troop, &[(0, 0), (4, 0)], plain());
        assert_eq!(
            p,
            push(
                E,
                &[(-2, 0), (-1, 0)],
                &[(0, 0)],
                Outcome::Slides((1, 0)),
                0
            )
        );
    }

    #[test]
    fn equal_back_marble_lowest_direction_index_wins() {
        // Two legal 2-lines share the back marble (0,0): E (index 0) and NE (index 2).
        let troop = [(0, 0), (1, 0), (1, -1)];
        let p = best_push(&troop, &[(2, 0), (2, -2)], plain());
        assert_eq!(
            p,
            push(E, &[(0, 0), (1, 0)], &[(2, 0)], Outcome::Slides((3, 0)), 0)
        );
    }

    #[test]
    fn apply_push_slides_the_pushing_line_and_the_enemy_line() {
        let mut troop = vec![(0, 0), (1, 0), (9, 9)];
        let mut enemies = vec![(2, 0), (7, 7)];
        let p = best_push(&troop, &enemies, plain()).expect("a legal push");
        let gone = apply_push(&mut troop, &mut enemies, &p);
        assert_eq!(troop, vec![(1, 0), (2, 0), (9, 9)]);
        assert_eq!(enemies, vec![(3, 0), (7, 7)]);
        assert!(gone.is_empty());
    }

    #[test]
    fn apply_push_ejects_the_last_enemy_and_returns_its_cell() {
        let mut troop = vec![(0, 0), (1, 0), (2, 0)];
        let mut enemies = vec![(3, 0), (4, 0)];
        let water = [((5, 0), Terrain::Water)];
        let p = best_push(&troop, &enemies, world(&water, WIDE)).expect("a legal push");
        let gone = apply_push(&mut troop, &mut enemies, &p);
        assert_eq!(troop, vec![(1, 0), (2, 0), (3, 0)]);
        assert_eq!(enemies, vec![(4, 0)]);
        assert_eq!(gone, vec![(4, 0)]);
    }

    /// The Abalone board of radius 4 has the same cells as the world used here: a cell is on the
    /// board when it is inside the hex of radius 4, with the same axial coordinates.
    fn abalone_cells(board: &Board, cell: Cell) -> Vec<P> {
        let mut v = Vec::new();
        for q in -4..=4 {
            for r in -4..=4 {
                if board.get(q, r) == Some(cell) {
                    v.push((q, r));
                }
            }
        }
        v.sort();
        v
    }

    /// Replays the push of `troop` against `enemies` through the Abalone rules: `best_push` must
    /// be an inline move `legal_moves` lists for Black, `apply` must give the marbles that
    /// `apply_push` gives, and the ejection must agree.
    fn replay(troop: &[P], enemies: &[P]) {
        let hex = |q: i32, r: i32| {
            (q.abs() <= 4 && r.abs() <= 4 && (q + r).abs() <= 4).then_some(Terrain::Grass)
        };
        let found = best_push(troop, enemies, hex).expect("a legal push");
        let mut board = Board::empty();
        for &(q, r) in troop {
            board.set(q, r, Cell::Black);
        }
        for &(q, r) in enemies {
            board.set(q, r, Cell::White);
        }
        let mut want = found.troop.clone();
        want.sort();
        let mv = legal_moves(&board, Player::Black)
            .into_iter()
            .find(|m| {
                let mut cells = m.cells.clone();
                cells.sort();
                m.dir == found.dir && cells == want
            })
            .expect("Abalone lists the push as a legal inline move");
        let (after, ejected) = apply(&board, Player::Black, &mv).expect("legal");

        let (mut t, mut e) = (troop.to_vec(), enemies.to_vec());
        let gone = apply_push(&mut t, &mut e, &found);
        t.sort();
        e.sort();
        assert_eq!(abalone_cells(&after, Cell::Black), t);
        assert_eq!(abalone_cells(&after, Cell::White), e);
        assert_eq!(ejected, !gone.is_empty());
    }

    #[test]
    fn abalone_replays_a_slide_of_2_against_1() {
        replay(&[(-2, 1), (-1, 1)], &[(0, 1)]);
    }

    #[test]
    fn abalone_replays_a_slide_of_3_against_2() {
        replay(&[(-2, 0), (-1, 0), (0, 0)], &[(1, 0), (2, 0)]);
    }

    #[test]
    fn abalone_replays_an_ejection_off_the_edge() {
        // (4,0) is on the rim of the radius 4 board; the push takes it off the board.
        replay(&[(2, 0), (3, 0)], &[(4, 0)]);
    }
}
