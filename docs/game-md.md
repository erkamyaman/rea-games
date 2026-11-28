# The GAME.md format

A `GAME.md` is the behaviour spec for one game, at `games/<game>/GAME.md`. It states the rules, the order of operations in a frame, the constants, the quirks, and what is not modelled. It is written from the recording (from what the original *does*), not from reading its source: the port is written from `GAME.md`, and `verify` checks the port against the recorded cases. A new `GAME.md` starts from the scaffold (`node bin/rea-games.mjs new <game>`), which uses the headings below.

## Required sections, in order

Keep these sections in this order, with these headings. Each one says what goes in it and links to a good example in a shipped `GAME.md`.

### Title and Original line

`# <game>: behavior spec`, followed by an `Original:` line naming the source repo, its licence, and where it is vendored unmodified under `originals/<game>/`. Example: [games/2048/GAME.md](../games/2048/GAME.md).

### What was recorded

How the original was run and recorded (the harness, the inputs, what one case is) and how many cases there are. Example: [games/blocks/GAME.md](../games/blocks/GAME.md); [games/dino/GAME.md](../games/dino/GAME.md) puts the harness in section 1, "How the original is run (the harness)".

### State that is compared

Every field `verify` compares, in order, with its units. Example: [games/dino/GAME.md](../games/dino/GAME.md), section 2, "State that is compared".

### Constants

Every number the port needs, with units and where it came from in the recording. No guessed numbers. Example: [games/blocks/GAME.md](../games/blocks/GAME.md).

### Randomness (the tape order)

Required when the game draws random numbers; omit it when it does not. Say how draws are seeded, saved as the tape, and the order they are consumed in, and give things that do not change play (clouds, particles) a separate stream. Example: [games/blocks/GAME.md](../games/blocks/GAME.md) ("Randomness (the tape order)"); [games/dino/GAME.md](../games/dino/GAME.md) ("Two random tapes").

### Order of operations in one step

The rules, as the ordered steps inside one step (one frame), with the formulas. Per-entity detail (the dino, obstacles, collision) goes in subsections under it. Example: [games/blocks/GAME.md](../games/blocks/GAME.md); [games/canvas-bird/GAME.md](../games/canvas-bird/GAME.md).

### Quirks

Oddities and bugs the original has, kept on purpose, with the evidence from the recording. Example: [games/2048/GAME.md](../games/2048/GAME.md) ("Quirks worth knowing"); [games/blocks/GAME.md](../games/blocks/GAME.md).

### Not modelled, and why that is safe

Everything left out, each with why it cannot change the trace. Example: [games/canvas-bird/GAME.md](../games/canvas-bird/GAME.md); [games/dino/GAME.md](../games/dino/GAME.md), section 11.

### Coverage

What the cases cover, read off the traces, not from the port. Example: [games/canvas-bird/GAME.md](../games/canvas-bird/GAME.md) ("Coverage of the recording"); [games/blocks/GAME.md](../games/blocks/GAME.md).

### Not covered

The honest list of what the recordings do not cover. Example: [games/2048/GAME.md](../games/2048/GAME.md); [games/dino/GAME.md](../games/dino/GAME.md), section 13 ("Not matched / not covered (honest list)").

## Optional sections

A game may add a section where the required ones do not fit (for example [games/blocks/GAME.md](../games/blocks/GAME.md) adds "What is traced but does not affect play" after the order of operations), but the required sections keep the order above, and no required section is renamed.

## Where this comes from

These headings are the common shape of the first four specs the repo shipped: [games/2048/GAME.md](../games/2048/GAME.md), [games/dino/GAME.md](../games/dino/GAME.md), [games/canvas-bird/GAME.md](../games/canvas-bird/GAME.md) and [games/blocks/GAME.md](../games/blocks/GAME.md). They do not all follow it yet: 2048 has no Constants or order-of-operations section, and dino numbers its sections 1 to 13. Those files are not rewritten here; a follow-up can align them.
