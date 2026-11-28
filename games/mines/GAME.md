# Mines: behavior spec

Original: `Joeynoh/HTML5-Minesweeper` (MIT), vendored unmodified in `originals/mines` (`index.html`, `js/minesweeper.js`, `css/styles.css`, `images/`). The clean-room port in `games/mines/ports/web/mines.mjs` was written from this specification and verified frame-by-frame against the original recordings.

## What was recorded

The unmodified original runs in headless Chrome (`driver.mjs`) over a local static server:

- **Offline jQuery:** `originals/mines/index.html` links jQuery 1.8.3 from a Google CDN. `driver.mjs` intercepts external requests and serves a local MIT copy (`vendor/jquery-1.8.3.min.js`).
- **Clock:** `Date`, `performance.now`, `setTimeout`, `clearTimeout`, `setInterval`, and `clearInterval` are replaced by a deterministic fake clock starting at `T0 = 1000000` ms. Advancing `dt` ms fires all timers due up to `t + dt` in chronological order.
- **Randomness:** `Math.random` is replaced by a seeded `mulberry32` generator whose outputs are saved to `tape`. After page load completes, the 2 initialization draws made by jQuery 1.8.3 are cleared from `tape` so `tape` holds only calls from `generateMines()`.
- **State observation:** `globals` and `defaults` are closure-scoped inside `$(function(){ ... })` in `js/minesweeper.js`. Leaving `originals/mines/` untouched on disk, the local server appends a single read-only hook (`window.__minesInternal = { globals, defaults }`) in memory when serving `js/minesweeper.js`. `window.prompt` is stubbed so winning never blocks headless execution, and `Image` loads (`flag.png`, `mine.png`) are awaited before snapshotting state.

A case is `{ game, name, seed, clock0, tape, inputs: [{ dt, action }], trace }`. `trace[0]` is the state right after page load, and `trace[i]` is the state after `inputs[i - 1]`.

## State that is compared

Each trace entry contains:

- `screen`: `"start"` when `difficulty === 0`, otherwise `"game"`
- `difficulty`: `0` (none), `9` (easy), `6` (medium), or `3` (insane)
- `firstClick`: boolean
- `gameover`: boolean
- `status`: DOM text of `#status` (`"Game on :)"`, `"Game over :("`, or `"You won! :D"`)
- `totalMines`, `totalFlags`, `elapsedTime`: integers
- `mines`: 20 strings of 30 chars (`"."` ungenerated, `"*"` mine, `"0".."8"` adjacent mine count)
- `revealed`: 20 strings of 30 chars (`"."` hidden, `"1"` revealed)
- `flags`: 20 strings of 30 chars (`"."` never flagged, `"F"` flagged, `"u"` previously unflagged)

## Constants

| Property | Value |
|---|---|
| Board size | 30 columns × 20 rows (600 cells) |
| Difficulties | `none = 0`, `easy = 9`, `medium = 6`, `insane = 3` |
| Timer interval | 1000 ms (`elapsedTime += 1` per full second while `!firstClick && !gameover`) |
| Status strings | `"Game on :)"`, `"Game over :("`, `"You won! :D"` |

## Randomness (the tape order)

Only `generateMines()` draws random numbers—always **600 draws per attempt**, iterated column-major (`x = 0..29`, inner loop `y = 0..19`):

1. For each cell `(x, y)`: `v = Math.floor(rng() * difficulty - 1)`. If `v > 0`, clamp `v = 0`. Cells with `-1` are mines (probability `1 / difficulty`: 1/9 Easy, 1/6 Medium, 1/3 Insane).
2. Count mines and increment every valid 8-neighbor cell whose value is `> -1`.
3. **First-click rejection sampling:** on the first left click at `(x, y)`, generate a full 600-cell board in a loop until `mineMap[x][y] !== -1`. A board requiring `k` attempts consumes `600 * k` random values.

## Order of operations in one step

For each input `{ dt, action }`:

1. **Action dispatch** (if `action` is non-null):
   - `difficulty`: resets the board and sets `difficulty` to `9` (easy), `6` (medium), or `3` (insane).
   - `reset`: resets the board while keeping the current `difficulty`.
   - `switch`: resets the board and sets `difficulty = 0` (`screen = "start"`).
   - `click` (`button`: `"left"` or `"right"`, `x`, `y`):
     - Ignored if `gameover` is true, `difficulty === 0`, or `(x, y)` is out of bounds.
     - **Left click:** ignored if `flags[x][y] === 1`. If `firstClick`, runs rejection-sampled board generation until `(x, y)` is safe, sets `firstClick = false`, and starts the 1000 ms timer. Then reveals `(x, y)`:
       - Marks `revealed[x][y] = 1`.
       - If the cell is a mine (`-1`), sets `gameover = true` and `status = "Game over :("`.
       - If the cell is `0`, recursively reveals all valid neighbors `(x + dx, y + dy)` for `dx, dy ∈ {-1, 0, 1}` that are not yet revealed.
     - **Right click on a revealed cell (chording):** checks the 3×3 neighborhood using the original flag predicate (`flags[nx][ny] > -1`). If the count equals `field[x][y]`, reveals all remaining non-flagged neighbors in that neighborhood.
     - **Right click on a hidden cell:** ignored if `firstClick` is true. Otherwise toggles flag: if not `1`, sets `flags[x][y] = 1` and `totalFlags++`; if `1`, sets `flags[x][y] = 0` and `totalFlags--`. Then checks the win condition: if every mine cell has `flags[x][y] === 1`, sets `gameover = true` and `status = "You won! :D"`.
2. **Clock advance:** if `dt > 0` and `!firstClick && !gameover`, accumulates `dt` ms and increments `elapsedTime` by `floor(timerMs / 1000)`, keeping the millisecond remainder.

## Quirks

- **Unflagged cells still count when chording:** Unflagging sets `flagMap[x][y] = 0` instead of `undefined` or `-1`. The original helper `util.is("flag", x, y)` checks `flagMap[x][y] > -1`, which evaluates `0 > -1` as `true`. As a result, a previously unflagged cell (`"u"`) is still counted as a flag during chording and skipped by chord reveals.
- **Win condition checks mines only:** Winning triggers as soon as all mines are flagged (`flaggedMines === totalMines`), even if extra flags are placed on safe cells (`totalFlags > totalMines`) and even if safe cells remain unrevealed.
- **Flood fill ignores flags on safe cells:** A `0`-cell flood fill reveals neighboring safe cells even if they are flagged (`flags[x][y]` stays `"F"` while `revealed[x][y]` becomes `"1"`).
- **Right-click before first click is ignored:** Flags cannot be placed until the first left click generates the field.
- **No safe 3×3 opening:** First-click rejection sampling guarantees only that the clicked cell itself is not a mine (`-1`); it may be a numbered cell (`1..8`) rather than `0`.

## Not modelled, and why that is safe

- **Canvas animations and drawing** (`walker` background animation, 50 ms tile fade intervals, `flag.png` / `mine.png` image blitting): visual-only effects that never modify game state.
- **High-score localStorage and `window.prompt` name entry on win:** side effects triggered after `gameover` is already set; they do not affect board state, timer, or inputs.

## Coverage

14 cases, 628 inputs, 642 recorded states, and 19,200 taped random draws (32 full 600-cell field generations):

| Case | What it covers |
|---|---|
| `edges-and-screens` | Start-screen clicks, pre-first-click right clicks, left-click on flag, partial-second timer boundaries (333/334/333 ms), screen switching, multi-difficulty switch |
| `easy-win`, `medium-win`, `insane-win` | Full wins across all 3 difficulties (`9`, `6`, `3`), post-win ignored clicks, post-win reset |
| `easy-win-extra-flags` | Winning with extra flags placed on safe cells (`totalFlags > totalMines`) |
| `easy-lose-reset`, `medium-lose-reset`, `insane-lose-reset` | Multi-round play, mine detonation, post-loss ignored clicks, resets across all 3 difficulties |
| `chord-safe-easy`, `chord-safe-medium` | Standard chording on revealed numbered cells |
| `chord-unflag-quirk` | Verifies that a previously unflagged neighbor (`"u"`) still satisfies the chord count |
| `chord-lethal` | Chording with misplaced flags into a mine (`Game over :(`) |
| `flood-over-flag` | Zero-cell flood fill revealing across a flagged safe cell |
| `rejection-sampling-insane` | 6 Insane rounds forcing multiple 600-draw rejection-sampling redraws with mixed `dt` values |

## Not covered

The original's animations, its image drawing and the saved high scores are not recorded.
