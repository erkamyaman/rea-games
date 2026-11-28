import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// A copy of what the bundler reads and writes: scripts/, lib/, each game's game.json and web port, and docs/play.
function copyRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rea-bundle-check-")));
  for (const p of ["scripts", "lib", "docs/play"]) fs.cpSync(path.join(root, p), path.join(dir, p), { recursive: true });
  for (const g of fs.readdirSync(path.join(root, "games"))) {
    const src = path.join(root, "games", g);
    if (!fs.existsSync(path.join(src, "game.json"))) continue;
    fs.cpSync(path.join(src, "game.json"), path.join(dir, "games", g, "game.json"));
    fs.cpSync(path.join(src, "ports", "web"), path.join(dir, "games", g, "ports", "web"), { recursive: true });
  }
  return dir;
}
const check = (dir) => spawnSync(process.execPath, [path.join(dir, "scripts", "bundle.mjs"), "--check"], { encoding: "utf8" });

test("bundle with an unknown option names it and exits 2 without writing anything", () => {
  const dir = copyRepo();
  try {
    const page = path.join(dir, "docs", "play", "mines.html");
    const before = fs.readFileSync(page, "utf8");
    const r = spawnSync(process.execPath, [path.join(dir, "scripts", "bundle.mjs"), "--chek"], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.equal(r.stderr.split("\n")[0], 'bundle.mjs: unknown option "--chek"');
    assert.equal(r.stdout, "");
    assert.equal(fs.readFileSync(page, "utf8"), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle --check passes when every play page matches its web port", () => {
  const dir = copyRepo();
  try {
    const r = check(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, "all play pages up to date\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle --check names stale and missing pages, exits 1 and writes nothing", () => {
  const dir = copyRepo();
  try {
    const stale = path.join(dir, "docs", "play", "mines.html");
    fs.appendFileSync(stale, "<!-- edited by hand -->\n");
    const edited = fs.readFileSync(stale, "utf8");
    fs.rmSync(path.join(dir, "docs", "play", "2048.html"));
    const r = check(dir);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "stale docs/play/2048.html\nstale docs/play/mines.html\nrun: node scripts/bundle.mjs to rebuild\n");
    assert.equal(fs.readFileSync(stale, "utf8"), edited);
    assert.equal(fs.existsSync(path.join(dir, "docs", "play", "2048.html")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
