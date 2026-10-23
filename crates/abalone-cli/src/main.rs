use std::io;

fn main() -> io::Result<()> {
    abalone_cli::run(io::stdin().lock(), io::stdout().lock())
}
