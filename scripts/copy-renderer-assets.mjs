/**
 * Copy renderer static assets (index.html, styles/) into dist/renderer.
 *
 * The renderer HTML is loaded via loadFile() from dist/renderer (same
 * relative layout in dev and packaged-as-asar: ./bundle.js, styles/),
 * so index.html must live next to the esbuild bundle.
 */
import { cpSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src", "renderer");
const DST = path.join(ROOT, "dist", "renderer");

mkdirSync(DST, { recursive: true });
cpSync(path.join(SRC, "index.html"), path.join(DST, "index.html"));
cpSync(path.join(SRC, "styles"), path.join(DST, "styles"), { recursive: true });
cpSync(path.join(SRC, "i18n"), path.join(DST, "i18n"), { recursive: true });
console.log(`Copied renderer assets -> ${DST}`);
