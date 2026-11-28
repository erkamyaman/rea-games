import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { bundleHtml } from "../scripts/bundle.mjs";

const source = fileURLToPath(new URL("../games/canvas-bird/ports/web/index.html", import.meta.url));
const published = new URL("../docs/play/canvas-bird.html", import.meta.url);
for (const [name, html] of [
  ["source", bundleHtml(fs.readFileSync(source, "utf8"), source)],
  ["published", fs.readFileSync(published, "utf8")],
]) {
  test(`Canvas Bird (${name}) announces each round transition once`, () => {
    assert.match(html, /id="live"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
    assert.equal(html.match(/aria-live=/g).length, 1);
    const messages = [];
    const live = { set textContent(text) { messages.push(text); } };
    const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
    const canvas = { getContext: () => ctx, addEventListener() {} };
    const elements = { c: canvas, live, best: {} };
    const window = { __tape: Array(1000).fill(0.5) };
    let keydown;
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(script, {
      window, document: { getElementById: id => elements[id] },
      localStorage: { getItem: () => "12" },
      performance: { now: () => 0 }, requestAnimationFrame() {},
      addEventListener(type, listener) { if (type === "keydown") keydown = listener; },
    });
    const step = () => window.__rea.step(1000 / 60);
    const start = () => { keydown({ code: "Space", preventDefault() {} }); step(); };
    assert.deepEqual(messages, []);
    start();
    assert.deepEqual(messages, ["Flying"]);
    for (let frame = 0; frame < 600; frame++) step();
    assert.deepEqual(messages, ["Flying", "Game over, 0 points, best 12"]);
    start();
    assert.deepEqual(messages, ["Flying", "Game over, 0 points, best 12", "Flying"]);
  });
}
