//! The enemy overlay of the Open world fight (docs/specs/openworld.md section 3): the generated enemies of a seed never change; a
//! push removes the ones it moved away (`removed`, by cell) and adds the ones that now stand where no generated enemy starts
//! (`added`). The generated enemies of a chunk come in as an argument, so the rule stays pure and testable. Both lists keep the
//! order in which cells were put in: the order of the enemies is the order the push rule sees them in.

use crate::world::{Terrain, CHUNK};
use crate::worldfight;

/// A cell, `q, r`.
pub type Cell = (i32, i32);

/// The chunk a cell is in.
fn chunk_of((q, r): Cell) -> Cell {
    (q.div_euclid(CHUNK), r.div_euclid(CHUNK))
}

/// The enemies within this many cells of the hero are the ones a push can reach.
pub const PUSH_REACH: i32 = 10;

/// A push as it was played, from the cells before it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Played {
    /// The troop after the push, the hero first.
    pub troop: Vec<Cell>,
    /// The enemies near the hero before the push.
    pub foes: Vec<Cell>,
    /// The same enemies after it.
    pub enemies: Vec<Cell>,
    /// The enemy ejected, none or one.
    pub ejected: Vec<Cell>,
    /// The direction of the push.
    pub dir: Cell,
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

    /// The enemies within `radius` cells (hex distance) of `cell`, chunk by chunk in the order given: `chunks` pairs a chunk with the
    /// generated enemies that start in it (`chunk_enemies` of each).
    pub fn around(&self, chunks: &[(Cell, Vec<Cell>)], cell: Cell, radius: i32) -> Vec<Cell> {
        let distance = |(q, r): Cell| {
            let (dq, dr) = (q - cell.0, r - cell.1);
            (dq.abs() + dr.abs() + (dq + dr).abs()) / 2
        };
        chunks
            .iter()
            .flat_map(|(chunk, generated)| self.chunk_enemies(generated, *chunk))
            .filter(|&enemy| distance(enemy) <= radius)
            .collect()
    }

    /// The troop's attack: the best legal push of `troop` (the hero first) against the enemies within `PUSH_REACH` of the hero, on the
    /// `terrain` given. `chunks` are the chunks that reach them with their generated enemies (`around`). The push is played on the
    /// overlay; `None`, and the overlay as it was, when no push is legal.
    pub fn troop_push(
        &mut self,
        chunks: &[(Cell, Vec<Cell>)],
        troop: &[Cell],
        terrain: impl Fn(i32, i32) -> Option<Terrain>,
    ) -> Option<Played> {
        todo!()
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
    fn around_keeps_the_enemies_within_the_radius_chunk_by_chunk() {
        let mut overlay = Overlay::new();
        overlay.apply(&[(2, 0)], &[(0, 3)], 0);
        let chunks = [
            ((0, 0), vec![(1, 0), (2, 0), (9, 0)]),
            ((1, 0), vec![(16, 0), (30, 0)]),
        ];
        assert_eq!(overlay.around(&chunks, (0, 0), 3), [(1, 0), (0, 3)]);
        assert_eq!(
            overlay.around(&chunks, (0, 0), 20),
            [(1, 0), (9, 0), (0, 3), (16, 0)]
        );
        assert!(overlay.around(&[], (0, 0), 5).is_empty());
    }

    #[test]
    fn the_distance_is_the_hex_distance() {
        let overlay = Overlay::new();
        let chunks = [((0, 0), vec![(2, -1), (2, 2), (-1, -1), (3, 0)])];
        // (2,-1) is 2 away, (2,2) is 4, (-1,-1) is 2, (3,0) is 3.
        assert_eq!(overlay.around(&chunks, (0, 0), 2), [(2, -1), (-1, -1)]);
        assert_eq!(overlay.around(&chunks, (0, 0), 3).len(), 3);
    }

    fn grass(_q: i32, _r: i32) -> Option<Terrain> {
        Some(Terrain::Grass)
    }

    #[test]
    fn the_troop_pushes_an_enemy_in_line_and_the_overlay_follows() {
        let mut overlay = Overlay::new();
        let chunks = [((0, 0), vec![(1, 0), (9, 9)])];
        let played = overlay
            .troop_push(&chunks, &[(0, 0), (-1, 0), (-2, 0)], grass)
            .unwrap();
        assert_eq!(played.troop, [(1, 0), (0, 0), (-1, 0)]);
        assert_eq!(played.foes, [(1, 0), (9, 9)]);
        assert_eq!(played.enemies, [(2, 0), (9, 9)]);
        assert!(played.ejected.is_empty());
        assert_eq!(played.dir, (1, 0));
        assert_eq!(overlay.removed(), [(1, 0)]);
        assert_eq!(overlay.added(), [(2, 0)]);
        assert_eq!(overlay.beaten(), 0);
    }

    #[test]
    fn an_enemy_pushed_into_water_is_ejected_and_counted() {
        let mut overlay = Overlay::new();
        let chunks = [((0, 0), vec![(1, 0)])];
        let water = |q: i32, _r: i32| Some(if q >= 2 { Terrain::Water } else { Terrain::Grass });
        let played = overlay
            .troop_push(&chunks, &[(0, 0), (-1, 0), (-2, 0)], water)
            .unwrap();
        assert_eq!(played.ejected, [(1, 0)]);
        assert!(played.enemies.is_empty());
        assert_eq!(overlay.beaten(), 1);
        assert_eq!(overlay.removed(), [(1, 0)]);
    }

    #[test]
    fn no_legal_push_changes_nothing() {
        let mut overlay = Overlay::new();
        let chunks = [((0, 0), vec![(5, 5)])];
        assert_eq!(overlay.troop_push(&chunks, &[(0, 0), (-1, 0)], grass), None);
        assert_eq!(overlay, Overlay::new());
        assert_eq!(overlay.troop_push(&[], &[(0, 0), (-1, 0), (-2, 0)], grass), None);
    }

    #[test]
    fn only_the_enemies_within_the_reach_of_the_hero_are_in_the_push() {
        let mut overlay = Overlay::new();
        let chunks = [((0, 0), vec![(1, 0)]), ((1, 0), vec![(16, 0)])];
        let played = overlay
            .troop_push(&chunks, &[(0, 0), (-1, 0), (-2, 0)], grass)
            .unwrap();
        assert_eq!(played.foes, [(1, 0)]);
        assert_eq!(PUSH_REACH, 10);
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
