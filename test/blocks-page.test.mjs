import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import { bundleHtml } from "../scripts/bundle.mjs";

const source = fs.readFileSync(new URL("../games/blocks/ports/web/index.html", import.meta.url), "utf8");
const bundled = fs.readFileSync(new URL("../docs/play/blocks.html", import.meta.url), "utf8");
const pages = [
  ["games/blocks/ports/web/index.html", bundleHtml(source)],
  ["docs/play/blocks.html", bundled],
];

function openPage(html) {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((s) => s.includes("new Blocks"));
  assert.ok(script, "the page has a script that creates a Blocks game");
  const els = {};
  const listeners = {};
  let writes = 0;
  let frame = () => {};
  let now = 0;
  const ctx2d = new Proxy({}, { get: () => () => {} });
  const el = (id) =>
    (els[id] ??= {
      id,
      style: {},
      dataset: {},
      classList: {
        add() {},
        remove() {},
        toggle() {},
        contains() {
          return false;
        },
      },
      addEventListener() {},
      getContext: () => ctx2d,
      appendChild() {},
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
      get textContent() {
        return this._t ?? "";
      },
      set textContent(v) {
        if (id === "live") writes++;
        this._t = v;
      },
    });
  const localStorage = {
    _v: {},
    getItem(k) {
      return this._v[k] ?? null;
    },
    setItem(k, v) {
      this._v[k] = String(v);
    },
    removeItem(k) {
      delete this._v[k];
    },
  };
  const doc = {
    getElementById: el,
    documentElement: el("html"),
    addEventListener: (n, fn) => {
      listeners[n] ??= [];
      listeners[n].push(fn);
    },
    querySelectorAll: () => [],
  };
  const win = {
    localStorage,
    addEventListener: doc.addEventListener,
  };
  const context = {
    document: doc,
    window: win,
    localStorage,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => now },
    requestAnimationFrame: (fn) => {
      frame = fn;
    },
    setInterval: () => 0,
    clearInterval: () => {},
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    JSON,
  };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "blocks-page.mjs" });
  const tick = (i = 1) => {
    for (let n = 0; n < i; n++) frame((now += 1000 / 60));
  };
  tick();
  return {
    live: () => el("live").textContent,
    writes: () => writes,
    press: (key) => {
      const e = { key, preventDefault() {} };
      for (const fn of listeners.keydown ?? []) fn(e);
      tick();
    },
    tick,
  };
}

test("the Blocks play page has a polite live region", (t) => {
  for (const [name, html] of pages) {
    assert.match(html, /id="live"[^>]*aria-live="polite"/, name + ": the live region is polite");
    assert.match(html, /id="live" class="sr-only"/, name + ": the live region is visually hidden");
  }
});

test("announces the start once, then game over with the score and rows, exactly once", (t) => {
  for (const [name, html] of pages) {
    const page = openPage(html);
    assert.equal(page.live(), "", name + ": nothing is announced before the game starts");
    page.press(" ");
    assert.equal(page.live(), "Playing", name + ": the start is announced once");
    const writesAfterStart = page.writes();
    for (let i = 0; i < 10; i++) page.press("ArrowDown");
    assert.equal(page.live(), "Playing", name + ": the score is not announced on every frame");
    assert.equal(page.writes(), writesAfterStart, name + ": the start is not announced again");
    for (let i = 0; i < 60 * 60 && !/^Game over/.test(page.live()); i++) page.press("ArrowDown");
    assert.match(
      page.live(),
      /^Game over, \d+ points, \d+ rows$/,
      name + ": game over announces the final score and rows",
    );
    assert.equal(page.writes(), writesAfterStart + 1, name + ": game over is announced exactly once");
    page.press(" ");
    assert.equal(page.live(), "Playing", name + ": the start is announced again after a new game");
  }
});
