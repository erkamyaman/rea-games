// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../lib/scaffold.mjs";

// An empty repo root, like makeRoot in test/verify.test.mjs.
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rea-games-scaffold-"));
}

test("rejects names that are not lowercase letters, digits and dashes", () => {
  const root = makeRoot();
  try {
    for (const name of ["My Game", "-x"]) {
      assert.throws(() => scaffold(root, name), /lowercase letters, digits and dashes/, name);
    }
    assert.ok(!fs.existsSync(path.join(root, "games")), "a rejected name writes nothing");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("refuses a game folder that already exists", () => {
  const root = makeRoot();
  try {
    scaffold(root, "demo");
    assert.throws(() => scaffold(root, "demo"), /games\/demo already exists/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writes a game.json whose name and web port point at files that exist", () => {
  const root = makeRoot();
  try {
    const dir = scaffold(root, "demo");
    assert.equal(dir, path.join(root, "games", "demo"));

    const meta = JSON.parse(fs.readFileSync(path.join(dir, "game.json"), "utf8"));
    assert.equal(meta.name, "demo");

    const web = meta.ports.web;
    assert.equal(web.cmd[0], "node");
    assert.ok(fs.existsSync(path.join(dir, web.cmd[1])), `${web.cmd[1]} exists`);
    assert.ok(fs.existsSync(path.join(dir, web.play)), `${web.play} exists`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writes a web page with the shared nav, title and head tags", () => {
  const root = makeRoot();
  try {
    const dir = scaffold(root, "demo");
    const html = fs.readFileSync(path.join(dir, "ports", "web", "index.html"), "utf8");
    assert.ok(html.includes("<title>demo · rea-games</title>"), "the title uses the middle dot");
    assert.ok(html.includes('<meta name="description" content="TODO: describe demo in one sentence.">'), "the page has a description");
    assert.ok(html.includes('<meta property="og:title" content="demo · rea-games">'), "the page has an og:title");
    assert.ok(html.includes('<meta property="og:description" content="TODO: describe demo in one sentence.">'), "the page has an og:description");
    assert.ok(html.includes('<meta property="og:image" content="https://erkamyaman.github.io/rea-games/assets/social-preview.png">'), "the page has an og:image");
    assert.equal(html.split('<nav class="site"').length - 1, 1, "one site nav");
    assert.ok(html.includes('<a href="../index.html">&larr; All games</a>'), "the nav links back to all games");
    assert.ok(html.includes('<a class="repo" href="https://github.com/erkamyaman/rea-games">rea-games on GitHub</a>'), "the nav links to the repo");
    assert.ok(html.includes("nav.site a:focus-visible { outline:2px solid"), "the nav links have a visible focus outline");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

