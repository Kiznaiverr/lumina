/**
 * Assemble the Python runtime bundle for a Lumina installer variant.
 *
 * Usage:  node scripts/bundle.mjs --variant=dml|cuda
 *
 * Produces build/bundle-<variant>/:
 *   python/            embeddable CPython + site-packages (no onnxruntime)
 *   ort/dml/           onnxruntime-directml wheel extracted here
 *   ort/cuda.7z        FULL onnxruntime-gpu + nvidia/* runtime (LZMA-7z'd,
 *                      GitHub 2GB limit); extracted by NSIS at install,
 *                      archive deleted after setup
 *   7zr.exe            (CUDA only) 7-Zip console used by setup
 *   backend/           python/ source (main.py, services/, ...)
 *
 * The embeddable's ._pth file ignores PYTHONPATH, so it's patched to enable
 * site-packages; run_backend.py prepends the ORT dir via LUMINA_PYTHONPATH.
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
const WHEELS_CUDA = path.join(BUILD, "wheels-cuda");
const WHEELS_BACKEND = path.join(BUILD, "wheels-backend");
const EMBED_DIR = path.join(BUILD, "embed");

// 7-Zip console (7zr.exe) — bundled with the CUDA installer for the NSIS
// customInstall macro to extract ort/cuda.7z (GitHub 2GB limit forces
// shipping the runtime compressed). Creates 7z multi-threaded with % output;
// only READS 7z, so wheels are unpacked with bsdtar. LGPL. 7-zip.org.
const SEVENZR_URL = "https://www.7-zip.org/a/7zr.exe";
const SEVENZR_EXE = path.join(BUILD, "7zr.exe");
const SEVENZR_MIN_BYTES = 300 * 1024; // ~600KB, reject truncated downloads

const REQ_BACKEND = path.join(SCRIPTS, "requirements-backend.txt");
const REQ_ORT = path.join(SCRIPTS, "requirements-ort.txt");
const REQ_ORT_CUDA = path.join(SCRIPTS, "requirements-ort-cuda.txt");

const PY_VER = "3.13.5"; // must match the cp313 wheels in build/wheels
const EMBED_ZIP = path.join(EMBED_DIR, `python-${PY_VER}-embed-amd64.zip`);
const EMBED_URL = `https://www.python.org/ftp/python/${PY_VER}/python-${PY_VER}-embed-amd64.zip`;

// Wheels ORT needs -> site-packages, kept out of requirements-backend.txt so
// the pinned versions (requirements-ort*.txt) win over transitive resolves.
const COMMON_DEPS = new Set([
  "flatbuffers",
  "mpmath",
  "numpy",
  "packaging",
  "protobuf",
  "sympy",
]);

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

/** Validate a zip: header + intact End-Of-Central-Directory near the tail
 * (catches truncated downloads, e.g. the ~10.9MB embeddable zip). */
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
  // {name}-{version}-... ; COMMON_DEPS are single-token names
  return wheel.split("-")[0].replaceAll("_", "-").toLowerCase();
}

function listWheels(dir) {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".whl"))
        .sort()
    : [];
}

/** Extract a zip via bsdtar (PowerShell Expand-Archive can't read them). */
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
  // Re-download if missing/corrupt
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

/** Download 7zr.exe once (CUDA bundles only). */
async function ensureSevenZr() {
  if (
    existsSync(SEVENZR_EXE) &&
    statSync(SEVENZR_EXE).size > SEVENZR_MIN_BYTES
  ) {
    console.log(`7zr.exe already cached: ${SEVENZR_EXE}`);
    return;
  }
  mkdirSync(BUILD, { recursive: true });
  rmSync(SEVENZR_EXE, { force: true });
  await fetchFile(SEVENZR_URL, SEVENZR_EXE, SEVENZR_MIN_BYTES);
}

/** Python with pip for cross-downloading win_amd64 wheels (venv if present,
 * else any host python — CI has no venv). */
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

function downloadOrtWheels(variant) {
  const dir = variant === "cuda" ? WHEELS_CUDA : WHEELS;
  const req = variant === "cuda" ? REQ_ORT_CUDA : REQ_ORT;
  if (listWheels(dir).length > 0) {
    console.log(`ORT wheels already downloaded: ${dir}`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  const [pip, ...pipArgs] = pipCmd();
  // CUDA: no --no-deps so the [cuda,cudnn] extra pulls the nvidia_* wheels
  // (cublas, cudnn, cufft, curand, nvrtc, runtime, nvjitlink) — they must
  // ship in ort/cuda.7z or the CUDA EP can't load.
  const noDeps = variant !== "cuda";
  sh(pip, [
    ...pipArgs,
    "download",
    "-r",
    req,
    ...(noDeps ? ["--no-deps"] : []),
    "--only-binary=:all:",
    "--platform",
    "win_amd64",
    "--python-version",
    "313",
    "--implementation",
    "cp",
    "--dest",
    dir,
  ]);
}

/**
 * Archive the CUDA runtime (onnxruntime/ + nvidia/ + dist-info) into
 * ort/cuda.7z (LZMA2, GitHub 2GB limit) — no pruning, parity with dev venv.
 * NSIS extracts it into resources/ort/cuda at setup, then deletes it.
 *
 * Wheels are unpacked with bsdtar (7zr only reads 7z), then compressed with
 * the bundled 7zr.exe: multi-threaded LZMA2 with % progress (bsdtar's tar -a
 * is single-threaded and silent on a ~2.4GB payload). */
function archiveOrtCuda(wheelDir, ortRoot) {
  const wheels = listWheels(wheelDir).filter((w) =>
    w.startsWith("onnxruntime"),
  );
  const ortWheel =
    wheels.find((w) => !w.includes("onnxruntime_gpu")) || wheels[0];
  if (!ortWheel) throw new Error(`onnxruntime wheel not found in ${wheelDir}`);
  const run = (args, opts = {}) => {
    const r = spawnSync(SEVENZR_EXE, args, { stdio: "inherit", ...opts });
    if (r.error || r.status !== 0) {
      throw new Error(`7zr failed (exit ${r.status}): ${args.join(" ")}`);
    }
  };
  // 1. onnxruntime wheel -> ortRoot
  console.log(`  ort: extracting ${ortWheel}`);
  extractZip(path.join(wheelDir, ortWheel), ortRoot);
  // 2. nvidia wheels -> ortRoot/nvidia (each wheel already contains
  //    nvidia/<pkg>/...; shared nvidia/__init__.py just gets overwritten)
  for (const w of listWheels(wheelDir).filter((w) => w.startsWith("nvidia_"))) {
    console.log(`  nvidia: extracting ${w}`);
    extractZip(path.join(wheelDir, w), ortRoot);
  }
  // 3. 7z the whole ortRoot (LZMA2 max, multi-threaded), then delete it
  const sevenZip = path.join(ortRoot + ".7z");
  rmSync(sevenZip, { force: true });
  console.log("  7z: compressing ort/cuda.7z (LZMA2 -mx=9, multi-threaded)...");
  run(["a", "-t7z", "-mx=9", sevenZip, "."], { cwd: ortRoot });
  // Defender/indexer can briefly hold handles -> EBUSY; retry
  rmSync(ortRoot, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 500,
  });
  const sz = statSync(sevenZip).size / 1024 / 1024;
  console.log(`  ort/cuda.7z: ${sz.toFixed(0)} MB`);
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
  const variantArg = process.argv.find((a) => a.startsWith("--variant="));
  const variant = variantArg ? variantArg.split("=")[1] : "dml";
  if (variant !== "dml" && variant !== "cuda") {
    throw new Error(`Unknown variant '${variant}' (expected dml|cuda)`);
  }
  const out = path.join(BUILD, `bundle-${variant}`);
  const wheelDir = variant === "cuda" ? WHEELS_CUDA : WHEELS;
  const ortVer = variant === "cuda" ? "1.24.4+cuda12" : "1.24.4";

  console.log(`=== Bundling Lumina (${variant.toUpperCase()}) ===`);

  mkdirSync(BUILD, { recursive: true });
  await ensureEmbeddedPython();
  if (variant === "cuda") await ensureSevenZr();
  downloadBackendWheels();
  downloadOrtWheels(variant);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // 1. embeddable python
  extractZip(EMBED_ZIP, path.join(out, "python"));
  const pyRoot = path.join(out, "python");
  fixPth(pyRoot);

  // 2. backend deps -> site-packages (common ORT deps win from wheelDir)
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
  const commonWheels = listWheels(wheelDir).filter(
    (w) => COMMON_DEPS.has(distName(w)) && !w.startsWith("onnxruntime"),
  );
  console.log(
    `Extracting ${commonWheels.length} common wheels -> site-packages`,
  );
  for (const w of commonWheels) {
    extractZip(path.join(wheelDir, w), sitePkgs);
  }

  // 3. onnxruntime variant — DML: extracted to ort/dml/; CUDA: FULL runtime
  // archived as ort/cuda.7z (LZMA), extracted by NSIS customInstall during
  // setup. 7zr.exe ships alongside so the installer can extract without
  // relying on the host having 7-Zip installed.
  const ortWheel = listWheels(wheelDir).find((w) =>
    w.startsWith("onnxruntime"),
  );
  if (!ortWheel) throw new Error(`onnxruntime wheel not found in ${wheelDir}`);
  const ortRoot = path.join(out, "ort", variant);
  if (variant === "cuda") {
    archiveOrtCuda(wheelDir, ortRoot);
    // ship 7zr.exe next to the archive for the installer to extract with
    copyFileSync(SEVENZR_EXE, path.join(out, "7zr.exe"));
  } else {
    extractZip(path.join(wheelDir, ortWheel), ortRoot);
  }

  // 4. backend source (real files — Python cannot read inside asar)
  copyTree(
    path.join(ROOT, "python"),
    path.join(out, "backend"),
    (rel) => rel === "__pycache__" || rel.endsWith(".pyc"),
  );

  // 5. manifest
  writeFileSync(
    path.join(out, "manifest.json"),
    JSON.stringify(
      {
        variant,
        python: PY_VER,
        onnxruntime: ortVer,
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
    [path.join(out, "backend", "run_backend.py"), "run_backend.py"],
    [path.join(sitePkgs, "numpy"), "numpy in site-packages"],
  ];
  if (variant === "cuda") {
    checks.push([path.join(out, "ort", "cuda.7z"), "ort/cuda.7z archive"]);
    checks.push([path.join(out, "7zr.exe"), "7zr.exe extractor"]);
  } else {
    checks.push([
      path.join(ortRoot, "onnxruntime"),
      `onnxruntime in ort/${variant}`,
    ]);
  }
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
  console.log(`\n=== Done: ${out} ===`);
  console.log(`  python:  ${mb(path.join(out, "python"))} MB`);
  if (variant === "cuda") {
    const a = path.join(out, "ort", "cuda.7z");
    console.log(
      `  ort/cuda.7z: ${(statSync(a).size / 1024 / 1024).toFixed(0)} MB`,
    );
  } else {
    console.log(`  ort/${variant}: ${mb(path.join(out, "ort", variant))} MB`);
  }
  console.log(`  total:   ${mb(out)} MB`);
}

main();
