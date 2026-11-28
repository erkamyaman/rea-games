import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { bundleHtml } from "../scripts/bundle.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "games/bricks/ports/web/index.html");
const pages = {
  "games/bricks/ports/web/index.html": () => bundleHtml(fs.readFileSync(source, "utf8"), source),
  "docs/play/bricks.html": () => fs.readFileSync(path.join(root, "docs/play/bricks.html"), "utf8"),
};

function openPage(html) {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1])
    .find((part) => part.includes("new Bricks"));
  assert.ok(script, "Bricks page script");
  const context = new Proxy({}, { get: () => () => {} });
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      textContent: "", style: {}, classList: { toggle() {} }, addEventListener() {},
    });
    return elements.get(id);
  };
  Object.assign(element("c"), { width: 448, height: 378, getContext: () => context });
  const listeners = {};
  let frame, now = 0;
  vm.runInNewContext(script, {
    document: {
      getElementById: element,
      documentElement: { dataset: {} },
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    },
    window: { devicePixelRatio: 1, addEventListener() {} },
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { frame = fn; },
  });
  const tick = () => { now += 16; frame(now); };
  const key = (type, value) => {
    const event = { key: value, target: { tagName: "BODY" }, repeat: false, preventDefault() {} };
    for (const handler of listeners[type]) handler(event);
  };
  tick();
  return { tick, key, text: (id) => element(id).textContent };
}

for (const [name, read] of Object.entries(pages)) {
  test(`${name}: announces the menu, current score, and the final score after losing`, () => {
    const html = read();
    const liveElement = html.match(/<p\b[^>]*\bid="live"[^>]*>/)?.[0];
    assert.ok(liveElement, "the page has a live-region element");
    assert.match(liveElement, /\baria-live="polite"/);
    const page = openPage(html);
    assert.equal(page.text("live"), "Bricks. Level 1 of 6. Press Space or tap to play");

    page.key("keydown", " ");
    page.key("keyup", " ");
    page.tick();
    assert.equal(page.text("live"), "Score 0, 3 balls, level 1");

    // Leave the paddle at the left wall while the three balls play out.
    page.key("keydown", "ArrowLeft");
    let lastRunning = page.text("live");
    for (let i = 0; i < 6000 && page.text("msgtitle") !== "Game over"; i++) {
      lastRunning = page.text("live");
      page.tick();
    }
    assert.equal(page.text("msgtitle"), "Game over");
    const score = /^Score (\d+), 1 balls, level 1$/.exec(lastRunning)?.[1];
    assert.ok(score, "the game was still announcing the score on the last ball");
    assert.equal(page.text("live"), `Game over. ${score} points. Level 1 of 6. Press Space or tap to play`);
  });
}
