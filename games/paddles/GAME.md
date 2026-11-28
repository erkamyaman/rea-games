# Paddles: behavior spec

Original: a two-paddle ball game (MIT, same author as Blocks and Bricks), vendored unmodified in `originals/paddles`
(`game.js` a small engine, `pong.js` the game, `index.html` the page with its option checkboxes, `images/` the menu
pictures, `sounds/` four effects). The tutorial steps of the original repository (`part1` to `part5`) are left out.
The port in `ports/web/paddles.mjs` was written from this page and from reading the original's rules, not by
translating them line by line. The rebuild is called "paddles": Pong is a trademark of its owner.

## What was recorded

The page runs unmodified in headless Chrome (`driver.mjs`). The canvas is always 640 x 480 (the game sets it). The
page keeps its game object in a local variable, so the driver wraps `Pong.initialize` to remember `this` and then runs
it unchanged; the state is read from that object after every input. Only the page's inputs are replaced:

- **Clock.** `new Date()`, `Date.now`, `performance.now`, `setTimeout`, `setInterval` and their `clear` functions are
  faked, exactly as for Bricks: key events first, then the clock moves by `dt` ms from 1000000, timers fire at their
  due time in due order (ties: scheduled first), an interval comes due again `1000 / 60` after it fired, and a `late`
  step fires every timer that came due once, at the end. The page sees `floor(t)`.
- **Random.** `Math.random` is a seeded generator; every value handed out is saved as `tape`.
- **"Abandon game in progress ?"** Escape opens `window.confirm`; it answers `input.answer` (true when absent).

A case is `{game, name, seed, clock0, tape, inputs, trace}`. An input is `{dt, keys, late?, answer?}`; `keys` is an
ordered list of `+key` (down) and `-key` (up), key one of `0 1 2 esc q a p l`. `trace[0]` is the state after load,
`trace[i]` the state after `inputs[i-1]`.

The inputs come from scripted players and bots that look only at the previous state (`record.mjs`).

## State that is compared

A recorded state is:

```
{playing, scores: [left, right], winner (0, 1 or null),
 left:  {y, up, down, auto, level, prediction},   level: index into the table below, or null
 right: {...},                                     prediction: null or {x, y, dx, dy, since, exactY}
 ball:  {x, y, dx, dy}                             all null until the first game
 last}                                             the frame loop's last timestamp (whole ms)
```

Numbers are compared exactly (`lib/compare.mjs`).

## Constants

| | |
|---|---|
| court | 640 x 480; walls 12 px at the top and bottom |
| paddles | 12 x 60, left at `x = 0`, right at `x = 628`; `y` in `[12, 408]`, starting at 210; speed `(408 - 12) / 2 = 198` px/s |
| ball | radius 5; `x` in `[5, 635]`, `y` in `[17, 463]`; serve speed `(635 - 5) / 4 = 157.5` px/s on each axis; acceleration 8 px/s² |
| win | the first to 9 points |
| levels | `level = 8 + (own score - other score)`; level `n` reacts after `0.2 + n/10` s (the literals 0.2, 0.3 ... 1.8) and errs by up to `40 + 10 n` px |

## Randomness (the tape order)

One number per serve (its `y`) and one per new prediction, in the order they happen inside a frame: left paddle's
prediction, right paddle's, then a serve after a point. A port that predicts once more (or once less) fails on
`tapeUsed`.

## Order of operations in one step

The frame loop is a 60 Hz interval: `now = floor(t)`, `update((now - last) / 1000)`, `last = now`. No cap on `dt`.

`update(dt)`:

1. Left paddle, then right paddle: if the computer holds it, it thinks (below); then if `down - up` is not 0,
   `y = y + (down - up) * dt * speed`, clamped to `[12, 408]`. Paddles move in the menu too, when held by a person.
2. Only while playing: the ball moves (below), then if its left edge is past 640 the left side scores, else if its right
   edge is below 0 the right side scores.

**The ball** (`dx`, `dy` are velocities):

1. `half = 8 * dt * dt * 0.5`; the new position is `x + dt * dx + half`, `y + dt * dy + half` (**the half step is added
   to y whichever way the ball goes**); `nx`, `ny` are the moves. Each velocity grows by `8 * dt` in its own direction.
2. Walls: moving down past 463, `y = 463` and `dy` flips; moving up past 17, `y = 17` and `dy` flips.
3. The paddle in the new horizontal direction (left if the new `dx < 0`) is tested with the move `(nx, ny)` from the old
   position: the side face facing the motion first, then the top or bottom face, as for Bricks (faces grown by the
   radius, two-segment intersection). A side hit sets `x` to the hit point and flips `dx`; a top or bottom hit sets `y`
   and flips `dy`.
4. **Spin**: after a hit, if that paddle's up key is held, `dy` is halved when the ball goes up and multiplied by 1.5
   when it goes down; if only its down key is held, the other way round.

**A point**: the scorer's count goes up. At 9 that side is the winner and the game stops (no question). Otherwise the
ball is served again and both paddles' levels are recomputed (only a computer paddle takes a new level).

**Serve**: from the scorer's side (`x = 635` moving left after a right point, `x = 5` moving right otherwise, also at a
game's start), `y = 17 + random() * (463 - 17)`, both velocities 157.5 (`dx` signed).

**The computer** (each frame, for a paddle it holds):

1. If the ball is past the paddle and moving away (`x < left` and `dx < 0`, or `x > right` and `dx > 0`): let go of
   both keys and stop.
2. Predict: keep the last prediction (adding `dt` to its age) while it exists, `dx` and `dy` have the same signs as when
   it was made, and it is younger than the level's reaction time. Otherwise aim a line from the ball along
   `(dx * 10, dy * 10)` at the paddle's side face (the paddle stretched to `y` +-10000). No hit: no prediction. A hit
   is folded back into `[17, 463]` wall by wall; `exactY` is that; then
   `error = levelError * (distance from the ball to the paddle's face along x) / 640` and
   `y = exactY - error + random() * (2 error)`. **This is the only other random number.**
3. With a prediction: above `paddle top + 25` press up, below `paddle bottom - 25` press down, otherwise let go. With
   none, the keys stay as they were.

### Keys and states

| key | down | up |
|---|---|---|
| 0, 1, 2 | start a game with that many people (only when no game is running): scores 0-0, the left paddle goes to the computer with 0 people, the right with 0 or 1, at level 8, and the ball is served | - |
| Esc | in a game: the frame loop stops, "abandon?" is asked, the loop starts again (`last = floor(t)`, a new interval) **whatever the answer**; yes stops the game | - |
| Q / A | left paddle up / down, if a person holds it | stop that direction |
| P / L | right paddle up / down, if a person holds it | stop that direction |

Stopping a game hands both paddles back to people and keeps the scores, the winner, each paddle's last level and its
last prediction. Only a paddle the computer held lets go of its keys then; a key a person is still holding stays down
(hold Q in a two-player game and give up: the left paddle keeps moving up). Handing a paddle to the computer does not
let go of keys already held either.

## Quirks

- The half step of acceleration is added to `y` downwards whatever the ball's vertical direction.
- A computer paddle with no prediction keeps its keys as they were, so it can keep sliding to a wall.
- A prediction survives the end of a game: the next game's computer may keep it if the new ball goes the same way and
  the prediction is still young.
- The winner stays on record until someone else wins; a new game does not clear it.
- Keys held when a paddle is handed to the computer stay held until the computer changes them.
- Abandon answered no still restarts the frame loop (6 declines recorded).

## Not modelled, and why that is safe

- **Drawing** (`draw`, the menu pictures, digits, footprints, predictions overlay): they only read the game.
- **Sound**: the page starts with sound off; `wall` and `goal` sounds are commented out in the original anyway.
- **The option checkboxes** (sound, stats, footprints, predictions): they switch drawing or sound only. Footprints
  change `ball.footprints`, which nothing in play reads.
- **The cursor** (`hideCursor`, `showCursor`): a CSS style.

## Coverage

Read off the traces by `analyze()` in `record.mjs` (independent of the port). 19 cases, 198,300 inputs, 198,319 states,
created by `rea-games record paddles` (cases are stored gzipped, 6.6 MB):

| | |
|---|---|
| games started (0 / 1 / 2 people) | 59 (15 / 22 / 22) |
| games played to 9 / abandoned / abandon declined | 21 / 24 / 6 |
| points | 337 |
| paddle hits / with spin / wall bounces | 1,457 / 271 (see below) / 2,517 |
| new computer predictions | 2,865 |
| computer levels used | 1 to 16 (level 0, behind by 8, never happened) |
| fastest ball | 667 px/s across |
| late steps (40 to 500 ms) | 661 |
| dt values | 16.667 mostly, also 8, 20, 33, 50, 100 ms (fixed per case and mixed per step) |

Spin is read off the traces from the hitting paddle's keys after the step, which is exact when the step is one frame
(182 of 182 such hits). A step of several frames can hide when the computer let go, so there it is an estimate: counted
at the moment of each hit in the verified port, 362 of 1,495 hits had spin (the traces also miss hits on a paddle's top
or bottom and a second hit in one step).

Breaking the port on purpose made `verify` fail: acceleration 8 -> 7.9 (16 of 19 cases failed), the spin of an upward
paddle swapped (15 of 19), the computer's dead zone 5 -> 6 px (14 of 19).

## Not covered

The computer's level 0 (behind by 8 points) never happened.
