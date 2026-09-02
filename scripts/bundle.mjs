/**
 * Assemble the Python runtime bundle for the Lumina installer (DML).
 *
 * Usage:  node scripts/bundle.mjs
 *
 * Produces build/bundle/ with the layout expected by
 * src/main/backend.ts (packaged mode):
 *
 *   python/            embeddable CPython + Lib/site-packages (backend deps,
 *                      NO onnxruntime — the DML wheel lives in ort/)
 *   ort/dml/           onnxruntime-directml wheel extracted here
 *   backend/           copy of python/ source (main.py, run_backend.py,
 *                      services/, utils/, prompts/, schemas.py)
 *
 * The embeddable distribution ships a ._pth file that makes the interpreter
 * ignore PYTHONPATH, so we rewrite it to include Lib\site-packages (and
 * enable import site). run_backend.py (see python/run_backend.py) still
 * prepends the ORT dir via LUMINA_PYTHONPATH at startup.
 */
import { spawnSync } from "child_process";
import { createWriteStream } from "fs";
import {
  rmSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const BUILD = path.join(ROOT, "build");
const WHEELS = path.join(BUILD, "wheels");
const WHEELS_BACKEND = path.join(BUILD, "wheels-backend");
const EMBED_DIR = path.join(BUILD, "embed");

const REQ_BACKEND = path.join(SCRIPTS, "requirements-backend.txt");
const REQ_ORT = path.join(SCRIPTS, "requirements-ort.txt");

const PY_VER = "3.13.5"; // must match the cp313 wheels in build/wheels
const EMBED_ZIP = path.join(EMBED_DIR, `python-${PY_VER}-embed-amd64.zip`);
const EMBED_URL = `https://www.python.org/ftp/python/${PY_VER}/python-${PY_VER}-embed-amd64.zip`;

// Wheels ORT needs -> site-packages. Kept out of requirements-backend.txt so
// the pinned versions (requirements-ort.txt) win over anything pip resolves
// transitively for the backend.
const COMMON_DEPS = new Set([
  "flatbuffers",
  "mpmath",
  "numpy",
  "packaging",
  "protobuf",
  "sympy",
]);

const OUT = path.join(BUILD, "bundle");

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.error) {
    console.error(`Failed to run ${cmd}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function fetchFile(url, dest, minBytes = 0) {
  console.log(`Downloading ${url}`);
  const tmp = `${dest}.part`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    const size = statSync(tmp).size;
    if (size < minBytes) throw new Error(`Download too small: ${size} bytes`);
    rmSync(dest, { force: true });
    copyFileSync(tmp, dest);
    console.log(`  -> ${(size / 1024 / 1024).toFixed(1)} MB`);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * Validate a zip archive: header PK\x03\x04 AND an intact End-Of-Central-
 * Directory record (PK\x05\x06) near the file tail. A truncated download
 * passes a header-only check but has no valid EOCD, so this catches partial
 * files (the python.org embeddable zip is ~10.9MB, not ~30MB — size alone
 * is a poor signal).
 */
function isZip(pathname) {
  let fd;
  try {
    fd = openSync(pathname, "r");
    const size = statSync(pathname).size;
    if (size < 22) return false;
    const window = Math.min(size, 65557); // max comment length + EOCD size
    const buf = Buffer.alloc(window);
    readSync(fd, buf, 0, window, size - window);
    return buf.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) !== -1;
  } catch {
    return false;
  } finally {
    if (fd) closeSync(fd);
  }
}

function distName(wheel) {
  // wheel filename: {name}-{version}-{...}.whl ; all COMMON_DEPS are
  // single-token names so the first dash-split segment is safe here.
  return wheel.split("-")[0].replaceAll("_", "-").toLowerCase();
}

function listWheels(dir) {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".whl"))
        .sort()
    : [];
}

/** Extract a zip via bsdtar (reads python.org zips fine; PowerShell 7's
 * Expand-Archive throws FileFormatException on them, so no fallback). */
function extractZip(zip, dest) {
  if (!isZip(zip)) throw new Error(`Not a valid zip: ${zip}`);
  mkdirSync(dest, { recursive: true });
  const r = spawnSync("tar", ["-xf", zip, "-C", dest], { stdio: "inherit" });
  if (r.error || r.status !== 0) {
    throw new Error(`Failed to extract ${zip} with bsdtar (exit ${r.status})`);
  }
}

function copyTree(src, dst, skip = (rel) => false) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const rel = entry.name;
    if (skip(rel)) continue;
    const s = path.join(src, rel);
    const d = path.join(dst, rel);
    if (entry.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyTree(s, d, skip);
    } else {
      mkdirSync(path.dirname(d), { recursive: true });
      copyFileSync(s, d);
    }
  }
}

async function ensureEmbeddedPython() {
  // Re-download if the cached zip is missing/corrupt. Real size is ~10.9MB;
  // the earlier "10.7MB" half-file had a truncated tail with no EOCD.
  if (
    existsSync(EMBED_ZIP) &&
    isZip(EMBED_ZIP) &&
    statSync(EMBED_ZIP).size > 5 * 1024 * 1024
  ) {
    console.log(`Embeddable python already cached: ${EMBED_ZIP}`);
    return;
  }
  mkdirSync(EMBED_DIR, { recursive: true });
  rmSync(EMBED_ZIP, { force: true });
  await fetchFile(EMBED_URL, EMBED_ZIP, 8 * 1024 * 1024);
}

/** Resolve a Python that can run `pip download`. Dev machines have venv/;
 * CI runners don't (venv/ is gitignored), but any host Python with pip can
 * cross-download win_amd64 wheels via --platform/--python-version — no need
 * for an actual cp313 interpreter. */
function pipCmd() {
  const venv = path.join(ROOT, "venv", "Scripts", "python.exe");
  if (existsSync(venv)) return [venv, "-m", "pip"];
  return ["python", "-m", "pip"];
}

function downloadBackendWheels() {
  const existing = listWheels(WHEELS_BACKEND);
  if (existing.length > 0) {
    console.log(
      `Backend wheels already downloaded (${existing.length}): ${WHEELS_BACKEND}`,
    );
    return;
  }
  mkdirSync(WHEELS_BACKEND, { recursive: true });
  const [pip, ...pipArgs] = pipCmd();
  sh(pip, [
    ...pipArgs,
    "download",
    "-r",
    REQ_BACKEND,
    "--only-binary=:all:",
    "--platform",
    "win_amd64",
    "--python-version",
    "313",
    "--implementation",
    "cp",
    "--dest",
    WHEELS_BACKEND,
  ]);
}

function downloadOrtWheels() {
  if (listWheels(WHEELS).length > 0) {
    console.log(`ORT wheels already downloaded: ${WHEELS}`);
    return;
  }
  mkdirSync(WHEELS, { recursive: true });
  const [pip, ...pipArgs] = pipCmd();
  // --no-deps: requirements-ort.txt pins the full set, so nothing else
  // should be pulled in.
  sh(pip, [
    ...pipArgs,
    "download",
    "-r",
    REQ_ORT,
    "--no-deps",
    "--only-binary=:all:",
    "--platform",
    "win_amd64",
    "--python-version",
    "313",
    "--implementation",
    "cp",
    "--dest",
    WHEELS,
  ]);
}

function fixPth(pythonDir) {
  const pth = readdirSync(pythonDir).find((f) => f.endsWith("._pth"));
  if (!pth) throw new Error(`No ._pth file in ${pythonDir}`);
  const p = path.join(pythonDir, pth);
  const zipLine = readFileSync(p, "utf-8")
    .split(/\r?\n/)
    .find((l) => l.includes(".zip"));
  writeFileSync(
    p,
    [
      zipLine ?? "python313.zip",
      ".",
      "Lib\\site-packages",
      "import site",
      "",
    ].join("\n"),
  );
  console.log(`Patched ${pth} (site-packages enabled)`);
}

async function main() {
  console.log("=== Bundling Lumina (DML) ===");

  mkdirSync(BUILD, { recursive: true });
  await ensureEmbeddedPython();
  downloadBackendWheels();
  downloadOrtWheels();

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // 1. embeddable python
  extractZip(EMBED_ZIP, path.join(OUT, "python"));
  const pyRoot = path.join(OUT, "python");
  fixPth(pyRoot);

  // 2. backend deps -> site-packages (common ORT deps win from build/wheels)
  const sitePkgs = path.join(pyRoot, "Lib", "site-packages");
  mkdirSync(sitePkgs, { recursive: true });
  const backendWheels = listWheels(WHEELS_BACKEND).filter(
    (w) => !COMMON_DEPS.has(distName(w)),
  );
  console.log(
    `Extracting ${backendWheels.length} backend wheels -> site-packages`,
  );
  for (const w of backendWheels) {
    extractZip(path.join(WHEELS_BACKEND, w), sitePkgs);
  }
  const commonWheels = listWheels(WHEELS).filter(
    (w) => COMMON_DEPS.has(distName(w)) && !w.startsWith("onnxruntime"),
  );
  console.log(
    `Extracting ${commonWheels.length} common wheels -> site-packages`,
  );
  for (const w of commonWheels) {
    extractZip(path.join(WHEELS, w), sitePkgs);
  }

  // 3. onnxruntime-directml
  const dml = listWheels(WHEELS).find((w) =>
    w.startsWith("onnxruntime_directml"),
  );
  if (!dml)
    throw new Error("onnxruntime_directml wheel not found in build/wheels");
  extractZip(path.join(WHEELS, dml), path.join(OUT, "ort", "dml"));

  // 4. backend source (real files — Python cannot read inside asar)
  copyTree(
    path.join(ROOT, "python"),
    path.join(OUT, "backend"),
    (rel) => rel === "__pycache__" || rel.endsWith(".pyc"),
  );

  // 5. manifest
  writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify(
      {
        variant: "dml",
        python: PY_VER,
        onnxruntime: "1.24.4",
        backend: "resources/backend (from python/)",
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  // sanity checks
  const checks = [
    [path.join(pyRoot, "python.exe"), "python.exe"],
    [path.join(OUT, "backend", "run_backend.py"), "run_backend.py"],
    [path.join(sitePkgs, "numpy"), "numpy in site-packages"],
    [path.join(OUT, "ort", "dml", "onnxruntime"), "onnxruntime in ort/dml"],
  ];
  for (const [p, label] of checks) {
    if (!existsSync(p)) throw new Error(`Bundle check failed: ${label}`);
  }

  const mb = (dir) => {
    let n = 0;
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else n += statSync(f).size;
      }
    };
    walk(dir);
    return (n / 1024 / 1024).toFixed(0);
  };
  console.log(`\n=== Done: ${OUT} ===`);
  console.log(`  python:  ${mb(path.join(OUT, "python"))} MB`);
  console.log(`  ort/dml: ${mb(path.join(OUT, "ort", "dml"))} MB`);
  console.log(`  total:   ${mb(OUT)} MB`);
}

main();
