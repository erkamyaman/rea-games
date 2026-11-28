# Pitfalls

Mistakes already made in this repository, each with the rule that prevents it. Add one in the same change whenever a
mistake is worth not repeating.

**A fixture with wrong tile positions made the original misbehave.** 2048 moves tiles by their own `x`/`y`, not by their
place in the grid, so a saved game built with every `position.x = 0` produced a trace no sane port could match. Build
fixtures so every field agrees with the cell it sits in, and look at a few steps of each hand-made case.

**A stale snapshot was recorded as truth.** 2048's `keepPlaying` never calls the actuator, so the last actuated state
still said "terminated" and the port correctly said it was not. Read state from the live game object, not from the
last callback.

**Comparing JSON as text failed a correct Rust port.** `serde_json` sorts keys, JavaScript keeps insertion order, and every
case "differed". Compare parsed values (`lib/compare.mjs`), never `JSON.stringify` output.

**CI never reached `verify all`.** The Godot checksum line turned `<hash>  Godot_v...zip` into `<hash>   godot.zip`
(three spaces), so `sha512sum -c` looked for a file named ` godot.zip` and every run failed before any port was replayed.
Replace only the file name in the sums line, and look at a new workflow's log for the `verify` output, not just its
colour.

**A deliberate break crashed the port instead of failing the check.** Breaking Bricks three ways first showed
`port exited 1` for every case, and one of the three edits had left a name undefined, so that failure proved nothing about
`verify`. Read the reason for each failure: a broken port should fail with `trace differs at ...` or a tape count, not an
error from the edit itself.

**A play page drew nothing after bundling.** `scripts/bundle.mjs` took a module's exports from the first name on each
`export const` line, so `export const W = 640, H = 480` exported `W` only, `H` was `undefined` in `docs/play/paddles.html`
and the canvas had no height, with no error. `scripts/exported-names.mjs` now keeps every name (see the multi-name
export entry below); open the bundled page, not only `ports/web`.

**`in` found keys the port never printed.** `firstDiff` checked `k in a`, which is true for inherited names, so a port
that printed a `constructor` key was reported as `.constructor: undefined != 1` instead of a missing key. Check own keys
with `Object.hasOwn`; `test/compare.test.mjs` covers it.

**One failing build hid every other result.** The exception from a port's build ended `verify all`, so on a machine
without cargo nothing after `2048 / bevy` was checked and there was no summary. A port that cannot run is that port's
failure (`verifyGames` in `lib/verify.mjs`); the run goes on and ends with one line per port.

**`new` promised a play page it never wrote.** `game.json` pointed `ports.web.play` at `ports/web/index.html`, but
`scaffold` only made the folder, so `scripts/bundle.mjs` failed with ENOENT on a freshly scaffolded game. When a command
writes a manifest, it writes every file that manifest names; `test/scaffold.test.mjs` now checks each path in `game.json`.

**A check that cannot fail looks like a pass.** After a port is green, break it three ways (a constant, a branch, an
offset) and watch `verify` fail each time; otherwise the cases may not reach the code you think they do.

**A port rename left stale references behind.** The plain-Rust 2048 runner was replaced by the Bevy port, but
CONTRIBUTING.md, the `verify` help text and the `package.json` exclusions still named the `rust` port. When a port is
replaced, grep for the old port name across docs, help text and packaging lists in the same change.

**The bundler dropped every name after the first in a multi-name export.** `export const W = 10, H = 20;` came out of
`scripts/bundle.mjs` as a module returning `W` only, so `docs/play/blocks.html` read `H` as `undefined` and the board
never drew its settled cells or grid lines. `verify` stayed green because it replays the logic, not the published page.
`scripts/exported-names.mjs` keeps every binding (commas count only at depth zero) and `npm test`
checks it; after regenerating `docs/play/`, open the changed pages and look at them.

**The bundler treated an export list as a block.** `export { B, C }` lost its names and became `{ B, C };`, which is
valid and does nothing, so `docs/play` loaded with `undefined` and `bundle.mjs` still exited 0. `export { B as D }` became
`{ B as D };` and the page threw `SyntaxError`. `scripts/exported-names.mjs` keeps a local list, including `B as D` as
`D: B` and a list split over several lines, and removes that statement before stripping `export`. `export … from`,
`export *`, `export default` and an indented `export` have no local binding the page can return. `bundle.mjs` exits 1
and names the module and the line. `npm test` covers both.

**One driver ignored PLAYWRIGHT_PATH.** Four drivers each had a copy of the Playwright lookup, and Dino called
`require("playwright")` itself, so with Playwright installed outside the repository `record dino` failed with Node's
"Cannot find module" while the others worked. Every driver loads it with `loadPlaywright()` from `lib/playwright.mjs`,
and `test/playwright.test.mjs` checks each `games/*/driver.mjs` for it.

**A crashed port showed only the Node.js version line.** `verify` reported the last two lines of a crashed port's stderr,
and Node ends an uncaught error with its stack, a blank line and `Node.js vNN`, so the error never showed up. Dropping the
blank and version lines is not enough, because the last two lines are then stack frames. Taking the first stack is not
right either, because a port may log an error before the one that ends it. `crashReason` starts from the last message
line and adds the first frame of the stack under it. A message can go on in lines that are not indented
(`new Error("boom\ndetail")`, an `assert.deepStrictEqual` diff), so from there it goes up to the line where the error
begins, `Error: boom` or `AssertionError [ERR_ASSERTION]: ...`, but not past an earlier stack. Check a message taken from
another program's output against what it really prints.

**Third-party libraries can consume `Math.random()` before the game starts.** jQuery 1.8.3 calls `Math.random()` twice during initialization, which prepended two stray draws to `tape` and shifted every mine placement. Reset the RNG tape after page load finishes so `tape` records only calls from the game itself.

The export scanner missed a regex after `typeof` when a comment came between them. It also mistook the end of a
Unicode identifier for a keyword. When deciding whether a slash starts a regex, use the last token after skipping
comments and read the whole identifier.

**A generated play page can hide a source-page fix.** `docs/play/*.html` is built from each game's
`ports/web/index.html`; change the source page, run `node scripts/bundle.mjs`, and review the generated result instead
of editing it by hand.

**A valid import can have a trailing comment.** An import line may end with `//` or a same-line `/* … */` comment;
when inlining it, preserve that trailing text instead of leaving the `import` in the generated plain script.

**Valid JSON is not necessarily valid port output.** Check that a port result is an object with a `trace` array and a
numeric `tapeUsed` before comparing it; otherwise a malformed result can crash verification or turn into an unreadable
root-level diff.

**A flag with no value came back as `true`, and the code read that as "no port".** `--port` at the end of the command line made the option parser return `true`, so `verify` ran every port, including the slow Bevy build. A value is now required (`--port web` or `--port=web`); a missing one, or one followed by another flag, exits 2, and unknown flags after `verify` are rejected instead of being taken as a game name.

**Mines needs a reveal before flagging is possible.** When Flag mode is active on a fresh or reset board, send
the first tap as a reveal. The timer starts on that reveal, and subsequent taps can toggle flags.

**A missing folder is not an empty folder to `readdirSync`.** Reading a directory that does not exist throws
a raw ENOENT; check `existsSync` first when "not there yet" is an expected state, so the caller can print its
readable message instead of a file-system error.

**A broken `game.json` failed with the parser's message and no file name.** `JSON.parse` on a truncated manifest
printed only `Unexpected end of JSON input`, so `list`, `record`, `pack` and `verify` gave no clue which game was
broken. Wrap the parse in `loadGame` and report the path relative to the repository, keeping the parser's message;
when several files can fail the same way, name the one that failed.
