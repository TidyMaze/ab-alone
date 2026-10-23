use serde::{Deserialize, Serialize};

/// Axial hex coordinates `(q, r)`. Center is `(0, 0)`, `s = -q - r`.
pub type Hex = (i8, i8);

pub const RADIUS: i8 = 4;

/// The 6 axial directions, clockwise starting east.
pub const DIRS: [Hex; 6] = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash, Serialize, Deserialize)]
pub enum Player {
    Black,
    White,
}

impl Player {
    pub fn other(self) -> Player {
        match self {
            Player::Black => Player::White,
            Player::White => Player::Black,
        }
    }
}

pub fn on_board((q, r): Hex) -> bool {
    q.abs() <= RADIUS && r.abs() <= RADIUS && (q + r).abs() <= RADIUS
}

pub fn add((q, r): Hex, (dq, dr): Hex) -> Hex {
    (q + dq, r + dr)
}

/// All 61 cells, row by row from `r = -RADIUS`.
pub fn cells() -> impl Iterator<Item = Hex> {
    (-RADIUS..=RADIUS).flat_map(|r| {
        (-RADIUS..=RADIUS)
            .map(move |q| (q, r))
            .filter(|&h| on_board(h))
    })
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub struct Board {
    // indexed by (r + RADIUS) * 9 + (q + RADIUS); off-board slots stay None
    cells: Vec<Option<Player>>,
}

fn idx((q, r): Hex) -> usize {
    ((r + RADIUS) as usize) * 9 + (q + RADIUS) as usize
}

impl Board {
    pub fn empty() -> Board {
        Board {
            cells: vec![None; 81],
        }
    }

    /// White on rows r = -4, -3 and the middle 3 of r = -2; Black mirrored.
    pub fn standard() -> Board {
        let mut b = Board::empty();
        for h in cells() {
            let (q, r) = h;
            if r <= -3 || (r == -2 && (0..=2).contains(&q)) {
                b.set(h, Some(Player::White));
            } else if r >= 3 || (r == 2 && (-2..=0).contains(&q)) {
                b.set(h, Some(Player::Black));
            }
        }
        b
    }

    /// Belgian daisy: two 7-marble hexagons per side, on opposite flanks.
    pub fn belgian_daisy() -> Board {
        let mut b = Board::empty();
        let flower = |b: &mut Board, c: Hex, p: Player| {
            b.set(c, Some(p));
            for d in DIRS {
                b.set(add(c, d), Some(p));
            }
        };
        flower(&mut b, (-1, -2), Player::White);
        flower(&mut b, (1, 2), Player::White);
        flower(&mut b, (2, -3), Player::Black);
        flower(&mut b, (-2, 3), Player::Black);
        b
    }

    /// Off-board cells read as empty.
    pub fn get(&self, h: Hex) -> Option<Player> {
        if on_board(h) {
            self.cells[idx(h)]
        } else {
            None
        }
    }

    /// Panics if `h` is off-board.
    pub fn set(&mut self, h: Hex, p: Option<Player>) {
        assert!(on_board(h), "off-board {h:?}");
        self.cells[idx(h)] = p;
    }

    pub fn count(&self, p: Player) -> usize {
        self.cells.iter().filter(|&&c| c == Some(p)).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_61_cells() {
        assert_eq!(cells().count(), 61);
    }

    #[test]
    fn layouts_have_14_each() {
        for b in [Board::standard(), Board::belgian_daisy()] {
            assert_eq!(b.count(Player::Black), 14);
            assert_eq!(b.count(Player::White), 14);
        }
    }

    #[test]
    fn standard_is_point_symmetric() {
        let b = Board::standard();
        for (q, r) in cells() {
            assert_eq!(b.get((q, r)).map(Player::other), b.get((-q, -r)));
        }
    }
}
