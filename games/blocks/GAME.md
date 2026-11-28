# Blocks: behavior spec

Original: a falling-blocks puzzle (MIT), vendored unmodified in `originals/blocks` (`index.html`, about 250 lines of
game code inline; `stats.js` is an FPS widget, `texture.jpg` a CSS background). The port in `ports/web/blocks.mjs`
was written from this page and from reading the original's rules, not by translating them line by line.

## What was recorded

The page runs unmodified in headless Chrome (`driver.mjs`). Its state lives in top-level `var`s, so it is read from
the live page after every frame: `blocks`, `current`, `next`, `pieces` (the bag), `score`, `vscore`, `rows`, `step`,
`dt`, `playing`, `actions`. Only its inputs are replaced:

- **Clock.** `Date.now`, `new Date()` (the page reads time with `new Date().getTime()`), `performance.now`,
  `requestAnimationFrame` and `cancelAnimationFrame` are faked. The page advances only when the driver calls
  `step({dt, keys})`: the key events are dispatched in order, the clock moves by `dt` ms (it starts at 1000000 and
  accumulates the float values), then the queued animation callback runs once. The page sees `floor(t)`.
- **Random.** `Math.random` is a seeded generator; every value handed out is saved as `tape`.
- The start link's href is `javascript:play();`. Following a link runs that in a later task, so the key `"play"` calls
  `play()` directly inside the frame (the same function the link calls).

A case is `{game, name, seed, clock0, tape, inputs: [{dt, keys}], trace}`; `keys` is an ordered list of
`left right up down esc space play`. `trace[0]` is the state after load, `trace[i]` the state after `inputs[i-1]`.
The inputs come from scripted players and bots that look only at the previous state (`record.mjs`).

## State that is compared

A state is `{grid: 20 strings of 10 chars ('.' or piece letter), current: {type, x, y, dir}, next: {...}, bag: letters
left in the bag in splice order, score, vscore, rows, step, dt (the gravity accumulator), playing, actions
(queued actions: 0 up/rotate, 1 right, 2 down, 3 left)}`. Numbers are compared exactly (`lib/compare.mjs`).

## Constants

| | |
|---|---|
| court | 10 columns x 20 rows, cell `[x][y]` holds the piece type that locked there |
| pieces | `i j l o s t z`, a 4x4 bitmask per rotation, `0x8000` is the top-left cell, rows left to right |
| masks | i `0F00 2222 00F0 4444`, j `44C0 8E00 6440 0E20`, l `4460 0E80 C440 2E00`, o `CC00` x4, s `06C0 8C40 6C00 4620`, t `0E40 4C40 4E00 4640`, z `0C60 4C80 C600 2640` |
| sizes | i 4, j l s t z 3, o 2 (used for the spawn column only) |
| gravity | `step = max(0.1, 0.6 - 0.005 * rows)` seconds per row; 0.6 at 0 rows, 0.1 from 100 rows |
| dir | 0 spawn, then +1 per rotation (clockwise), wraps 3 -> 0 |

## Randomness (the tape order)

`random(a, b) = a + Math.random() * (b - a)` is a float, and `randomChoice` is not used by the pieces. A piece is made
by `randomPiece()`:

1. If the bag is empty, refill it with four of each type, in the order i j l o s t z (28 pieces).
2. `Math.random()` number 1: the bag index is `random(0, len - 1)` and `splice` truncates it, so the index is
   `floor(r * (len - 1))`: **the last piece in the bag can never be drawn until it is the only one left.**
3. `Math.random()` number 2: the spawn column `x = Math.round(r * (10 - size))`, `y = 0`, `dir = 0`.

Two numbers per piece, always in that order. The bag is a global that survives a game over and a restart. At load
`reset()` draws `current` then `next` (4 numbers). Every start (`play()` runs `reset()`) moves `next` to `current`
and draws one new `next` (2 numbers). Every lock draws one new `next` (2 numbers).

## Order of operations in one step

A step is: the key events (in order), then the animation callback `frame()`: `now = floor(t)`,
`update(min(1, (now - last) / 1000))`, `last = now`. `update(idt)`:

1. If not `playing`: nothing happens (the game does not run, `dt` and the queue stay as they were).
2. If `vscore < score`: `vscore += 1`.
3. `handle(actions.shift())`: at most ONE queued action per frame (left, right: move one cell if the cells are
   free; up: rotate; down: `drop()`).
4. `dt += idt`; if `dt > step` (strictly): `dt -= step` and `drop()`. At most one gravity drop per frame, so a frame
   longer than two steps leaves the rest in `dt`; `dt` is not reset by a lock.

Step 4 runs even when step 3 locked a piece or ended the game (see quirks).

**Keys** (`keydown`): while playing, left/right/up/down push `DIR.LEFT/RIGHT/UP/DOWN` on `actions` (no limit: the
queue can hold hundreds when keys come faster than one per frame), Escape calls `lose()`, every other key does
nothing. While not playing, Space calls `play()`, everything else (arrows, Escape) is ignored. `play()` itself
(`reset()` then `playing = true`) works whatever the state: it is also the start link.

**`reset()`**: `dt = 0`, queue emptied, court emptied, `rows = 0` (so `step = 0.6`), `score = 0`, `vscore = 0`,
`current = next` (a new piece only at load), `next = randomPiece()`.

**Move / rotate.** A move checks all four cells of the piece at the new place: outside the court (`x < 0`,
`x >= 10`, `y < 0`, `y >= 20`) or on an occupied cell blocks it, and a blocked move changes nothing. Rotation turns in
place to `dir + 1`; **there are no wall kicks**, a rotation that would hit a wall, the floor or a block is dropped.

**`drop()`** (gravity, and the down key): if the piece can move one row down, it does. Otherwise it locks:
1. `score += 10`;
2. its four cells are written into the court;
3. `removeLines()` (below);
4. `current = next`, `next = randomPiece()` (2 numbers), `actions` emptied;
5. if the new `current` already overlaps something: `lose()`.

**`removeLines()`**: scans rows 19 down to 1 (row 20 does not exist, **row 0 is never examined**). A full row is removed
by copying every row above it down by one and emptying row 0, then the same row index is looked at again. After the
scan, if `n > 0` rows went: `rows += n` (which recomputes `step`), then `score += 100 * 2^(n-1)`: 100, 200, 400, 800.
`vscore` is not touched.

**`lose()`**: `vscore = score`, `playing = false`. The court, the pieces and the queue stay; the next `play()` clears
them.

## What is traced but does not affect play

`vscore` is the displayed score: it catches up to `score` one point per frame while playing. Nothing reads it for
play, but it is in the trace and compared exactly, so the port has it.

## Quirks

- The bag's last piece is skipped until it is alone (index `floor(r * (len - 1))`). With one piece left the index is 0.
- `Math.round` on the spawn column: `round(r * (10 - size))`, so a size-4 piece spawns in columns 0..6 and columns 0 and
  6 are drawn about half as often as the others.
- One queued action per frame: holding a key faster than 60 Hz builds a queue that drains slowly. A lock empties it.
- **After a lock that ends the game by an action**, step 4 can still run: `dt > step` then calls `drop()` on the piece that
  overlaps the stack. That piece may move down (if the cells below it are free), or lock again (`score += 10`, more
  cells written, `next` replaced, one more pair of random numbers) while `playing` is already false. Seen in the
  recordings (3 frames), and the port repeats it because it keeps the same order.
- `vscore` stops catching up while the game is over (`update` does nothing), and `lose()` sets it to `score` at once.
- The step is `max(0.1, 0.6 - 0.005 * rows)`; the float result is what is compared (the recordings hold 0.595, 0.596 ... down to 0.1), the port computes the same
  expression, so equal bits.
- A frame's `idt` is computed from whole milliseconds: with `dt = 16.666...` the page sees 16 or 17 ms per frame, never
  16.667. The port keeps the clock as a float and reads `floor(t)` the same way, so `dt` (the accumulator) matches bit for
  bit. `idt` is capped at 1 s.
- Row 0 is never checked for a full line, so a full top row would stay (not reachable in play: a piece that fills it ends
  the game first; the recording never reaches it).
- Escape while playing ends the game with no points added; there is no pause.

## Not modelled, and why that is safe

- **Rendering** (`draw`, `drawCourt`, `drawNext`, `drawBlock`, the `invalid*` flags, `resize`, `dx`/`dy`): they only
  read the game variables and write to the canvases and two text nodes. None of them writes a game variable.
- **The stats widget** (`stats.js`, `stats.update()`): it reads the clock and draws into its own canvases.
- **The start link's visibility and the texture**: CSS and the `visibility` style of one element.
- **Window resize**: changes only pixel sizes.
- **Real key events beyond `keyCode`**: the page reads only `keyCode` from `keydown`; repeats arrive as more
  `keydown` events, which the cases model as more `keys` entries.

## Coverage

Read off the traces by `analyze()` in `record.mjs` (independent of the port). 36 cases, 104,208 inputs, 104,244 states,
created by `rea-games record blocks` (cases are stored gzipped, 1.2 MB):

| | |
|---|---|
| games started / restarted after a loss | 142 / 106 (109 losses: 71 by stacking out, 38 by Escape) |
| pieces locked | 3,271, every type 451-476 times |
| line clears | 1 row: 461, 2 rows: 79, 3 rows: 23, 4 rows: 20 |
| most rows / score in one case | 131 rows (step reaches its floor 0.1), 17,690 points |
| rotations tried | 8,361; every type reaches every direction (28 type x direction pairs, 114-503 times each) |
| rotations dropped | 560 by a wall or the floor, 433 by a block; 869 of them would have turned with a one-cell kick |
| moves tried / blocked | 12,674 / 1,240 |
| soft drops (down key handled) / gravity drops | 38,873 / 2,630 |
| frames with keys while stopped | 35 (arrows, Escape; Space and the start link also while playing) |
| longest action queue | 177 |
| queue emptied by a lock | 204 |
| frames where a lose was followed by a second drop (quirk above) | 3 |
| dt values | 16.667 mostly, also 8, 20, 33, 50, 100 ms (fixed per case and mixed per frame) |

The analyzer's own prediction of every handled rotation (turns or not, from the previous grid) agreed with the
original in all cases (0 mismatches), which checks the bots' copy of the shapes and the reading of the queue.

## Not covered

Only three recorded frames include a second drop after a loss in the same frame. No recording reaches a full top row.
