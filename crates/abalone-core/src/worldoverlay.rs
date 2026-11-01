//! The enemy overlay of the Open world fight (docs/specs/openworld.md section 3): the generated enemies of a seed never change; a
//! push removes the ones it moved away (`removed`, by cell) and adds the ones that now stand where no generated enemy starts
//! (`added`). The generated enemies of a chunk come in as an argument, so the rule stays pure and testable. Both lists keep the
//! order in which cells were put in: the order of the enemies is the order the push rule sees them in.

use crate::world::CHUNK;

/// A cell, `q, r`.
pub type Cell = (i32, i32);

/// The chunk a cell is in.
fn chunk_of((q, r): Cell) -> Cell {
    (q.div_euclid(CHUNK), r.div_euclid(CHUNK))
}

/// What the pushes of the troop changed on the generated enemies, and how many enemies were ejected.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Overlay {
    removed: Vec<Cell>,
    added: Vec<Cell>,
    beaten: u32,
}

impl Overlay {
    /// A fight with no push: the generated enemies are all there, none beaten.
    pub fn new() -> Self {
        Self::default()
    }

    /// The overlay of a saved fight: the lists are kept as given, in their order.
    pub fn from_parts(removed: Vec<Cell>, added: Vec<Cell>, beaten: u32) -> Self {
        Self {
            removed,
            added,
            beaten,
        }
    }

    /// The generated enemies gone, in the order they went.
    pub fn removed(&self) -> &[Cell] {
        &self.removed
    }

    /// The enemies on cells where no generated enemy starts, in the order they came.
    pub fn added(&self) -> &[Cell] {
        &self.added
    }

    /// The enemies ejected so far.
    pub fn beaten(&self) -> u32 {
        self.beaten
    }

    /// Hides generated enemies: a test fixture replaces them with its own.
    pub fn hide(&mut self, cells: &[Cell]) {
        for &cell in cells {
            if !self.removed.contains(&cell) {
                self.removed.push(cell);
            }
        }
    }

    /// The enemies on chunk `chunk` now: the `generated` ones of that chunk not moved, then the ones pushed onto it.
    pub fn chunk_enemies(&self, generated: &[Cell], chunk: Cell) -> Vec<Cell> {
        let mut cells: Vec<Cell> = generated
            .iter()
            .copied()
            .filter(|cell| !self.removed.contains(cell))
            .collect();
        cells.extend(
            self.added
                .iter()
                .copied()
                .filter(|&cell| chunk_of(cell) == chunk),
        );
        cells
    }

    /// Whether an enemy stands on `cell` now; `generated` are the generated enemies of its chunk.
    pub fn occupied(&self, generated: &[Cell], cell: Cell) -> bool {
        self.added.contains(&cell) || (!self.removed.contains(&cell) && generated.contains(&cell))
    }

    /// Plays a push: the enemies `old` leave their cells, the enemies `new` stand on theirs, and the `ejected` ones count as beaten.
    /// A generated enemy that comes back to its cell is that generated enemy again.
    pub fn apply(&mut self, old: &[Cell], new: &[Cell], ejected: usize) {
        for &cell in old {
            if let Some(i) = self.added.iter().position(|&c| c == cell) {
                self.added.remove(i);
            } else if !self.removed.contains(&cell) {
                self.removed.push(cell);
            }
        }
        for &cell in new {
            if let Some(i) = self.removed.iter().position(|&c| c == cell) {
                self.removed.remove(i);
            } else if !self.added.contains(&cell) {
                self.added.push(cell);
            }
        }
        self.beaten += ejected as u32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_overlay_changes_nothing() {
        let overlay = Overlay::new();
        assert!(overlay.removed().is_empty() && overlay.added().is_empty());
        assert_eq!(overlay.beaten(), 0);
        assert_eq!(
            overlay.chunk_enemies(&[(1, 0), (2, 0)], (0, 0)),
            [(1, 0), (2, 0)]
        );
        assert!(overlay.occupied(&[(1, 0)], (1, 0)));
        assert!(!overlay.occupied(&[(1, 0)], (2, 0)));
    }

    #[test]
    fn a_pushed_generated_enemy_leaves_its_cell_and_stands_on_the_new_one() {
        let mut overlay = Overlay::new();
        overlay.apply(&[(1, 0)], &[(2, 0)], 0);
        assert_eq!(overlay.removed(), [(1, 0)]);
        assert_eq!(overlay.added(), [(2, 0)]);
        assert!(!overlay.occupied(&[(1, 0)], (1, 0)));
        assert!(overlay.occupied(&[], (2, 0)));
        assert_eq!(overlay.chunk_enemies(&[(1, 0)], (0, 0)), [(2, 0)]);
    }

    #[test]
    fn an_enemy_that_comes_back_to_its_generated_cell_is_that_generated_enemy_again() {
        let mut overlay = Overlay::new();
        overlay.apply(&[(1, 0)], &[(2, 0)], 0);
        overlay.apply(&[(2, 0)], &[(1, 0)], 0);
        assert_eq!(overlay, Overlay::new());
    }

    #[test]
    fn ejected_enemies_are_counted() {
        let mut overlay = Overlay::new();
        overlay.apply(&[(1, 0), (5, 0)], &[], 2);
        overlay.apply(&[], &[], 1);
        assert_eq!(overlay.beaten(), 3);
        assert_eq!(overlay.removed(), [(1, 0), (5, 0)]);
    }

    #[test]
    fn a_pushed_enemy_belongs_to_the_chunk_it_stands_in_below_zero_too() {
        let mut overlay = Overlay::new();
        overlay.apply(&[], &[(-1, -1), (16, 0)], 0);
        assert_eq!(overlay.chunk_enemies(&[], (-1, -1)), [(-1, -1)]);
        assert_eq!(overlay.chunk_enemies(&[(3, 3)], (0, 0)), [(3, 3)]);
        assert_eq!(overlay.chunk_enemies(&[], (1, 0)), [(16, 0)]);
    }

    #[test]
    fn the_cells_keep_the_order_they_came_in() {
        let mut overlay = Overlay::new();
        overlay.apply(&[], &[(3, 0), (1, 0), (2, 0)], 0);
        overlay.apply(&[(1, 0)], &[], 0);
        assert_eq!(overlay.added(), [(3, 0), (2, 0)]);
        assert_eq!(
            overlay.chunk_enemies(&[(9, 9)], (0, 0)),
            [(9, 9), (3, 0), (2, 0)]
        );
    }

    #[test]
    fn a_cell_is_in_a_list_once_and_keeps_its_place() {
        let mut overlay = Overlay::new();
        overlay.apply(&[(1, 0), (1, 0)], &[(3, 0), (4, 0), (3, 0)], 0);
        assert_eq!(overlay.removed(), [(1, 0)]);
        assert_eq!(overlay.added(), [(3, 0), (4, 0)]);
        overlay.apply(&[(1, 0)], &[], 0);
        assert_eq!(overlay.removed(), [(1, 0)]);
    }

    #[test]
    fn hide_removes_generated_enemies_once() {
        let mut overlay = Overlay::new();
        overlay.hide(&[(1, 0), (2, 0), (1, 0)]);
        assert_eq!(overlay.removed(), [(1, 0), (2, 0)]);
        assert!(overlay.chunk_enemies(&[(1, 0), (2, 0)], (0, 0)).is_empty());
    }

    #[test]
    fn a_saved_overlay_comes_back_as_it_was() {
        let overlay = Overlay::from_parts(vec![(4, 4), (1, 1)], vec![(2, 2)], 7);
        assert_eq!(overlay.removed(), [(4, 4), (1, 1)]);
        assert_eq!(overlay.added(), [(2, 2)]);
        assert_eq!(overlay.beaten(), 7);
    }
}
