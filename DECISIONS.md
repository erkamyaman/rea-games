# Decisions

Choices and the reason for each. Change one only with a reason of the same weight.

**The proof is a recording, not a code comparison.** The same idea as rust-anything: run the original, save what it does,
and check every rebuild against the saved behavior. A rebuild passes only when every recorded state is identical.

**Random numbers are recorded, not seeded.** A port cannot reproduce a different language's generator, so the case
holds the numbers the original drew (the `tape`) and the port reads them back in order. A port that asks for more or
fewer numbers than the original used fails.

**The original is never edited.** It runs as downloaded; only its clock, its random numbers and its browser surface are
replaced from outside. A recording of a patched game proves nothing about the real one.

**Random numbers that cannot change play get their own stream.** Clouds and stars in Dino draw from `Math.random` too.
The recorder tells the callers apart (by stack) and gives the cosmetic ones a separate generator, so the port does not
have to copy drawing code to stay in step. Each game's `GAME.md` says what was split and shows the trace does not change
when the cosmetic stream does.

**Runner protocol: JSON in, JSON out.** A port is any program that reads a case on stdin and prints `{trace, tapeUsed}`.
That makes Rust, GDScript run headless, C# and a browser port all checkable by the same code.

**Node for the tool, no dependencies.** The CLI and recorders are plain Node 22 with no npm packages (Playwright is used
for the browser games and is already on most machines that develop for the web). Contributors who build engine ports do
not need a Rust or Node expertise to run `verify`.

**Web first, then engines.** A browser port is playable from a link, which is what people share, and it is the cheapest to
verify. Rust (Bevy-ready logic) now ships for 2048, Dino, Canvas Bird and Blocks as proof that the protocol is engine-neutral, and Godot ports are verified for the same four games. Unity ports are
welcome but count as verified only when a headless runner passes the cases.

**Three small open-source games first.** 2048 (MIT), the Chrome Dino (BSD-3-Clause) and Canvas Bird (MIT) have source we
may run and redistribute, are small enough to verify completely, and cover pure logic, physics with timing, and
black-box observation of a game whose state is private. Blocks (MIT) was added fourth on the same terms: small enough to verify completely, and it covers falling pieces, rotation and line clears, which the first three do not.

**No art, sound or names from an original.** Rebuilds draw their own shapes. See `NOTICE`.

**The repository was built unattended.** The first version was written in one session while the author was away;
everything that could be checked was checked (see `docs/STATUS.md`), and what was not is listed there.
