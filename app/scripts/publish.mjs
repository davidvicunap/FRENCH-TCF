// Copies the single-file build to ../v2/index.html so GitHub Pages serves it at /v2/
// and it also opens by double-click from disk.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "..", "dist", "index.html");
const out = path.resolve(here, "..", "..", "v2");
mkdirSync(out, { recursive: true });
copyFileSync(src, path.join(out, "index.html"));
console.log(`published v2/index.html (${Math.round(statSync(src).size / 1024)} KB)`);
