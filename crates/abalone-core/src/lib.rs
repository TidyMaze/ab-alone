pub mod board;
pub mod encounter;
pub mod game;
pub mod moves;
pub mod royale;
pub mod run;
pub mod search;
pub mod world;
pub mod worldfight;
pub mod worldoverlay;
pub mod worldstep;

pub fn version() -> &'static str {
    "0.1.0"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_0_1_0() {
        assert_eq!(version(), "0.1.0");
    }
}
