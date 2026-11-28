// `rea-games new <game>`: the files every game needs, with the contract spelled out.
import fs from "node:fs";
import path from "node:path";

export function scaffold(root, name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error("game names are lowercase letters, digits and dashes");
  const dir = path.join(root, "games", name);
  if (fs.existsSync(dir)) throw new Error(`games/${name} already exists`);
  fs.mkdirSync(path.join(dir, "cases"), { recursive: true });
  fs.mkdirSync(path.join(dir, "ports/web"), { recursive: true });
  const w = (f, s) => fs.writeFileSync(path.join(dir, f), s);
  w("game.json", JSON.stringify({
    name, title: name,
    original: { repo: "OWNER/REPO", license: "SPDX-ID", path: `originals/${name}` },
    record: "record.mjs",
    ports: { web: { cmd: ["node", "ports/web/run.mjs"], play: "ports/web/index.html" } },
  }, null, 2) + "\n");
  w("record.mjs", `// Records the ORIGINAL (originals/${name}) into cases/*.json. Run it unmodified; wrap the browser, not the game.
// A case is { game, name, tape, inputs, trace }:
//   tape   every random number the original used, in order (the port reads them back)
//   inputs what the player (and the clock) did, one entry per step
//   trace  the state after each step, plus the initial state first; read it from the live game
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function record() {
  fs.mkdirSync(path.join(here, "cases"), { recursive: true });
  // TODO: open the original, replace the clock / requestAnimationFrame / Math.random, play seeded input scripts,
  // and write each case with fs.writeFileSync(path.join(here, "cases", \`\${name}.json\`), JSON.stringify(c)).
  throw new Error("record.mjs is a stub: write the recorder for ${name}");
}
`);
  w("GAME.md", `# ${name}: behavior spec

Original: OWNER/REPO (licence), vendored unmodified in \`originals/${name}\`.

## What was recorded
(how the original was driven, what a trace entry holds, how many cases and inputs there are)

## State that is compared
(every field verify compares, in order, with its units)

## Constants
(every number the port needs, with units and where it came from in the recording)

## Randomness (the tape order)
(how random numbers are seeded, saved as the tape, and the order they are drawn in; omit this section when the game draws no random numbers)

## Order of operations in one step
(the rules, as the ordered steps inside one step, with the formulas)

## Quirks
(things the original does that look like bugs; the port must match them)

## Not modelled, and why that is safe
(what is not modelled, and why it cannot change the trace)

## Coverage
(what the cases cover, read off the traces)

## Not covered
(what the recordings do not cover)
`);
  w("ports/web/run.mjs", `// Runner protocol: a case on stdin, { trace, tapeUsed } on stdout.
const c = JSON.parse(await new Promise((r) => { let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => r(s)); }));
let used = 0;
const rng = () => { if (used >= c.tape.length) throw new Error("asked for more random numbers than the original used"); return c.tape[used++]; };
const trace = []; // TODO: step your port through c.inputs and push one state per step
process.stdout.write(JSON.stringify({ trace, tapeUsed: used }));
`);
  w("ports/web/index.html", `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} · rea-games</title>
<meta name="description" content="TODO: describe ${name} in one sentence.">
<meta property="og:title" content="${name} · rea-games">
<meta property="og:description" content="TODO: describe ${name} in one sentence.">
<meta property="og:image" content="https://erkamyaman.github.io/rea-games/assets/social-preview.png">
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#14161c; color:#e8eaf0;
         font:16px/1.4 system-ui,sans-serif; text-align:center; }
  main { padding:20px; }
nav.site { display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:20px; }
nav.site a { color:#8b93a7; text-decoration:none; padding:4px 0; border-radius:4px; }
nav.site a:hover { color:#e8eaed; text-decoration:underline; }
nav.site a:focus-visible { outline:2px solid #e8eaed; outline-offset:3px; color:#e8eaed; }
nav.site a.repo { font-size:13px; }
  p { color:#8b93a7; max-width:44ch; }
</style>
</head>
<body>
<main>
<nav class="site" aria-label="rea-games"><a href="../index.html">&larr; All games</a><a class="repo" href="https://github.com/erkamyaman/rea-games">rea-games on GitHub</a></nav>
<h1>${name}</h1>
<p>TODO: draw the game, step it through a case's inputs and tape, and show the same trace. Keep the rules in one module so verify can run it.</p>
</main>
</body>
</html>
`);
  return dir;
}
