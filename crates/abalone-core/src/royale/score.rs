//! Battle royale placement and points: the order of elimination sets the places, and a place
//! gives its points plus 1 per ejection credited (rules.md section 10.4).

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::super::{resolve_round, seat_cell, start, Order, Royale};
    use super::*;
    use crate::board::{Board, MAX_RADIUS};
    use crate::moves::{Direction, Direction::*, Move};

    type P = (i32, i32);

    /// A royale of `seats` seats on the radius 8 arena with only the listed marbles, at `round`.
    fn arena(seats: usize, round: u32, marbles: &[(P, usize)]) -> Royale {
        let mut board = Board::with_radius(MAX_RADIUS);
        for &((q, r), seat) in marbles {
            board.set(q, r, seat_cell(seat));
        }
        Royale {
            board,
            seats,
            round,
            ejections: vec![0; seats],
            touched: BTreeMap::new(),
            last_void: vec![0; seats],
            eliminated: Vec::new(),
        }
    }

    fn go(cells: &[P], dir: Direction) -> Order {
        Order::Move(Move {
            cells: cells.to_vec(),
            dir,
        })
    }

    /// Plays one round where every seat holds.
    fn hold(s: &Royale) -> Royale {
        resolve_round(s, &[]).unwrap().0
    }

    fn standing(place: usize, points: u32) -> Standing {
        Standing { place, points }
    }

    #[test]
    fn each_table_takes_the_first_places_of_10_6_4_2_1_then_0_for_last() {
        let tables: [&[u32]; 4] = [
            &[10, 6, 0],
            &[10, 6, 4, 0],
            &[10, 6, 4, 2, 0],
            &[10, 6, 4, 2, 1, 0],
        ];
        for (seats, table) in (3..).zip(tables) {
            let got: Vec<u32> = (1..=seats).map(|p| placement_points(seats, p)).collect();
            assert_eq!(got, table, "{seats} seats");
        }
    }

    #[test]
    fn no_standings_before_the_game_is_over() {
        assert_eq!(start(3).unwrap().standings(), None);
    }

    #[test]
    fn the_order_of_elimination_sets_the_places() {
        // Round 12, initiative 3, 0, 1, 2. Seat 0 ejects seat 1's last marble at turn 2, seat 2
        // ejects seat 3's at turn 4: seat 1 is out first, seat 3 second. Seats 0 and 2 end on
        // the radius 8 ring, which cracks, then voids at the end of round 13 with seat 0's 3
        // marbles and seat 2's 2: seat 2 is out third, seat 0 wins.
        let s = arena(
            4,
            12,
            &[
                ((2, -8), 0),
                ((1, -8), 0),
                ((8, 0), 0),
                ((0, -8), 1),
                ((-2, 8), 2),
                ((-1, 8), 2),
                ((0, 8), 3),
            ],
        );
        let orders = [
            (0, go(&[(2, -8), (1, -8)], W)),
            (2, go(&[(-2, 8), (-1, 8)], E)),
        ];
        let (s, _) = resolve_round(&s, &orders).unwrap();
        assert_eq!(s.eliminated, [vec![1], vec![3]]);
        assert_eq!(s.standings(), None);
        let end = hold(&s);
        assert_eq!(end.eliminated, [vec![1], vec![3], vec![2], vec![0]]);
        assert_eq!(end.winners(), Some(vec![0]));
        assert_eq!(
            end.standings(),
            Some(vec![
                standing(1, 11),
                standing(4, 0),
                standing(2, 7),
                standing(3, 4),
            ])
        );
    }

    /// Seats 0 and 1 have 2 marbles on the radius 8 ring, seat 2 has 1, seat 3 sits in the
    /// centre: the void at the end of round 13 takes seats 0 to 2 at once.
    fn void_takes_three() -> Royale {
        arena(
            4,
            12,
            &[
                ((8, 0), 0),
                ((8, -1), 0),
                ((0, 8), 1),
                ((1, 7), 1),
                ((-8, 0), 2),
                ((0, 0), 3),
            ],
        )
    }

    #[test]
    fn seats_a_void_takes_together_share_a_place_on_a_tie() {
        let end = hold(&hold(&void_takes_three()));
        assert_eq!(end.eliminated, [vec![2], vec![0, 1]]);
        assert_eq!(
            end.standings(),
            Some(vec![
                standing(2, 6),
                standing(2, 6),
                standing(4, 0),
                standing(1, 10),
            ])
        );
    }

    #[test]
    fn seats_a_void_takes_together_are_ranked_by_marbles_lost_then_ejections() {
        let mut s = void_takes_three();
        s.ejections[1] = 1;
        let end = hold(&hold(&s));
        assert_eq!(end.eliminated, [vec![2], vec![0], vec![1]]);
        assert_eq!(
            end.standings(),
            Some(vec![
                standing(3, 4),
                standing(2, 7),
                standing(4, 0),
                standing(1, 10),
            ])
        );
    }

    #[test]
    fn a_void_that_takes_everyone_shares_first_place_on_a_tie() {
        // The same ring without seat 3, in a 3 seat game.
        let s = arena(
            3,
            12,
            &[
                ((8, 0), 0),
                ((8, -1), 0),
                ((0, 8), 1),
                ((1, 7), 1),
                ((-8, 0), 2),
            ],
        );
        let end = hold(&hold(&s));
        assert_eq!(end.winners(), Some(vec![0, 1]));
        assert_eq!(
            end.standings(),
            Some(vec![standing(1, 10), standing(1, 10), standing(3, 0)])
        );
    }

    #[test]
    fn a_held_game_ends_with_every_seat_sharing_first_place() {
        // Every wedge loses 3, 4, then its last 3 marbles to the voids of rounds 13, 19, 25.
        for seats in 3..=6 {
            let mut s = start(seats).unwrap();
            while !s.is_over() {
                s = hold(&s);
            }
            assert_eq!(s.round(), 26);
            assert_eq!(s.eliminated, [(0..seats).collect::<Vec<_>>()]);
            assert_eq!(s.standings(), Some(vec![standing(1, 10); seats]));
        }
    }
}
