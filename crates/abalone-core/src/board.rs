//! Board model: the 61 cells of the radius-4 hexagon, in axial coordinates `(q, r)`.

use std::collections::HashMap;

use crate::moves::{Move, Player};

/// Radius of the standard board: 61 cells. A cell `(q, r)` is on a board of radius `n` when
/// `|q|`, `|r|` and `|q + r|` are all `<= n`.
pub const RADIUS: i32 = 4;

/// Radius of the largest hexagon a mode plays on: the battle royale arena, 217 cells. The game code
/// scans only a board's own radius (`-radius..=radius`) and relies on `get` giving `None` off the
/// board, so a smaller board costs no more than before. The Dual Room's board scans radius 7 but
/// holds two radius 3 rooms (`encounter::dual::DUAL_RADIUS`).
pub const MAX_RADIUS: i32 = 8;

/// Content of one cell. Black and White are seats 1 and 2, the other marbles seats 3 to 6 of a
/// battle royale. A core and the Overseer belong to The Overseer's fight: a core is a passive
/// marble both sides push, the Overseer a marble nothing moves.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Cell {
    Empty,
    Black,
    White,
    Seat3,
    Seat4,
    Seat5,
    Seat6,
    Core,
    Overseer,
}

/// Standard start, Black side (bottom, r > 0): row r=4 (5 cells), row r=3 (6), the three centre cells of r=2.
/// White is the point reflection `(q, r) -> (-q, -r)`.
pub(crate) const STANDARD_BLACK: [(i32, i32); 14] = [
    (-4, 4),
    (-3, 4),
    (-2, 4),
    (-1, 4),
    (0, 4),
    (-4, 3),
    (-3, 3),
    (-2, 3),
    (-1, 3),
    (0, 3),
    (1, 3),
    (-2, 2),
    (-1, 2),
    (0, 2),
];

/// Belgian daisy start, Black side: two flowers (a cell and its six neighbours) centred on
/// (-3,3) at bottom left and (3,-3) at top right. White is the left-right mirror
/// `(q, r) -> (-q - r, r)`, flowers centred on (0,3) and (0,-3).
/// Sources, which agree cell for cell: Wikipedia "Abalone (board game)" (file
/// Abalone_belgian.svg); abalonegames.com (Abalone S.A.), Rules > Rule variations > Belgian
/// Daisy, author Belgian Federation of Abalone; playstrategy.org/variant/abalone.
const BELGIAN_DAISY_BLACK: [(i32, i32); 14] = [
    (-4, 4),
    (-3, 4),
    (-4, 3),
    (-3, 3),
    (-2, 3),
    (-3, 2),
    (-2, 2),
    (2, -2),
    (3, -2),
    (2, -3),
    (3, -3),
    (4, -3),
    (3, -4),
    (4, -4),
];

/// Hexagonal Abalone board.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Board {
    radius: i32,
    cells: HashMap<(i32, i32), Cell>,
    /// Cracked cells with the plies left before they vanish, for the Hull boss.
    cracks: Vec<((i32, i32), u8)>,
    /// Boss marbles that were player marbles, for the Chaplain: only these flip back.
    converted: Vec<(i32, i32)>,
    /// Alien eggs on empty cells, with the player turns left before each hatches.
    eggs: Vec<((i32, i32), u8)>,
    /// Rail Yard trains: the track of each announced train and the player turns left before it
    /// passes.
    trains: Vec<(u8, u8)>,
    /// The Magnetizer's polarities on player marbles: `1` for +, `-1` for −.
    polarities: Vec<((i32, i32), i8)>,
    /// The Magnetizer's announce: the player marble picked for the next assignment and its coming
    /// sign, the cell `None` once that marble left the board.
    announce: Option<Announce>,
    /// The sign of the last polarity The Magnetizer assigned this fight, `0` before the first: the
    /// next one is the other sign, + first.
    last_sign: i8,
    /// The Chaplain's martyr: `None` before it is announced, then the announced marble's cell,
    /// `Some(None)` once it exploded or left (it happens once).
    martyr: Option<Option<(i32, i32)>>,
    /// The Pulsar's active pulsar (the direction code it pushes in) and the player turns played in
    /// its cycle.
    pulsar: Option<(u8, u8)>,
    /// The Assembly Line's three belts.
    belts: Option<Belts>,
    /// The Overseer's incinerator cells: a core on one burns.
    incinerators: Vec<(i32, i32)>,
    /// The Unstable Core's marks. `Some` also turns on its weighted push rule.
    unstable: Option<Unstable>,
    /// The Dual Room's state.
    dual: Option<Dual>,
    /// The Echo's memory: the moves whose mirror was never played, oldest first, with their side.
    echoes: Vec<(Player, Move)>,
    /// The special marbles of a rogue-lite fight, in `q` then `r` order. `Some` is the rogue-lite
    /// flag: it also turns on their rules (docs/specs/roguelite.md section 5).
    specials: Option<Vec<((i32, i32), Special)>>,
    /// The Choir's armies and turn order, only inside its search tree (#825).
    choir: Option<ChoirMarks>,
}

/// What the Choir's search tree needs to play the army cycle: which army owns each boss marble and
/// whose turn it is. The fight keeps the same in `Choir`; this copy rides on the tree's boards.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct ChoirMarks {
    /// Boss marbles with their army, the index in the cycle (0 to 2).
    pub armies: Vec<((i32, i32), u8)>,
    /// Index in the cycle of the army that moves next.
    pub pos: u8,
    /// The last army has played the first of its two moves this boss turn.
    pub second: bool,
    /// Marbles the player has ejected, which sets the phase.
    pub ejections: u8,
}

/// A special marble of a rogue-lite fight (docs/specs/roguelite.md section 5).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Special {
    /// Weighs 2 in a push.
    Heavy,
    /// Never leaves the board.
    Anchor,
    /// Pushes its neighbours one cell away when it is ejected.
    Spark,
}

/// Why a special marble cannot be placed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlaceError {
    /// The board has no rogue-lite flag.
    NotRogueLite,
    /// The cell holds no Black or White marble.
    NoMarble,
    /// The fight has started: special marbles are placed before its first move.
    Started,
}

/// The Dual Room's state on the board (docs/specs/game-design.md section 7.15): its board holds
/// two radius 3 rooms, the south one on the rows `r >= 1`, the north one on `r <= -1`, and the void
/// on the row `r = 0` between them until the bridge fills it in P3.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct Dual {
    /// The bridge fills the void (P3): the rooms are one board.
    pub bridged: bool,
    /// Boss marbles ejected so far: the phases come from them.
    pub ejections: u8,
    /// The marble the last move pushed off and the cell it left, until the hook announces its return.
    pub ejected: Option<(Cell, (i32, i32))>,
    /// The announced return: the marble and the cell it lands on at the end of the next ply.
    pub coming: Option<(Cell, (i32, i32))>,
}

/// The room of a cell of the Dual Room's board: `0` south (`r >= 1`, the bridge too), `1` north.
pub fn room((_, r): (i32, i32)) -> usize {
    usize::from(r < 0)
}

/// The Unstable Core's state on the board (docs/specs/game-design.md section 7.13): the charges of
/// the marbles, which weigh `1 + charges` in a push, the announce of the core's collapse and the
/// wedge shockwave clock.
#[derive(Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct Unstable {
    /// Charged marbles, in `q` then `r` order, with their charges (1 to 3).
    pub charges: Vec<((i32, i32), u8)>,
    /// The core collapses at the end of the player's next turn.
    pub collapsing: bool,
    /// Player turns played in P3 since the last shockwave, 0 to 2.
    pub clock: u8,
    /// The wedge the next shockwave hits, picked when it is announced.
    pub wedge: Option<u8>,
}

impl Unstable {
    /// Charges of the marble on `cell`, 0 when it has none.
    pub fn charge(&self, cell: (i32, i32)) -> u8 {
        self.charges.iter().find(|c| c.0 == cell).map_or(0, |c| c.1)
    }
}

/// The Assembly Line's belts (#744), the three middle rows: the centre belt, then the rows
/// `r = -1` and `r = 1`. The pattern slots of a belt alternate plain and strike and scroll with it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Belts {
    /// Whether the centre belt first runs toward +q.
    pub first: bool,
    /// Player turns played.
    pub turns: u16,
    /// How far each belt's pattern has scrolled toward +q, modulo the belt's length.
    pub shift: [u8; 3],
    /// The strike slot announced on each belt, which the press strikes on the next player turn.
    pub strike: [Option<u8>; 3],
}

/// The Magnetizer's announce: the marble's cell (`None` once it left the board) and its sign.
pub type Announce = (Option<(i32, i32)>, i8);

impl Board {
    /// Board with all 61 cells empty.
    pub fn empty() -> Self {
        Self::with_radius(RADIUS)
    }

    /// Board of the given radius with every cell empty: [`RADIUS`] for most modes, up to
    /// [`MAX_RADIUS`] for the battle royale, 7 as the scan of The Dual Room's two rooms.
    pub fn with_radius(radius: i32) -> Self {
        let mut cells = HashMap::new();
        for q in -radius..=radius {
            for r in -radius..=radius {
                if (q + r).abs() <= radius {
                    cells.insert((q, r), Cell::Empty);
                }
            }
        }
        Self {
            radius,
            cells,
            cracks: Vec::new(),
            converted: Vec::new(),
            eggs: Vec::new(),
            trains: Vec::new(),
            polarities: Vec::new(),
            announce: None,
            last_sign: 0,
            martyr: None,
            pulsar: None,
            belts: None,
            incinerators: Vec::new(),
            unstable: None,
            dual: None,
            echoes: Vec::new(),
            specials: None,
            choir: None,
        }
    }

    /// Radius the board was built with. Vanished cells do not shrink it.
    pub fn radius(&self) -> i32 {
        self.radius
    }

    /// Content of `(q, r)`, or `None` when the cell is off the board.
    pub fn get(&self, q: i32, r: i32) -> Option<Cell> {
        self.cells.get(&(q, r)).copied()
    }

    /// Sets `(q, r)`. Off-board cells are left untouched.
    pub fn set(&mut self, q: i32, r: i32, cell: Cell) {
        if let Some(slot) = self.cells.get_mut(&(q, r)) {
            *slot = cell;
        }
    }

    /// Removes `(q, r)` from the board for good, with its marble. Later `get` gives `None` and
    /// `set` is ignored, so moves onto it are refused and pushes onto it eject.
    pub fn void(&mut self, q: i32, r: i32) {
        self.cells.remove(&(q, r));
    }

    /// Adds `(q, r)` to the board as an empty cell (The Dual Room's bridge). A cell on the board
    /// keeps its marble.
    pub fn open(&mut self, q: i32, r: i32) {
        self.cells.entry((q, r)).or_insert(Cell::Empty);
    }

    /// Cracked cells and the plies left before each vanishes.
    pub fn cracks(&self) -> &[((i32, i32), u8)] {
        &self.cracks
    }

    pub fn set_cracks(&mut self, cracks: Vec<((i32, i32), u8)>) {
        self.cracks = cracks;
    }

    /// Cells holding a marble the boss converted.
    pub fn converted(&self) -> &[(i32, i32)] {
        &self.converted
    }

    pub fn set_converted(&mut self, converted: Vec<(i32, i32)>) {
        self.converted = converted;
    }

    /// Alien eggs and the player turns left before each hatches.
    pub fn eggs(&self) -> &[((i32, i32), u8)] {
        &self.eggs
    }

    pub fn set_eggs(&mut self, eggs: Vec<((i32, i32), u8)>) {
        self.eggs = eggs;
    }

    /// Rail Yard trains: each announced train's track and the player turns left before it passes.
    pub fn trains(&self) -> &[(u8, u8)] {
        &self.trains
    }

    pub fn set_trains(&mut self, trains: Vec<(u8, u8)>) {
        self.trains = trains;
    }

    /// Player marbles with a polarity (The Magnetizer): `1` for +, `-1` for −.
    pub fn polarities(&self) -> &[((i32, i32), i8)] {
        &self.polarities
    }

    pub fn set_polarities(&mut self, polarities: Vec<((i32, i32), i8)>) {
        self.polarities = polarities;
    }

    /// The marble announced for the next assignment and its coming sign (The Magnetizer).
    pub fn announce(&self) -> Option<Announce> {
        self.announce
    }

    pub fn set_announce(&mut self, announce: Option<Announce>) {
        self.announce = announce;
    }

    /// The sign of the last polarity assigned (The Magnetizer), `0` before the first.
    pub fn last_sign(&self) -> i8 {
        self.last_sign
    }

    pub fn set_last_sign(&mut self, sign: i8) {
        self.last_sign = sign;
    }

    /// The Chaplain's martyr: `None` before it is announced, `Some(Some(cell))` while it waits,
    /// `Some(None)` once it exploded or left.
    pub fn martyr(&self) -> Option<Option<(i32, i32)>> {
        self.martyr
    }

    pub fn set_martyr(&mut self, martyr: Option<Option<(i32, i32)>>) {
        self.martyr = martyr;
    }

    /// The Pulsar's active pulsar, as the direction code it pushes in, and the player turns played
    /// in its cycle.
    pub fn pulsar(&self) -> Option<(u8, u8)> {
        self.pulsar
    }

    pub fn set_pulsar(&mut self, pulsar: Option<(u8, u8)>) {
        self.pulsar = pulsar;
    }

    /// The Assembly Line's belts.
    pub fn belts(&self) -> Option<Belts> {
        self.belts
    }

    pub fn set_belts(&mut self, belts: Option<Belts>) {
        self.belts = belts;
    }

    /// The Overseer's incinerator cells.
    pub fn incinerators(&self) -> &[(i32, i32)] {
        &self.incinerators
    }

    pub fn set_incinerators(&mut self, incinerators: Vec<(i32, i32)>) {
        self.incinerators = incinerators;
    }

    /// The Unstable Core's marks, `None` outside its fight.
    pub fn unstable(&self) -> Option<&Unstable> {
        self.unstable.as_ref()
    }

    pub fn set_unstable(&mut self, unstable: Option<Unstable>) {
        self.unstable = unstable;
    }

    /// The Dual Room's state, `None` outside its fight.
    pub fn dual(&self) -> Option<Dual> {
        self.dual
    }

    pub fn set_dual(&mut self, dual: Option<Dual>) {
        self.dual = dual;
    }

    /// The Echo's never-echoed moves, oldest first, with the side that played each.
    pub fn echoes(&self) -> &[(Player, Move)] {
        &self.echoes
    }

    pub fn set_echoes(&mut self, echoes: Vec<(Player, Move)>) {
        self.echoes = echoes;
    }

    /// Whether the board has the rogue-lite flag, which turns on the special marbles' rules.
    pub fn rogue_lite(&self) -> bool {
        self.specials.is_some()
    }

    /// Sets the rogue-lite flag, with no special marble yet.
    pub fn set_rogue_lite(&mut self) {
        self.specials.get_or_insert_with(Vec::new);
    }

    /// The special marbles, in `q` then `r` order, empty without the rogue-lite flag.
    pub fn specials(&self) -> &[((i32, i32), Special)] {
        self.specials.as_deref().unwrap_or_default()
    }

    /// The special marble on `cell`, if any.
    pub fn special(&self, cell: (i32, i32)) -> Option<Special> {
        self.specials().iter().find(|s| s.0 == cell).map(|s| s.1)
    }

    /// Makes the Black or White marble on `cell` a `kind` special marble, in place of any it was.
    /// Refused without the rogue-lite flag.
    pub fn place_special(&mut self, cell: (i32, i32), kind: Special) -> Result<(), PlaceError> {
        let marble = matches!(self.get(cell.0, cell.1), Some(Cell::Black | Cell::White));
        let Some(specials) = self.specials.as_mut() else {
            return Err(PlaceError::NotRogueLite);
        };
        if !marble {
            return Err(PlaceError::NoMarble);
        }
        specials.retain(|s| s.0 != cell);
        specials.push((cell, kind));
        specials.sort_by_key(|s| s.0);
        Ok(())
    }

    /// Replaces the special marbles, after a ply moved them. Only on a rogue-lite board.
    pub(crate) fn set_specials(&mut self, specials: Vec<((i32, i32), Special)>) {
        self.specials = Some(specials);
    }

    /// The Choir's marks, `None` outside its search tree.
    pub fn choir(&self) -> Option<&ChoirMarks> {
        self.choir.as_ref()
    }

    pub fn set_choir(&mut self, choir: Option<ChoirMarks>) {
        self.choir = choir;
    }

    /// Standard start layout: 14 marbles per side.
    pub fn standard() -> Self {
        Self::with_marbles(&STANDARD_BLACK, |q, r| (-q, -r))
    }

    /// Belgian daisy start layout: 14 marbles per side, two flowers each.
    pub fn belgian_daisy() -> Self {
        Self::with_marbles(&BELGIAN_DAISY_BLACK, |q, r| (-q - r, r))
    }

    /// Black marbles on `black`, White marbles on their images by `white_of`.
    fn with_marbles(black: &[(i32, i32)], white_of: impl Fn(i32, i32) -> (i32, i32)) -> Self {
        let mut board = Self::empty();
        for &(q, r) in black {
            let (wq, wr) = white_of(q, r);
            board.set(q, r, Cell::Black);
            board.set(wq, wr, Cell::White);
        }
        board
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_coords() -> impl Iterator<Item = (i32, i32)> {
        (-MAX_RADIUS..=MAX_RADIUS).flat_map(|q| (-MAX_RADIUS..=MAX_RADIUS).map(move |r| (q, r)))
    }

    fn count(board: &Board, cell: Cell) -> usize {
        all_coords()
            .filter(|&(q, r)| board.get(q, r) == Some(cell))
            .count()
    }

    fn swap_colour(cell: Cell) -> Cell {
        match cell {
            Cell::Black => Cell::White,
            Cell::White => Cell::Black,
            other => other,
        }
    }

    #[test]
    fn board_has_61_cells() {
        let board = Board::empty();
        let on_board = all_coords()
            .filter(|&(q, r)| board.get(q, r).is_some())
            .count();
        assert_eq!(on_board, 61);
    }

    #[test]
    fn with_radius_sizes_the_board() {
        for (radius, cells) in [(0, 1), (4, 61), (5, 91), (8, 217)] {
            let board = Board::with_radius(radius);
            let on_board = all_coords()
                .filter(|&(q, r)| board.get(q, r).is_some())
                .count();
            assert_eq!(on_board, cells, "radius {radius}");
            assert_eq!(board.radius(), radius);
        }
        assert_eq!(MAX_RADIUS, 8, "the battle royale arena");
        assert_eq!(Board::standard().radius(), RADIUS);
        assert_eq!(Board::with_radius(RADIUS), Board::empty());
        assert_eq!(Board::with_radius(5).get(5, -5), Some(Cell::Empty));
        assert_eq!(Board::with_radius(5).get(6, 0), None);
    }

    #[test]
    fn off_board_get_is_none() {
        let board = Board::standard();
        assert_eq!(board.get(5, 0), None);
        assert_eq!(board.get(0, -5), None);
        assert_eq!(board.get(3, 2), None);
    }

    #[test]
    fn set_then_get_on_board() {
        let mut board = Board::empty();
        board.set(1, -2, Cell::White);
        assert_eq!(board.get(1, -2), Some(Cell::White));
    }

    #[test]
    fn seats_3_to_6_have_their_own_marbles() {
        let mut board = Board::with_radius(MAX_RADIUS);
        let seats = [Cell::Seat3, Cell::Seat4, Cell::Seat5, Cell::Seat6];
        for (i, &seat) in seats.iter().enumerate() {
            board.set(8 - i as i32, 0, seat);
        }
        for (i, &seat) in seats.iter().enumerate() {
            assert_eq!(board.get(8 - i as i32, 0), Some(seat));
            assert_eq!(count(&board, seat), 1);
        }
    }

    #[test]
    fn open_adds_an_empty_cell_and_keeps_one_on_the_board() {
        let mut board = Board::empty();
        board.void(0, 0);
        board.open(0, 0);
        assert_eq!(board.get(0, 0), Some(Cell::Empty), "back, empty");
        board.set(1, 0, Cell::Black);
        board.open(1, 0);
        assert_eq!(board.get(1, 0), Some(Cell::Black), "a marble stays");
        assert_eq!((room((0, 1)), room((0, -1))), (0, 1));
    }

    #[test]
    fn set_off_board_is_ignored() {
        let mut board = Board::empty();
        board.set(5, 0, Cell::Black);
        assert_eq!(board.get(5, 0), None);
        assert_eq!(count(&board, Cell::Black), 0);
    }

    #[test]
    fn standard_has_14_marbles_per_side() {
        let board = Board::standard();
        assert_eq!(count(&board, Cell::Black), 14);
        assert_eq!(count(&board, Cell::White), 14);
    }

    #[test]
    fn standard_layout_matches_spec() {
        // docs/specs/rules.md section 2.1: Black at the bottom (r > 0), White at the top.
        let board = Board::standard();
        let mut black: Vec<(i32, i32)> = all_coords()
            .filter(|&(q, r)| board.get(q, r) == Some(Cell::Black))
            .collect();
        let mut white: Vec<(i32, i32)> = all_coords()
            .filter(|&(q, r)| board.get(q, r) == Some(Cell::White))
            .collect();
        black.sort();
        white.sort();
        let mut expected_black = vec![
            (-4, 4),
            (-3, 4),
            (-2, 4),
            (-1, 4),
            (0, 4),
            (-4, 3),
            (-3, 3),
            (-2, 3),
            (-1, 3),
            (0, 3),
            (1, 3),
            (-2, 2),
            (-1, 2),
            (0, 2),
        ];
        let mut expected_white = vec![
            (0, -4),
            (1, -4),
            (2, -4),
            (3, -4),
            (4, -4),
            (-1, -3),
            (0, -3),
            (1, -3),
            (2, -3),
            (3, -3),
            (4, -3),
            (0, -2),
            (1, -2),
            (2, -2),
        ];
        expected_black.sort();
        expected_white.sort();
        assert_eq!(black, expected_black);
        assert_eq!(white, expected_white);
    }

    #[test]
    fn standard_is_point_symmetric() {
        let board = Board::standard();
        for (q, r) in all_coords() {
            assert_eq!(board.get(q, r), board.get(-q, -r).map(swap_colour));
        }
    }

    #[test]
    fn belgian_daisy_has_14_marbles_per_side() {
        let board = Board::belgian_daisy();
        assert_eq!(count(&board, Cell::Black), 14);
        assert_eq!(count(&board, Cell::White), 14);
    }

    #[test]
    fn belgian_daisy_layout_matches_spec() {
        // docs/specs/rules.md section 2.2: each side has a flower near the bottom and one near
        // the top, Black at bottom left and top right.
        let board = Board::belgian_daisy();
        let mut black: Vec<(i32, i32)> = all_coords()
            .filter(|&(q, r)| board.get(q, r) == Some(Cell::Black))
            .collect();
        let mut white: Vec<(i32, i32)> = all_coords()
            .filter(|&(q, r)| board.get(q, r) == Some(Cell::White))
            .collect();
        black.sort();
        white.sort();
        let mut expected_black = vec![
            (-4, 4),
            (-3, 4),
            (-4, 3),
            (-3, 3),
            (-2, 3),
            (-3, 2),
            (-2, 2),
            (2, -2),
            (3, -2),
            (2, -3),
            (3, -3),
            (4, -3),
            (3, -4),
            (4, -4),
        ];
        let mut expected_white = vec![
            (-1, 4),
            (0, 4),
            (-1, 3),
            (0, 3),
            (1, 3),
            (0, 2),
            (1, 2),
            (-1, -2),
            (0, -2),
            (-1, -3),
            (0, -3),
            (1, -3),
            (0, -4),
            (1, -4),
        ];
        expected_black.sort();
        expected_white.sort();
        assert_eq!(black, expected_black);
        assert_eq!(white, expected_white);
    }

    #[test]
    fn belgian_daisy_white_mirrors_black_left_right() {
        // The mirror (q, r) -> (-q - r, r) keeps the row and swaps colours. The point reflection
        // keeps colours: it maps each side's bottom flower onto its own top flower.
        let board = Board::belgian_daisy();
        for (q, r) in all_coords() {
            assert_eq!(board.get(q, r), board.get(-q - r, r).map(swap_colour));
            assert_eq!(board.get(q, r), board.get(-q, -r));
        }
    }

    #[test]
    fn void_removes_a_cell_and_its_marble() {
        let mut board = Board::standard();
        board.void(0, 4);
        assert_eq!(board.get(0, 4), None);
        assert_eq!(count(&board, Cell::Black), 13);
        assert_eq!(
            all_coords()
                .filter(|&(q, r)| board.get(q, r).is_some())
                .count(),
            60
        );
        board.set(0, 4, Cell::Black);
        assert_eq!(board.get(0, 4), None, "a vanished cell stays off the board");
    }

    #[test]
    fn cracks_start_empty_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert!(board.cracks().is_empty());
        board.set_cracks(vec![((4, 0), 2)]);
        assert_eq!(board.cracks(), &[((4, 0), 2)]);
        assert_ne!(board, Board::empty());
        board.set_cracks(vec![]);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn converted_cells_start_empty_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert!(board.converted().is_empty());
        board.set_converted(vec![(1, 0)]);
        assert_eq!(board.converted(), &[(1, 0)]);
        assert_ne!(board, Board::empty());
        board.set_converted(vec![]);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn eggs_start_empty_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert!(board.eggs().is_empty());
        board.set_eggs(vec![((1, 0), 4)]);
        assert_eq!(board.eggs(), &[((1, 0), 4)]);
        assert_ne!(board, Board::empty());
        board.set_eggs(vec![]);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn trains_start_empty_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert!(board.trains().is_empty());
        board.set_trains(vec![(26, 5)]);
        assert_eq!(board.trains(), &[(26, 5)]);
        assert_ne!(board, Board::empty());
        board.set_trains(vec![]);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn the_martyr_starts_unannounced_and_is_replaced_whole() {
        let mut board = Board::empty();
        assert_eq!(board.martyr(), None);
        board.set_martyr(Some(Some((1, 0))));
        assert_eq!(board.martyr(), Some(Some((1, 0))));
        board.set_martyr(Some(None));
        assert_eq!(board.martyr(), Some(None));
    }

    #[test]
    fn the_announce_starts_empty_and_is_replaced_whole() {
        let mut board = Board::empty();
        assert_eq!(board.announce(), None);
        board.set_announce(Some((Some((1, 0)), -1)));
        assert_eq!(board.announce(), Some((Some((1, 0)), -1)));
        assert_ne!(board, Board::empty());
        board.set_announce(None);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn the_last_sign_starts_at_zero_and_is_replaced() {
        let mut board = Board::empty();
        assert_eq!(board.last_sign(), 0);
        board.set_last_sign(-1);
        assert_eq!(board.last_sign(), -1);
    }

    #[test]
    fn polarities_start_empty_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert!(board.polarities().is_empty());
        board.set_polarities(vec![((1, 0), 1), ((2, 0), -1)]);
        assert_eq!(board.polarities(), &[((1, 0), 1), ((2, 0), -1)]);
        assert_ne!(board, Board::empty());
        board.set_polarities(vec![]);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn the_pulsar_starts_unset_and_is_replaced_whole() {
        let mut board = Board::empty();
        assert_eq!(board.pulsar(), None);
        board.set_pulsar(Some((4, 1)));
        assert_eq!(board.pulsar(), Some((4, 1)));
        assert_ne!(board, Board::empty());
        board.set_pulsar(None);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn the_belts_start_unset_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert_eq!(board.belts(), None);
        let belts = Belts {
            first: true,
            turns: 2,
            shift: [1, 0, 3],
            strike: [None, Some(5), None],
        };
        board.set_belts(Some(belts));
        assert_eq!(board.belts(), Some(belts));
        assert_ne!(board, Board::empty());
        board.set_belts(None);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn the_unstable_marks_start_unset_and_give_the_charge_of_a_marble() {
        let mut board = Board::empty();
        assert_eq!(board.unstable(), None);
        let marks = Unstable {
            charges: vec![((1, 0), 2)],
            ..Unstable::default()
        };
        assert_eq!((marks.charge((1, 0)), marks.charge((0, 0))), (2, 0));
        board.set_unstable(Some(marks));
        assert_ne!(board, Board::empty());
        board.set_unstable(None);
        assert_eq!(board, Board::empty());
    }

    #[test]
    fn the_choir_marks_start_unset_and_are_replaced_whole() {
        let mut board = Board::empty();
        assert_eq!(board.choir(), None);
        let marks = ChoirMarks {
            armies: vec![((1, 0), 2)],
            ..ChoirMarks::default()
        };
        board.set_choir(Some(marks.clone()));
        assert_eq!(board.choir(), Some(&marks));
        assert_ne!(board, Board::empty());
        board.set_choir(None);
        assert_eq!(board, Board::empty());
    }
}
