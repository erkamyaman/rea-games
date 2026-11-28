# 2048: behavior spec

Original: [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048) (MIT), vendored unmodified in
`originals/2048/src` (the rules live in `game_manager.js`, `grid.js`, `tile.js`). All three ports in this folder
were written from this page, not by translating those files.

## What was recorded

`record.mjs` runs the original `GameManager` unmodified inside a Node `vm`. Only the browser parts are replaced:
the input manager, the actuator, the storage, and `Math.random`, whose every value is saved in the case as `tape`.
After each input the case stores a snapshot: the 4x4 grid (`grid[x][y]`, 0 = empty, x is the column), `score`, `over`,
`won`, `terminated` and `best`. A port must reproduce every snapshot and use exactly the recorded random numbers.

19 cases, 24,044 inputs: 6 random games, 6 "corner" games (mostly left and down, like a human), 2 games with random
restarts, 3 late-game boards full of big tiles, one saved game one merge from the win (covers `won`, `terminated`,
`keepPlaying`) and one that ends because the board fills (covers `over`).

## Rules

- 4x4 grid. A move slides every tile as far as it goes toward the wall. Tiles that touch with the same value merge
  into one of double value, **once per move per tile**, and the pair nearest the wall merges first (`[2,2,2,2]` slides
  to `[4,4,0,0]`, `[2,2,2,0]` to `[4,2,0,0]`).
- Score grows by the value of each merged tile. A merge that makes 2048 sets `won`.
- A move that changes nothing is ignored: no new tile, no actuate, score unchanged.
- After a move that changed the grid, one tile appears. **The random numbers are drawn in this order**: first the value
  (`r < 0.9` gives 2, otherwise 4), then the place (`floor(r * free)` into the free cells listed column by column,
  top to bottom within a column, `x` outer, `y` inner).
- If no cell is free and no two neighbours are equal, `over` is set.
- `terminated = over || (won && !keepPlaying)`. Moves are ignored while terminated.
- `keepPlaying` clears the won overlay only; it does not change the grid or draw a tile. `restart` clears the
  saved game, then sets up a new one with two start tiles (two value+place pairs from the tape).
- `best` is the highest score seen since the page loaded and survives `restart`.

## Quirks worth knowing

- The original replaces its own `keepPlaying` method with a boolean on first use (`this.keepPlaying = true`). It works
  because the handler was already bound, and the port keeps the same behavior with a plain flag.
- `terminated` is not part of what the actuator receives after `keepPlaying`, because that path never calls it. The
  recording reads it from the manager instead, which is what the page shows.
- A fixture bug found while recording: a saved game whose tile `position` fields disagree with their place in the grid
  makes the original misbehave (it moves tiles by their own coordinates). Fixtures set `position` to the cell.

## Not covered

Animations, the tile-merge "pop", touch handling, local storage of best score between page loads, and sizes other
than 4 (the original accepts any, the ports are fixed at 4).
