import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { formatSize, loadCases, loadGame, packCases, packLine } from "../lib/verify.mjs";

// Every shipped game has packed cases, so both sides of pack/load need a test of their own.
function caseText(n) {
  return JSON.stringify({
    inputs: Array.from({ length: n }, (_, i) => i % 5),
    tape: Array.from({ length: n }, (_, i) => (i % 97) / 97),
    trace: Array.from({ length: n }, (_, i) => ({ score: i, cells: [0, 0, i] })),
  });
}

// games/<name> with game.json and the given plain cases; loadGame needs the game.json.
function makeGame(root, name, cases) {
  const dir = path.join(root, "games", name);
  const cd = path.join(dir, "cases");
  fs.mkdirSync(cd, { recursive: true });
  fs.writeFileSync(path.join(dir, "game.json"), JSON.stringify({ name, original: { repo: "test/test", license: "MIT" }, ports: {} }));
  for (const [file, raw] of Object.entries(cases)) fs.writeFileSync(path.join(cd, file), raw);
  return dir;
}

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "rea-games-pack-"));

test("packCases leaves only .json.gz, reports fewer bytes, and loadCases returns the original cases", () => {
  const root = tempRoot();
  try {
    const a = caseText(200), b = caseText(250);
    const dir = makeGame(root, "packed", { "a.json": a, "b.json": b });
    const expected = loadCases(dir); // plain cases, before packing
    assert.deepEqual(expected.map((c) => c.file), ["a.json", "b.json"]);
    assert.deepEqual(expected.map((c) => c.raw), [a, b]);

    const { packed, alreadyPacked, before, after } = packCases(root, "packed");
    assert.equal(packed, 2);
    assert.equal(alreadyPacked, 0);
    assert.equal(before, Buffer.byteLength(a) + Buffer.byteLength(b));
    assert.ok(before > after, `before ${before} should be larger than after ${after}`);

    const cd = path.join(dir, "cases");
    assert.deepEqual(fs.readdirSync(cd).sort(), ["a.json.gz", "b.json.gz"]);
    assert.deepEqual(loadCases(dir), expected); // same names (without .gz) and same raw text
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loadCases reads one packed case and one plain case", () => {
  const root = tempRoot();
  try {
    const a = caseText(150), b = caseText(160);
    const dir = makeGame(root, "mixed", { "a.json": a });
    packCases(root, "mixed"); // a.json becomes a.json.gz
    const cd = path.join(dir, "cases");
    fs.writeFileSync(path.join(cd, "b.json"), b); // a plain case alongside the packed one

    assert.deepEqual(fs.readdirSync(cd).sort(), ["a.json.gz", "b.json"]);
    assert.deepEqual(loadCases(dir), [
      { file: "a.json", raw: a },
      { file: "b.json", raw: b },
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("packCases on packed cases packs nothing and reports how many were already packed", () => {
  const root = tempRoot();
  try {
    const dir = makeGame(root, "done", { "a.json": caseText(100), "b.json": caseText(120) });
    packCases(root, "done");
    const cd = path.join(dir, "cases");
    const gzBefore = fs.readdirSync(cd).sort().map((f) => fs.readFileSync(path.join(cd, f)));

    const r = packCases(root, "done");
    assert.deepEqual(r, { packed: 0, alreadyPacked: 2, before: 0, after: 0 });
    assert.equal(packLine("done", r), "done: already packed (2 cases)");
    assert.deepEqual(fs.readdirSync(cd).sort().map((f) => fs.readFileSync(path.join(cd, f))), gzBefore); // untouched

    fs.writeFileSync(path.join(cd, "c.json"), caseText(90)); // one new plain case among the packed ones
    const r2 = packCases(root, "done");
    assert.equal(r2.packed, 1);
    assert.equal(r2.alreadyPacked, 2);
    assert.match(packLine("done", r2), /^done: [\d.]+ KB -> [\d.]+ KB \(1 case packed, 2 already packed\)$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("formatSize shows KB below 0.1 MB and MB from there up", () => {
  assert.equal(formatSize(0), "0.0 KB");
  assert.equal(formatSize(4321), "4.3 KB");
  assert.equal(formatSize(99_949), "99.9 KB");
  assert.equal(formatSize(100_000), "0.1 MB");
  assert.equal(formatSize(2_345_678), "2.3 MB");
  assert.equal(packLine("empty", { packed: 0, alreadyPacked: 0, before: 0, after: 0 }), "empty: no cases to pack");
});

test("an unknown game and a game with no cases yet say what to do", () => {
  const root = tempRoot();
  try {
    makeGame(root, "known", {});
    fs.mkdirSync(path.join(root, "games", "fresh"));
    fs.writeFileSync(path.join(root, "games", "fresh", "game.json"), JSON.stringify({ name: "fresh", ports: {} }));
    assert.throws(() => loadGame(root, "nope"), { message: 'no game "nope" (games: fresh, known). Create one with: rea-games new nope' });
    assert.throws(() => packCases(root, "fresh"), { message: "fresh has no cases yet; run: rea-games record fresh" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pack all continues when a game has no cases and exits 1", () => {
  const root = tempRoot();
  try {
    makeGame(root, "aaa", {});
    makeGame(root, "zzz", { a: caseText(10) });
    // Remove cases folder from aaa
    fs.rmSync(path.join(root, "games", "aaa", "cases"), { recursive: true, force: true });

    // Copy bin, lib, package.json so rea-games runs in root
    const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    fs.cpSync(path.join(repoRoot, "bin"), path.join(root, "bin"), { recursive: true });
    fs.cpSync(path.join(repoRoot, "lib"), path.join(root, "lib"), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, "package.json"), path.join(root, "package.json"));

    const run = spawnSync(process.execPath, [path.join(root, "bin", "rea-games.mjs"), "pack", "all"], {
      encoding: "utf8",
    });
    assert.equal(run.status, 1);
    const lines = (run.stdout + run.stderr).split("\n").filter(Boolean);
    assert.ok(lines.some((l) => l.includes("aaa has no cases yet; run: rea-games record aaa")));
    assert.ok(lines.some((l) => l.startsWith("zzz:")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
