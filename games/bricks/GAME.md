# Bricks: behavior spec

Original: a brick-breaking game (MIT, same author as Blocks), vendored unmodified in `originals/bricks`
(`game.js` is a small engine: state machine, frame loop, collision maths; `breakout.js` the game; `levels.js` ten brick
layouts; `images/` and `sound/` are the page's arrows, background and sound library). The port in
`ports/web/bricks.mjs` was written from this page and from reading the original's rules, not by translating them
line by line. The rebuild is called "bricks": Breakout is a trademark of its owner.

## What was recorded

The page runs unmodified in headless Chrome (`driver.mjs`) at a 700 x 700 viewport, so the canvas is 640 x 480 (the
page's CSS picks that size below 1200 px wide). The state is read from the live game object `Game.current` after
every input. Only the page's inputs are replaced:

- **Clock.** `new Date()` (the page reads time with `new Date().getTime()`), `Date.now`, `performance.now`,
  `setTimeout`, `setInterval` and their `clear` functions are faked. The page advances only when the driver calls
  `step(input)`: the key events are dispatched in order, then the clock moves by `dt` ms (it starts at 1000000 and
  accumulates the float values). The page sees `floor(t)`. Timers are explained below.
- **Random.** `Math.random` is a seeded generator; every value handed out is saved as `tape`.
- **"Abandon game?"** Escape opens `window.confirm`. It answers `input.answer` (true when absent).
- **Storage.** Each case runs in a new browser context, so `localStorage` starts empty: level 1, high score 1000.
- The sound library (`sound/soundmanager2-*.js`) keeps the real timers: it never touches the game's variables. The
  recorder waits until it has loaded, because the game reads the global `soundManager` whenever it would play a sound
  (sound is off by default, so nothing plays).

A case is `{game, name, seed, clock0, levels, tape, inputs, trace}`.

- `levels` holds, per level, the bricks as the original builds them: `[firstColumn, lastColumn, row, points]`, in the
  original's order. It is read from the page (a throwaway one) at record time, so the port takes the layouts from the
  case and ships none of the original's level designs.
- An input is `{dt, keys, late?, answer?}`. `keys` is an ordered list of `+key` (key down) and `-key` (key up), key one
  of `left right a d space enter esc up down`.
- `trace[0]` is the state after load, `trace[i]` the state after `inputs[i-1]`.

The inputs come from scripted players and bots that look only at the previous state (`record.mjs`).

## State that is compared

A recorded state is:

```
{state: "menu" | "game", level (0-based), score, vscore, highscore, lives,
 paddle: {x, left, right},          left/right: 1 while that direction is held
 ball: {x, y, dx, dy, speed, moving, countdown, label},
 bricks: one char per brick of the level, "o" standing, "x" hit,
 last}                              the frame loop's last timestamp (whole ms)
```

Numbers are compared exactly (`lib/compare.mjs`).

## Constants

Everything is measured in **chunks**: `chunk = floor(min(640, 480) / (max(30, 25) + 4)) = 14` px.

| | |
|---|---|
| court | 30 x 25 chunks: `width 420, height 350`, `left = floor((640 - 420) / 2) = 110`, `top = floor((480 - 350) / 2) = 65`, `right 530`, `bottom 415` |
| walls | top `{x: left - chunk, y: top - 2 chunk, w: width + 2 chunk, h: 2 chunk}`; left `{x: left - chunk, y: top - 2 chunk, w: chunk, h: 2 chunk + height}`; right the same at `x: right` |
| bricks | `x = left + x1 * chunk`, `y = top + row * chunk`, `w = (x2 - x1 + 1) * chunk`, `h = chunk`; points `(25 - row) * 5` |
| paddle | `w = 6 chunk`, `h = 1 chunk`, `y = bottom - h`, speed `20 chunk` px/s, `x` kept in `[left, right - w]` |
| ball | radius `0.3 * chunk`, speed `15 * chunk` px/s at the start of each ball, at most `1.5 x` that |
| lives | 3 at the start, at most 5 |

A box's edges are `left = x`, `right = x + w`, `top = y`, `bottom = y + h`.

## Randomness (the tape order)

One number per entry into the menu: the paddle's position. At load, after every lost game and after every "yes" to
abandon. Nothing else draws. A port that draws one more (or one fewer) fails on `tapeUsed`.

## Order of operations in one step

### Timers (the order of everything)

The original's frame loop is `setInterval(loop, 1000 / 60)` and the launch countdown a chain of `setTimeout(.., 1000)`.
The recorder's clock, and the port's copy of it, runs them like this:

- A timer comes due `delay` ms after it was set: `due = t + delay` (float).
- **On time** (`late` absent): while some timer is due at or before the end of the step, the one with the smallest
  `due` (ties: the one scheduled first) fires; the clock first moves to its `due`. An interval is then due again
  `1000 / 60` ms after the time it fired. Then the clock moves to the end of the step.
- **Late** (`late: true`, the page was busy): the clock moves to the end of the step first, then every timer that came
  due fires once, in the same order, all at the end. An interval comes due again `1000 / 60` after that.

`loop`: `now = floor(t)`; `update((now - last) / 1000)`; `last = now`. So a 60 Hz frame sees 16 or 17 ms, and a late
frame sees the whole gap. There is no cap on that `dt`.

### One frame: `update(dt)`

1. **Paddle.** `amount = right - left` (1, 0 or -1, both held cancel). If not 0: `x = min(maxX, max(minX, x + amount * dt * speed))`.
2. **Ball** (below). In the menu, or before launch, the ball sits on the paddle: `x = paddle.x + paddle.w / 2`,
   `y = bottom - paddle.h - radius`.
3. **Shown score.** If `vscore < score`: `vscore = min(score, vscore + 10)`. This runs in the menu too.

The paddle moves in the menu as well (the ball rides on it).

### The ball

When moving, with `vx = dx * speed`, `vy = dy * speed`, `nx = vx * dt`, `ny = vy * dt`:

1. For each target in order (**paddle, top wall, left wall, right wall, then the bricks** in layout order, skipping hit
   bricks), find where the path from `(x, y)` to `(x + nx, y + ny)` crosses the box grown by the ball's radius. A box is
   tested on **one side face first**: the right face when `nx < 0`, the left face when `nx > 0` (none when `nx = 0`); only
   if that misses, the bottom face when `ny < 0` or the top face when `ny > 0`. Each face is a segment, e.g. the left
   face runs from `(left - r, top - r)` to `(left - r, bottom + r)`. The crossing is the usual two-segment
   intersection: `den = (y4 - y3)(x2 - x1) - (x4 - x3)(y2 - y1)`, no hit when `den = 0`;
   `ua = ((x4 - x3)(y1 - y3) - (y4 - y3)(x1 - x3)) / den`, `ub = ((x2 - x1)(y1 - y3) - (y2 - y1)(x1 - x3)) / den`,
   a hit when both are in `[0, 1]`, at `(x1 + ua (x2 - x1), y1 + ua (y2 - y1))`.
2. The **closest** hit (straight-line distance from the ball, `sqrt(ex * ex + ey * ey)`) wins; a later target at the
   same distance does not replace it.
3. If there is a hit:
   - a brick: it is hit (below). If that was the level's last brick, stop here (the ball is back on the paddle).
   - the paddle's **top** face: `vx = speed * (hitX - (paddle.x + paddle.w / 2)) / (paddle.w / 2)` (the end of the paddle
     gives a horizontal push of one speed, the middle none). Any other face of the paddle is an ordinary face.
   - the ball moves to the hit point; a left or right face sets the direction from `(-vx, vy)`, a top or bottom face
     from `(vx, -vy)`, normalised (`m = sqrt(a * a + b * b)`, `dx = a / m`, `dy = b / m`; `m = 0` means not moving).
   - then the rest of the time, `dt - dt * (distance / sqrt(nx * nx + ny * ny))`, runs again from step 1.
4. With no hit: if the end point is off the **canvas** (`x < 0`, `y < 0`, `x > 640` or `y > 480`; not the court) the ball
   is lost. Otherwise it moves there and its direction is re-normalised from `(vx, vy)`.

**A brick hit**: `score += points`; `speed += 10 * (1 - speed / maxSpeed)`; when all bricks of the level are hit, the
level is won: `lives = min(5, lives + 1)`, the next level is laid out (after the last level comes the first), and a new
ball starts (below).

**A lost ball**: `lives -= 1`; at 0 the game ends, otherwise a new ball starts.

**A new ball** (`reset`): speed and max speed back to the start values, on the paddle, not moving, any pending
countdown cancelled (label and countdown cleared), the target list rebuilt from the current bricks. Then, for a game
ball, the countdown starts.

**Countdown** (`launch`, called at once and then by its own one-second timer): it acts only while the ball is not
moving or a countdown is running. `countdown` goes 3, 2, 1, 0 (starting at 3 when there was none):

| countdown | label | what happens |
|---|---|---|
| 3 | `ready...` | next tick in 1 s |
| 2 | `set..` | next tick in 1 s |
| 1 | `go!` | next tick in 1 s; the ball starts moving towards `(1, -1)` |
| 0 | none | label and countdown cleared |

So the ball leaves 2 s after a ball starts, and "go!" stays one more second. **Launch now** (Space or Enter in a game):
if the ball is not moving, cancel the countdown and start moving towards `(1, -1)`.

### Menu and game

- **Load**: the menu is entered (below), then the frame loop starts (`last = floor(T0)`).
- **Entering the menu** (load, a lost game, an abandoned game): the current level is laid out again, the paddle is put at
  `x = minX + random() * (maxX - minX)` (the **only** random number in the game), not moving, and a new ball (no
  countdown).
- **Play** (Space or Enter in the menu): `score = vscore = 0`, `lives = 3`, a new ball with the countdown. The paddle stays
  where it was, and so does the level the menu showed.
- **Leaving a game** (lost, or abandoned): if `score > highscore`, `highscore = score`; `lives = 3`. `score` itself stays,
  and `vscore` keeps counting up to it in the menu, until the next game resets both.
- **Abandon** (Escape up in a game): the original stops its frame loop, asks "Abandon game?", and starts the loop again
  (`last = floor(t)`, a new interval due `1000 / 60` from now) **whatever the answer**. Yes leaves the game.
- **Levels** in the menu: Up (key up) shows the next level if there is one, Down the previous; each lays the level out
  again. The paddle and ball are not reset.

**Keys.** Left/A and Right/D act on key down (start moving) and key up (stop that direction). Every other key acts on
key up: Space/Enter (play in the menu, launch now in a game), Escape (abandon, in a game), Up/Down (level, in the
menu). A key acts in the state the game was in when its event started: the key up that starts a game does not also
launch the ball.

## Quirks

- The ball is lost only when its centre leaves the 640 x 480 canvas, about 65 px below the court's floor.
- Answering "no" to "Abandon game?" still restarts the frame loop: the next frame's `dt` is the time since the question,
  and the frame phase moves (14 declines recorded).
- The speed gained from bricks is lost with each new ball and each new level.
- The paddle is placed at random only on entering the menu, not for a new ball or a new level.
- A key up of Left stops the paddle even while A is still held (and the same for Right and D).
- Each face test returns the first face hit, side faces before top and bottom, so a corner hit counts as a side hit.
- After the last level the first comes again (seen once, in `bot-marathon-from-9`).
- The game reads `soundManager` as a bare global: if the sound library has not loaded, the first brick, paddle hit or
  lost ball throws. The recorder waits for it; the port has no sound.

## Not modelled, and why that is safe

- **Drawing** (`draw`, `render`, `measure`, `initCanvas`, the cached canvases, labels' positions): they only read the
  game and write pixels. The label's position is computed when it is set but nothing reads it for play.
- **Sound**: off unless the checkbox is ticked (it never is in the recordings); `playSound` changes nothing else.
- **The page's controls** (level arrows, the sound checkbox, the instructions box): they call the same functions as the
  Up/Down keys, or only toggle sound and CSS.
- **Touch** (`touchmove` places the paddle under the finger; `touchstart` on the instructions plays): not recorded. The
  port's `placePaddle` does what `place` does, and the play page uses it for dragging, but no case checks it.
- **Window resize**: stops the loop and later restarts it with new sizes, resetting the paddle (one more random number)
  and the ball. Never triggered; other canvas sizes are not recorded.
- **The stats overlay** (`stats: false`).

## Coverage

Read off the traces by `analyze()` in `record.mjs` (independent of the port). 37 cases, 209,600 inputs, 209,637 states,
created by `rea-games record bricks` (cases are stored gzipped, 5.8 MB):

| | |
|---|---|
| games started | 101 |
| balls lost / games lost | 166 / 47 |
| games abandoned / abandon declined | 19 / 14 |
| levels won / wrap from the last to the first | 14 / 1 |
| levels played | all 10 (from 5,767 to 55,653 game steps each) |
| bricks hit | 3,212 (up to 3 in one step) |
| paddle bounces | 1,841 |
| launches: countdown / Space or Enter | 158 / 71 |
| level changes in the menu | 176 |
| high score raised | 4 times |
| most lives / fastest ball | 5 / 314.66 px/s (the cap is 315) |
| late steps (40 to 500 ms, timers fire at the end) | 321 |
| steps with no frame (dt shorter than the frame interval) | 5,494 |
| dt values | 16.667 mostly, also 8, 20, 33, 50, 100 ms (fixed per case and mixed per step) |

Breaking the port on purpose made `verify` fail: the speed gained per brick 10 -> 9 (35 of 37 cases failed, the first
difference in the last bit of `ball.dx`), a key acting in the state after an earlier key (35 of 37), the paddle's centre
one pixel off (33 of 37).

## Not covered

Touch (dragging the paddle) and window resizing are not recorded, and the canvas is only ever 640 x 480.
