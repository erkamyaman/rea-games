// Turns each game's playable port into ONE html file (docs/play/<game>.html) that works from file:// and GitHub Pages.
// Module imports are inlined, `export` is dropped. Only relative "./x.mjs" imports are supported, and only
// `export const|let|var|function|class` and local `export { … }` lists: any other export stops the bundle.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listGames, loadGame } from "../lib/verify.mjs";
import { EXPORT_DECL, EXPORT_LIST, exportedNames } from "./exported-names.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules = new Map();
// Leading spaces or tabs are allowed: a page often indents the code inside its <script>.
const IMPORT = /^([ \t]*)import\s*\{([^}]*)\}\s*from\s*["'](\.\/[^"']+)["'];?([ \t]*(?:\/\/[^\n]*?|\/\*[^\n]*?\*\/))?\s*$/gm;
// Any import left after inlining would make the plain <script> fail to parse in the browser.
const LEFTOVER_IMPORT = /^[ \t]*import(?=[\s{*"'])[^\n]*/m;
// An export left after inlining has no binding to hand back (`export default`, `export *`, `export { … } from`).
// An export after a `;` or `}` on the same line (`const A = 1; export { A };`, `function f() {}export const Z = 1;`)
// is never stripped either; the part before that delimiter must hold no `//`, so the word in a line comment does not count.
const LEFTOVER_EXPORT = /^[ \t]*export\b[^\n]*|^(?:(?!\/\/)[^\n])*?[;}][ \t]*export\b[^\n]*/m;
// String literals, regex literals and block comments are blanked (same length, newlines kept, quotes kept) before
// that check, so `"; export"` in a string or `/* one; export two */` in a comment is not code. They are matched in one
// pass, left to right, with `//` comments (kept as they are) so a quote in a comment or `/*` in a string does not
// start the wrong one.
// A `/` also starts a regex after `=>` or a keyword after which a value is expected (`return`, `typeof`,
// `void`, `delete`, `in`, `instanceof`, `case`, `yield`, `await`, `throw`), as a whole word, so `x.return / 2`
// stays a division.
const BLANKABLE = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|(?<=(?:[=(,:?]|=>|(?:^|[^.\w$])(?:return|typeof|void|delete|in|instanceof|case|yield|await|throw))\s*)\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^\\/[\n])+\/[a-z]*/g;
function lineAt(text, at) {
  const start = text.lastIndexOf("\n", at) + 1;
  const end = text.indexOf("\n", at);
  return text.slice(start, end === -1 ? undefined : end);
}

function leftoverExport(body) {
  const blank = body.replace(BLANKABLE, (m) => {
    if (m.startsWith("//")) return m;
    if (m.startsWith("/*")) return m.replace(/[^\n]/g, " ");
    return m[0] + m.slice(1, -1).replace(/[^\n]/g, " ") + m.at(-1);
  });
  const at = blank.match(LEFTOVER_EXPORT)?.index;
  if (at === undefined) return undefined;
  return lineAt(body, at);
}
// Each module runs in its own function scope and hands back its named exports, so two files may
// both declare the same top-level name (the page and its logic module often both define W and H).
function inline(dir, file, out) {
  const full = path.join(dir, file);
  if (modules.has(full)) return modules.get(full);
  const id = `__mod${modules.size}`;
  modules.set(full, id);
  const src = fs.readFileSync(full, "utf8");
  let names;
  try {
    names = exportedNames(src);
  } catch (e) {
    if (typeof e?.offset === "number") {
      throw new Error(`${path.relative(root, full)}: export not supported by the bundler: ${lineAt(src, e.offset).trim()}`, { cause: e });
    }
    throw e;
  }
  const body = imports(src, path.dirname(full), out).replace(EXPORT_LIST, "").replace(EXPORT_DECL, "");
  const left = leftoverExport(body);
  if (left) throw new Error(`${path.relative(root, full)}: export not supported by the bundler: ${left.trim()}`);
  out.push(`const ${id} = (() => {\n${body}\nreturn { ${names.join(", ")} };\n})();\n`);
  return id;
}
function imports(src, dir, out) {
  return src.replace(IMPORT, (_, indent, list, rel, trailing) => {
    const id = inline(dir, rel, out);
    const binds = list.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, ": "));
    return `${indent}const { ${binds.join(", ")} } = ${id};${trailing ?? ""}`;
  });
}
// One page's html with its module script turned into a plain <script> holding every inlined module.
export function bundleHtml(html, htmlPath) {
  try {
    return html.replace(/<script type="module">([\s\S]*?)<\/script>/, (_, body) => {
      const mods = [];
      const rest = imports(body, path.dirname(htmlPath), mods);
      return `<script>\n(() => {\n${mods.join("")}${rest}\n})();\n</script>`;
    });
  } finally {
    modules.clear();
  }
}

export function leftoverImport(html) {
  return html.match(LEFTOVER_IMPORT)?.[0];
}

export function bundleAll(rootDir = root, { check = false } = {}) {
  if (!check) fs.mkdirSync(path.join(rootDir, "docs/play"), { recursive: true });
  let failed = false;
  const stale = [];
  for (const g of listGames(rootDir)) {
    const { dir, meta } = loadGame(rootDir, g);
    const play = Object.values(meta.ports).find((p) => p.play)?.play;
    if (!play) continue;
    const htmlPath = path.join(dir, play);
    const page = "docs/play/" + g + ".html";
    let out;
    try {
      out = bundleHtml(fs.readFileSync(htmlPath, "utf8"), htmlPath);
    } catch (e) {
      console.error(`${page}: ${e.message}`);
      failed = true;
      continue;
    }
    const left = leftoverImport(out);
    if (left) {
      console.error(`${page}: import not inlined, the page will not load: ${left.trim()}`);
      failed = true;
      continue;
    }
    if (check) {
      const file = path.join(rootDir, page);
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== out) stale.push(page);
    } else {
      fs.writeFileSync(path.join(rootDir, page), out);
      console.log("wrote " + page, out.length, "bytes");
    }
  }
  return { failed, stale };
}

function main() {
  const extra = process.argv.slice(2).filter((a) => a !== "--check");
  if (extra.length) {
    console.error(`bundle.mjs: unknown option "${extra[0]}"`);
    process.exit(2);
  }
  const check = process.argv.includes("--check");
  const { failed, stale } = bundleAll(root, { check });
  if (check) {
    for (const page of stale) console.log("stale " + page);
    if (stale.length) console.log("run: node scripts/bundle.mjs to rebuild");
    else if (!failed) console.log("all play pages up to date");
  }
  if (failed || stale.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
