#!/usr/bin/env node
/**
 * build.js — Produces draftsman.html, a single self-contained file.
 *
 * Usage: node build.js
 *
 * Inlines styles.css and all JS modules (in dependency order) so the output
 * can be opened directly from the filesystem in Chrome without a server.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

/**
 * Remove ES module import/export syntax so the code runs as a plain script.
 *
 * - Strips all `import { ... } from '...'` declarations.
 * - Converts `export function/const/let/var/class` → the bare declaration.
 * - Strips `export default`.
 * - Strips bare `export { ... }` re-export lines.
 */
function stripModuleSyntax(js) {
  // Named imports — may span multiple lines: import {\n  a,\n  b\n} from './x.js';
  js = js.replace(
    /import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?[ \t]*\r?\n?/gs,
    "",
  );
  // Default/namespace imports: import Foo from '...' | import * as Foo from '...'
  js = js.replace(
    /import\s+(?:\w+|\*\s+as\s+\w+)\s+from\s*['"][^'"]+['"];?[ \t]*\r?\n?/g,
    "",
  );
  // export function / export const / export let / export var / export class
  js = js.replace(/^export\s+(function|class|const|let|var)\b/gm, "$1");
  // export default
  js = js.replace(/^export\s+default\s+/gm, "");
  // bare export { a, b, c };
  js = js.replace(/^export\s*\{[^}]*\};?[ \t]*\r?\n?/gm, "");
  return js;
}

// ---------------------------------------------------------------------------
// Bundle JS — list modules in dependency order (no imports first)
// ---------------------------------------------------------------------------
const JS_MODULES = [
  "dates.js",
  "csv.js",
  "scheduler.js",
  "export.js",
  "gantt.js",
  "app.js",
];

const bundledJs = JS_MODULES.map((f) => {
  const divider = `// ${"─".repeat(72)}\n// ${f}\n// ${"─".repeat(72)}`;
  return `${divider}\n${stripModuleSyntax(read(f))}`;
}).join("\n");

const wrappedJs = `(function () {\n'use strict';\n\n${bundledJs}\n})();`;

// ---------------------------------------------------------------------------
// Inline into HTML
// ---------------------------------------------------------------------------
const css = read("styles.css");
let html = read("index.html");

// Replace <link rel="stylesheet" href="styles.css" /> with inline <style>
html = html.replace(
  /<link\b[^>]*href="styles\.css"[^>]*>/,
  `<style>\n${css}</style>`,
);

// Replace <script type="module" src="app.js"></script> with bundled inline script
html = html.replace(
  /<script\s+type="module"\s+src="app\.js"\s*><\/script>/,
  `<script>\n${wrappedJs}\n</script>`,
);

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
const outPath = path.join(ROOT, "draftsman.html");
fs.writeFileSync(outPath, html, "utf8");

const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`Built: draftsman.html (${kb} kB)`);
