pub fn version() -> &'static str {
    ""
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_0_1_0() {
        assert_eq!(version(), "0.1.0");
    }
}
