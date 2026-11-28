# Canvas Bird: behavior spec

Original: Canvas Bird (MIT), vendored unmodified in `originals/canvas-bird` (`app.js`, about 300 lines, one IIFE).
The port in `ports/web/bird.mjs` was written from this page, not by translating `app.js`.

## What was recorded and how

The page runs unmodified in headless Chrome (`driver.mjs`). 

Only its inputs are replaced:

- **Clock.** `Date.now`, `performance.now`, `requestAnimationFrame` and `cancelAnimationFrame` are faked. The page
  advances only when the driver calls `step({dt, click})`: the click event (if any) is dispatched on the canvas, the
  clock moves by `dt` ms (starts at 1000000), and the queued animation callback runs once. `Date.now()` is
  `floor(t)` as in a real browser, `t` accumulates the float `dt` values.
- **Random.** `Math.random` is a seeded generator; every value it hands out is saved as `tape`.
- **Audio.** `Audio` is a stub whose `play()` only adds `a:...` to the frame.
- The page's CSS imports a web font; network requests are blocked (the font cannot change what is drawn on the
  canvas, `ctx.font` is not observable through the calls above).

A case is `{seed, tape, inputs: [{dt, click}], trace}`. `trace[0]` is the frame `window.onload` draws before any
step, `trace[i]` is the frame of `inputs[i-1]`. The inputs come from small scripted players that look only at the
previous frame's draw list (`record.mjs`), so they react to the game; the port gets the inputs and the tape and
nothing else.

## State that is compared

Its state is inside the IIFE, so it is observed
black-box through the canvas 2D context: `clearRect`, `drawImage`, `fillText` and `strokeText` are wrapped
(and so are the `fillStyle` / `strokeStyle` setters, to keep the raw string that was assigned). Everything the
player can see is one of those calls, so a frame is the list of its calls, as strings, numbers printed exactly
as JavaScript prints them (nothing is rounded):

| string | call |
|---|---|
| `c:0:0:640:480` | `clearRect` |
| `i:enemy_up:x:y` | `drawImage(img, x, y)`, image named by its file |
| `s:player:sx:0:64:64:70:y:64:64` | `drawImage` with a source rectangle (the bird, 3 sprite frames) |
| `t:fill|stroke:text:x:y:style` | `fillText` / `strokeText` with the style string last assigned |
| `a:point`, `a:lose` | `Audio.play()` of the point / lose sound was requested |

## Constants

| | |
|---|---|
| canvas | 640 x 480 |
| bird | box 64 x 64, x = 70 (never changes), starts at y = 20 with velocity 2, force 0.15 per frame, jump sets velocity -6, falling velocity stops growing once it is 8 or more |
| pipes | 5 sets, each an up pipe and a down pipe, 64 x 316 images, 300 px apart (x = 640 + 300 i), 3 px per frame |
| gap | up pipe y = 240 + 120 + off, down pipe y = 0 - 120 + off, off = `floor(rand * 201 - 150)`, so -150..50; the opening is `[off + 196, off + 360]`, 164 px tall |
| background | two images, 640 wide, 1 px per frame, jump to x = 640 once x <= -640 |
| frame gate | 30 fps = 1000/30 = 33.333... ms |
| text | `Click to start game` at x = 90, y = 80; the score at x = 309 (stroke, y 51) and 310 (fill, y 50) |

## Randomness (the tape order)

`Math.random` is a seeded generator; every value it hands out is saved as `tape`. At the start of a round, five new pipe sets are made, one random number each, in order 0..4, and those first five numbers fix the gap heights of the five sets. When a pipe is recycled, one random number is taken for a new offset, but its `y` is not recomputed: `yOffset` is stored and never used. Later random numbers are therefore consumed (and must be, to keep the tape in step) but change nothing on screen.

## Order of operations in one step

A step is: (click handler, if clicked) then the animation callback.

**Click handler.** If controls are on: velocity = -6. If no round is on: score = 0, velocity = 2, y = 20, five new
pipe sets are made (one random number each, in order 0..4), `next = 0`, `last = 4`, round on, controls on. So the
**first click only starts** (controls were off when it began), the second one flaps.

**Frame.** `clearRect`, two background draws, then both backgrounds move.
- *No round on:* stroke the text with `rgba(0,0,0,a)`, fill it with `rgba(255,255,255,a)`, then move `a` by 0.02:
  `a` starts at 1 and falls; when it is below 0 it turns and rises; when above 1 it turns and falls. It is not reset
  by a round, so the splash after a loss continues where the last one stopped.
- *Round on:* for each pipe set 0..4: draw up pipe, draw down pipe, move up pipe, move down pipe. Then the bird:
  1. pick the sprite frame (this reads the clock, gate below), draw the bird at the current y,
  2. fall (gate below): velocity += 0.15 if it is below 8, then y += velocity,
  3. collision check with the new y; if it hit, controls go off, and if `y - 64 > 480` the round ends,
  4. `strokeText(score)` using whatever stroke style the splash left, `fillText(score)` in white.

A pipe is therefore drawn before it moves and the bird is drawn before it falls: the frame shows the position
from before this frame's physics; the collision is judged after it.

**Pipe move.** Up pipe: x -= 3; if x <= -64 it is recycled: its x and its down pipe's x become the x of pipe
`last` plus 300 (that pipe's value at that moment, which has or has not moved yet this frame depending on the
order of the ids), one random number is taken for a new offset, `last` advances. Both pipes then check scoring:
if this set is `next` and its x + 64 < 134, `next` advances and, if controls are on, score += 1 and `a:point`. The
down pipe moves 3 px after the up pipe in the same frame, so after the first recycle the two images of a set are
3 px apart in x for ever.

### Collision

Only `pipes[next]` is looked at. With `right = 134` (bird x + 64, the front edge), `px = down.x + 40`:

- if `px < right < px + 24` (down.x between 70 and 94 exclusive, 8 frames at 3 px) and
  (`top < down.y + 316` or `bottom > up.y`): hit. The top and bottom of the bird are the 64 px box.
- if `bottom < 0` or `top > 480`: hit, whether or not a pipe is near.

`a:lose` is requested when a hit is found while controls are still on, i.e. once per round. The hit does not stop
the round: controls go off (no flap, no score, a new click does nothing), the bird keeps falling and the pipes keep
moving (and recycling, and taking random numbers) until the bird is below the screen, then the splash returns.
A hit above the top does not end the round either: the bird (controls off) falls back onto the screen and out of
the bottom, so a "top exit" costs a few dozen extra frames before the splash.

### What the 30 fps gate really does

Two clocks are compared with `now - counter > 33.33`:

- **Sprite frame** (`fpsCounter`) is reset each time the sprite advances, so the bird flaps its three frames
  (0, 1, 2, 0...) at most every 34 ms of the clock. With 16.667 ms steps it changes every 3rd frame (50 ms, as
  the integer clock reaches 34+), with 8 ms every 5th, with 33 ms every 2nd, with 50 and 100 ms every frame.
- **Fall** (`fallingCounter`) is set once at page load and **never reset**. After the first 34 ms of the clock it is
  always true, so the physics runs once per rendered frame whatever `dt` is: falling speed per second depends on
  the frame rate (twice as fast at 8 ms steps as at 16.667 ms, and the pipes, 3 px a frame, scale the same
  way, so only the clicks' timing is different in time terms). The gate matters only for a round that starts
  within 34 ms of load: with 16.667 ms steps the first two frames after the click do not fall (clock 16, 33), so y = 20 is
  drawn three times; with 8 ms steps four frames do not fall and y = 20 is drawn five times. Recorded in
  `click-at-load-60fps` and `click-at-load-8ms`.

## Quirks

- The gate above: "30 fps lock for falling" does not lock anything after the first 34 ms.
- Recycled pipes get a new random offset but their `y` is not recomputed: `yOffset` is stored and never used. The
  gap heights of the five sets are fixed by the first five random numbers of a round; later random numbers
  are consumed (and must be, to keep the tape in step) but change nothing on screen. The pipes just repeat every 5.
- `hasCollided & PLAYER_CONTROLS_ON`: a single `&` between booleans. It works (the result is 0 or 1) and is
  not a behavior difference.
- The score stroke uses the stroke style the last splash frame left (`rgba(0,0,0,0.9199999999999999)` and so on),
  so the outline's opacity is a leftover; fill is plain white.
- The first click does not flap. A click while the bird is falling after a hit does nothing.
- Only the next pipe is checked and only for 8 frames: the 40 px offsets make the hit box 24 px wide inside a 64 px
  image, and the bird's front edge is the only thing tested (its back part can overlap a pipe image).
- Falling speed stops growing at 8, flap speed is -6: from velocity -6 the bird rises about 120 px.
- `playerBottomY < 0` is "above the top", so the bird that flew up can go on until its whole body is out of sight
  before that counts.
- The fall counter, the sprite clock, the text alpha and the background offsets are never reset by a new round.

## Not modelled, and why that is safe

- **Audio.** The sounds are not played; only the request is traced (`a:point` / `a:lose`, once per event). The
  game never reads anything back from audio.
- **The images.** Pixel content is not compared; names, positions and source rectangles are. The one place the
  game reads an image is its `width` / `height`, which `loadImage` sets from the constants (64, 316, 640), so
  size comes from attributes, not from files.
- **Real time and the web font.** Replaced by the fake clock; no draw call depends on the font.
- **Everything not reachable through the page's one click handler:** no keyboard, touch or other events exist in
  the original, so the inputs `{dt, click}` are all there is.

## Coverage

Read off the traces by `analyze()` in `record.mjs`, not from the port. 30 cases, 68,409 inputs, 68,439 recorded frames (28 MB of JSON), seeds 1 to 41, steps of 8, 16.667, 20, 33, 50
and 100 ms (and a random mix of all six).

| what | count |
|---|---|
| rounds started | 133 (105 of them after a loss, i.e. restarts from the splash) |
| score increments (`a:point`) | 354; highest score in one round 60; 9 cases reach 32 or more (bot-60fps-a, bot-60fps-b, bot-mixed-dt, bot-8ms, bot-20ms, bot-33ms, bot-50ms, bot-100ms, bot-marathon) |
| pipe recycles seen (an up pipe jumping right) | 494 (each takes one random number) |
| hits (`a:lose`) | 142: 48 top pipe, 11 bottom pipe, 68 above the top, 15 below the bottom |
| round ended by falling off the bottom | 108 (back to the splash) |
| splash frames (alpha fluctuation) | 3,898, the longest wait is 700 frames, so alpha crossed both ends |

Hit kinds are classified from the frame after the hit (bird y) and the pipe whose window the bird front was in; the
two the bots rarely produce, bottom pipe (11) and below the bottom (15), have the thinnest coverage.

## Not covered

- Only the next-pipe rule was exercised by bots that pass, plus crashes; a bird that sits outside the gap in the
  window of a pipe other than `next` is possible only if `next` lags the pipes, which never happened in any case.
- One click per frame only (the driver dispatches one click event per step); several clicks between two frames
  are not recorded. The handler is idempotent per frame apart from the first click, so two clicks in one frame would
  start a round and flap in the same frame, which no case does.
- `dt` values were never below 8 ms or above 100 ms, and `dt` = 0 was not tried.
- Cases are one session from page load; the page is never reloaded mid case.

